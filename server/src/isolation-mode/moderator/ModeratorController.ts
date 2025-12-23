/**
 * 主持人控制器
 * 
 * 负责流程调度，不涉及 LLM 调用
 */

import { SessionState } from '../core/types';
import { IModeratorController, IAgent, IRuleEngine } from '../core/interfaces';

/**
 * 主持人控制器实现
 */
export class ModeratorController implements IModeratorController {
    private sessions: Map<string, SessionState> = new Map();
    private agents: Map<string, Map<string, IAgent>> = new Map();
    private ruleEngine: IRuleEngine | null = null;

    /**
     * 设置规则引擎
     */
    setRuleEngine(engine: IRuleEngine): void {
        this.ruleEngine = engine;
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

        // TODO: 发布 session:start 事件
        // TODO: 选择第一个发言者
    }

    /**
     * 暂停讨论
     */
    async pauseSession(sessionId: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (state) {
            state.status = 'paused';
            // TODO: 发布 session:pause 事件
        }
    }

    /**
     * 恢复讨论
     */
    async resumeSession(sessionId: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (state && state.status === 'paused') {
            state.status = 'active';
            // TODO: 发布 session:resume 事件
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
            // TODO: 发布 session:end 事件
        }
    }

    /**
     * 选择下一个发言者
     */
    async selectNextSpeaker(sessionId: string): Promise<IAgent | null> {
        const state = this.sessions.get(sessionId);
        const sessionAgents = this.agents.get(sessionId);

        if (!state || !sessionAgents || !this.ruleEngine) {
            return null;
        }

        const agentList = Array.from(sessionAgents.values());
        const nextSpeaker = this.ruleEngine.getNextSpeaker(state, agentList);

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
            // TODO: 发布 moderator:direct 事件
        }
    }

    /**
     * 检查是否应该结束
     */
    shouldEndSession(state: SessionState): boolean {
        // TODO: 根据结束条件判断
        return state.status === 'completed' || state.status === 'aborted';
    }

    /**
     * 推进一轮
     */
    async advanceRound(sessionId: string): Promise<void> {
        const state = this.sessions.get(sessionId);
        if (state) {
            state.currentRound += 1;
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
}

export const moderatorController = new ModeratorController();
