/**
 * KeyPool Dashboard - 号池仪表板
 *
 * 用户贡献和管理 API Key 的界面
 */

import React, { useState, useEffect } from 'react';
import {
    X, Key, Plus, Shield, Trophy, TrendingUp, AlertTriangle,
    Check, Loader2, Trash2, Eye, EyeOff, RefreshCw
} from 'lucide-react';
import { API_BASE, authFetch } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

interface KeyPoolEntry {
    id: string;
    providerId: string;
    maskedKey: string;
    status: 'active' | 'exhausted' | 'invalid' | 'banned' | 'withdrawn';
    modelsSupported: string[] | null;
    dailyQuota: number;
    totalContributed: number;
    totalCalls: number;
    successRate: number;
    riskScore: number;
    lastUsedAt: string | null;
    createdAt: string;
}

interface LeaderboardEntry {
    userId: number;
    username: string;
    totalKeys: number;
    activeKeys: number;
    totalTokensContributed: number;
    totalCallsServed: number;
    avgSuccessRate: number;
    rankScore: number;
}

interface KeyPoolDashboardProps {
    onClose: () => void;
}

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', icon: '🟢' },
    { id: 'anthropic', name: 'Anthropic Claude', icon: '🟣' },
    { id: 'gemini', name: 'Google Gemini', icon: '🔵' },
    { id: 'deepseek', name: 'DeepSeek', icon: '⚫' },
];

