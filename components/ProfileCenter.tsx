import { useState, useEffect } from 'react';
import { User, Crown, Star, Shield, Copy, Check, Phone, MessageCircle, Zap, Link2, X, ChevronRight, RefreshCw, Plus, LogOut, Lock, AlertTriangle } from 'lucide-react';
import { API_BASE } from '../utils/api';

interface ProfileData {
    id: number;
    username: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    user_tier: 'free' | 'pro' | 'ultra';
    is_admin: boolean;
    hasQQ: boolean;
    hasPhone: boolean;
    created_at: string;
    tierInfo: {
        name: string;
        color: string;
        features: string[];
    };
}

interface SplitCodeData {
    codes: Array<{
        code: string;
        is_used: boolean;
        used_at: string | null;
        used_by_username: string | null;
    }>;
    generated: number;
    limit: number;
    canGenerate: boolean;
    treeId?: string;
    message?: string;
}

interface ProfileCenterProps {
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
    token: string | null;
}

export default function ProfileCenter({ isOpen, onClose, onLogout, token }: ProfileCenterProps) {
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [splitCodes, setSplitCodes] = useState<SplitCodeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [splitEnabled, setSplitEnabled] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ username: '', email: '' });

    const fetchData = async () => {
        if (!token) return;

        setLoading(true);
        try {
            // Fetch profile
            const profileRes = await fetch(`${API_BASE}/api/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (profileRes.ok) {
                const data = await profileRes.json();
                setProfile(data);
                setEditForm({ username: data.username, email: data.email || '' });
            }

            // Check if split invitation is enabled
            const enabledRes = await fetch(`${API_BASE}/api/split-invitation/enabled`);
            if (enabledRes.ok) {
                const { enabled } = await enabledRes.json();
                setSplitEnabled(enabled);

                if (enabled) {
                    // Fetch split codes
                    const codesRes = await fetch(`${API_BASE}/api/split-invitation/my-codes`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (codesRes.ok) {
                        setSplitCodes(await codesRes.json());
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && token) {
            fetchData();
        }
    }, [isOpen, token]);

    const handleGenerateCode = async () => {
        if (!token) return;
        setGenerating(true);
        try {
            const res = await fetch(`${API_BASE}/api/split-invitation/generate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (res.ok) {
                fetchData();
            } else {
                alert(data.error || '生成失败');
            }
        } catch (error) {
            console.error('Failed to generate code:', error);
        } finally {
            setGenerating(false);
        }
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const handleSaveProfile = async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/api/profile`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(editForm)
            });
            const data = await res.json();
            if (res.ok) {
                setIsEditing(false);
                fetchData();
            } else {
                alert(data.error || '保存失败');
            }
        } catch (error) {
            console.error('Failed to save profile:', error);
        }
    };

    const getTierIcon = (tier: string) => {
        switch (tier) {
            case 'ultra': return <Crown className="text-amber-500" size={24} />;
            case 'pro': return <Star className="text-purple-500" size={24} />;
            default: return <Shield className="text-gray-400" size={24} />;
        }
    };

    const getTierBgClass = (tier: string) => {
        switch (tier) {
            case 'ultra': return 'from-amber-500/20 to-orange-500/20 border-amber-500/30';
            case 'pro': return 'from-purple-500/20 to-pink-500/20 border-purple-500/30';
            default: return 'from-gray-500/20 to-slate-500/20 border-gray-500/30';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <User size={24} />
                        个人中心
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <RefreshCw className="animate-spin text-blue-500" size={32} />
                    </div>
                ) : profile ? (
                    <div className="p-6 space-y-6">
                        {/* Tier Card */}
                        <div className={`p-6 rounded-xl bg-gradient-to-br ${getTierBgClass(profile.user_tier)} border`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {getTierIcon(profile.user_tier)}
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">当前等级</p>
                                        <p className="text-2xl font-bold" style={{ color: profile.tierInfo.color }}>
                                            {profile.tierInfo.name}
                                        </p>
                                    </div>
                                </div>
                                {profile.user_tier !== 'ultra' && (
                                    <button
                                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1"
                                        onClick={() => alert('升级功能即将推出')}
                                    >
                                        <Zap size={16} />
                                        升级
                                    </button>
                                )}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {profile.tierInfo.features.map((feature, i) => (
                                    <span key={i} className="px-2 py-1 bg-white/20 dark:bg-black/20 rounded text-xs text-gray-700 dark:text-gray-300">
                                        {feature}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Profile Info */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900 dark:text-white">个人信息</h3>
                                {!isEditing ? (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="text-blue-500 text-sm hover:underline"
                                    >
                                        编辑
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            className="text-gray-500 text-sm"
                                        >
                                            取消
                                        </button>
                                        <button
                                            onClick={handleSaveProfile}
                                            className="text-blue-500 text-sm font-medium"
                                        >
                                            保存
                                        </button>
                                    </div>
                                )}
                            </div>

                            {isEditing ? (
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={editForm.username}
                                        onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                                        placeholder="用户名"
                                        className="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
                                    />
                                    <input
                                        type="email"
                                        value={editForm.email}
                                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                        placeholder="邮箱"
                                        className="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-700">
                                        <span className="text-gray-500">用户名</span>
                                        <span className="text-gray-900 dark:text-white">{profile.username}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-700">
                                        <span className="text-gray-500">邮箱</span>
                                        <span className="text-gray-900 dark:text-white">{profile.email || '未设置'}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-700">
                                        <span className="text-gray-500">注册时间</span>
                                        <span className="text-gray-900 dark:text-white">
                                            {new Date(profile.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Bindings (Reserved) */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-gray-900 dark:text-white">账号绑定</h3>
                            <button
                                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                                onClick={() => alert('该功能即将推出')}
                            >
                                <div className="flex items-center gap-3">
                                    <Phone size={20} className="text-green-500" />
                                    <div className="text-left">
                                        <p className="font-medium text-gray-900 dark:text-white">绑定手机号</p>
                                        <p className="text-xs text-gray-500">{profile.hasPhone ? '已绑定' : '未绑定'}</p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-gray-400" />
                            </button>
                            <button
                                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                                onClick={async () => {
                                    if (profile.hasQQ) {
                                        // Unbind QQ
                                        if (!confirm('确定解绑QQ？解绑后将无法使用QQ登录此账号')) return;
                                        try {
                                            const res = await fetch(`${API_BASE}/api/auth/qq/unbind`, {
                                                method: 'DELETE',
                                                headers: { 'Authorization': `Bearer ${token}` }
                                            });
                                            if (res.ok) {
                                                alert('QQ解绑成功');
                                                fetchData(); // Refresh
                                            } else {
                                                const data = await res.json();
                                                alert(data.error || 'QQ解绑失败');
                                            }
                                        } catch (e) {
                                            alert('网络错误，请稍后重试');
                                        }
                                    } else {
                                        // Bind QQ - redirect to OAuth with token for authentication
                                        window.location.href = `${API_BASE}/api/auth/qq?action=bind&token=${token}`;
                                    }
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <svg viewBox="0 0 1024 1024" className="w-5 h-5 text-blue-500" fill="currentColor">
                                        <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm210.5 612.4c-11.5 1.4-44.9-52.7-44.9-52.7 0 31.3-16.2 72.2-51.1 101.8 16.9 5.2 54.9 19.2 45.9 34.4-7.3 12.3-125.6 7.9-159.8 4-34.2 3.8-152.5 8.3-159.8-4-9.1-15.2 28.9-29.2 45.8-34.4-35-29.5-51.1-70.4-51.1-101.8 0 0-33.4 54.1-44.9 52.7-5.4-.7-12.4-29.6 9.4-99.7 10.3-33 22-60.5 40.2-105.8-3.1-116.9 45.3-215 160.4-215 113.9 0 162.4 98.1 160.4 215 18.1 45.2 29.9 72.8 40.2 105.8 21.7 70.1 14.6 99.1 9.3 99.7z" />
                                    </svg>
                                    <div className="text-left">
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {profile.hasQQ ? '解绑QQ' : '绑定QQ'}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {profile.hasQQ
                                                ? `已绑定: ${(profile as any).qqNickname || 'QQ用户'} - 点击解绑`
                                                : '未绑定 - 点击绑定'}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-gray-400" />
                            </button>
                        </div>
                        {/* MCP 服务中心 */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <Zap size={18} className="text-purple-500" />
                                MCP 服务中心
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                MCP (Model Context Protocol) 扩展 AI 的能力，启用后可在对话中使用
                            </p>

                            {/* 热点趋势服务 */}
                            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                            <Zap size={20} className="text-amber-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">实时热点趋势</p>
                                            <p className="text-xs text-gray-500">获取微博、知乎、B站等平台热搜</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded">已启用</span>
                                </div>
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {['微博', '知乎', '百度', 'B站', '抖音', '头条', '掘金', 'GitHub'].map(p => (
                                        <span key={p} className="px-1.5 py-0.5 text-xs bg-white/60 dark:bg-slate-700/60 rounded text-gray-600 dark:text-gray-300">
                                            {p}
                                        </span>
                                    ))}
                                </div>
                                <button
                                    onClick={async () => {
                                        try {
                                            const res = await fetch(`${API_BASE}/api/mcp/platforms`);
                                            if (res.ok) {
                                                const data = await res.json();
                                                alert(`✅ 热点服务正常\n\n支持 ${data.platforms.length} 个平台:\n${data.platforms.map((p: any) => `${p.icon} ${p.name}`).join('\n')}`);
                                            } else {
                                                alert('❌ 热点服务连接失败');
                                            }
                                        } catch (e) {
                                            alert('❌ 无法连接热点服务');
                                        }
                                    }}
                                    className="w-full py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 rounded hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                                >
                                    测试连接
                                </button>
                            </div>

                            {/* Web Search */}
                            <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">Web Search</p>
                                            <p className="text-xs text-gray-500">搜索引擎工具 (Google/Bing/DuckDuckGo)</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded">已启用</span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">在对话中说"帮我搜索..."，AI 会自动调用搜索</p>
                            </div>

                            {/* HTTP Client */}
                            <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">HTTP Client</p>
                                            <p className="text-xs text-gray-500">发送 HTTP 请求，获取 API 数据</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded">已启用</span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">支持 GET/POST/PUT/DELETE 请求</p>
                            </div>

                            {/* File System - 预留 */}
                            <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600 opacity-60">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">File System</p>
                                            <p className="text-xs text-gray-500">沙箱文件读写操作</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-gray-400 rounded">即将推出</span>
                                </div>
                            </div>

                            {/* Code Executor - 预留 */}
                            <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600 opacity-60">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">Code Executor</p>
                                            <p className="text-xs text-gray-500">安全代码执行环境</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-gray-400 rounded">即将推出</span>
                                </div>
                            </div>

                            <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-2">
                                更多 MCP 服务正在开发中，敬请期待
                            </p>
                        </div>

                        {/* Split Invitation Codes */}
                        {splitEnabled && splitCodes && splitCodes.treeId && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-900 dark:text-white">我的邀请码</h3>
                                    <span className="text-xs text-gray-500">
                                        {splitCodes.generated}/{splitCodes.limit}
                                    </span>
                                </div>

                                {splitCodes.codes.length > 0 ? (
                                    <div className="space-y-2">
                                        {splitCodes.codes.map((code) => (
                                            <div
                                                key={code.code}
                                                className={`flex items-center justify-between p-3 rounded-lg border ${code.is_used
                                                    ? 'bg-gray-50 dark:bg-slate-700 border-gray-200 dark:border-slate-600'
                                                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                                    }`}
                                            >
                                                <div>
                                                    <p className="font-mono font-bold text-gray-900 dark:text-white">
                                                        {code.code}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {code.is_used
                                                            ? `已被 ${code.used_by_username} 使用`
                                                            : '可使用'}
                                                    </p>
                                                </div>
                                                {!code.is_used && (
                                                    <button
                                                        onClick={() => copyCode(code.code)}
                                                        className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                                                    >
                                                        {copiedCode === code.code ? (
                                                            <Check size={18} className="text-green-500" />
                                                        ) : (
                                                            <Copy size={18} className="text-gray-500" />
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 text-center py-4">暂无邀请码</p>
                                )}

                                {splitCodes.canGenerate && (
                                    <button
                                        onClick={handleGenerateCode}
                                        disabled={generating}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                                    >
                                        {generating ? (
                                            <RefreshCw size={18} className="animate-spin" />
                                        ) : (
                                            <Plus size={18} />
                                        )}
                                        生成邀请码
                                    </button>
                                )}
                            </div>
                        )}

                        {splitEnabled && splitCodes && !splitCodes.treeId && (
                            <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {splitCodes.message || '您使用的是普通邀请码注册，不在分裂邀请系统中'}
                                </p>
                            </div>
                        )}

                        {/* Password Change Section */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-gray-900 dark:text-white">账户安全</h3>
                            <button
                                onClick={() => {
                                    const oldPassword = prompt('请输入当前密码:');
                                    if (!oldPassword) return;
                                    const newPassword = prompt('请输入新密码 (至少6位):');
                                    if (!newPassword) return;
                                    if (newPassword.length < 6) {
                                        alert('新密码长度至少6位');
                                        return;
                                    }
                                    const confirmPassword = prompt('请再次输入新密码:');
                                    if (newPassword !== confirmPassword) {
                                        alert('两次输入的密码不一致');
                                        return;
                                    }
                                    fetch(`${API_BASE}/api/auth/change-password`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${localStorage.getItem('galaxyous_token')}`
                                        },
                                        body: JSON.stringify({ oldPassword, newPassword })
                                    })
                                        .then(res => res.json())
                                        .then(data => {
                                            if (data.error) {
                                                alert('❌ ' + data.error);
                                            } else {
                                                alert('✅ 密码修改成功');
                                            }
                                        })
                                        .catch(() => alert('❌ 网络错误'));
                                }}
                                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Lock size={20} className="text-blue-500" />
                                    <div className="text-left">
                                        <p className="font-medium text-gray-900 dark:text-white">修改密码</p>
                                        <p className="text-xs text-gray-500">更新您的账户密码</p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Danger Zone - Account Deletion */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-red-500">危险操作</h3>
                            <button
                                onClick={() => {
                                    if (!window.confirm('⚠️ 确定要注销账户吗？\n\n此操作不可撤销，所有数据将被永久删除！')) return;
                                    const password = prompt('请输入密码以确认注销:');
                                    if (!password) return;
                                    fetch(`${API_BASE}/api/auth/delete-account`, {
                                        method: 'DELETE',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${localStorage.getItem('galaxyous_token')}`
                                        },
                                        body: JSON.stringify({ password })
                                    })
                                        .then(res => res.json())
                                        .then(data => {
                                            if (data.error) {
                                                alert('❌ ' + data.error);
                                            } else {
                                                alert('✅ 账户已注销');
                                                onClose();
                                                onLogout();
                                            }
                                        })
                                        .catch(() => alert('❌ 网络错误'));
                                }}
                                className="w-full flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <AlertTriangle size={20} className="text-red-500" />
                                    <div className="text-left">
                                        <p className="font-medium text-red-600 dark:text-red-400">注销账户</p>
                                        <p className="text-xs text-red-500/70">永久删除您的账户和所有数据</p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-red-400" />
                            </button>
                        </div>

                        {/* Logout Button */}
                        <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
                            <button
                                onClick={() => {
                                    if (window.confirm('确定要登出吗？')) {
                                        onClose();
                                        onLogout();
                                    }
                                }}
                                className="w-full py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                            >
                                <LogOut size={18} />
                                退出登录
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-12 text-center text-gray-500">
                        加载失败
                    </div>
                )}
            </div>
        </div>
    );
}
