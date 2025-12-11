import React, { useState } from 'react';
import { X, User, Mail, Lock, Key, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type ModalMode = 'login' | 'register' | 'resetPassword';

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

    // For password reset (synced users)
    const [resetUserId, setResetUserId] = useState<number | null>(null);
    const [resetUsername, setResetUsername] = useState('');

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
    };

    const handleModeSwitch = (newMode: ModalMode) => {
        resetForm();
        setMode(newMode);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        const result = await login(username, password);

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

        setIsLoading(true);
        const result = await register(username, email, password, invitationCode);
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
                    </h2>
                    <p className="mt-1 text-blue-100">
                        {mode === 'login' && '登录您的 Galaxyous 账号'}
                        {mode === 'register' && '使用邀请码注册新账号'}
                        {mode === 'resetPassword' && '您的账号需要设置新密码'}
                    </p>
                </div>

                {/* Form */}
                <form
                    onSubmit={
                        mode === 'login' ? handleLogin :
                            mode === 'register' ? handleRegister :
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
                    {mode !== 'resetPassword' && (
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

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
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
                            </>
                        )}
                    </button>

                    {/* Mode Toggle */}
                    {mode !== 'resetPassword' && (
                        <div className="text-center text-sm text-slate-500">
                            {mode === 'login' ? (
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
                            ) : (
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
                        </div>
                    )}

                    {/* QQ Login */}
                    {mode === 'login' && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <div className="text-center text-xs text-slate-400 mb-3">或使用第三方登录</div>
                            <button
                                type="button"
                                onClick={() => {
                                    // Open QQ OAuth in current window
                                    const apiBase = (import.meta as any).env?.VITE_PROXY_API_BASE || 'http://localhost:3001';
                                    window.location.href = `${apiBase}/api/auth/qq`;
                                }}
                                className="w-full py-3 bg-[#12B7F5] hover:bg-[#0DA8E3] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                {/* QQ Penguin Icon */}
                                <svg viewBox="0 0 1024 1024" className="w-6 h-6" fill="currentColor">
                                    <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm210.5 612.4c-11.5 1.4-44.9-52.7-44.9-52.7 0 31.3-16.2 72.2-51.1 101.8 16.9 5.2 54.9 19.2 45.9 34.4-7.3 12.3-125.6 7.9-159.8 4-34.2 3.8-152.5 8.3-159.8-4-9.1-15.2 28.9-29.2 45.8-34.4-35-29.5-51.1-70.4-51.1-101.8 0 0-33.4 54.1-44.9 52.7-5.4-.7-12.4-29.6 9.4-99.7 10.3-33 22-60.5 40.2-105.8-3.1-116.9 45.3-215 160.4-215 113.9 0 162.4 98.1 160.4 215 18.1 45.2 29.9 72.8 40.2 105.8 21.7 70.1 14.6 99.1 9.3 99.7z" />
                                </svg>
                                QQ 快捷登录
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default LoginModal;
