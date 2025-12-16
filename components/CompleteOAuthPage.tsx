/**
 * QQ OAuth 完成注册页面
 * 
 * @module components/CompleteOAuthPage
 * @description 新 QQ 用户完成账户关联 - 绑定已有账户或创建新账户
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, User, Key, Ticket, Link2, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';

interface QQSessionInfo {
    qqNickname: string;
    avatarUrl: string;
}

export default function CompleteOAuthPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const qqSession = searchParams.get('qq_session');

    const [sessionInfo, setSessionInfo] = useState<QQSessionInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form state
    const [activeTab, setActiveTab] = useState<'bind' | 'create'>('create');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [invitationCode, setInvitationCode] = useState('');

    // Load QQ session info
    useEffect(() => {
        const loadSession = async () => {
            if (!qqSession) {
                setError('无效的登录链接，请重新使用 QQ 登录');
                setLoading(false);
                return;
            }

            try {
                const res = await fetch(`/api/auth/qq/session?session=${qqSession}`);
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
    }, [qqSession]);

    // Handle form submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const res = await fetch('/api/auth/qq/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qqSession,
                    action: activeTab,
                    username,
                    password,
                    invitationCode: activeTab === 'create' ? invitationCode : undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || '操作失败');
                setSubmitting(false);
                return;
            }

            // Success - save token and redirect
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-slate-800/90 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full border border-white/10 shadow-2xl">
                {/* QQ Info */}
                <div className="text-center mb-6">
                    {sessionInfo?.avatarUrl && (
                        <img
                            src={sessionInfo.avatarUrl}
                            alt="QQ 头像"
                            className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-purple-500"
                        />
                    )}
                    <h1 className="text-xl font-bold text-white">欢迎, {sessionInfo?.qqNickname}</h1>
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

                    {/* Invitation Code (only for create) */}
                    {activeTab === 'create' && (
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
                        ? '创建账户后，QQ 将自动绑定到新账户'
                        : '绑定后，您可以使用 QQ 快捷登录此账户'}
                </p>
            </div>
        </div>
    );
}
