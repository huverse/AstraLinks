/**
 * useIsolationSession Hook
 *
 * 管理隔离模式的Socket连接和会话状态
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { isolationSocket, WorldEvent, StateUpdate } from '../services/isolationSocket';
import { isolationLogger } from '../utils/logger';

export interface IsolationSessionState {
    connected: boolean;
    reconnecting: boolean;
    reconnectAttempts: number;
    sessionId: string | null;
    error: string | null;
}

export interface UseIsolationSessionOptions {
    token: string | null;
    onWorldEvent?: (event: WorldEvent) => void;
    onStateUpdate?: (state: StateUpdate) => void;
    onSimulationEnded?: (sessionId: string) => void;
}

export function useIsolationSession(options: UseIsolationSessionOptions) {
    const { token, onWorldEvent, onStateUpdate, onSimulationEnded } = options;

    const [state, setState] = useState<IsolationSessionState>({
        connected: false,
        reconnecting: false,
        reconnectAttempts: 0,
        sessionId: null,
        error: null,
    });

    const initialized = useRef(false);
    const callbacksRef = useRef({ onWorldEvent, onStateUpdate, onSimulationEnded });

    // 更新回调引用
    useEffect(() => {
        callbacksRef.current = { onWorldEvent, onStateUpdate, onSimulationEnded };
    }, [onWorldEvent, onStateUpdate, onSimulationEnded]);

    // 初始化Socket连接
    useEffect(() => {
        if (!token || initialized.current) return;
        initialized.current = true;

        isolationSocket.setTokenGetter(() => token);

        isolationSocket.connect({
            onConnect: () => {
                setState(prev => ({
                    ...prev,
                    connected: true,
                    reconnecting: false,
                    reconnectAttempts: 0,
                    error: null,
                }));
                isolationLogger.info('WebSocket connected');
            },
            onDisconnect: (reason) => {
                setState(prev => ({ ...prev, connected: false }));
                isolationLogger.warn('WebSocket disconnected', { reason });
            },
            onReconnecting: (attempt, delay) => {
                setState(prev => ({
                    ...prev,
                    reconnecting: true,
                    reconnectAttempts: attempt,
                }));
                isolationLogger.info('Reconnecting', { attempt, delay });
            },
            onWorldEvent: (event) => {
                callbacksRef.current.onWorldEvent?.(event);
            },
            onStateUpdate: (update) => {
                callbacksRef.current.onStateUpdate?.(update);
            },
            onSimulationEnded: ({ sessionId }) => {
                callbacksRef.current.onSimulationEnded?.(sessionId);
            },
            onError: (err) => {
                setState(prev => ({ ...prev, error: err.message }));
                isolationLogger.error('Socket error', { error: err.message });
            },
        });

        return () => {
            isolationSocket.disconnect();
            initialized.current = false;
        };
    }, [token]);

    // 加入会话
    const joinSession = useCallback(async (sessionId: string) => {
        const result = await isolationSocket.joinSession(sessionId);
        if (result.success) {
            setState(prev => ({ ...prev, sessionId, error: null }));
        } else {
            setState(prev => ({ ...prev, error: result.error || 'Failed to join session' }));
        }
        return result;
    }, []);

    // 离开会话
    const leaveSession = useCallback(() => {
        setState(prev => ({ ...prev, sessionId: null }));
    }, []);

    // 清除错误
    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    return {
        ...state,
        joinSession,
        leaveSession,
        clearError,
        isConnected: state.connected,
    };
}
