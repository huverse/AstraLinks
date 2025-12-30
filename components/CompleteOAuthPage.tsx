/**
 * OAuth 完成注册页面
 * 
 * @module components/CompleteOAuthPage
 * @description 新 OAuth 用户完成账户关联 - 支持 QQ、Google、Email
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, User, Key, Ticket, Link2, UserPlus, CheckCircle, AlertCircle, Mail } from 'lucide-react';

type OAuthType = 'qq' | 'google' | 'email';

interface SessionInfo {
    // QQ specific
    qqNickname?: string;
    avatarUrl?: string;
    // Google specific
    email?: string;
    name?: string;
    avatar?: string;
}

export default function CompleteOAuthPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Determine OAuth type from URL params
    const qqSession = searchParams.get('qq_session');
    const googleSession = searchParams.get('google_session');
    const emailSession = searchParams.get('email_session');

    const oauthType: OAuthType | null = qqSession ? 'qq' : googleSession ? 'google' : emailSession ? 'email' : null;
    const session = qqSession || googleSession || emailSession;

    const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form state
    const [activeTab, setActiveTab] = useState<'bind' | 'create'>('create');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [invitationCode, setInvitationCode] = useState('');

    // Invitation code system state
    const [invitationCodeEnabled, setInvitationCodeEnabled] = useState(true); // Default to enabled

    // Get API endpoint based on OAuth type
    const getApiEndpoint = (action: 'session' | 'complete') => {
        const base = '/api/auth';
        switch (oauthType) {
            case 'qq': return `${base}/qq/${action}`;
            case 'google': return `${base}/google/${action}`;
            case 'email': return `${base}/email/${action}`;
            default: return '';
        }
    };

    // Get display info based on OAuth type
    const getOAuthDisplay = () => {
        switch (oauthType) {
            case 'qq':
                return {
                    title: 'QQ 登录',
                    icon: (
                        <svg viewBox="0 0 1024 1024" className="w-6 h-6 text-blue-500" fill="currentColor">
                            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm210.5 612.4c-11.5 1.4-44.9-52.7-44.9-52.7 0 31.3-16.2 72.2-51.1 101.8 16.9 5.2 54.9 19.2 45.9 34.4-7.3 12.3-125.6 7.9-159.8 4-34.2 3.8-152.5 8.3-159.8-4-9.1-15.2 28.9-29.2 45.8-34.4-35-29.5-51.1-70.4-51.1-101.8 0 0-33.4 54.1-44.9 52.7-5.4-.7-12.4-29.6 9.4-99.7 10.3-33 22-60.5 40.2-105.8-3.1-116.9 45.3-215 160.4-215 113.9 0 162.4 98.1 160.4 215 18.1 45.2 29.9 72.8 40.2 105.8 21.7 70.1 14.6 99.1 9.3 99.7z" />
                        </svg>
                    ),
                    color: 'blue'
                };
            case 'google':
                return {
                    title: 'Google 登录',
                    icon: (
                        <svg viewBox="0 0 24 24" className="w-6 h-6">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                    ),
                    color: 'slate'
                };
            case 'email':
                return {
                    title: '邮箱登录',
                    icon: <Mail className="w-6 h-6 text-purple-500" />,
                    color: 'purple'
                };
            default:
                return { title: '登录', icon: null, color: 'gray' };
        }
    };

    // Load session info
    useEffect(() => {
        const loadSession = async () => {
            if (!session || !oauthType) {
                setError('无效的登录链接，请重新登录');
                setLoading(false);
                return;
            }

            try {
                const res = await fetch(`${getApiEndpoint('session')}?session=${session}`);
                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || '会话已过期，请重新登录');
                    setLoading(false);
                    return;
                }

                setSessionInfo(data);
                setLoading(false);
            } catch (err) {
                setError('加载失败，请重试');
                setLoading(false);
            }
        };

        loadSession();
    }, [session, oauthType]);

    // Fetch invitation code settings
    useEffect(() => {
        const fetchInvitationCodeSettings = async () => {
            try {
                const response = await fetch('/api/settings/public/invitation-code');
                if (response.ok) {
                    const data = await response.json();
                    setInvitationCodeEnabled(data.enabled);
                }
            } catch (err) {
                console.error('Failed to fetch invitation code settings:', err);
                // Keep default (enabled) if fetch fails
            }
        };
        fetchInvitationCodeSettings();
    }, []);

    // Handle form submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const body: any = {
                action: activeTab,
                username,
                password,
            };

            // Add session based on type
            if (oauthType === 'qq') body.qqSession = session;
            else if (oauthType === 'google') body.googleSession = session;
            else if (oauthType === 'email') body.emailSession = session;

            if (activeTab === 'create' && invitationCodeEnabled) {
                body.invitationCode = invitationCode;
            }

            const res = await fetch(getApiEndpoint('complete'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || '操作失败');
                setSubmitting(false);
                return;
            }

            // Success - save token and redirect
            localStorage.setItem('galaxyous_token', data.token);
            setSuccess(data.message);

            setTimeout(() => {
                navigate('/', { replace: true });
                window.location.reload();
            }, 1500);
        } catch (err) {
            setError('网络错误，请重试');
            setSubmitting(false);
        }
    };

    const oauthDisplay = getOAuthDisplay();

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <Loader2 size={40} className="animate-spin text-purple-400" />
            </div>
        );
    }

    if (error && !sessionInfo) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-slate-800/90 rounded-2xl p-8 max-w-md w-full border border-white/10 text-center">
                    <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-white mb-2">登录失败</h1>
                    <p className="text-slate-400 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
                    >
                        返回首页
                    </button>
                </div>
            </div>
        );
    }

    // Get avatar and display name based on OAuth type
    const avatarUrl = sessionInfo?.avatarUrl || sessionInfo?.avatar;
    const displayName = sessionInfo?.qqNickname || sessionInfo?.name || sessionInfo?.email || '用户';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-slate-800/90 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full border border-white/10 shadow-2xl">
                {/* OAuth Info */}
                <div className="text-center mb-6">
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt="头像"
                            className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-purple-500"
                        />
                    ) : (
                        <div className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-purple-500 bg-purple-500/20 flex items-center justify-center">
                            {oauthDisplay.icon}
                        </div>
                    )}
                    <h1 className="text-xl font-bold text-white">欢迎, {displayName}</h1>
                    <p className="text-slate-400 text-sm mt-1">请选择如何完成账户设置</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${activeTab === 'create'
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        <UserPlus size={18} />
                        创建新账户
                    </button>
                    <button
                        onClick={() => setActiveTab('bind')}
                        className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${activeTab === 'bind'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        <Link2 size={18} />
                        绑定已有账户
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Username */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">
                            {activeTab === 'create' ? '设置用户名' : '已有账户用户名'}
                        </label>
                        <div className="relative">
                            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder={activeTab === 'create' ? '3-60 个字符' : '输入用户名'}
                                className="w-full pl-10 pr-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                required
                                minLength={activeTab === 'create' ? 3 : undefined}
                                maxLength={60}
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">
                            {activeTab === 'create' ? '设置密码' : '账户密码'}
                        </label>
                        <div className="relative">
                            <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="至少 6 个字符"
                                className="w-full pl-10 pr-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                required
                                minLength={6}
                            />
                        </div>
                    </div>

                    {/* Invitation Code (only for create, when enabled) */}
                    {activeTab === 'create' && invitationCodeEnabled && (
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">邀请码</label>
                            <div className="relative">
                                <Ticket size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    value={invitationCode}
                                    onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                                    placeholder="输入邀请码"
                                    className="w-full pl-10 pr-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500 uppercase"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <div className="p-3 bg-green-900/30 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
                            <CheckCircle size={16} />
                            {success}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={submitting || !!success}
                        className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${activeTab === 'create'
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                            : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
                            } text-white disabled:opacity-50`}
                    >
                        {submitting ? (
                            <><Loader2 size={18} className="animate-spin" /> 处理中...</>
                        ) : success ? (
                            <><CheckCircle size={18} /> 成功</>
                        ) : activeTab === 'create' ? (
                            <><UserPlus size={18} /> 创建账户</>
                        ) : (
                            <><Link2 size={18} /> 绑定账户</>
                        )}
                    </button>
                </form>

                {/* Info */}
                <p className="text-xs text-slate-500 text-center mt-4">
                    {activeTab === 'create'
                        ? `创建账户后，${oauthDisplay.title.replace('登录', '')}将自动绑定到新账户`
                        : `绑定后，您可以使用${oauthDisplay.title.replace('登录', '')}快捷登录此账户`}
                </p>
            </div>
        </div>
    );
}
