/**
 * Isolation Mode Socket.IO 客户端服务
 * 
 * 管理与后端 World Engine WebSocket 的连接:
 * - JWT token 握手认证
 * - 断线重连 + token 刷新
 * - 事件订阅与分发
 */

import { io, Socket } from 'socket.io-client';

// ============================================
// 类型定义
// ============================================

export interface WorldEvent {
    eventId: string;
    sessionId: string;
    type: string;
    tick: number;
    payload: any;
}

export interface StateUpdate {
    sessionId: string;
    worldState: any;
    tick: number;
    isTerminated: boolean;
    terminationReason?: string;
}

export interface SocketCallbacks {
    onWorldEvent?: (event: WorldEvent) => void;
    onStateUpdate?: (state: StateUpdate) => void;
    onSimulationEnded?: (data: { sessionId: string; reason: string }) => void;
    onConnect?: () => void;
    onDisconnect?: (reason: string) => void;
    onError?: (error: Error) => void;
}

// ============================================
// IsolationSocket 类
// ============================================

class IsolationSocketService {
    private socket: Socket | null = null;
    private currentSessionId: string | null = null;
    private callbacks: SocketCallbacks = {};
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 2000;
    private tokenGetter: (() => string | null) | null = null;

    /**
     * 设置 token 获取函数
     */
    setTokenGetter(getter: () => string | null): void {
        this.tokenGetter = getter;
    }

    /**
     * 获取 API WebSocket URL
     */
    private getWsUrl(): string {
        // @ts-ignore
        const apiBase = import.meta.env.VITE_API_BASE;
        if (apiBase) {
            return apiBase.replace(/^http/, 'ws');
        }
        if (typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz') {
            return 'https://astralinks.xyz';
        }
        return 'http://localhost:3001';
    }

    /**
     * 获取当前 token
     */
    private getToken(): string | null {
        if (this.tokenGetter) {
            return this.tokenGetter();
        }
        // 备用: 从 localStorage 获取
        return localStorage.getItem('token');
    }

    /**
     * 连接到 World Engine WebSocket
     */
    connect(callbacks?: SocketCallbacks): void {
        if (this.socket?.connected) {
            console.warn('[IsolationSocket] Already connected');
            return;
        }

        const token = this.getToken();
        if (!token) {
            console.error('[IsolationSocket] No token available');
            callbacks?.onError?.(new Error('No authentication token'));
            return;
        }

        this.callbacks = callbacks || {};
        const wsUrl = this.getWsUrl();

        this.socket = io(`${wsUrl}/world-engine`, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: this.reconnectDelay,
            reconnectionDelayMax: 10000,
        });

        this.setupEventListeners();
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        if (!this.socket) return;

        // 连接成功
        this.socket.on('connect', () => {
            console.log('[IsolationSocket] Connected');
            this.reconnectAttempts = 0;
            this.callbacks.onConnect?.();

            // 如果之前加入过 session，重新加入
            if (this.currentSessionId) {
                this.joinSession(this.currentSessionId);
            }
        });

        // 断开连接
        this.socket.on('disconnect', (reason) => {
            console.log('[IsolationSocket] Disconnected:', reason);
            this.callbacks.onDisconnect?.(reason);
        });

        // 连接错误
        this.socket.on('connect_error', (error) => {
            console.error('[IsolationSocket] Connection error:', error.message);
            this.reconnectAttempts++;

            // Token 过期时尝试刷新
            if (error.message.includes('token') || error.message.includes('auth')) {
                this.handleTokenRefresh();
            }

            this.callbacks.onError?.(error);
        });

        // World Event (来自后端广播)
        this.socket.on('world_event', (event: WorldEvent) => {
            this.callbacks.onWorldEvent?.(event);
        });

        // State Update (来自后端广播)
        this.socket.on('state_update', (state: StateUpdate) => {
            this.callbacks.onStateUpdate?.(state);
        });

        // 模拟结束
        this.socket.on('simulation_ended', (data: { sessionId: string; reason: string }) => {
            this.callbacks.onSimulationEnded?.(data);
        });
    }

    /**
     * Token 刷新处理
     */
    private async handleTokenRefresh(): Promise<void> {
        // 如果 token getter 存在，尝试获取新 token 并重连
        if (this.tokenGetter) {
            const newToken = this.tokenGetter();
            if (newToken && this.socket) {
                // 更新 socket auth
                this.socket.auth = { token: newToken };
                this.socket.connect();
            }
        }
    }

    /**
     * 加入会话
     */
    joinSession(sessionId: string): Promise<{ success: boolean; worldState?: any; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket?.connected) {
                resolve({ success: false, error: 'Not connected' });
                return;
            }

            this.currentSessionId = sessionId;

            this.socket.emit('join_session', { sessionId }, (response: any) => {
                if (response.success) {
                    console.log('[IsolationSocket] Joined session:', sessionId);
                }
                resolve(response);
            });
        });
    }

    /**
     * 创建会话
     */
    createSession(config: {
        worldType: 'game' | 'logic' | 'society';
        agents?: { id: string; name: string; role?: string }[];
        maxTicks?: number;
        problemStatement?: string;
    }): Promise<{ success: boolean; sessionId?: string; worldState?: any; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket?.connected) {
                resolve({ success: false, error: 'Not connected' });
                return;
            }

            this.socket.emit('create_session', config, (response: any) => {
                if (response.success) {
                    this.currentSessionId = response.sessionId;
                    console.log('[IsolationSocket] Created session:', response.sessionId);
                }
                resolve(response);
            });
        });
    }

    /**
     * 执行 Step
     */
    step(actions: { agentId: string; type: string; payload: any }[]): Promise<{
        success: boolean;
        events?: WorldEvent[];
        worldState?: any;
        isTerminated?: boolean;
        terminationReason?: string;
        error?: string;
    }> {
        return new Promise((resolve) => {
            if (!this.socket?.connected || !this.currentSessionId) {
                resolve({ success: false, error: 'Not connected or no session' });
                return;
            }

            this.socket.emit('step', {
                sessionId: this.currentSessionId,
                actions
            }, (response: any) => {
                resolve(response);
            });
        });
    }

    /**
     * 启动自动模拟 (需要 admin 权限)
     */
    startAutoSimulation(tickInterval = 1000): Promise<{
        success: boolean;
        message?: string;
        tickInterval?: number;
        error?: string;
    }> {
        return new Promise((resolve) => {
            if (!this.socket?.connected || !this.currentSessionId) {
                resolve({ success: false, error: 'Not connected or no session' });
                return;
            }

            this.socket.emit('start_auto_simulation', {
                sessionId: this.currentSessionId,
                tickInterval
            }, (response: any) => {
                resolve(response);
            });
        });
    }

    /**
     * 停止自动模拟
     */
    stopAutoSimulation(): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket?.connected || !this.currentSessionId) {
                resolve({ success: false, error: 'Not connected or no session' });
                return;
            }

            this.socket.emit('stop_auto_simulation', {
                sessionId: this.currentSessionId
            }, (response: any) => {
                resolve(response);
            });
        });
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.currentSessionId = null;
        this.callbacks = {};
    }

    /**
     * 检查是否已连接
     */
    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }

    /**
     * 获取当前会话 ID
     */
    getCurrentSessionId(): string | null {
        return this.currentSessionId;
    }
}

// 单例导出
export const isolationSocket = new IsolationSocketService();

// React Hook 便捷导出
export function useIsolationSocket() {
    return isolationSocket;
}
