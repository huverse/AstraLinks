/**
 * 主持人控制器
 *
 * 负责流程调度，不涉及 LLM 调用
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionState, SessionStatus, EventType } from '../core/types';
import { IModeratorController, IAgent, IRuleEngine } from '../core/interfaces';
import { eventLogService, eventBus } from '../event-log';
import { getDiscussionLoopLauncher } from '../orchestrator/DiscussionLoopLauncher';
import { weLogger } from '../../services/world-engine-logger';

/**
 * 主持人控制器实现
 */
export class ModeratorController implements IModeratorController {
    private sessions: Map<string, SessionState> = new Map();
    private agents: Map<string, Map<string, IAgent>> = new Map();
    private ruleEngines: Map<string, IRuleEngine> = new Map();

    /**
     * 设置规则引擎
     */
    setRuleEngine(sessionId: string, engine: IRuleEngine): void {
        this.ruleEngines.set(sessionId, engine);
    }

    /**
     * 清理会话数据
     */
    clearSession(sessionId: string): void {
        this.sessions.delete(sessionId);
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

        state.status = 'active';
        state.startedAt = Date.now();
        state.currentRound = 1;

        await this.publishSystemEvent(sessionId, 'SESSION_START', {
            message: '讨论开始',
            round: 1
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
        }

        return nextSpeaker;
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
