/**
 * Isolation Mode WebSocket 客户端 (生产版)
 * 
 * 特性:
 * - JWT token 握手认证
 * - 指数退避重连 (1s → 2s → 4s → 8s → max 60s)
 * - 事件队列合并 (防止 UI 卡顿)
 * - 状态恢复 (重连后请求全量状态)
 * - 结构化日志
 */

import { io, Socket } from 'socket.io-client';
import { isolationLogger } from '../utils/logger';

// ============================================
// 类型定义
// ============================================

export interface WorldEvent {
    eventId: string;
    sessionId: string;
    type: string;
    tick: number;
    payload: Record<string, unknown>;
}

export interface StateUpdate {
    sessionId: string;
    worldState: Record<string, unknown>;
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
    onReconnecting?: (attempt: number, delay: number) => void;
}

interface SocketConfig {
    /** 最大重连次数 */
    maxReconnectAttempts: number;
    /** 初始重连延迟 (ms) */
    initialReconnectDelay: number;
    /** 最大重连延迟 (ms) */
    maxReconnectDelay: number;
    /** 事件合并窗口 (ms) */
    eventMergeWindow: number;
}

const DEFAULT_CONFIG: SocketConfig = {
    maxReconnectAttempts: 10,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 60000,
    eventMergeWindow: 50,
};

// ============================================
// IsolationSocket 类
// ============================================

class IsolationSocketService {
    private socket: Socket | null = null;
    private currentSessionId: string | null = null;
    private callbacks: SocketCallbacks = {};
    private reconnectAttempts = 0;
    private tokenGetter: (() => string | null) | null = null;
    private config: SocketConfig;
    private eventQueue: WorldEvent[] = [];
    private eventFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private isConnecting = false;

    constructor(config: Partial<SocketConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 设置 token 获取函数
     */
    setTokenGetter(getter: () => string | null): void {
        this.tokenGetter = getter;
    }

    /**
     * 获取 API WebSocket URL (生产环境自动检测)
     */
    private getWsUrl(): string {
        // @ts-ignore - Vite 环境变量
        const apiBase = import.meta.env?.VITE_API_BASE;
        if (apiBase) {
            return apiBase;
        }

        // 生产环境检测
        if (typeof window !== 'undefined') {
            const { hostname, protocol } = window.location;
            // 生产域名
            if (hostname === 'astralinks.xyz' || hostname === 'www.astralinks.xyz') {
                return `${protocol}//astralinks.xyz`;
            }
            // 其他部署场景 (相同域名)
            if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
                return `${protocol}//${hostname}${window.location.port ? ':' + window.location.port : ''}`;
            }
        }

        // 开发环境
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
        if (typeof window !== 'undefined') {
            return localStorage.getItem('token');
        }
        return null;
    }

    /**
     * 计算重连延迟 (指数退避)
     */
    private getReconnectDelay(): number {
        const delay = this.config.initialReconnectDelay * Math.pow(2, this.reconnectAttempts);
        return Math.min(delay, this.config.maxReconnectDelay);
    }

    /**
     * 连接到隔离模式 WebSocket
     */
    connect(callbacks?: SocketCallbacks): void {
        if (this.socket?.connected) {
            isolationLogger.warn('Already connected, skipping');
            return;
        }

        if (this.isConnecting) {
            isolationLogger.warn('Connection in progress, skipping');
            return;
        }

        const token = this.getToken();
        if (!token) {
            isolationLogger.error('No authentication token available');
            callbacks?.onError?.(new Error('No authentication token'));
            return;
        }

        this.isConnecting = true;
        this.callbacks = callbacks || {};
        const wsUrl = this.getWsUrl();

        isolationLogger.info('Connecting to WebSocket', { url: wsUrl });

        this.socket = io(`${wsUrl}/isolation`, {
            auth: { token },
            // Polling 优先，因为 WebSocket 存在 RSV1 帧问题
            transports: ['polling', 'websocket'],
            reconnection: false, // 手动管理重连以实现指数退避
            timeout: 10000,
            forceNew: true,
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
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            isolationLogger.info('WebSocket connected', { socketId: this.socket?.id });
            this.callbacks.onConnect?.();

            // 如果之前加入过 session，重新加入并请求全量状态
            if (this.currentSessionId) {
                this.rejoinSession(this.currentSessionId);
            }
        });

        // 断开连接
        this.socket.on('disconnect', (reason) => {
            this.isConnecting = false;
            isolationLogger.warn('WebSocket disconnected', { reason });
            this.callbacks.onDisconnect?.(reason);

            // 自动重连 (除非是主动断开)
            if (reason !== 'io client disconnect') {
                this.scheduleReconnect();
            }
        });

        // 连接错误
        this.socket.on('connect_error', (error) => {
            this.isConnecting = false;
            isolationLogger.error('WebSocket connection error', { error: error.message });
            this.callbacks.onError?.(error);
            this.scheduleReconnect();
        });

        // World Event (使用队列合并)
        this.socket.on('world_event', (event: WorldEvent) => {
            this.queueEvent(event);
        });

        // State Update
        this.socket.on('state_update', (state: StateUpdate) => {
            this.callbacks.onStateUpdate?.(state);
        });

        // 模拟结束
        this.socket.on('simulation_ended', (data: { sessionId: string; reason: string }) => {
            isolationLogger.info('Simulation ended', data);
            this.callbacks.onSimulationEnded?.(data);
        });

        // 全量状态响应 (重连恢复用)
        this.socket.on('full_state', (data: { sessionId: string; worldState: Record<string, unknown>; events: WorldEvent[] }) => {
            isolationLogger.info('Received full state', { sessionId: data.sessionId, eventCount: data.events.length });
            // 批量处理历史事件
            data.events.forEach(event => {
                this.callbacks.onWorldEvent?.(event);
            });
            this.callbacks.onStateUpdate?.({
                sessionId: data.sessionId,
                worldState: data.worldState,
                tick: 0,
                isTerminated: false,
            });
        });
    }