export default function KeyPoolDashboard({ onClose }: KeyPoolDashboardProps) {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState<'mykeys' | 'contribute' | 'leaderboard'>('mykeys');
    const [myKeys, setMyKeys] = useState<KeyPoolEntry[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 贡献表单
    const [contributeForm, setContributeForm] = useState({
        providerId: 'openai',
        apiKey: '',
        baseUrl: '',
        dailyQuota: 100000,
    });
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<{ valid: boolean; models?: string[]; error?: string } | null>(null);
    const [showApiKey, setShowApiKey] = useState(false);

    useEffect(() => {
        if (activeTab === 'mykeys') loadMyKeys();
        if (activeTab === 'leaderboard') loadLeaderboard();
    }, [activeTab]);

    const loadMyKeys = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await authFetch<{ success: boolean; keys: KeyPoolEntry[] }>('/api/keypool/my-keys', token);
            setMyKeys(data.keys);
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    const loadLeaderboard = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/keypool/leaderboard?limit=50`);
            const data = await response.json();
            if (data.success) {
                setLeaderboard(data.leaderboard);
            } else {
                setError(data.error);
            }
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    const validateKey = async () => {
        if (!contributeForm.apiKey) return;
        setValidating(true);
        setValidationResult(null);

        try {
            const data = await authFetch<{ valid: boolean; models?: string[]; error?: string }>('/api/keypool/validate', token, {
                method: 'POST',
                body: JSON.stringify({
                    apiKey: contributeForm.apiKey,
                    providerId: contributeForm.providerId,
                }),
            });
            setValidationResult(data);
        } catch (err: any) {
            setValidationResult({ valid: false, error: err.message });
        }
        setValidating(false);
    };

    const contributeKey = async () => {
        if (!contributeForm.apiKey || !validationResult?.valid) return;
        setLoading(true);
        setError(null);

        try {
            await authFetch('/api/keypool/contribute', token, {
                method: 'POST',
                body: JSON.stringify({
                    apiKey: contributeForm.apiKey,
                    providerId: contributeForm.providerId,
                    baseUrl: contributeForm.baseUrl || undefined,
                    dailyQuota: contributeForm.dailyQuota,
                    modelsSupported: validationResult.models,
                }),
            });
            setContributeForm({ providerId: 'openai', apiKey: '', baseUrl: '', dailyQuota: 100000 });
            setValidationResult(null);
            setActiveTab('mykeys');
            loadMyKeys();
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    const withdrawKey = async (keyId: string) => {
        if (!confirm('确定要撤回此密钥吗？撤回后将无法恢复。')) return;
        setLoading(true);
        try {
            await authFetch(`/api/keypool/withdraw/${keyId}`, token, { method: 'DELETE' });
            loadMyKeys();
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    const formatNumber = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    };

    const getStatusBadge = (status: string) => {
        const badges: Record<string, { color: string; text: string }> = {
            active: { color: 'bg-green-500/20 text-green-400 border-green-500/30', text: '活跃' },
            exhausted: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', text: '配额耗尽' },
            invalid: { color: 'bg-red-500/20 text-red-400 border-red-500/30', text: '无效' },
            banned: { color: 'bg-red-600/20 text-red-300 border-red-600/30', text: '已封禁' },
            withdrawn: { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', text: '已撤回' },
        };
        const badge = badges[status] || badges.invalid;
        return <span className={`px-2 py-0.5 rounded text-xs border ${badge.color}`}>{badge.text}</span>;
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Key size={20} className="text-amber-400" />
                        号池系统
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10">
                    {[
                        { key: 'mykeys', label: '我的密钥', icon: Key },
                        { key: 'contribute', label: '贡献密钥', icon: Plus },
                        { key: 'leaderboard', label: '贡献榜', icon: Trophy },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as any)}
                            className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors
                                ${activeTab === tab.key
                                    ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mx-4 mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                        <AlertTriangle size={16} />
                        {error}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {/* My Keys Tab */}
                    {activeTab === 'mykeys' && (
                        <div className="space-y-3">
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-amber-400" />
                                </div>
                            ) : myKeys.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Key size={48} className="mx-auto mb-4 opacity-30" />
                                    <p>暂无贡献的密钥</p>
                                    <button
                                        onClick={() => setActiveTab('contribute')}
                                        className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm"
                                    >
                                        贡献第一个密钥
                                    </button>
                                </div>
                            ) : (
                                myKeys.map(key => (
                                    <div key={key.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">
                                                        {PROVIDERS.find(p => p.id === key.providerId)?.icon || '🔑'}
                                                    </span>
                                                    <span className="font-mono text-white">{key.maskedKey}</span>
                                                    {getStatusBadge(key.status)}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    {PROVIDERS.find(p => p.id === key.providerId)?.name || key.providerId}
                                                    {key.modelsSupported && ` · ${key.modelsSupported.length} 个模型`}
                                                </div>
                                            </div>
                                            {key.status === 'active' && (
                                                <button
                                                    onClick={() => withdrawKey(key.id)}
                                                    className="text-slate-500 hover:text-red-400 transition-colors"
                                                    title="撤回密钥"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-4 gap-3 text-center">
                                            <div className="bg-black/20 rounded-lg p-2">
                                                <div className="text-xs text-slate-500">贡献 Token</div>
                                                <div className="text-sm font-medium text-green-400">
                                                    {formatNumber(key.totalContributed)}
                                                </div>
                                            </div>
                                            <div className="bg-black/20 rounded-lg p-2">
                                                <div className="text-xs text-slate-500">调用次数</div>
                                                <div className="text-sm font-medium text-blue-400">
                                                    {formatNumber(key.totalCalls)}
                                                </div>
                                            </div>
                                            <div className="bg-black/20 rounded-lg p-2">
                                                <div className="text-xs text-slate-500">成功率</div>
                                                <div className="text-sm font-medium text-purple-400">
                                                    {(key.successRate * 100).toFixed(1)}%
                                                </div>
                                            </div>
                                            <div className="bg-black/20 rounded-lg p-2">
                                                <div className="text-xs text-slate-500">风险分</div>
                                                <div className={`text-sm font-medium ${
                                                    key.riskScore > 50 ? 'text-red-400' :
                                                    key.riskScore > 20 ? 'text-yellow-400' : 'text-green-400'
                                                }`}>
                                                    {key.riskScore}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Contribute Tab */}
                    {activeTab === 'contribute' && (
                        <div className="space-y-4">
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200">
                                <Shield size={16} className="inline mr-2" />
                                您的密钥将使用 AES-256-GCM 加密存储，仅在调用时解密。我们绝不会明文存储或记录您的 API Key。
                            </div>

                            {/* Provider Selection */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">选择提供商</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PROVIDERS.map(provider => (
                                        <button
                                            key={provider.id}
                                            onClick={() => {
                                                setContributeForm(f => ({ ...f, providerId: provider.id }));
                                                setValidationResult(null);
                                            }}
                                            className={`p-3 rounded-lg text-left flex items-center gap-2 transition-colors ${
                                                contributeForm.providerId === provider.id
                                                    ? 'bg-amber-500/20 border border-amber-500/50 text-white'
                                                    : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10'
                                            }`}
                                        >
                                            <span className="text-xl">{provider.icon}</span>
                                            <span>{provider.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* API Key Input */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">API Key</label>
                                <div className="relative">
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={contributeForm.apiKey}
                                        onChange={e => {
                                            setContributeForm(f => ({ ...f, apiKey: e.target.value }));
                                            setValidationResult(null);
                                        }}
                                        placeholder="sk-..."
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
                                    />
                                    <button
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                    >
                                        {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Optional: Custom Base URL */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">自定义 Base URL (可选)</label>
                                <input
                                    type="text"
                                    value={contributeForm.baseUrl}
                                    onChange={e => setContributeForm(f => ({ ...f, baseUrl: e.target.value }))}
                                    placeholder="https://api.example.com/v1"
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
                                />
                            </div>

                            {/* Daily Quota */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">每日配额 (tokens)</label>
                                <input
                                    type="number"
                                    value={contributeForm.dailyQuota}
                                    onChange={e => setContributeForm(f => ({ ...f, dailyQuota: parseInt(e.target.value) || 100000 }))}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-amber-500/50 focus:outline-none"
                                />
                            </div>

                            {/* Validation Result */}
                            {validationResult && (
                                <div className={`p-4 rounded-lg border ${
                                    validationResult.valid
                                        ? 'bg-green-500/10 border-green-500/30'
                                        : 'bg-red-500/10 border-red-500/30'
                                }`}>
                                    {validationResult.valid ? (
                                        <div>
                                            <div className="flex items-center gap-2 text-green-400 mb-2">
                                                <Check size={16} />
                                                密钥验证成功
                                            </div>
                                            {validationResult.models && validationResult.models.length > 0 && (
                                                <div className="text-xs text-slate-400">
                                                    支持的模型: {validationResult.models.slice(0, 5).join(', ')}
                                                    {validationResult.models.length > 5 && ` +${validationResult.models.length - 5} 更多`}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-red-400">
                                            <AlertTriangle size={16} />
                                            {validationResult.error || '密钥验证失败'}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={validateKey}
                                    disabled={!contributeForm.apiKey || validating}
                                    className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                                >
                                    {validating ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <RefreshCw size={16} />
                                    )}
                                    验证密钥
                                </button>
                                <button
                                    onClick={contributeKey}
                                    disabled={!validationResult?.valid || loading}
                                    className="flex-1 px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Plus size={16} />
                                    )}
                                    贡献密钥
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Leaderboard Tab */}
                    {activeTab === 'leaderboard' && (
                        <div className="space-y-3">
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-amber-400" />
                                </div>
                            ) : leaderboard.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Trophy size={48} className="mx-auto mb-4 opacity-30" />
                                    <p>暂无贡献者</p>
                                </div>
                            ) : (
                                leaderboard.map((entry, index) => (
                                    <div
                                        key={entry.userId}
                                        className={`flex items-center gap-4 p-4 rounded-xl border ${
                                            index === 0
                                                ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border-amber-500/30'
                                                : index === 1
                                                ? 'bg-gradient-to-r from-slate-400/20 to-slate-300/20 border-slate-400/30'
                                                : index === 2
                                                ? 'bg-gradient-to-r from-orange-600/20 to-orange-500/20 border-orange-600/30'
                                                : 'bg-white/5 border-white/10'
                                        }`}
                                    >
                                        {/* Rank */}
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                                            index === 0 ? 'bg-amber-500 text-black' :
                                            index === 1 ? 'bg-slate-400 text-black' :
                                            index === 2 ? 'bg-orange-600 text-white' :
                                            'bg-white/10 text-slate-400'
                                        }`}>
                                            {index + 1}
                                        </div>

                                        {/* User Info */}
                                        <div className="flex-1">
                                            <div className="font-medium text-white">
                                                {entry.username || `用户 ${entry.userId}`}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {entry.activeKeys} 个活跃密钥 · 成功率 {(entry.avgSuccessRate * 100).toFixed(1)}%
                                            </div>
                                        </div>

                                        {/* Stats */}
                                        <div className="text-right">
                                            <div className="text-lg font-bold text-amber-400">
                                                {formatNumber(entry.totalTokensContributed)}
                                            </div>
                                            <div className="text-xs text-slate-500">贡献 Tokens</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
