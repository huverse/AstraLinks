/**
 * 主持人控制器
 *
 * 负责流程调度，不涉及 LLM 调用
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionState, SessionStatus, SessionConfig, EventType, Intent, IntentUrgencyLevel, DiscussionOutline } from '../core/types';
import { IModeratorController, IAgent, IRuleEngine, IModeratorLLM } from '../core/interfaces';
import { eventLogService, eventBus } from '../event-log';
import { getDiscussionLoopLauncher } from '../orchestrator/DiscussionLoopLauncher';
import { weLogger } from '../../services/world-engine-logger';
import { outlineGenerator, moderatorLLM } from './index';

/**
 * 主持人控制器实现
 */
export class ModeratorController implements IModeratorController {
    private sessions: Map<string, SessionState> = new Map();
    private sessionConfigs: Map<string, SessionConfig> = new Map();
    private agents: Map<string, Map<string, IAgent>> = new Map();
    private ruleEngines: Map<string, IRuleEngine> = new Map();
    private pendingIntents: Map<string, Intent[]> = new Map();
    private outlines: Map<string, DiscussionOutline> = new Map();
    private interventionLevels: Map<string, number> = new Map();

    /**
     * 设置规则引擎
     */
    setRuleEngine(sessionId: string, engine: IRuleEngine): void {
        this.ruleEngines.set(sessionId, engine);
    }

    /**
     * 设置会话配置（用于大纲生成等需要原始配置的场景）
     */
    setSessionConfig(sessionId: string, config: SessionConfig): void {
        this.sessionConfigs.set(sessionId, config);
    }

    /**
     * 清理会话数据
     */
    clearSession(sessionId: string): void {
        this.sessions.delete(sessionId);
        this.sessionConfigs.delete(sessionId);
        this.agents.delete(sessionId);
        this.ruleEngines.delete(sessionId);
    }

    /**
     * 注册 Agent 到会话
     */
    registerAgent(sessionId: string, agent: IAgent): void {
        if (!this.agents.has(sessionId)) {
            this.agents.set(sessionId, new Map());
        }
        this.agents.get(sessionId)!.set(agent.config.id, agent);
    }

    /**
     * 开始讨论
     */
    async startSession(sessionId: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (!state) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // 自动生成讨论大纲（如果尚未设置）
        await this.ensureOutline(sessionId);

        state.status = 'active';
        state.startedAt = Date.now();
        state.currentRound = 1;

        // 获取大纲摘要（如果有）
        const outline = this.outlines.get(sessionId);
        const outlineSummary = outline?.items?.slice(0, 2).map(i => i.topic).join('、');

        await this.publishSystemEvent(sessionId, 'SESSION_START', {
            message: '讨论开始',
            round: 1,
            hasOutline: !!outline,
            outlinePreview: outlineSummary || undefined
        });

        // 使用注册的启动器启动讨论循环
        const launcher = getDiscussionLoopLauncher();
        launcher.start(sessionId).catch((err) => {
            weLogger.error({
                sessionId,
                error: err.message,
                stack: err.stack
            }, 'discussion_loop_error');
            this.abortSession(sessionId, `DiscussionLoop error: ${err.message}`);
        });
    }

    /**
     * 暂停讨论
     */
    async pauseSession(sessionId: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (state && state.status === 'active') {
            state.status = 'paused';

            // 发布 session:pause 事件
            await this.publishSystemEvent(sessionId, 'SESSION_PAUSE', {
                message: '讨论已暂停',
                round: state.currentRound
            });

            weLogger.info({ sessionId, round: state.currentRound }, 'session_paused');
        }
    }

    /**
     * 恢复讨论
     */
    async resumeSession(sessionId: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (state && state.status === 'paused') {
            state.status = 'active';

            // 发布 session:resume 事件
            await this.publishSystemEvent(sessionId, 'SESSION_RESUME', {
                message: '讨论已恢复',
                round: state.currentRound
            });

            weLogger.info({ sessionId, round: state.currentRound }, 'session_resumed');
        }
    }