    /**
     * 事件队列 (合并高频事件)
     */
    private queueEvent(event: WorldEvent): void {
        this.eventQueue.push(event);

        if (!this.eventFlushTimer) {
            this.eventFlushTimer = setTimeout(() => {
                this.flushEventQueue();
            }, this.config.eventMergeWindow);
        }
    }

    /**
     * 刷新事件队列
     */
    private flushEventQueue(): void {
        this.eventFlushTimer = null;

        if (this.eventQueue.length === 0) return;

        // 批量处理事件
        const events = [...this.eventQueue];
        this.eventQueue = [];

        // 通知回调
        events.forEach(event => {
            this.callbacks.onWorldEvent?.(event);
        });
    }

    /**
     * 调度重连
     */
    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            isolationLogger.error('Max reconnect attempts reached', { attempts: this.reconnectAttempts });
            this.callbacks.onError?.(new Error('Max reconnect attempts reached'));
            return;
        }

        const delay = this.getReconnectDelay();
        this.reconnectAttempts++;

        isolationLogger.info('Scheduling reconnect', { attempt: this.reconnectAttempts, delay });
        this.callbacks.onReconnecting?.(this.reconnectAttempts, delay);

        setTimeout(() => {
            if (!this.socket?.connected) {
                this.socket?.close();
                this.socket = null;
                this.connect(this.callbacks);
            }
        }, delay);
    }

    /**
     * 重新加入会话 (重连后)
     */
    private rejoinSession(sessionId: string): void {
        isolationLogger.info('Rejoining session after reconnect', { sessionId });

        this.socket?.emit('join_session', { sessionId, requestFullState: true }, (response: { success: boolean; error?: string }) => {
            if (response.success) {
                isolationLogger.info('Rejoined session successfully', { sessionId });
            } else {
                isolationLogger.error('Failed to rejoin session', { sessionId, error: response.error });
            }
        });
    }

    /**
     * 加入会话
     */
    joinSession(sessionId: string): Promise<{ success: boolean; worldState?: Record<string, unknown>; error?: string }> {
        return new Promise((resolve) => {
            this.currentSessionId = sessionId;

            if (!this.socket?.connected) {
                resolve({ success: false, error: 'Not connected' });
                return;
            }

            this.socket.emit('join_session', { sessionId }, (response: { success: boolean; worldState?: Record<string, unknown>; error?: string }) => {
                if (response.success) {
                    isolationLogger.info('Joined session', { sessionId });
                } else {
                    isolationLogger.error('Failed to join session', { sessionId, error: response.error });
                }
                resolve(response);
            });
        });
    }

    /**
     * 创建会话
     */
    createSession(config: {
        worldType: 'game' | 'logic' | 'society' | 'debate';
        agents?: { id: string; name: string; role?: string }[];
        maxTicks?: number;
        problemStatement?: string;
    }): Promise<{ success: boolean; sessionId?: string; worldState?: Record<string, unknown>; error?: string }> {
        return Promise.resolve({
            success: false,
            error: 'Isolation socket does not support create_session. Use /api/isolation/sessions.'
        });
    }

    /**
     * 执行 Step
     */
    step(actions: { agentId: string; type: string; payload: Record<string, unknown> }[]): Promise<{
        success: boolean;
        events?: WorldEvent[];
        worldState?: Record<string, unknown>;
        isTerminated?: boolean;
        terminationReason?: string;
        error?: string;
    }> {
        return Promise.resolve({
            success: false,
            error: 'Isolation socket does not support step actions.'
        });
    }

    /**
     * 启动自动模拟 (需要 admin 权限)
     */
    startAutoSimulation(tickInterval = 2000): Promise<{
        success: boolean;
        message?: string;
        tickInterval?: number;
        error?: string;
    }> {
        return Promise.resolve({
            success: false,
            error: 'Isolation socket does not support auto simulation.'
        });
    }

    /**
     * 停止自动模拟
     */
    stopAutoSimulation(): Promise<{ success: boolean; error?: string }> {
        return Promise.resolve({
            success: false,
            error: 'Isolation socket does not support auto simulation.'
        });
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        if (this.eventFlushTimer) {
            clearTimeout(this.eventFlushTimer);
            this.eventFlushTimer = null;
        }

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        this.currentSessionId = null;
        this.callbacks = {};
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.eventQueue = [];

        isolationLogger.info('Disconnected from WebSocket');
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

    /**
     * 获取重连状态
     */
    getReconnectInfo(): { attempts: number; maxAttempts: number; isReconnecting: boolean } {
        return {
            attempts: this.reconnectAttempts,
            maxAttempts: this.config.maxReconnectAttempts,
            isReconnecting: this.isConnecting && this.reconnectAttempts > 0,
        };
    }
}

// 单例导出
export const isolationSocket = new IsolationSocketService();

// React Hook 便捷导出
export function useIsolationSocket() {
    return isolationSocket;
}
