/**
 * World Engine WebSocket Service
 * 
 * WebSocket 服务，负责：
 * - 创建/加入 World Session
 * - 实时广播 World Events
 * - 处理 Agent Actions
 */

import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
    worldEngineSessionManager,
    WorldEngineSessionConfig,
    WorldEngineType
} from '../session/WorldEngineSessionManager';
import { Action } from '../world-engine/interfaces';

// ============================================
// WebSocket 事件类型
// ============================================

export interface CreateSessionRequest {
    worldType: WorldEngineType;
    maxTicks?: number;
    agents?: { id: string; name: string; role?: string }[];
}

export interface JoinSessionRequest {
    sessionId: string;
}

export interface SubmitActionRequest {
    sessionId: string;
    actions: Partial<Action>[];
}

// ============================================
// World Engine Socket Handler
// ============================================

/**
 * 初始化 World Engine WebSocket namespace
 */
export function initWorldEngineSocket(io: Server): void {
    const worldEngine = io.of('/world-engine');

    worldEngine.on('connection', (socket: Socket) => {
        console.log(`🌍 World Engine client connected: ${socket.id}`);

        // 当前加入的 session
        let currentSessionId: string | null = null;

        // ========================================
        // 创建 Session
        // ========================================
        socket.on('create_session', async (request: CreateSessionRequest, callback) => {
            try {
                const config: WorldEngineSessionConfig = {
                    worldType: request.worldType,
                    maxTicks: request.maxTicks,
                    agents: request.agents
                };

                const session = await worldEngineSessionManager.createSession(config);
                currentSessionId = session.id;

                // 加入 session room
                socket.join(`session:${session.id}`);

                const worldState = worldEngineSessionManager.getWorldState(session.id);

                callback({
                    success: true,
                    sessionId: session.id,
                    worldType: session.worldType,
                    worldState
                });

                console.log(`✅ Session created via WebSocket: ${session.id}`);
            } catch (error: any) {
                callback({
                    success: false,
                    error: error.message
                });
            }
        });

        // ========================================
        // 加入 Session
        // ========================================
        socket.on('join_session', (request: JoinSessionRequest, callback) => {
            try {
                const session = worldEngineSessionManager.getSession(request.sessionId);
                if (!session) {
                    callback({ success: false, error: 'Session not found' });
                    return;
                }

                currentSessionId = request.sessionId;
                socket.join(`session:${request.sessionId}`);

                const worldState = worldEngineSessionManager.getWorldState(request.sessionId);

                callback({
                    success: true,
                    sessionId: session.id,
                    worldType: session.worldType,
                    status: session.status,
                    tickCount: session.tickCount,
                    worldState
                });

                console.log(`👤 Client joined session: ${request.sessionId}`);
            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // ========================================
        // 提交 Actions 并执行 Step
        // ========================================
        socket.on('submit_actions', async (request: SubmitActionRequest, callback) => {
            try {
                const session = worldEngineSessionManager.getSession(request.sessionId);
                if (!session) {
                    callback({ success: false, error: 'Session not found' });
                    return;
                }

                // 补全 Action 字段
                const actions: Action[] = request.actions.map(a => ({
                    actionId: a.actionId || uuidv4(),
                    agentId: a.agentId || 'unknown',
                    actionType: a.actionType || 'idle',
                    params: a.params || {},
                    confidence: a.confidence ?? 1.0,
                    timestamp: a.timestamp || Date.now(),
                    target: a.target,
                    priority: a.priority
                } as Action));

                // 执行 step
                const result = await worldEngineSessionManager.step(request.sessionId, actions);

                // 广播事件到所有订阅者
                for (const event of result.events) {
                    worldEngine.to(`session:${request.sessionId}`).emit('world_event', event);
                }

                // 广播状态更新
                worldEngine.to(`session:${request.sessionId}`).emit('state_update', {
                    tickCount: session.tickCount,
                    worldState: result.worldState,
                    isTerminated: result.isTerminated
                });

                // 如果结束，广播结束事件
                if (result.isTerminated) {
                    worldEngine.to(`session:${request.sessionId}`).emit('simulation_ended', {
                        reason: result.terminationReason,
                        finalState: result.worldState
                    });
                }

                callback({
                    success: true,
                    tickCount: session.tickCount,
                    isTerminated: result.isTerminated,
                    eventsCount: result.events.length
                });

            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // ========================================
        // 自动运行模拟 (Society)
        // ========================================
        socket.on('start_auto_simulation', async (request: { sessionId: string; tickInterval?: number }, callback) => {
            try {
                const session = worldEngineSessionManager.getSession(request.sessionId);
                if (!session) {
                    callback({ success: false, error: 'Session not found' });
                    return;
                }

                if (session.worldType !== 'society') {
                    callback({ success: false, error: 'Auto simulation only supported for society world' });
                    return;
                }

                const tickInterval = request.tickInterval || 500; // 默认 500ms

                callback({ success: true, message: 'Auto simulation started' });

                // 自动运行
                const runTick = async () => {
                    const s = worldEngineSessionManager.getSession(request.sessionId);
                    if (!s || s.status === 'ended' || s.engine.isTerminated()) {
                        return;
                    }

                    // 生成随机 Actions
                    const societyEngine = s.engine as any;
                    const activeAgents = societyEngine.getActiveAgents?.() || [];
                    const actions = activeAgents.map((agent: any) => generateRandomSocietyAction(agent.agentId));

                    const result = await worldEngineSessionManager.step(request.sessionId, actions);

                    // 广播事件
                    for (const event of result.events) {
                        worldEngine.to(`session:${request.sessionId}`).emit('world_event', event);
                    }

                    worldEngine.to(`session:${request.sessionId}`).emit('state_update', {
                        tickCount: s.tickCount,
                        worldState: result.worldState,
                        isTerminated: result.isTerminated
                    });

                    if (result.isTerminated) {
                        worldEngine.to(`session:${request.sessionId}`).emit('simulation_ended', {
                            reason: result.terminationReason,
                            finalState: result.worldState
                        });
                    } else {
                        setTimeout(runTick, tickInterval);
                    }
                };

                runTick();

            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // ========================================
        // 获取事件历史
        // ========================================
        socket.on('get_events', (request: { sessionId: string; limit?: number }, callback) => {
            try {
                const events = worldEngineSessionManager.getEvents(request.sessionId, request.limit || 100);
                callback({ success: true, events });
            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // ========================================
        // 断开连接
        // ========================================
        socket.on('disconnect', () => {
            console.log(`🌍 World Engine client disconnected: ${socket.id}`);
            if (currentSessionId) {
                socket.leave(`session:${currentSessionId}`);
            }
        });
    });

    console.log('🌍 World Engine WebSocket namespace initialized');
}

// ============================================
// 辅助函数
// ============================================

/**
 * 生成随机社会 Action
 */
function generateRandomSocietyAction(agentId: string): Action {
    const actionTypes = ['work', 'consume', 'talk', 'help', 'idle'] as const;
    const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];

    let params: Record<string, unknown> = {};

    switch (actionType) {
        case 'work':
            params = { intensity: Math.floor(Math.random() * 3) + 1 };
            break;
        case 'consume':
            params = { amount: Math.floor(Math.random() * 10) + 5 };
            break;
        case 'talk':
            params = {
                targetAgentId: `agent-${Math.floor(Math.random() * 5) + 1}`,
                talkType: ['friendly', 'neutral', 'hostile'][Math.floor(Math.random() * 3)]
            };
            break;
        case 'help':
            params = {
                targetAgentId: `agent-${Math.floor(Math.random() * 5) + 1}`,
                amount: Math.floor(Math.random() * 10) + 1
            };
            break;
    }

    return {
        actionId: uuidv4(),
        agentId,
        actionType,
        params,
        confidence: 1.0,
        timestamp: Date.now()
    };
}
