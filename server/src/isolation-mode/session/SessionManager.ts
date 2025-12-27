/**
 * 会话管理器
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionConfig, SessionState, SessionSummary, ScenarioConfig } from '../core/types';
import { SessionError } from '../core/errors';
import { agentFactory } from '../agents';
import { moderatorController, RuleEngine } from '../moderator';
import { eventLogService, eventBus } from '../event-log';
import { scenarioLoader } from '../scenarios';
import { resolveDiscussionRules } from '../scenarios/RulesResolver';
import { createLlmAdapterFromUserConfig, getDefaultLlmAdapter } from '../llm';

/**
 * 会话管理器
 */
export class SessionManager {
    private sessions: Map<string, SessionConfig> = new Map();

    /**
     * 创建会话
     */
    async create(
        params: Omit<SessionConfig, 'id' | 'createdAt'>
    ): Promise<SessionConfig> {
        const id = uuidv4();
        const now = Date.now();

        // 加载并验证场景
        const scenario = await scenarioLoader.load(params.scenario.id);
        const rules = resolveDiscussionRules(scenario, params.maxRounds);

        const config: SessionConfig = {
            ...params,
            scenario,
            maxRounds: params.maxRounds ?? rules.maxRounds,
            id,
            createdAt: now,
        };

        // 解析用户 LLM 配置（如有）
        const llmAdapter = config.llmConfig
            ? createLlmAdapterFromUserConfig(config.llmConfig)
            : getDefaultLlmAdapter();
        if (config.llmConfig && !llmAdapter.isAvailable()) {
            throw new SessionError('Invalid LLM configuration', id);
        }

        // 保存配置
        this.sessions.set(id, config);

        // 创建会话状态
        moderatorController.createSessionState(id);

        // 绑定规则引擎
        const sessionRuleEngine = new RuleEngine();
        sessionRuleEngine.setRules(rules);
        moderatorController.setRuleEngine(id, sessionRuleEngine);

        // 创建 Agent 实例并注册
        for (const agentConfig of config.agents) {
            const agent = agentFactory.create(agentConfig, llmAdapter);
            await agent.initialize(id);
            moderatorController.registerAgent(id, agent);

            // 订阅事件
            eventBus.subscribeToSession(id, (event) => {
                agent.receiveEvent(event).catch((err) => {
                    import('../../services/world-engine-logger').then(({ isolationLogger }) => {
                        isolationLogger.error({ error: (err as Error).message, sessionId: id }, 'agent_receive_event_error');
                    });
                });
            });
        }

        return config;
    }

    /**
     * 获取会话
     */
    get(sessionId: string): SessionConfig | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * 获取会话状态
     */
    getState(sessionId: string): SessionState | undefined {
        return moderatorController.getSessionState(sessionId);
    }

    /**
     * 开始会话
     */
    async start(sessionId: string): Promise<void> {
        const config = this.sessions.get(sessionId);
        if (!config) {
            throw new SessionError('Session not found', sessionId);
        }

        await moderatorController.startSession(sessionId);
    }

    /**
     * 结束会话
     */
    async end(sessionId: string, reason: string = 'Manual end'): Promise<void> {
        await moderatorController.endSession(sessionId, reason);
    }

    /**
     * 删除会话
     */
    async delete(sessionId: string): Promise<void> {
        this.sessions.delete(sessionId);
        await eventLogService.clearSession(sessionId);
        eventBus.clearSession(sessionId);
        moderatorController.clearSession(sessionId);
    }

    /**
     * 获取用户的所有会话
     */
    async listByUser(userId: string): Promise<SessionSummary[]> {
        const summaries = await Promise.all(
            Array.from(this.sessions.entries()).map(async ([sessionId, config]) => {
                if (config.createdBy !== userId) {
                    return null;
                }

                const state = moderatorController.getSessionState(sessionId);
                const eventCount = await eventLogService.getEventCount(sessionId);

                return {
                    sessionId,
                    title: config.title,
                    topic: config.topic,
                    scenarioName: config.scenario.name,
                    agentCount: config.agents.length,
                    eventCount,
                    totalRounds: state?.currentRound || 0,
                    duration: state?.endedAt
                        ? state.endedAt - (state.startedAt || config.createdAt)
                        : 0,
                    status: state?.status || 'pending',
                    createdAt: config.createdAt,
                    endedAt: state?.endedAt,
                } as SessionSummary;
            })
        );

        return summaries
            .filter((summary): summary is SessionSummary => summary !== null)
            .sort((a, b) => b.createdAt - a.createdAt);
    }
}

export const sessionManager = new SessionManager();
