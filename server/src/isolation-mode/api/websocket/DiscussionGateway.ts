/**
 * WebSocket 网关
 *
 * 用于实时通信
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { eventBus, eventLogService } from '../../event-log';
import { sessionManager } from '../../session';
import { moderatorController } from '../../moderator';
import { Event, EventType } from '../../core/types';
import { isolationLogger } from '../../../services/world-engine-logger';

interface JoinSessionRequest {
    sessionId: string;
    requestFullState?: boolean;
}

interface ClientWorldEvent {
    eventId: string;
    sessionId: string;
    type: string;
    tick: number;
    payload: Record<string, unknown>;
}

interface StateUpdatePayload {
    sessionId: string;
    worldState: Record<string, unknown>;
    tick: number;
    isTerminated: boolean;
    terminationReason?: string;
}

const MAX_FULL_STATE_EVENTS = 200;

function toClientWorldEvent(event: Event): ClientWorldEvent {
    const payload = typeof event.content === 'string'
        ? { message: event.content }
        : { ...(event.content as Record<string, unknown>) };

    if (!payload.message && !payload.content && payload.action) {
        payload.message = String(payload.action);
    }

    return {
        eventId: event.eventId,
        sessionId: event.sessionId,
        type: event.type,
        tick: event.sequence,
        payload: {
            ...payload,
            speaker: event.speaker,
            timestamp: event.timestamp,
            meta: event.meta
        }
    };
}

function buildStateUpdate(sessionId: string, tick: number): StateUpdatePayload | null {
    const state = moderatorController.getSessionState(sessionId);
    if (!state) {
        return null;
    }

    const isTerminated = state.status === 'completed' || state.status === 'aborted';

    return {
        sessionId,
        worldState: {
            status: state.status,
            currentRound: state.currentRound,
            currentSpeakerId: state.currentSpeakerId
        },
        tick,
        isTerminated,
        terminationReason: isTerminated ? state.status : undefined
    };
}

/**
 * 初始化 WebSocket 网关
 */
export function initializeWebSocketGateway(io: SocketIOServer): void {
    const isolationNamespace = io.of('/isolation');

    isolationNamespace.on('connection', (socket: Socket) => {
        isolationLogger.info({ socketId: socket.id, userId: socket.data?.user?.id }, 'isolation_socket_connected');

        let currentSessionId: string | null = null;
        let unsubscribe: (() => void) | null = null;

        const cleanupSubscription = () => {
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
            if (currentSessionId) {
                socket.leave(`session:${currentSessionId}`);
                currentSessionId = null;
            }
        };

        const joinSession = async (data: JoinSessionRequest, callback?: (response: any) => void) => {
            const { sessionId, requestFullState } = data;

            const session = sessionManager.get(sessionId);
            if (!session) {
                callback?.({ success: false, error: 'Session not found' });
                socket.emit('error', { message: 'Session not found' });
                return;
            }

            cleanupSubscription();

            currentSessionId = sessionId;
            socket.join(`session:${sessionId}`);

            // 订阅事件并转发给客户端
            unsubscribe = eventBus.subscribeToSession(sessionId, (event) => {
                const mappedEvent = toClientWorldEvent(event);
                socket.emit('world_event', mappedEvent);

                const stateUpdate = buildStateUpdate(sessionId, event.sequence);
                if (stateUpdate) {
                    socket.emit('state_update', stateUpdate);
                }

                if (event.type === EventType.SYSTEM) {
                    const content = event.content as Record<string, unknown>;
                    const action = content?.action as string | undefined;
                    if (action === 'SESSION_END' || action === 'SESSION_ABORTED') {
                        socket.emit('simulation_ended', {
                            sessionId,
                            reason: content?.reason || content?.message || action || 'ended'
                        });
                    }
                }
            });

            const currentSequence = await eventLogService.getCurrentSequence(sessionId);
            const initialState = buildStateUpdate(sessionId, currentSequence);
            if (initialState) {
                socket.emit('state_update', initialState);
            }

            if (requestFullState) {
                const events = await eventLogService.getRecentEvents(sessionId, MAX_FULL_STATE_EVENTS);
                socket.emit('full_state', {
                    sessionId,
                    worldState: initialState?.worldState || {},
                    events: events.map(toClientWorldEvent)
                });
            }

            socket.emit('joined', { sessionId });
            callback?.({ success: true, sessionId, worldState: initialState?.worldState });
        };

        socket.on('join_session', (data: JoinSessionRequest, callback?: (response: any) => void) => {
            void joinSession(data, callback);
        });

        socket.on('join:session', (data: { sessionId: string }) => {
            void joinSession({ sessionId: data.sessionId, requestFullState: false });
        });

        socket.on('leave_session', () => {
            cleanupSubscription();
        });

        socket.on('leave:session', () => {
            cleanupSubscription();
        });

        // 处理发言请求
        socket.on('speak:request', async (_data: { sessionId: string; content: string }) => {
            // TODO: 处理发言请求
            // 1. 验证权限
            // 2. 触发 Agent 发言
            // 3. 发布事件
        });

        // 处理暂停/恢复请求
        socket.on('session:control', async (data: { sessionId: string; action: 'pause' | 'resume' | 'end' }) => {
            const { sessionId, action } = data;

            try {
                switch (action) {
                    case 'pause':
                        await moderatorController.pauseSession(sessionId);
                        break;
                    case 'resume':
                        await moderatorController.resumeSession(sessionId);
                        break;
                    case 'end':
                        await sessionManager.end(sessionId, 'User ended');
                        break;
                }
            } catch (error: any) {
                socket.emit('error', { message: error.message });
            }
        });

        socket.on('disconnect', () => {
            cleanupSubscription();
            isolationLogger.info({ socketId: socket.id }, 'isolation_socket_disconnected');
        });
    });
}
