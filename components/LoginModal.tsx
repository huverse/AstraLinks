import React, { useState, useEffect, useRef } from 'react';
import { X, User, Mail, Lock, Key, Loader2, AlertCircle, CheckCircle, FileText, Shield, Check, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../utils/api';
import MarkdownRenderer from './MarkdownRenderer';

// Cloudflare Turnstile Site Key
const TURNSTILE_SITE_KEY = '0x4AAAAAACHmC6NQQ8IJpFD8';

// Declare turnstile type for TypeScript
declare global {
    interface Window {
        turnstile?: {
            render: (element: string | HTMLElement, options: {
                sitekey: string;
                callback: (token: string) => void;
                'error-callback'?: () => void;
                'expired-callback'?: () => void;
                theme?: 'light' | 'dark' | 'auto';
            }) => string;
            reset: (widgetId: string) => void;
            remove: (widgetId: string) => void;
        };
    }
}

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type ModalMode = 'login' | 'register' | 'resetPassword' | 'emailLogin';

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
    const { login, register, resetPassword } = useAuth();

    const [mode, setMode] = useState<ModalMode>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form fields
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [invitationCode, setInvitationCode] = useState('');

    // Email login states
    const [emailLoginEmail, setEmailLoginEmail] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [emailCodeId, setEmailCodeId] = useState<string | null>(null);
    const [emailCodeSending, setEmailCodeSending] = useState(false);
    const [emailCodeSent, setEmailCodeSent] = useState(false);
    const [emailCooldown, setEmailCooldown] = useState(0);

    // For password reset (synced users)
    const [resetUserId, setResetUserId] = useState<number | null>(null);
    const [resetUsername, setResetUsername] = useState('');

    // Terms and Privacy Agreement
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [showPolicyModal, setShowPolicyModal] = useState<'terms' | 'privacy' | null>(null);
    const [policyContent, setPolicyContent] = useState<{ title: string, content: string } | null>(null);
    const [loadingPolicy, setLoadingPolicy] = useState(false);

    // Cloudflare Turnstile
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [turnstileLoginEnabled, setTurnstileLoginEnabled] = useState(true); // Default to enabled for safety
    const [turnstileSiteKey, setTurnstileSiteKey] = useState(TURNSTILE_SITE_KEY);
    const turnstileWidgetId = useRef<string | null>(null);
    const turnstileContainerRef = useRef<HTMLDivElement>(null);

    // Fetch Turnstile settings from API
    useEffect(() => {
        const fetchTurnstileSettings = async () => {
            // Bypass Turnstile on localhost for development
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('[Turnstile] Bypassed on localhost');
                setTurnstileLoginEnabled(false);
                setTurnstileToken('localhost-bypass');
                return;
            }

            try {
                const response = await fetch('/api/settings/public/turnstile');
                if (response.ok) {
                    const data = await response.json();
                    setTurnstileLoginEnabled(data.loginEnabled);
                    if (data.siteKey) {
                        setTurnstileSiteKey(data.siteKey);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch Turnstile settings:', err);
                // Keep default (enabled) if fetch fails
            }
        };
        fetchTurnstileSettings();
    }, []);

    // Initialize Turnstile widget (only if login Turnstile is enabled)
    useEffect(() => {
        if (!isOpen || mode === 'resetPassword' || !turnstileLoginEnabled) return;

        const initTurnstile = () => {
            if (window.turnstile && turnstileContainerRef.current && !turnstileWidgetId.current) {
                turnstileWidgetId.current = window.turnstile.render(turnstileContainerRef.current, {
                    sitekey: turnstileSiteKey,
                    callback: (token: string) => {
                        setTurnstileToken(token);
                    },
                    'error-callback': () => {
                        setTurnstileToken(null);
                        setError('验证失败，请刷新页面重试');
                    },
                    'expired-callback': () => {
                        setTurnstileToken(null);
                    },
                    theme: 'auto',
                });
            }
        };

        // Wait for turnstile script to load
        const checkTurnstile = setInterval(() => {
            if (window.turnstile) {
                clearInterval(checkTurnstile);
                initTurnstile();
            }
        }, 100);

        return () => {
            clearInterval(checkTurnstile);
            if (turnstileWidgetId.current && window.turnstile) {
                window.turnstile.remove(turnstileWidgetId.current);
                turnstileWidgetId.current = null;
            }
        };
    }, [isOpen, mode, turnstileLoginEnabled, turnstileSiteKey]);

    // Reset turnstile when mode changes
    useEffect(() => {
        if (turnstileWidgetId.current && window.turnstile) {
            window.turnstile.reset(turnstileWidgetId.current);
            setTurnstileToken(null);
        }
    }, [mode]);

    const resetForm = () => {
        setUsername('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setInvitationCode('');
        setError(null);
        setSuccess(null);
        setResetUserId(null);
        setResetUsername('');
        setAgreedToTerms(false);
        setTurnstileToken(null);
        // Reset email login states
        setEmailLoginEmail('');
        setEmailCode('');
        setEmailCodeId(null);
        setEmailCodeSent(false);
        setEmailCooldown(0);
        // Reset turnstile widget
        if (turnstileWidgetId.current && window.turnstile) {
            window.turnstile.reset(turnstileWidgetId.current);
        }
    };

    const handleModeSwitch = (newMode: ModalMode) => {
        resetForm();
        setMode(newMode);
    };

    // Fetch policy content from site settings
    const fetchPolicyContent = async (type: 'terms' | 'privacy') => {
        setLoadingPolicy(true);
        setShowPolicyModal(type);
        try {
            const endpoint = type === 'terms'
                ? `${API_BASE}/api/settings/public/terms`
                : `${API_BASE}/api/settings/public/privacy`;

            const res = await fetch(endpoint);
            if (res.ok) {
                const data = await res.json();
                setPolicyContent({
                    title: type === 'terms' ? '用户协议' : '隐私政策',
                    content: data.content || (type === 'terms' ? '暂无用户协议内容。' : '暂无隐私政策内容。')
                });
            } else {
                throw new Error('加载失败');
            }
        } catch (e) {
            setPolicyContent({
                title: type === 'terms' ? '用户协议' : '隐私政策',
                content: '加载失败，请稍后重试。'
            });
        } finally {
            setLoadingPolicy(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (turnstileLoginEnabled && !turnstileToken) {
            setError('请完成人机验证');
            return;
        }

        setIsLoading(true);

        const result = await login(username, password, turnstileLoginEnabled ? turnstileToken : undefined);

        setIsLoading(false);

        if (result.success) {
            setSuccess('登录成功！');
            setTimeout(() => {
                onClose();
                resetForm();
            }, 1000);
        } else if (result.needsPasswordReset && result.userId) {
            // User synced from WordPress, needs to set password
            setResetUserId(result.userId);
            setResetUsername(username);
            setMode('resetPassword');
            setError(null);
        } else {
            setError(result.error || '登录失败');
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (turnstileLoginEnabled && !turnstileToken) {
            setError('请完成人机验证');
            return;
        }

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        if (password.length < 6) {
            setError('密码长度至少 6 个字符');
            return;
        }

        if (!invitationCode) {
            setError('请输入邀请码');
            return;
        }

        if (!agreedToTerms) {
            setError('请先阅读并同意用户协议和隐私政策');
            return;
        }

        setIsLoading(true);
        const result = await register(username, email, password, invitationCode, turnstileLoginEnabled ? turnstileToken : undefined);
        setIsLoading(false);

        if (result.success) {
            setSuccess('注册成功！');
            setTimeout(() => {
                onClose();
                resetForm();
            }, 1000);
        } else {
            setError(result.error || '注册失败');
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!resetUserId) {
            setError('缺少用户信息');
            return;
        }

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        if (password.length < 6) {
            setError('密码长度至少 6 个字符');
            return;
        }

        setIsLoading(true);
        const result = await resetPassword(resetUserId, resetUsername, password);
        setIsLoading(false);

        if (result.success) {
            setSuccess('密码设置成功！');
            setTimeout(() => {
                onClose();
                resetForm();
            }, 1000);
        } else {
            setError(result.error || '设置密码失败');
        }
    };

    // Email login: send verification code
    const handleSendEmailCode = async () => {
        if (!emailLoginEmail || !emailLoginEmail.includes('@')) {
            setError('请输入有效的邮箱地址');
            return;
        }

        // Require Turnstile verification if enabled
        if (turnstileLoginEnabled && !turnstileToken) {
            setError('请先完成人机验证');
            return;
        }

        setError(null);
        setEmailCodeSending(true);

        try {
            const res = await fetch(`${API_BASE}/api/auth/email/send-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailLoginEmail,
                    turnstileToken: turnstileToken
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || '发送验证码失败');
                setEmailCodeSending(false);
                return;
            }

            setEmailCodeId(data.codeId);
            setEmailCodeSent(true);
            setEmailCooldown(60);
            setEmailCodeSending(false);

            // Countdown timer
            const timer = setInterval(() => {
                setEmailCooldown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err) {
            setError('网络错误，请稍后重试');
            setEmailCodeSending(false);
        }
    };

    // Email login: verify code
    const handleEmailVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!emailLoginEmail || !emailCode || !emailCodeId) {
            setError('请输入邮箱和验证码');
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch(`${API_BASE}/api/auth/email/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailLoginEmail,
                    code: emailCode,
                    codeId: emailCodeId,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || '验证失败');
                setIsLoading(false);
                return;
            }

            if (data.isExisting && data.token) {
                // Existing user - login directly
                localStorage.setItem('galaxyous_token', data.token);
                setSuccess('登录成功！');
                setTimeout(() => {
                    onClose();
                    resetForm();
                    window.location.reload();
                }, 1000);
            } else if (data.emailSession) {
                // New user - redirect to complete registration
                window.location.href = `/complete-oauth?email_session=${data.emailSession}`;
            }
        } catch (err) {
            setError('网络错误，请稍后重试');
        }

        setIsLoading(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="relative p-6 bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                    <button
                        onClick={() => { onClose(); resetForm(); }}
                        className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/20 transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <h2 className="text-2xl font-bold">
                        {mode === 'login' && '欢迎回来'}
                        {mode === 'register' && '加入我们'}
                        {mode === 'resetPassword' && '设置密码'}
                        {mode === 'emailLogin' && '邮箱登录'}
                    </h2>
                    <p className="mt-1 text-blue-100">
                        {mode === 'login' && '登录您的 Galaxyous 账号'}
                        {mode === 'register' && '使用邀请码注册新账号'}
                        {mode === 'resetPassword' && '您的账号需要设置新密码'}
                        {mode === 'emailLogin' && '使用邮箱验证码登录'}
                    </p>
                </div>

                {/* Form */}
                <form
                    onSubmit={
                        mode === 'login' ? handleLogin :
                            mode === 'register' ? handleRegister :
                                mode === 'emailLogin' ? handleEmailVerify :
                                    handleResetPassword
                    }
                    className="p-6 space-y-4"
                >
                    {/* Error/Success Messages */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                            <AlertCircle size={18} />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                            <CheckCircle size={18} />
                            <span className="text-sm">{success}</span>
                        </div>
                    )}

                    {/* Username (Login/Register) */}
                    {(mode === 'login' || mode === 'register') && (
                        <div className="relative">
                            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="用户名"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                required
                            />
                        </div>
                    )}

                    {/* Email Login Form */}
                    {mode === 'emailLogin' && (
                        <>
                            <div className="relative">
                                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="email"
                                    placeholder="请输入邮箱地址"
                                    value={emailLoginEmail}
                                    onChange={(e) => setEmailLoginEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    required
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="验证码"
                                        value={emailCode}
                                        onChange={(e) => setEmailCode(e.target.value)}
                                        maxLength={6}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                        required
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSendEmailCode}
                                    disabled={emailCodeSending || emailCooldown > 0}
                                    className="px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                                >
                                    {emailCodeSending ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : emailCooldown > 0 ? (
                                        `${emailCooldown}s`
                                    ) : emailCodeSent ? (
                                        '重新发送'
                                    ) : (
                                        '发送验证码'
                                    )}
                                </button>
                            </div>
                        </>
                    )}

                    {/* Email (Register only) */}
                    {mode === 'register' && (
                        <div className="relative">
                            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="email"
                                placeholder="邮箱（可选）"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>
                    )}

                    {/* Password */}
                    {mode !== 'emailLogin' && (
                        <div className="relative">
                            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="password"
                                placeholder={mode === 'resetPassword' ? '设置新密码' : '密码'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                required
                            />
                        </div>
                    )}

                    {/* Confirm Password (Register/Reset) */}
                    {(mode === 'register' || mode === 'resetPassword') && (
                        <div className="relative">
                            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="password"
                                placeholder="确认密码"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                required
                            />
                        </div>
                    )}

                    {/* Invitation Code (Register only) */}
                    {mode === 'register' && (
                        <div className="relative">
                            <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="邀请码（8位或12位）"
                                value={invitationCode}
                                onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                                maxLength={12}
                                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono tracking-widest"
                                required
                            />
                        </div>
                    )}

                    {/* Terms and Privacy Agreement (Register only) */}
                    {mode === 'register' && (
                        <div className="flex items-start gap-3 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setAgreedToTerms(!agreedToTerms)}
                                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${agreedToTerms
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white dark:bg-slate-700 border-2 border-slate-300 dark:border-slate-600'
                                    }`}
                            >
                                {agreedToTerms && <Check size={14} />}
                            </button>
                            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                我已阅读并同意
                                <button
                                    type="button"
                                    onClick={() => fetchPolicyContent('terms')}
                                    className="text-blue-500 hover:underline mx-1 font-medium"
                                >
                                    《用户协议》
                                </button>
                                和
                                <button
                                    type="button"
                                    onClick={() => fetchPolicyContent('privacy')}
                                    className="text-blue-500 hover:underline mx-1 font-medium"
                                >
                                    《隐私政策》
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Cloudflare Turnstile Widget */}
                    {(mode === 'login' || mode === 'register') && turnstileLoginEnabled && (
                        <div className="flex flex-col items-center gap-2">
                            <div ref={turnstileContainerRef} className="cf-turnstile" />
                            {turnstileToken && (
                                <div className="flex items-center gap-1 text-xs text-green-500">
                                    <ShieldCheck size={14} />
                                    <span>验证通过</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading || ((mode === 'login' || mode === 'register') && turnstileLoginEnabled && !turnstileToken) || (mode === 'emailLogin' && (!emailCodeSent || !emailCode))}
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                处理中...
                            </>
                        ) : (
                            <>
                                {mode === 'login' && '登录'}
                                {mode === 'register' && '注册'}
                                {mode === 'resetPassword' && '确认设置'}
                                {mode === 'emailLogin' && '验证登录'}
                            </>
                        )}
                    </button>

                    {/* Mode Toggle */}
                    {(mode === 'login' || mode === 'register' || mode === 'emailLogin') && (
                        <div className="text-center text-sm text-slate-500">
                            {mode === 'login' && (
                                <>
                                    还没有账号？
                                    <button
                                        type="button"
                                        onClick={() => handleModeSwitch('register')}
                                        className="ml-1 text-blue-500 hover:underline"
                                    >
                                        立即注册
                                    </button>
                                </>
                            )}
                            {mode === 'register' && (
                                <>
                                    已有账号？
                                    <button
                                        type="button"
                                        onClick={() => handleModeSwitch('login')}
                                        className="ml-1 text-blue-500 hover:underline"
                                    >
                                        返回登录
                                    </button>
                                </>
                            )}
                            {mode === 'emailLogin' && (
                                <button
                                    type="button"
                                    onClick={() => handleModeSwitch('login')}
                                    className="text-blue-500 hover:underline"
                                >
                                    返回账号密码登录
                                </button>
                            )}
                        </div>
                    )}

                    {/* Third-party Login */}
                    {mode === 'login' && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <div className="text-center text-xs text-slate-400 mb-3">或使用其他方式登录</div>
                            <div className="flex gap-3 mb-3">
                                {/* QQ Login */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (turnstileLoginEnabled && !turnstileToken) {
                                            setError('请先完成人机验证');
                                            return;
                                        }
                                        const apiBase = (import.meta as any).env?.VITE_PROXY_API_BASE || 'http://localhost:3001';
                                        const url = turnstileToken
                                            ? `${apiBase}/api/auth/qq?turnstileToken=${encodeURIComponent(turnstileToken)}`
                                            : `${apiBase}/api/auth/qq`;
                                        window.location.href = url;
                                    }}
                                    className="flex-1 py-3 bg-[#12B7F5] hover:bg-[#0DA8E3] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg viewBox="0 0 1024 1024" className="w-5 h-5" fill="currentColor">
                                        <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm210.5 612.4c-11.5 1.4-44.9-52.7-44.9-52.7 0 31.3-16.2 72.2-51.1 101.8 16.9 5.2 54.9 19.2 45.9 34.4-7.3 12.3-125.6 7.9-159.8 4-34.2 3.8-152.5 8.3-159.8-4-9.1-15.2 28.9-29.2 45.8-34.4-35-29.5-51.1-70.4-51.1-101.8 0 0-33.4 54.1-44.9 52.7-5.4-.7-12.4-29.6 9.4-99.7 10.3-33 22-60.5 40.2-105.8-3.1-116.9 45.3-215 160.4-215 113.9 0 162.4 98.1 160.4 215 18.1 45.2 29.9 72.8 40.2 105.8 21.7 70.1 14.6 99.1 9.3 99.7z" />
                                    </svg>
                                    QQ
                                </button>

                                {/* Google Login */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (turnstileLoginEnabled && !turnstileToken) {
                                            setError('请先完成人机验证');
                                            return;
                                        }
                                        const apiBase = (import.meta as any).env?.VITE_PROXY_API_BASE || 'http://localhost:3001';
                                        const url = turnstileToken
                                            ? `${apiBase}/api/auth/google?turnstileToken=${encodeURIComponent(turnstileToken)}`
                                            : `${apiBase}/api/auth/google`;
                                        window.location.href = url;
                                    }}
                                    className="flex-1 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg viewBox="0 0 24 24" className="w-5 h-5">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                    Google
                                </button>
                            </div>
                            {/* Email Login Button */}
                            <button
                                type="button"
                                onClick={() => handleModeSwitch('emailLogin')}
                                className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                <Mail size={18} />
                                邮箱验证码登录
                            </button>
                        </div>
                    )}
                </form>
            </div>

            {/* Policy Modal */}
            {showPolicyModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-blue-500 to-indigo-600">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                {showPolicyModal === 'terms' ? <FileText size={20} /> : <Shield size={20} />}
                                {policyContent?.title || (showPolicyModal === 'terms' ? '用户协议' : '隐私政策')}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowPolicyModal(null);
                                    setPolicyContent(null);
                                }}
                                className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            {loadingPolicy ? (
                                <div className="flex items-center justify-center py-10">
                                    <Loader2 className="animate-spin text-blue-500" size={32} />
                                </div>
                            ) : (
                                <MarkdownRenderer
                                    content={policyContent?.content || ''}
                                    className="text-slate-700 dark:text-slate-300 leading-relaxed"
                                />
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                            <button
                                onClick={() => {
                                    setShowPolicyModal(null);
                                    setPolicyContent(null);
                                }}
                                className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
                            >
                                我已阅读
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoginModal;
