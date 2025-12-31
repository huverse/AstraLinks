/**
 * WebSocket 网关
 *
 * 用于实时通信
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { eventBus, eventLogService } from '../../event-log';
import { sessionManager } from '../../session';
import {
    moderatorController,
    outlineGenerator,
    judgeSystem,
    IntentUrgencyLevel,
    INTERVENTION_LEVEL_DESCRIPTIONS,
} from '../../moderator';
import { Event, EventType, Intent } from '../../core/types';
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

type ClientPayload = Record<string, unknown> & {
    message?: string;
    content?: string;
    action?: unknown;
};

interface StateUpdatePayload {
    sessionId: string;
    worldState: Record<string, unknown>;
    tick: number;
    isTerminated: boolean;
    terminationReason?: string;
}

const MAX_FULL_STATE_EVENTS = 200;

function toClientWorldEvent(event: Event): ClientWorldEvent {
    const payload: ClientPayload = typeof event.content === 'string'
        ? { message: event.content }
        : { ...(event.content as Record<string, unknown>) };

    const hasMessage = typeof payload.message === 'string' && payload.message.length > 0;
    const hasContent = typeof payload.content === 'string' && payload.content.length > 0;

    if (!hasMessage && !hasContent && payload.action !== undefined) {
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
        socket.on('speak:request', async (
            data: { sessionId: string; agentId?: string; content?: string },
            callback?: (response: any) => void
        ) => {
            const { sessionId, agentId, content } = data;

            // 验证会话
            const session = sessionManager.get(sessionId);
            if (!session) {
                const error = { success: false, error: 'Session not found' };
                callback?.(error);
                socket.emit('speak:response', error);
                return;
            }

            // 确定目标 Agent
            let targetAgentId = agentId;
            if (!targetAgentId) {
                // 如果未指定，使用当前发言者或第一个 Agent
                const state = moderatorController.getSessionState(sessionId);
                targetAgentId = state?.currentSpeakerId || session.agents[0]?.id;
            }

            if (!targetAgentId) {
                const error = { success: false, error: 'No agent specified or available' };
                callback?.(error);
                socket.emit('speak:response', error);
                return;
            }

            try {
                const result = await moderatorController.triggerAgentSpeak(
                    sessionId,
                    targetAgentId,
                    content
                );

                callback?.(result);
                socket.emit('speak:response', result);
            } catch (error: any) {
                const errorResponse = { success: false, error: error.message };
                callback?.(errorResponse);
                socket.emit('speak:response', errorResponse);
            }
        });

        // 处理暂停/恢复请求
        socket.on('session:control', async (
            data: { sessionId: string; action: 'pause' | 'resume' | 'end' },
            callback?: (response: { success: boolean; error?: string }) => void
        ) => {
            const { sessionId, action } = data;

            try {
                switch (action) {
                    case 'pause':
                        await moderatorController.pauseSession(sessionId);
                        socket.to(`session:${sessionId}`).emit('session:paused', { sessionId });
                        break;
                    case 'resume':
                        await moderatorController.resumeSession(sessionId);
                        socket.to(`session:${sessionId}`).emit('session:resumed', { sessionId });
                        break;
                    case 'end':
                        await sessionManager.end(sessionId, 'User ended');
                        socket.to(`session:${sessionId}`).emit('session:ended', { sessionId });
                        break;
                }
                callback?.({ success: true });
            } catch (error: any) {
                callback?.({ success: false, error: error.message });
                socket.emit('error', { message: error.message });
            }
        });

        // 举手/插话意图提交
        socket.on('intent:submit', async (
            data: {
                sessionId: string;
                agentId: string;
                type: Intent['type'];
                urgencyLevel?: IntentUrgencyLevel;
                targetAgentId?: string;
                topic?: string;
                preview?: string;
            },
            callback?: (response: any) => void
        ) => {
            const { sessionId, agentId, type, urgencyLevel, targetAgentId, topic, preview } = data;

            try {
                const result = await moderatorController.submitIntent(sessionId, {
                    agentId,
                    type,
                    urgency: urgencyLevel || IntentUrgencyLevel.RAISE_HAND,
                    urgencyLevel,
                    targetAgentId,
                    topic,
                    preview,
                });

                callback?.(result);
                socket.emit('intent:response', result);

                // 广播给房间内其他用户
                if (result.success) {
                    socket.to(`session:${sessionId}`).emit('intent:submitted', {
                        agentId,
                        type,
                        urgencyLevel,
                        position: result.position,
                    });
                }
            } catch (error: any) {
                const errorResponse = { success: false, error: error.message };
                callback?.(errorResponse);
                socket.emit('intent:response', errorResponse);
            }
        });

        // 获取待处理意图列表
        socket.on('intent:list', (data: { sessionId: string }, callback?: (response: any) => void) => {
            const intents = moderatorController.getPendingIntents(data.sessionId);
            const response = { success: true, intents };
            callback?.(response);
            socket.emit('intent:list:response', response);
        });

        // 主持人点名
        socket.on('moderator:call', async (
            data: { sessionId: string; agentId: string; reason?: string },
            callback?: (response: any) => void
        ) => {
            const { sessionId, agentId, reason } = data;

            try {
                const result = await moderatorController.callAgent(sessionId, agentId, reason);
                callback?.(result);
                socket.emit('moderator:call:response', result);

                if (result.success) {
                    socket.to(`session:${sessionId}`).emit('moderator:called', { agentId, reason });
                }
            } catch (error: any) {
                const errorResponse = { success: false, error: error.message };
                callback?.(errorResponse);
                socket.emit('moderator:call:response', errorResponse);
            }
        });

        // 主持人请求回应
        socket.on('moderator:request-response', async (
            data: { sessionId: string; responderId: string; targetId: string; topic?: string },
            callback?: (response: any) => void
        ) => {
            const { sessionId, responderId, targetId, topic } = data;

            try {
                const result = await moderatorController.requestResponse(sessionId, responderId, targetId, topic);
                callback?.(result);
                socket.emit('moderator:request-response:response', result);
            } catch (error: any) {
                const errorResponse = { success: false, error: error.message };
                callback?.(errorResponse);
                socket.emit('moderator:request-response:response', errorResponse);
            }
        });

        // 设置介入程度
        socket.on('intervention:set', (
            data: { sessionId: string; level: number },
            callback?: (response: any) => void
        ) => {
            const { sessionId, level } = data;

            try {
                moderatorController.setInterventionLevel(sessionId, level);
                const description = INTERVENTION_LEVEL_DESCRIPTIONS[level];
                const response = { success: true, level, description };
                callback?.(response);
                socket.emit('intervention:set:response', response);
                socket.to(`session:${sessionId}`).emit('intervention:changed', { level, description });
            } catch (error: any) {
                const errorResponse = { success: false, error: error.message };
                callback?.(errorResponse);
                socket.emit('intervention:set:response', errorResponse);
            }
        });

        // 获取介入程度
        socket.on('intervention:get', (data: { sessionId: string }, callback?: (response: any) => void) => {
            const level = moderatorController.getInterventionLevel(data.sessionId);
            const description = INTERVENTION_LEVEL_DESCRIPTIONS[level];
            const response = { success: true, level, description };
            callback?.(response);
            socket.emit('intervention:get:response', response);
        });

        // 生成讨论大纲
        socket.on('outline:generate', async (
            data: {
                sessionId: string;
                topic: string;
                objective: 'explore' | 'debate' | 'consensus';
                agentNames: string[];
                factions?: Array<{ id: string; name: string }>;
                maxRounds?: number;
            },
            callback?: (response: any) => void
        ) => {
            try {
                const outline = await outlineGenerator.generate(data);
                moderatorController.setOutline(data.sessionId, outline);
                const response = { success: true, outline };
                callback?.(response);
                socket.emit('outline:generated', response);
            } catch (error: any) {
                const errorResponse = { success: false, error: error.message };
                callback?.(errorResponse);
                socket.emit('outline:generated', errorResponse);
            }
        });

        // 获取讨论大纲
        socket.on('outline:get', (data: { sessionId: string }, callback?: (response: any) => void) => {
            const outline = moderatorController.getOutline(data.sessionId);
            const response = outline
                ? { success: true, outline }
                : { success: false, error: 'No outline found' };
            callback?.(response);
            socket.emit('outline:get:response', response);
        });

        // 触发评分
        socket.on('judge:score', async (
            data: {
                sessionId: string;
                topic: string;
                agentIds: string[];
                judges: Array<{ id: string; name: string; style?: 'strict' | 'lenient' | 'balanced'; weight: number }>;
            },
            callback?: (response: any) => void
        ) => {
            const { sessionId, topic, agentIds, judges } = data;

            try {
                const events = await eventLogService.getRecentEvents(sessionId, 500);
                const result = await judgeSystem.score({
                    sessionId,
                    topic,
                    events,
                    agentIds,
                    judges,
                });
                const response = { success: true, result };
                callback?.(response);
                socket.emit('judge:scored', response);
                socket.to(`session:${sessionId}`).emit('judge:scored', response);
            } catch (error: any) {
                const errorResponse = { success: false, error: error.message };
                callback?.(errorResponse);
                socket.emit('judge:scored', errorResponse);
            }
        });

        // 生成讨论总结
        socket.on('summary:generate', async (
            data: {
                sessionId: string;
                topic: string;
                summaryType: 'phase_end' | 'mid_phase' | 'final';
            },
            callback?: (response: any) => void
        ) => {
            const { sessionId, topic, summaryType } = data;

            try {
                const { getModeratorLLMService } = await import('../../moderator');
                const moderatorLLMService = getModeratorLLMService();

                if (!moderatorLLMService) {
                    throw new Error('ModeratorLLMService not initialized');
                }

                // 获取讨论事件
                const events = await eventLogService.getRecentEvents(sessionId, 300);
                const speechEvents = events.filter((e: any) =>
                    e.type === 'SPEECH' || e.type === 'agent:speak'
                );

                // 压缩事件为要点
                const condensedEvents = speechEvents.slice(-20).map((e: any) => ({
                    speaker: e.sourceId || e.agentId || 'unknown',
                    keyPoint: typeof e.payload?.content === 'string'
                        ? e.payload.content.slice(0, 100)
                        : 'N/A'
                }));

                const result = await moderatorLLMService.generateSummary({
                    topic,
                    summaryType,
                    phase: { id: 'discussion', name: '讨论', type: 'free_discussion' },
                    condensedEvents,
                    consensusPoints: [],
                    divergencePoints: []
                });

                const response = { success: true, summary: result };
                callback?.(response);
                socket.emit('summary:generated', response);
                socket.to(`session:${sessionId}`).emit('summary:generated', response);
            } catch (error: any) {
                const errorResponse = { success: false, error: error.message };
                callback?.(errorResponse);
                socket.emit('summary:generated', errorResponse);
            }
        });

        socket.on('disconnect', () => {
            cleanupSubscription();
            isolationLogger.info({ socketId: socket.id }, 'isolation_socket_disconnected');
        });
    });
}