    /**
     * 结束讨论
     */
    async endSession(sessionId: string, reason: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (state) {
            state.status = 'completed';
            state.endedAt = Date.now();

            // 发布 session:end 事件
            await this.publishSystemEvent(sessionId, 'SESSION_END', {
                message: reason || '讨论正常结束',
                round: state.currentRound,
                reason
            });

            weLogger.info({
                sessionId,
                reason,
                rounds: state.currentRound,
                duration: state.startedAt ? Date.now() - state.startedAt : 0
            }, 'session_ended');
        }
    }

    /**
     * 异常中止会话
     */
    private abortSession(sessionId: string, reason: string): void {
        const state = this.sessions.get(sessionId);
        if (state) {
            state.status = 'aborted';
            state.endedAt = Date.now();

            void this.publishSystemEvent(sessionId, 'SESSION_ABORTED', {
                message: reason,
                round: state.currentRound,
                reason
            });

            weLogger.warn({ sessionId, reason }, 'session_aborted');
        }
    }

    /**
     * 选择下一个发言者
     */
    async selectNextSpeaker(sessionId: string): Promise<IAgent | null> {
        const state = this.sessions.get(sessionId);
        const sessionAgents = this.agents.get(sessionId);
        const ruleEngine = this.ruleEngines.get(sessionId);

        if (!state || !sessionAgents || !ruleEngine) {
            return null;
        }

        const agentList = Array.from(sessionAgents.values());
        const nextSpeaker = ruleEngine.getNextSpeaker(state, agentList);

        if (nextSpeaker) {
            state.currentSpeakerId = nextSpeaker.config.id;
            state.currentSpeakerStartTime = Date.now();
        }

        return nextSpeaker;
    }

    /**
     * 由AI智能选择下一个发言者
     * 当意图队列为空时，主持人AI根据讨论进展决定谁应该发言
     */
    async selectNextSpeakerByAI(sessionId: string): Promise<IAgent | null> {
        const state = this.sessions.get(sessionId);
        const sessionAgents = this.agents.get(sessionId);
        const config = this.sessionConfigs.get(sessionId);

        if (!state || !sessionAgents || sessionAgents.size === 0) {
            return null;
        }

        // 检查介入程度，如果为 0（低），则不使用AI点名
        const interventionLevel = this.interventionLevels.get(sessionId) ?? 2;
        if (interventionLevel === 0) {
            return null; // 返回 null，让调用者使用轮流模式
        }

        // 准备 Agent 信息
        const agentList = Array.from(sessionAgents.values());
        const agentInfoList = agentList.map(a => ({
            id: a.config.id,
            name: a.config.name,
            role: a.config.role,
            stance: a.config.stance
        }));

        // 计算发言次数统计
        const speakCounts = new Map<string, number>();
        for (const agent of agentList) {
            speakCounts.set(agent.config.id, agent.state.speakCount || 0);
        }

        // 获取最近的讨论事件
        const recentEvents = await eventLogService.getRecentEvents(sessionId, 20);

        // 获取主题
        const topic = config?.topic || '讨论';

        try {
            // 调用 ModeratorLLM 进行智能选择
            const selection = await moderatorLLM.selectNextSpeaker(
                topic,
                recentEvents,
                agentInfoList,
                speakCounts
            );

            if (selection) {
                const selectedAgent = sessionAgents.get(selection.agentId);
                if (selectedAgent) {
                    // 设置当前发言者
                    state.currentSpeakerId = selection.agentId;
                    state.currentSpeakerStartTime = Date.now();

                    // 发布AI点名事件
                    await this.publishSystemEvent(sessionId, 'MODERATOR_AI_CALL', {
                        message: `主持人点名 ${selectedAgent.config.name} 发言`,
                        agentId: selection.agentId,
                        agentName: selectedAgent.config.name,
                        reason: selection.reason,
                        interventionLevel
                    });

                    weLogger.info({
                        sessionId,
                        agentId: selection.agentId,
                        agentName: selectedAgent.config.name,
                        reason: selection.reason
                    }, 'moderator_ai_selected_speaker');

                    return selectedAgent;
                }
            }
        } catch (error: any) {
            weLogger.error({
                sessionId,
                error: error.message
            }, 'moderator_ai_selection_error');
        }

        return null;
    }

