import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { Plus, Trash2, Ticket, CheckCircle, XCircle, Users, CalendarPlus, RefreshCw, Copy, Check } from 'lucide-react';

interface Stats {
    enabled: boolean;
    totalCodes: number;
    usedCodes: number;
    unusedCodes: number;
    todayGenerated: number;
    usersViaCode: number;
    usageRate: string;
}

interface InvitationCode {
    id: number;
    code: string;
    is_used: boolean;
    used_by_user_id: number | null;
    used_by_username: string | null;
    created_at: string;
    used_at: string | null;
}

export default function InvitationCodes() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [codes, setCodes] = useState<InvitationCode[]>([]);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [generateCount, setGenerateCount] = useState(10);
    const [newCodes, setNewCodes] = useState<string[]>([]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [statsRes, codesRes] = await Promise.all([
                adminAPI.getCodesStats(),
                adminAPI.getCodes(1, filter)
            ]);
            setStats(statsRes);
            setCodes(codesRes.codes || []);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filter]);

    const handleToggle = async () => {
        if (!stats) return;
        try {
            await adminAPI.toggleInvitationCode(!stats.enabled);
            fetchData();
        } catch (error) {
            console.error('Failed to toggle:', error);
        }
    };

    const handleGenerate = async () => {
        if (generateCount < 1 || generateCount > 100) {
            alert('数量需要在1-100之间');
            return;
        }

        setGenerating(true);
        try {
            const result = await adminAPI.generateCodes(generateCount);
            setNewCodes(result.codes || []);
            fetchData();
        } catch (err: any) {
            alert('生成失败：' + err.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleDelete = async (id: number, code: string) => {
        if (!confirm(`确定删除邀请码 ${code}？`)) return;

        try {
            await adminAPI.deleteCode(id);
            fetchData();
        } catch (err: any) {
            alert('删除失败：' + err.message);
        }
    };

    const copyToClipboard = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const copyAllNewCodes = async () => {
        try {
            await navigator.clipboard.writeText(newCodes.join('\n'));
            alert('已复制所有邀请码到剪贴板');
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="animate-spin text-blue-500" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Ticket className="text-blue-500" />
                    邀请码管理
                </h1>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    刷新
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* System Status Card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">系统状态</p>
                            <p className={`text-2xl font-bold ${stats?.enabled ? 'text-green-500' : 'text-red-500'}`}>
                                {stats?.enabled ? '已启用' : '已禁用'}
                            </p>
                        </div>
                        <button
                            onClick={handleToggle}
                            className={`px-4 py-2 rounded-lg text-white font-medium transition-colors ${stats?.enabled
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-green-500 hover:bg-green-600'
                                }`}
                        >
                            {stats?.enabled ? '禁用' : '启用'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                        {stats?.enabled ? '用户可使用邀请码注册' : '邀请码注册已关闭'}
                    </p>
                </div>

                {/* Total Codes Card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <Ticket className="text-blue-500" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">邀请码总数</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.totalCodes || 0}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex justify-between text-xs">
                        <span className="text-green-500">可用: {stats?.unusedCodes || 0}</span>
                        <span className="text-gray-400">已用: {stats?.usedCodes || 0}</span>
                    </div>
                </div>

                {/* Usage Rate Card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <CheckCircle className="text-purple-500" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">使用率</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.usageRate || '0.0'}%</p>
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                            <div
                                className="bg-purple-500 h-2 rounded-full transition-all"
                                style={{ width: `${stats?.usageRate || 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Users Via Code Card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <Users className="text-green-500" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">已注册用户</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.usersViaCode || 0}</p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">
                        今日新增: <span className="text-blue-500">{stats?.todayGenerated || 0}</span> 个邀请码
                    </p>
                </div>
            </div>

            {/* Generate Codes Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                    <CalendarPlus size={20} />
                    生成邀请码
                </h2>
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-gray-600 dark:text-gray-300">数量:</label>
                        <input
                            type="number"
                            value={generateCount}
                            onChange={(e) => setGenerateCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="w-24 px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 text-center"
                            min={1}
                            max={100}
                        />
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium transition-colors"
                    >
                        <Plus size={20} />
                        {generating ? '生成中...' : '批量生成'}
                    </button>
                </div>

                {/* Generated Codes Display */}
                {newCodes.length > 0 && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-green-700 dark:text-green-300 font-medium">
                                成功生成 {newCodes.length} 个邀请码:
                            </p>
                            <button
                                onClick={copyAllNewCodes}
                                className="text-sm px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                            >
                                复制全部
                            </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {newCodes.map((code, i) => (
                                <div
                                    key={i}
                                    onClick={() => copyToClipboard(code)}
                                    className="font-mono text-sm bg-white dark:bg-slate-800 px-3 py-2 rounded border cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center justify-between"
                                >
                                    <span>{code}</span>
                                    {copiedCode === code ? (
                                        <Check size={14} className="text-green-500" />
                                    ) : (
                                        <Copy size={14} className="text-gray-400" />
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => setNewCodes([])}
                            className="mt-3 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            关闭
                        </button>
                    </div>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex gap-2">
                    {[
                        { key: 'all', label: '全部', count: stats?.totalCodes },
                        { key: 'unused', label: '未使用', count: stats?.unusedCodes },
                        { key: 'used', label: '已使用', count: stats?.usedCodes }
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                                filter === f.key
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            {f.label}
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                                filter === f.key
                                    ? 'bg-white/20'
                                    : 'bg-gray-200 dark:bg-slate-600'
                            }`}>
                                {f.count || 0}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Codes Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">邀请码</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">状态</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">使用者</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">创建时间</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">使用时间</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {codes.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                        暂无邀请码
                                    </td>
                                </tr>
                            ) : (
                                codes.map(code => (
                                    <tr key={code.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-gray-900 dark:text-white">
                                                    {code.code}
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(code.code)}
                                                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-600 rounded"
                                                    title="复制"
                                                >
                                                    {copiedCode === code.code ? (
                                                        <Check size={14} className="text-green-500" />
                                                    ) : (
                                                        <Copy size={14} className="text-gray-400" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {code.is_used ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs font-medium">
                                                    <XCircle size={12} />
                                                    已使用
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full text-xs font-medium">
                                                    <CheckCircle size={12} />
                                                    可用
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                            {code.used_by_username || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(code.created_at).toLocaleString('zh-CN')}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {code.used_at ? new Date(code.used_at).toLocaleString('zh-CN') : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => handleDelete(code.id, code.code)}
                                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                title="删除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
