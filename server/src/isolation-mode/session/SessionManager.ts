/**
 * 会话管理器
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionConfig, SessionState, SessionSummary } from '../core/types';
import { SessionError } from '../core/errors';
import { agentFactory } from '../agents';
import { moderatorController } from '../moderator';
import { eventLogService, eventBus } from '../event-log';
import { scenarioLoader } from '../scenarios';

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

        const config: SessionConfig = {
            ...params,
            id,
            createdAt: now,
        };

        // 验证场景
        await scenarioLoader.load(config.scenario.id);

        // 保存配置
        this.sessions.set(id, config);

        // 创建会话状态
        moderatorController.createSessionState(id);

        // 创建 Agent 实例并注册
        for (const agentConfig of config.agents) {
            const agent = agentFactory.create(agentConfig);
            await agent.initialize(id);
            moderatorController.registerAgent(id, agent);

            // 订阅事件
            eventBus.subscribeToSession(id, (event) => {
                agent.receiveEvent(event).catch(console.error);
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
        eventLogService.clearSession(sessionId);
        eventBus.clearSession(sessionId);
    }

    /**
     * 获取用户的所有会话
     */
    listByUser(userId: string): SessionSummary[] {
        const summaries: SessionSummary[] = [];

        this.sessions.forEach((config, sessionId) => {
            if (config.createdBy === userId) {
                const state = moderatorController.getSessionState(sessionId);
                summaries.push({
                    sessionId,
                    title: config.title,
                    topic: config.topic,
                    scenarioName: config.scenario.name,
                    agentCount: config.agents.length,
                    eventCount: eventLogService.getEventCount(sessionId),
                    totalRounds: state?.currentRound || 0,
                    duration: state?.endedAt
                        ? state.endedAt - (state.startedAt || config.createdAt)
                        : 0,
                    status: state?.status || 'pending',
                    createdAt: config.createdAt,
                    endedAt: state?.endedAt,
                });
            }
        });

        return summaries.sort((a, b) => b.createdAt - a.createdAt);
    }
}

export const sessionManager = new SessionManager();
