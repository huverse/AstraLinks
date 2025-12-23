import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '../middleware/auth';
import { wsLogger } from './world-engine-logger';
import { isProductionLike } from '../config/world-engine.config';

let io: Server | null = null;

// User socket mapping
const userSockets = new Map<number, Set<string>>();
const adminSockets = new Set<string>();

// CORS 配置
const getCorsOrigins = (): string[] => {
    if (isProductionLike) {
        return ['https://astralinks.xyz', 'https://www.astralinks.xyz'];
    }
    return ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'];
};

export function initWebSocket(httpServer: HttpServer): Server {
    io = new Server(httpServer, {
        cors: {
            origin: getCorsOrigins(),
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return next(new Error('Invalid token'));
        }

        socket.data.user = decoded;
        next();
    });

    io.on('connection', (socket: Socket) => {
        const user = socket.data.user;
        wsLogger.info({ userId: user.id, username: user.username, socketId: socket.id }, 'websocket_connected');

        // Track user sockets
        if (!userSockets.has(user.id)) {
            userSockets.set(user.id, new Set());
        }
        userSockets.get(user.id)!.add(socket.id);

        // Track admin sockets
        if (user.isAdmin) {
            adminSockets.add(socket.id);
        }

        // Join user room
        socket.join(`user:${user.id}`);
        if (user.isAdmin) {
            socket.join('admins');
        }

        socket.on('disconnect', () => {
            wsLogger.info({ userId: user.id, username: user.username, socketId: socket.id }, 'websocket_disconnected');
            userSockets.get(user.id)?.delete(socket.id);
            if (userSockets.get(user.id)?.size === 0) {
                userSockets.delete(user.id);
            }
            adminSockets.delete(socket.id);
        });

        // Handle typing indicator
        socket.on('typing', (data: { threadId: string }) => {
            socket.to(`thread:${data.threadId}`).emit('user_typing', {
                userId: user.id,
                username: user.username,
                isAdmin: user.isAdmin
            });
        });

        // Join feedback thread room
        socket.on('join_thread', (threadId: string) => {
            socket.join(`thread:${threadId}`);
        });

        socket.on('leave_thread', (threadId: string) => {
            socket.leave(`thread:${threadId}`);
        });
    });

    wsLogger.info({ corsOrigins: getCorsOrigins() }, 'websocket_server_initialized');
    return io;
}

// Emit events
export function emitToUser(userId: number, event: string, data: any): void {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
}

export function emitToAdmins(event: string, data: any): void {
    if (io) {
        io.to('admins').emit(event, data);
    }
}

export function emitToThread(threadId: string, event: string, data: any): void {
    if (io) {
        io.to(`thread:${threadId}`).emit(event, data);
    }
}

// Notify new feedback message
export function notifyNewFeedbackMessage(threadId: string, message: any, userId: number): void {
    // Notify user
    emitToUser(userId, 'new_feedback_message', { threadId, message });

    // Notify all admins
    emitToAdmins('new_feedback_message', { threadId, message, userId });

    // Notify anyone in the thread room
    emitToThread(threadId, 'thread_message', message);
}

// Notify feedback thread deleted
export function notifyFeedbackDeleted(threadId: string, userId: number): void {
    emitToUser(userId, 'feedback_deleted', { threadId });
    emitToAdmins('feedback_deleted', { threadId });
}

// Get IO instance for external use
export function getIO(): Server | null {
    return io;
}

export { io };