    /**
     * 检查当前发言者是否超时
     */
    checkSpeakerTimeout(sessionId: string): boolean {
        const state = this.sessions.get(sessionId);
        const ruleEngine = this.ruleEngines.get(sessionId);

        if (!state || !ruleEngine) {
            return false;
        }

        return ruleEngine.checkTimeout(state);
    }

    /**
     * 获取发言剩余时间
     */
    getSpeakerRemainingTime(sessionId: string): number | null {
        const state = this.sessions.get(sessionId);
        const ruleEngine = this.ruleEngines.get(sessionId);

        if (!state || !ruleEngine) {
            return null;
        }

        return ruleEngine.getRemainingTime(state);
    }

    /**
     * 指定发言者
     */
    async directSpeaker(sessionId: string, agentId: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (state) {
            state.currentSpeakerId = agentId;

            // 发布 moderator:direct 事件
            await this.publishSystemEvent(sessionId, 'MODERATOR_DIRECT', {
                message: `主持人指定 ${agentId} 发言`,
                targetAgentId: agentId
            });
        }
    }

    /**
     * 触发指定 Agent 发言
     */
    async triggerAgentSpeak(
        sessionId: string,
        agentId: string,
        userContent?: string
    ): Promise<{ success: boolean; message?: string; error?: string }> {
        const state = this.sessions.get(sessionId);
        if (!state) {
            return { success: false, error: 'Session not found' };
        }

        if (state.status !== 'active' && state.status !== 'paused') {
            return { success: false, error: `Session is ${state.status}` };
        }

        const sessionAgents = this.agents.get(sessionId);
        if (!sessionAgents) {
            return { success: false, error: 'No agents in session' };
        }

        const agent = sessionAgents.get(agentId);
        if (!agent) {
            return { success: false, error: 'Agent not found' };
        }

        try {
            // 如果用户提供了内容，先发布用户消息事件
            if (userContent) {
                await eventLogService.appendEvent({
                    sessionId,
                    type: EventType.SPEECH,
                    speaker: 'user',
                    content: { message: userContent, isUserInput: true }
                }).then(event => eventBus.publish(event as any));
            }

            // 触发 Agent 生成响应
            const response = await agent.generateResponse();

            // 发布 Agent 发言事件
            const event = await eventLogService.appendEvent({
                sessionId,
                type: EventType.SPEECH,
                speaker: agentId,
                content: {
                    agentId,
                    agentName: agent.config.name,
                    message: response.content,
                    tokens: response.tokens,
                    triggeredByUser: !!userContent
                }
            });

            eventBus.publish(event as any);

            return { success: true, message: response.content };
        } catch (error: any) {
            weLogger.error({ sessionId, agentId, error: error.message }, 'trigger_agent_speak_error');
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取会话中的 Agent
     */
    getAgent(sessionId: string, agentId: string): IAgent | undefined {
        return this.agents.get(sessionId)?.get(agentId);
    }

    /**
     * 获取会话中的所有 Agent
     */
    getAgents(sessionId: string): IAgent[] {
        const sessionAgents = this.agents.get(sessionId);
        return sessionAgents ? Array.from(sessionAgents.values()) : [];
    }

    /**
     * 检查是否应该结束
     */
    shouldEndSession(state: SessionState): boolean {
        // 已经处于结束状态
        if (state.status === 'completed' || state.status === 'aborted') {
            return true;
        }

        // 可扩展更多结束条件
        return false;
    }

    /**
     * 推进一轮
     */
    async advanceRound(sessionId: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (state) {
            state.currentRound += 1;

            // 发布 round:advance 事件
            await this.publishSystemEvent(sessionId, 'ROUND_ADVANCE', {
                message: `进入第 ${state.currentRound} 轮`,
                round: state.currentRound
            });

            weLogger.debug({ sessionId, round: state.currentRound }, 'round_advanced');
        }
    }

    /**
     * 创建会话状态
     */
    createSessionState(sessionId: string): SessionState {
        const state: SessionState = {
            sessionId,
            status: 'pending',
            currentRound: 0,
            currentSpeakerId: null,
            agentStates: new Map(),
            eventSequence: 0,
        };
        this.sessions.set(sessionId, state);
        return state;
    }

    /**
     * 获取会话状态
     */
    getSessionState(sessionId: string): SessionState | undefined {
        return this.sessions.get(sessionId);
    }

    // ============================================
    // 举手/插话机制
    // ============================================

    /**
     * 提交发言意图（举手/插话）
     */
    async submitIntent(sessionId: string, intent: Omit<Intent, 'timestamp'>): Promise<{
        success: boolean;
        queued: boolean;
        position?: number;
        error?: string;
    }> {
        const state = this.sessions.get(sessionId);
        if (!state) {
            return { success: false, queued: false, error: 'Session not found' };
        }

        if (state.status !== 'active') {
            return { success: false, queued: false, error: 'Session is not active' };
        }

        const fullIntent: Intent = {
            ...intent,
            timestamp: Date.now(),
        };

        // 获取或创建意图队列
        let intents = this.pendingIntents.get(sessionId);
        if (!intents) {
            intents = [];
            this.pendingIntents.set(sessionId, intents);
        }

        // 检查是否是高优先级插话
        const urgencyLevel = intent.urgencyLevel || IntentUrgencyLevel.RAISE_HAND;
        const interventionLevel = this.interventionLevels.get(sessionId) || 2;

        // 如果是直接插话且允许打断
        if (urgencyLevel >= IntentUrgencyLevel.INTERRUPT && interventionLevel < 3) {
            // 高优先级，插入队列前面
            intents.unshift(fullIntent);

            // 发布插话事件
            await this.publishSystemEvent(sessionId, 'AGENT_INTERRUPT', {
                message: `${intent.agentId} 请求插话`,
                agentId: intent.agentId,
                urgencyLevel,
                intentType: intent.type,
            });

            weLogger.info({ sessionId, agentId: intent.agentId, urgencyLevel }, 'agent_interrupt');
            return { success: true, queued: true, position: 1 };
        }

        // 普通举手，按优先级插入
        const insertIndex = intents.findIndex(i =>
            (i.urgencyLevel || 1) < urgencyLevel
        );

        if (insertIndex === -1) {
            intents.push(fullIntent);
        } else {
            intents.splice(insertIndex, 0, fullIntent);
        }

        // 发布举手事件
        await this.publishSystemEvent(sessionId, 'AGENT_RAISE_HAND', {
            message: `${intent.agentId} 举手请求发言`,
            agentId: intent.agentId,
            urgencyLevel,
            intentType: intent.type,
            targetAgentId: intent.targetAgentId,
        });

        const position = intents.indexOf(fullIntent) + 1;
        weLogger.debug({ sessionId, agentId: intent.agentId, position }, 'agent_raise_hand');

        return { success: true, queued: true, position };
    }

    /**
     * 获取待处理的发言意图
     */
    getPendingIntents(sessionId: string): Intent[] {
        return this.pendingIntents.get(sessionId) || [];
    }

    /**
     * 处理下一个发言意图
     */
    async processNextIntent(sessionId: string): Promise<Intent | null> {
        const intents = this.pendingIntents.get(sessionId);
        if (!intents || intents.length === 0) {
            return null;
        }

        return intents.shift() || null;
    }

    /**
     * 清除某个 Agent 的所有意图
     */
    clearAgentIntents(sessionId: string, agentId: string): void {
        const intents = this.pendingIntents.get(sessionId);
        if (intents) {
            const filtered = intents.filter(i => i.agentId !== agentId);
            this.pendingIntents.set(sessionId, filtered);
        }
    }

    // ============================================
    // 主持人点名功能
    // ============================================

    /**
     * 主持人点名指定 Agent 发言
     */
    async callAgent(sessionId: string, agentId: string, reason?: string): Promise<{
        success: boolean;
        error?: string;
    }> {
        const state = this.sessions.get(sessionId);
        if (!state) {
            return { success: false, error: 'Session not found' };
        }

        const agent = this.agents.get(sessionId)?.get(agentId);
        if (!agent) {
            return { success: false, error: 'Agent not found' };
        }

        // 设置当前发言者
        state.currentSpeakerId = agentId;
        state.currentSpeakerStartTime = Date.now();

        // 发布点名事件
        await this.publishSystemEvent(sessionId, 'MODERATOR_CALL', {
            message: reason || `主持人点名 ${agent.config.name} 发言`,
            agentId,
            agentName: agent.config.name,
        });

        weLogger.info({ sessionId, agentId, reason }, 'moderator_call_agent');

        return { success: true };
    }

    /**
     * 主持人要求某 Agent 回应另一个 Agent
     */
    async requestResponse(
        sessionId: string,
        responderId: string,
        targetId: string,
        topic?: string
    ): Promise<{ success: boolean; error?: string }> {
        const state = this.sessions.get(sessionId);
        if (!state) {
            return { success: false, error: 'Session not found' };
        }

        const responder = this.agents.get(sessionId)?.get(responderId);
        const target = this.agents.get(sessionId)?.get(targetId);

        if (!responder || !target) {
            return { success: false, error: 'Agent not found' };
        }

        // 设置当前发言者
        state.currentSpeakerId = responderId;
        state.currentSpeakerStartTime = Date.now();

        // 发布请求回应事件
        await this.publishSystemEvent(sessionId, 'MODERATOR_REQUEST_RESPONSE', {
            message: `主持人请 ${responder.config.name} 回应 ${target.config.name}${topic ? `关于"${topic}"的观点` : ''}`,
            responderId,
            responderName: responder.config.name,
            targetId,
            targetName: target.config.name,
            topic,
        });

        weLogger.info({ sessionId, responderId, targetId, topic }, 'moderator_request_response');

        return { success: true };
    }

    // ============================================
    // 讨论大纲管理
    // ============================================

    /**
     * 设置讨论大纲
     */
    setOutline(sessionId: string, outline: DiscussionOutline): void {
        this.outlines.set(sessionId, outline);
    }

    /**
     * 获取讨论大纲
     */
    getOutline(sessionId: string): DiscussionOutline | undefined {
        return this.outlines.get(sessionId);
    }

    /**
     * 确保大纲已生成（开场时自动调用）
     */
    private async ensureOutline(sessionId: string): Promise<void> {
        // 如果已有大纲，跳过
        if (this.outlines.has(sessionId)) return;

        const sessionAgents = this.agents.get(sessionId);
        if (!sessionAgents || sessionAgents.size === 0) return;

        // 从 SessionConfig 获取 topic（优先）或回退到 SessionState
        const config = this.sessionConfigs.get(sessionId);
        const topic = config?.topic || '讨论';
        // objective 必须是 'explore' | 'debate' | 'consensus'，默认 debate
        const objective: 'explore' | 'debate' | 'consensus' = 'debate';
        const maxRounds = config?.maxRounds || 10;

        const agentNames = Array.from(sessionAgents.values()).map(a => a.config.name);

        try {
            weLogger.info({ sessionId, topic, agentNames }, 'auto_generating_outline');

            const outline = await outlineGenerator.generate({
                topic,
                objective,
                agentNames,
                maxRounds
            });

            this.outlines.set(sessionId, outline);

            await this.publishSystemEvent(sessionId, 'OUTLINE_GENERATED', {
                message: '讨论大纲已自动生成',
                outline: {
                    objective: outline.objective,
                    itemCount: outline.items?.length || 0,
                    conflictPoints: outline.conflictDesign || []
                }
            });

            weLogger.info({
                sessionId,
                itemCount: outline.items?.length || 0,
                conflictPoints: outline.conflictDesign?.length || 0
            }, 'outline_generated');
        } catch (err: any) {
            weLogger.warn({ sessionId, error: err.message }, 'outline_generation_failed');
            // 大纲生成失败不阻塞讨论开始
        }
    }

    // ============================================
    // 介入程度控制
    // ============================================

    /**
     * 设置介入程度 (0-3)
     */
    setInterventionLevel(sessionId: string, level: number): void {
        this.interventionLevels.set(sessionId, Math.max(0, Math.min(3, level)));
    }

    /**
     * 获取介入程度
     */
    getInterventionLevel(sessionId: string): number {
        return this.interventionLevels.get(sessionId) ?? 2;
    }

    /**
     * 发布系统事件
     */
    private async publishSystemEvent(
        sessionId: string,
        action: string,
        details: Record<string, unknown>
    ): Promise<void> {
        const event = await eventLogService.appendEvent({
            sessionId,
            type: EventType.SYSTEM,
            speaker: 'moderator',
            content: { action, ...details }
        });

        eventBus.publish(event as any);
    }
}

export const moderatorController = new ModeratorController();
