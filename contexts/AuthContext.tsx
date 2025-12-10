import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// API base URL - in production, this should be your server URL
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

interface User {
    id: number;
    username: string;
    email: string | null;
    isAdmin: boolean;
    needsPasswordReset?: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<{ success: boolean; error?: string; needsPasswordReset?: boolean; userId?: number }>;
    register: (username: string, email: string, password: string, invitationCode: string) => Promise<{ success: boolean; error?: string }>;
    resetPassword: (userId: number, username: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    // Proxy helper
    apiBase: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(() => {
        return localStorage.getItem('galaxyous_token');
    });
    const [isLoading, setIsLoading] = useState(true);

    // Verify token on mount
    useEffect(() => {
        async function verifyToken() {
            if (!token) {
                setIsLoading(false);
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setUser(data.user);
                } else {
                    // Invalid token
                    localStorage.removeItem('galaxyous_token');
                    setToken(null);
                }
            } catch (error) {
                console.error('Token verification failed:', error);
            } finally {
                setIsLoading(false);
            }
        }

        verifyToken();
    }, [token]);

    // Handle OAuth callback from URL
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const callbackToken = urlParams.get('token');
        const qqLogin = urlParams.get('qq_login');
        const qqBind = urlParams.get('qq_bind');
        const error = urlParams.get('error');

        // Handle errors
        if (error) {
            const errorMessages: Record<string, string> = {
                'missing_params': '授权参数缺失',
                'invalid_state': '授权状态无效，请重试',
                'token_failed': '获取令牌失败',
                'openid_failed': '获取用户信息失败',
                'callback_failed': '授权回调失败',
                'qq_already_bound': '该QQ已绑定其他账号'
            };
            alert(errorMessages[error] || `登录失败: ${error}`);
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }

        // Handle successful QQ bind
        if (qqBind === 'success') {
            alert('QQ绑定成功！');
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }

        // Handle QQ login with token
        if (callbackToken && qqLogin === 'success') {
            localStorage.setItem('galaxyous_token', callbackToken);
            setToken(callbackToken);
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    const login = async (username: string, password: string) => {
        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.needsPasswordReset) {
                    return { success: false, error: data.error, needsPasswordReset: true, userId: data.userId };
                }
                return { success: false, error: data.error || '登录失败' };
            }

            localStorage.setItem('galaxyous_token', data.token);
            setToken(data.token);
            setUser(data.user);
            return { success: true };

        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: '网络错误，请稍后重试' };
        }
    };

    const register = async (username: string, email: string, password: string, invitationCode: string) => {
        try {
            // Generate device fingerprint
            const deviceFingerprint = generateFingerprint();

            const response = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, invitationCode, deviceFingerprint })
            });

            const data = await response.json();

            if (!response.ok) {
                return { success: false, error: data.error || '注册失败' };
            }

            localStorage.setItem('galaxyous_token', data.token);
            setToken(data.token);
            setUser(data.user);
            return { success: true };

        } catch (error) {
            console.error('Register error:', error);
            return { success: false, error: '网络错误，请稍后重试' };
        }
    };

    const resetPassword = async (userId: number, username: string, newPassword: string) => {
        try {
            const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, username, newPassword })
            });

            const data = await response.json();

            if (!response.ok) {
                return { success: false, error: data.error || '重置密码失败' };
            }

            localStorage.setItem('galaxyous_token', data.token);
            setToken(data.token);
            setUser(data.user);
            return { success: true };

        } catch (error) {
            console.error('Reset password error:', error);
            return { success: false, error: '网络错误，请稍后重试' };
        }
    };

    const logout = () => {
        localStorage.removeItem('galaxyous_token');
        setToken(null);
        setUser(null);
    };

    const value: AuthContextType = {
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        resetPassword,
        logout,
        apiBase: API_BASE
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Generate a simple device fingerprint for invitation code binding
 */
function generateFingerprint(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('galaxyous-fingerprint', 2, 2);
    }

    const data = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        canvas.toDataURL()
    ].join('|');

    // Simple hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

export default AuthContext;
