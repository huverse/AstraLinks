/**
 * WebSocket 网关
 * 
 * 用于实时通信
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { eventBus } from '../../event-log';
import { sessionManager } from '../../session';

/**
 * 初始化 WebSocket 网关
 */
export function initializeWebSocketGateway(io: SocketIOServer): void {
    const isolationNamespace = io.of('/isolation');

    isolationNamespace.on('connection', (socket: Socket) => {
        console.log('[Isolation] WebSocket connected:', socket.id);

        // 加入会话房间
        socket.on('join:session', async (data: { sessionId: string }) => {
            const { sessionId } = data;

            // 验证会话存在
            const session = sessionManager.get(sessionId);
            if (!session) {
                socket.emit('error', { message: 'Session not found' });
                return;
            }

            socket.join(sessionId);
            socket.emit('joined', { sessionId });

            // 订阅事件并转发给客户端
            const unsubscribe = eventBus.subscribeToSession(sessionId, (event) => {
                socket.emit('event', event);
            });

            // 离开时取消订阅
            socket.on('leave:session', () => {
                socket.leave(sessionId);
                unsubscribe();
            });

            socket.on('disconnect', () => {
                unsubscribe();
            });
        });

        // 处理发言请求
        socket.on('speak:request', async (data: { sessionId: string; content: string }) => {
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
                        // await moderatorController.pauseSession(sessionId);
                        break;
                    case 'resume':
                        // await moderatorController.resumeSession(sessionId);
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
            console.log('[Isolation] WebSocket disconnected:', socket.id);
        });
    });
}
