import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { Share2, Users, Ban, CheckCircle, XCircle, Plus, AlertTriangle, Clock, Eye, RefreshCw } from 'lucide-react';

interface TreeInfo {
    id: string;
    root_code_id: number;
    created_by_admin_id: number;
    created_by_username: string;
    is_banned: boolean;
    banned_reason: string | null;
    banned_at: string | null;
    created_at: string;
    user_count: number;
    code_count: number;
    used_code_count: number;
}

interface Stats {
    enabled: boolean;
    totalTrees: number;
    bannedTrees: number;
    totalCodes: number;
    usedCodes: number;
    usersInSystem: number;
    codeLimit: number;
}

interface CooldownInfo {
    canCreate: boolean;
    remainingDays: number;
    lastCreated?: string;
}

export default function SplitInvitations() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [trees, setTrees] = useState<TreeInfo[]>([]);
    const [cooldown, setCooldown] = useState<CooldownInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newCode, setNewCode] = useState<string | null>(null);
    const [selectedTree, setSelectedTree] = useState<string | null>(null);
    const [treeDetails, setTreeDetails] = useState<any>(null);
    const [codeLimit, setCodeLimit] = useState(2);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [statsRes, treesRes, cooldownRes] = await Promise.all([
                adminAPI.getSplitInvitationStats(),
                adminAPI.getSplitInvitationTrees(),
                adminAPI.getSplitInvitationCooldown()
            ]);
            setStats(statsRes);
            setTrees(treesRes);
            setCooldown(cooldownRes);
            if (statsRes?.codeLimit) {
                setCodeLimit(statsRes.codeLimit);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleToggle = async () => {
        if (!stats) return;
        try {
            await adminAPI.toggleSplitInvitation(!stats.enabled);
            fetchData();
        } catch (error) {
            console.error('Failed to toggle:', error);
        }
    };

    const handleCreateRoot = async () => {
        setCreating(true);
        try {
            const result = await adminAPI.createSplitInvitationRoot();
            setNewCode(result.code);
            fetchData();
        } catch (error: any) {
            alert(error.message || '创建失败');
        } finally {
            setCreating(false);
        }
    };

    const handleBanTree = async (treeId: string) => {
        const reason = prompt('请输入封禁原因:');
        if (!reason) return;

        const daysStr = prompt('封禁天数 (留空为永久):');
        const days = daysStr ? parseInt(daysStr) : undefined;

        try {
            await adminAPI.banSplitInvitationTree(treeId, reason, days);
            fetchData();
            if (selectedTree === treeId) {
                loadTreeDetails(treeId);
            }
        } catch (error: any) {
            alert(error.message || '封禁失败');
        }
    };

    const handleUnbanTree = async (treeId: string) => {
        if (!confirm('确定要解封整棵邀请树吗？')) return;
        try {
            await adminAPI.unbanSplitInvitationTree(treeId);
            fetchData();
            if (selectedTree === treeId) {
                loadTreeDetails(treeId);
            }
        } catch (error: any) {
            alert(error.message || '解封失败');
        }
    };

    const loadTreeDetails = async (treeId: string) => {
        setSelectedTree(treeId);
        try {
            const details = await adminAPI.getSplitInvitationTree(treeId);
            setTreeDetails(details);
        } catch (error) {
            console.error('Failed to load tree details:', error);
        }
    };

    const handleUpdateCodeLimit = async () => {
        try {
            await adminAPI.updateSplitInvitationSettings(codeLimit);
            alert('设置已更新');
        } catch (error: any) {
            alert(error.message || '更新失败');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="animate-spin text-blue-500" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Share2 className="text-purple-500" />
                    分裂邀请管理
                </h1>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                    <RefreshCw size={16} />
                    刷新
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                            className={`px-4 py-2 rounded-lg text-white ${stats?.enabled ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
                        >
                            {stats?.enabled ? '禁用' : '启用'}
                        </button>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">邀请树总数</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.totalTrees || 0}</p>
                    <p className="text-xs text-red-500">已封禁: {stats?.bannedTrees || 0}</p>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">邀请码总数</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.totalCodes || 0}</p>
                    <p className="text-xs text-green-500">已使用: {stats?.usedCodes || 0}</p>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">系统用户数</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.usersInSystem || 0}</p>
                </div>
            </div>

            {/* Settings */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">系统设置</h2>
                <div className="flex items-center gap-4">
                    <label className="text-gray-600 dark:text-gray-300">每用户可生成邀请码数量:</label>
                    <input
                        type="number"
                        value={codeLimit}
                        onChange={(e) => setCodeLimit(parseInt(e.target.value) || 2)}
                        className="w-20 px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
                        min={1}
                        max={10}
                    />
                    <button
                        onClick={handleUpdateCodeLimit}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        保存
                    </button>
                </div>
            </div>

            {/* Create Root Code */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">创建根邀请码</h2>

                {cooldown && !cooldown.canCreate ? (
                    <div className="flex items-center gap-2 text-amber-500">
                        <Clock size={20} />
                        <span>冷却中，还需等待 {cooldown.remainingDays} 天</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <button
                            onClick={handleCreateRoot}
                            disabled={creating}
                            className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                        >
                            <Plus size={20} />
                            {creating ? '创建中...' : '创建新的根邀请码'}
                        </button>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            创建后将进入 10 天冷却期
                        </p>
                    </div>
                )}

                {newCode && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <p className="text-green-700 dark:text-green-300">新邀请码已创建:</p>
                        <p className="text-2xl font-mono font-bold text-green-600 dark:text-green-400">{newCode}</p>
                    </div>
                )}
            </div>

            {/* Trees List */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">邀请树列表</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">ID</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">创建者</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">用户数</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">邀请码</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">状态</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">创建时间</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {trees.map((tree) => (
                                <tr key={tree.id} className={tree.is_banned ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                                    <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                                        {tree.id.slice(0, 8)}...
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {tree.created_by_username}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        <span className="flex items-center gap-1">
                                            <Users size={14} />
                                            {tree.user_count}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {tree.used_code_count}/{tree.code_count}
                                    </td>
                                    <td className="px-4 py-3">
                                        {tree.is_banned ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs">
                                                <Ban size={12} />
                                                已封禁
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full text-xs">
                                                <CheckCircle size={12} />
                                                正常
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(tree.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 space-x-2">
                                        <button
                                            onClick={() => loadTreeDetails(tree.id)}
                                            className="text-blue-500 hover:text-blue-600"
                                            title="查看详情"
                                        >
                                            <Eye size={18} />
                                        </button>
                                        {tree.is_banned ? (
                                            <button
                                                onClick={() => handleUnbanTree(tree.id)}
                                                className="text-green-500 hover:text-green-600"
                                                title="解封"
                                            >
                                                <CheckCircle size={18} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleBanTree(tree.id)}
                                                className="text-red-500 hover:text-red-600"
                                                title="封禁整棵树"
                                            >
                                                <Ban size={18} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {trees.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                        暂无邀请树
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tree Details Modal */}
            {selectedTree && treeDetails && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedTree(null)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-4xl max-h-[80vh] overflow-auto m-4" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                邀请树详情
                            </h3>
                            <button onClick={() => setSelectedTree(null)} className="text-gray-500 hover:text-gray-700">
                                <XCircle size={24} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            {treeDetails.tree.is_banned && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                        <AlertTriangle size={20} />
                                        <span className="font-semibold">该邀请树已被封禁</span>
                                    </div>
                                    <p className="mt-1 text-red-500">{treeDetails.tree.banned_reason}</p>
                                </div>
                            )}

                            <div>
                                <h4 className="font-medium text-gray-900 dark:text-white mb-2">用户列表 ({treeDetails.users.length})</h4>
                                <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-slate-700">
                                            <tr>
                                                <th className="px-3 py-2 text-left">用户名</th>
                                                <th className="px-3 py-2 text-left">邮箱</th>
                                                <th className="px-3 py-2 text-left">邀请人</th>
                                                <th className="px-3 py-2 text-left">已生成码数</th>
                                                <th className="px-3 py-2 text-left">注册时间</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                            {treeDetails.users.map((user: any) => (
                                                <tr key={user.id}>
                                                    <td className="px-3 py-2">{user.username}</td>
                                                    <td className="px-3 py-2 text-gray-500">{user.email || '-'}</td>
                                                    <td className="px-3 py-2 text-gray-500">{user.invited_by || '根用户'}</td>
                                                    <td className="px-3 py-2">{user.split_codes_generated}</td>
                                                    <td className="px-3 py-2 text-gray-500">
                                                        {new Date(user.created_at).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
