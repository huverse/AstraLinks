/**
 * World Engine Session Manager
 * 
 * 管理 World Engine 实例的生命周期（独立于辩论 SessionManager）
 * - 支持 game/logic/society 世界类型
 * - 创建/销毁 Sessions
 * - 自动清理超时 Sessions
 */

import { v4 as uuidv4 } from 'uuid';
import {
    IWorldEngine,
    WorldEvent,
    Action
} from '../world-engine/interfaces';
import {
    GameWorldEngine,
    createGameWorldEngine
} from '../world-engine/game';
import {
    LogicWorldEngine,
    createLogicWorldEngine,
    Hypothesis,
    Goal
} from '../world-engine/logic';
import {
    SocietyWorldEngine,
    createSocietyWorldEngine,
    createDefaultSociety,
    SocialRole
} from '../world-engine/society';
import { sessionLogger } from '../../services/world-engine-logger';

// ============================================
// Session Types
// ============================================

export type WorldEngineType = 'game' | 'logic' | 'society';

export interface WorldEngineSessionConfig {
    worldType: WorldEngineType;
    maxTicks?: number;
    agents?: { id: string; name: string; role?: string }[];
    // Logic specific
    problemStatement?: string;
    hypotheses?: Hypothesis[];
    goals?: Goal[];
}

export interface WorldEngineSession {
    id: string;
    worldType: WorldEngineType;
    engine: IWorldEngine;
    createdAt: number;
    lastActivityAt: number;
    status: 'created' | 'running' | 'paused' | 'ended';
    tickCount: number;
    config: WorldEngineSessionConfig;
}

// ============================================
// World Engine Session Manager
// ============================================

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟超时

class WorldEngineSessionManager {
    private sessions: Map<string, WorldEngineSession> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // 每 5 分钟清理一次超时 Sessions
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * 创建新 Session
     */
    async createSession(config: WorldEngineSessionConfig): Promise<WorldEngineSession> {
        const sessionId = `we-${uuidv4().slice(0, 8)}`;
        let engine: IWorldEngine;

        switch (config.worldType) {
            case 'game':
                const gameAgents = config.agents?.map(a => a.id) || ['A', 'B'];
                engine = await createGameWorldEngine(gameAgents, config.maxTicks || 20);
                break;

            case 'logic':
                const logicAgents = config.agents?.map(a => a.id) || ['researcher-1', 'researcher-2'];
                engine = await createLogicWorldEngine(
                    'prob-001',
                    config.problemStatement || 'Prove: a + b = b + a',
                    config.hypotheses || [],
                    config.goals || [],
                    logicAgents
                );
                break;

            case 'society':
                if (config.agents && config.agents.length > 0) {
                    const societyAgents = config.agents.map(a => ({
                        id: a.id,
                        name: a.name,
                        role: (a.role || 'neutral') as SocialRole
                    }));
                    engine = await createSocietyWorldEngine(societyAgents, config.maxTicks || 100);
                } else {
                    engine = await createDefaultSociety(config.maxTicks || 100);
                }
                break;

            default:
                throw new Error(`Unknown world type: ${config.worldType}`);
        }

        const session: WorldEngineSession = {
            id: sessionId,
            worldType: config.worldType,
            engine,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
            status: 'created',
            tickCount: 0,
            config
        };

        this.sessions.set(sessionId, session);
        sessionLogger.info({ sessionId, worldType: config.worldType }, 'world_engine_session_created');
        return session;
    }

    /**
     * 获取 Session
     */
    getSession(sessionId: string): WorldEngineSession | undefined {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivityAt = Date.now();
        }
        return session;
    }

    /**
     * 执行 Step
     */
    async step(sessionId: string, actions: Action[]): Promise<{
        results: any[];
        events: WorldEvent[];
        worldState: any;
        isTerminated: boolean;
        terminationReason?: string;
    }> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        session.lastActivityAt = Date.now();
        session.status = 'running';

        const results = await session.engine.step(actions);
        session.tickCount++;

        const worldState = session.engine.getWorldState();
        const isTerminated = session.engine.isTerminated();
        const terminationReason = session.engine.getTerminationReason();

        if (isTerminated) {
            session.status = 'ended';
        }

        // 获取最近的事件
        const events = session.engine.getEvents(50);

        return {
            results,
            events,
            worldState: this.serializeWorldState(worldState),
            isTerminated,
            terminationReason
        };
    }

    /**
     * 获取事件历史
     */
    getEvents(sessionId: string, limit: number = 100): WorldEvent[] {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return session.engine.getEvents(limit);
    }

    /**
     * 获取当前 WorldState
     */
    getWorldState(sessionId: string): any {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return this.serializeWorldState(session.engine.getWorldState());
    }

    /**
     * 结束 Session
     */
    endSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = 'ended';
        }
    }

    /**
     * 删除 Session
     */
    deleteSession(sessionId: string): boolean {
        const result = this.sessions.delete(sessionId);
        if (result) {
            sessionLogger.info({ sessionId }, 'world_engine_session_deleted');
        }
        return result;
    }

    /**
     * 列出所有 Sessions
     */
    listSessions(): { id: string; worldType: WorldEngineType; status: string; tickCount: number; createdAt: number }[] {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            worldType: s.worldType,
            status: s.status,
            tickCount: s.tickCount,
            createdAt: s.createdAt
        }));
    }

    /**
     * 清理超时 Sessions
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (now - session.lastActivityAt > SESSION_TIMEOUT_MS) {
                sessionLogger.info({ sessionId: id }, 'cleaning_up_timed_out_session');
                this.sessions.delete(id);
            }
        }
    }

    /**
     * 序列化 WorldState (处理 Map)
     */
    private serializeWorldState(state: any): any {
        if (state === null || state === undefined) {
            return state;
        }

        if (state instanceof Map) {
            const obj: any = {};
            for (const [key, value] of state) {
                obj[key] = this.serializeWorldState(value);
            }
            return obj;
        }

        if (Array.isArray(state)) {
            return state.map(item => this.serializeWorldState(item));
        }

        if (typeof state === 'object') {
            const result: any = {};
            for (const [key, value] of Object.entries(state)) {
                result[key] = this.serializeWorldState(value);
            }
            return result;
        }

        return state;
    }

    /**
     * 销毁
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.sessions.clear();
    }
}

// 单例
export const worldEngineSessionManager = new WorldEngineSessionManager();
