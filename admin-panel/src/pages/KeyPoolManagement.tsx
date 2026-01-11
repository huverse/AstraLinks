/**
 * KeyPool Management - 号池管理页面
 */

import { useState, useEffect } from 'react';
import { Key, RefreshCw, Ban, CheckCircle, Search } from 'lucide-react';
import { fetchAPI } from '../services/api';

interface KeyPoolEntry {
    id: string;
    contributorId: number;
    contributorUsername: string;
    providerId: string;
    maskedKey: string;
    status: 'active' | 'exhausted' | 'invalid' | 'banned' | 'withdrawn';
    dailyQuota: number;
    totalContributed: number;
    totalCalls: number;
    successRate: number;
    riskScore: number;
    lastUsedAt: string | null;
    createdAt: string;
}

interface KeyPoolStats {
    totalKeys: number;
    activeKeys: number;
    totalTokens: number;
    totalCalls: number;
    avgSuccessRate: number;
    contributors: number;
}

export default function KeyPoolManagement() {
    const [keys, setKeys] = useState<KeyPoolEntry[]>([]);
    const [stats, setStats] = useState<KeyPoolStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [keysRes, statsRes] = await Promise.all([
                fetchAPI('/api/keypool/admin/entries'),
                fetchAPI('/api/keypool/stats')
            ]);
            setKeys(keysRes.entries ?? []);
            setStats(statsRes.stats);
        } catch (err) {
            console.error('Load keypool data error:', err);
        }
        setLoading(false);
    };

    const updateKeyStatus = async (keyId: string, status: string) => {
        try {
            await fetchAPI(`/api/keypool/admin/entries/${keyId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status })
            });
            loadData();
        } catch (err) {
            console.error('Update key status error:', err);
        }
    };

    const filteredKeys = keys.filter(key => {
        if (statusFilter !== 'all' && key.status !== statusFilter) return false;
        if (search) {
            const searchLower = search.toLowerCase();
            return key.maskedKey.toLowerCase().includes(searchLower) ||
                   key.providerId.toLowerCase().includes(searchLower) ||
                   key.contributorUsername?.toLowerCase().includes(searchLower);
        }
        return true;
    });

    const getStatusBadge = (status: string) => {
        const badges: Record<string, string> = {
            active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            exhausted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            invalid: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
            banned: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
            withdrawn: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
        };
        return badges[status] || badges.invalid;
    };

    const getRiskColor = (score: number) => {
        if (score >= 50) return 'text-red-500';
        if (score >= 20) return 'text-yellow-500';
        return 'text-green-500';
    };

    const formatNumber = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Key className="text-amber-500" />
                    号池管理
                </h1>
                <button
                    onClick={loadData}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                    <RefreshCw size={16} />
                    刷新
                </button>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-6 gap-4 mb-6">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
                        <div className="text-sm text-gray-500 dark:text-gray-400">总密钥数</div>
                        <div className="text-2xl font-bold text-gray-800 dark:text-white">{stats.totalKeys}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
                        <div className="text-sm text-gray-500 dark:text-gray-400">活跃密钥</div>
                        <div className="text-2xl font-bold text-green-600">{stats.activeKeys}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
                        <div className="text-sm text-gray-500 dark:text-gray-400">贡献 Tokens</div>
                        <div className="text-2xl font-bold text-blue-600">{formatNumber(stats.totalTokens)}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
                        <div className="text-sm text-gray-500 dark:text-gray-400">总调用次数</div>
                        <div className="text-2xl font-bold text-purple-600">{formatNumber(stats.totalCalls)}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
                        <div className="text-sm text-gray-500 dark:text-gray-400">平均成功率</div>
                        <div className="text-2xl font-bold text-orange-600">{(stats.avgSuccessRate * 100).toFixed(1)}%</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
                        <div className="text-sm text-gray-500 dark:text-gray-400">贡献者数</div>
                        <div className="text-2xl font-bold text-gray-800 dark:text-white">{stats.contributors}</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex gap-4">
                    <div className="flex-1 relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="搜索密钥、提供商、贡献者..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">所有状态</option>
                        <option value="active">活跃</option>
                        <option value="exhausted">配额耗尽</option>
                        <option value="invalid">无效</option>
                        <option value="banned">已封禁</option>
                        <option value="withdrawn">已撤回</option>
                    </select>
                </div>
            </div>

            {/* Keys Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw size={24} className="animate-spin text-blue-500" />
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-900">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">密钥</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">贡献者</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">提供商</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">状态</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">贡献</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">成功率</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">风险</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                            {filteredKeys.map(key => (
                                <tr key={key.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                    <td className="px-4 py-3">
                                        <code className="text-sm font-mono text-gray-800 dark:text-white">{key.maskedKey}</code>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {key.contributorUsername || `User #${key.contributorId}`}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {key.providerId}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(key.status)}`}>
                                            {key.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {formatNumber(key.totalContributed)} / {formatNumber(key.totalCalls)} 次
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {(key.successRate * 100).toFixed(1)}%
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`font-medium ${getRiskColor(key.riskScore)}`}>
                                            {key.riskScore}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            {key.status === 'active' && (
                                                <button
                                                    onClick={() => updateKeyStatus(key.id, 'banned')}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                    title="封禁"
                                                >
                                                    <Ban size={16} />
                                                </button>
                                            )}
                                            {key.status === 'banned' && (
                                                <button
                                                    onClick={() => updateKeyStatus(key.id, 'active')}
                                                    className="p-1.5 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                                                    title="解封"
                                                >
                                                    <CheckCircle size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
