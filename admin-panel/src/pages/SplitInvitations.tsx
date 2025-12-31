import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { Share2, Users, Ban, CheckCircle, XCircle, Plus, AlertTriangle, Clock, Eye, RefreshCw, ChevronDown, ChevronRight, Search, User, Award, Activity, TreeDeciduous } from 'lucide-react';

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

// 完整邀请树节点
interface FullTreeNode {
    userId: number;
    username: string;
    email?: string;
    createdAt: string;
    lastActive?: string | null;
    messageCount: number;
    invitedCount: number;
    codesGenerated: number;
    isRoot?: boolean;
    children: FullTreeNode[];
}

// 完整邀请树响应
interface FullTreeResponse {
    treeInfo: any;
    rootCode: any;
    tree: FullTreeNode[];
    stats: {
        totalUsers: number;
        maxDepth: number;
        activeUsers: number;
        totalCodes: number;
        usedCodes: number;
    };
}

// 递归树节点组件
function TreeNodeComponent({
    node,
    depth = 0,
    expanded,
    onToggle,
    searchTerm,
    onUserClick
}: {
    node: FullTreeNode;
    depth?: number;
    expanded: Set<number>;
    onToggle: (userId: number) => void;
    searchTerm: string;
    onUserClick: (userId: number, username: string) => void;
}) {
    const isExpanded = expanded.has(node.userId);
    const hasChildren = node.children && node.children.length > 0;
    const isMatch = searchTerm && node.username.toLowerCase().includes(searchTerm.toLowerCase());

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatRelativeTime = (dateStr: string | null | undefined) => {
        if (!dateStr) return '从未';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return '今天';
        if (diffDays === 1) return '昨天';
        if (diffDays < 7) return `${diffDays}天前`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
        return `${Math.floor(diffDays / 30)}月前`;
    };

    return (
        <div className={`${depth > 0 ? 'ml-6 border-l-2 border-gray-200 dark:border-slate-600 pl-4' : ''}`}>
            <div
                className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                    node.isRoot
                        ? 'bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700'
                        : isMatch
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700'
                        : 'hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
            >
                {hasChildren ? (
                    <button
                        onClick={() => onToggle(node.userId)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors"
                    >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                ) : (
                    <div className="w-6" />
                )}

                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        node.isRoot
                            ? 'bg-gradient-to-br from-purple-400 to-purple-600'
                            : 'bg-gradient-to-br from-gray-300 to-gray-400 dark:from-slate-500 dark:to-slate-600'
                    }`}>
                        <User size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onUserClick(node.userId, node.username)}
                                className={`font-medium truncate hover:underline ${
                                    node.isRoot ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'
                                }`}
                            >
                                {node.username}
                            </button>
                            {node.isRoot && (
                                <span className="text-xs bg-purple-500 text-white px-1.5 py-0.5 rounded">根</span>
                            )}
                            {isMatch && !node.isRoot && (
                                <span className="text-xs bg-yellow-500 text-white px-1.5 py-0.5 rounded">匹配</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {formatDate(node.createdAt)}
                            </span>
                            {node.invitedCount > 0 && (
                                <span className="flex items-center gap-1">
                                    <Award size={10} />
                                    邀请 {node.invitedCount} 人
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <Activity size={10} />
                                {formatRelativeTime(node.lastActive)}
                            </span>
                            {node.messageCount > 0 && (
                                <span>发言 {node.messageCount}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {hasChildren && isExpanded && (
                <div className="mt-1">
                    {node.children.map((child) => (
                        <TreeNodeComponent
                            key={child.userId}
                            node={child}
                            depth={depth + 1}
                            expanded={expanded}
                            onToggle={onToggle}
                            searchTerm={searchTerm}
                            onUserClick={onUserClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
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

    // 完整邀请树可视化状态
    const [fullTreeData, setFullTreeData] = useState<FullTreeResponse | null>(null);
    const [fullTreeLoading, setFullTreeLoading] = useState(false);
    const [treeExpanded, setTreeExpanded] = useState<Set<number>>(new Set());
    const [treeSearchTerm, setTreeSearchTerm] = useState('');
    const [showTreeView, setShowTreeView] = useState(false);

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

    // 加载完整邀请树可视化
    const loadFullTree = async (treeId: string) => {
        setSelectedTree(treeId);
        setShowTreeView(true);
        setFullTreeLoading(true);
        setFullTreeData(null);
        setTreeSearchTerm('');
        try {
            const data = await adminAPI.getSplitInvitationFullTree(treeId);
            setFullTreeData(data);
            // 默认展开根节点
            if (data.tree && data.tree.length > 0) {
                const rootIds = new Set<number>(data.tree.map((node: FullTreeNode) => node.userId));
                setTreeExpanded(rootIds);
            }
        } catch (error) {
            console.error('Failed to load full tree:', error);
        } finally {
            setFullTreeLoading(false);
        }
    };

    // 切换节点展开/折叠
    const toggleTreeNode = (userId: number) => {
        setTreeExpanded(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    };

    // 收集所有节点ID（用于展开全部）
    const collectAllNodeIds = (nodes: FullTreeNode[]): number[] => {
        const ids: number[] = [];
        const collect = (nodeList: FullTreeNode[]) => {
            for (const node of nodeList) {
                ids.push(node.userId);
                if (node.children && node.children.length > 0) {
                    collect(node.children);
                }
            }
        };
        collect(nodes);
        return ids;
    };

    // 展开全部节点
    const expandAllNodes = () => {
        if (!fullTreeData?.tree) return;
        const allIds = collectAllNodeIds(fullTreeData.tree);
        setTreeExpanded(new Set(allIds));
    };

    // 折叠全部节点
    const collapseAllNodes = () => {
        if (!fullTreeData?.tree) return;
        const rootIds = new Set(fullTreeData.tree.map(node => node.userId));
        setTreeExpanded(rootIds);
    };

    // 用户点击回调
    const handleUserClick = (userId: number, username: string) => {
        // 可以扩展为跳转到用户详情页
        alert(`用户: ${username} (ID: ${userId})`);
    };

    // 关闭树视图
    const closeTreeView = () => {
        setShowTreeView(false);
        setSelectedTree(null);
        setFullTreeData(null);
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
                                        <button
                                            onClick={() => loadFullTree(tree.id)}
                                            className="text-purple-500 hover:text-purple-600"
                                            title="树形视图"
                                        >
                                            <TreeDeciduous size={18} />
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

            {/* Full Tree Visualization Modal */}
            {showTreeView && selectedTree && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeTreeView}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden m-4 flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <TreeDeciduous className="text-purple-500" size={24} />
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    邀请树可视化
                                </h3>
                                {fullTreeData?.stats && (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">
                                            {fullTreeData.stats.totalUsers} 人
                                        </span>
                                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                                            {fullTreeData.stats.maxDepth} 层
                                        </span>
                                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">
                                            {fullTreeData.stats.activeUsers} 活跃
                                        </span>
                                    </div>
                                )}
                            </div>
                            <button onClick={closeTreeView} className="text-gray-500 hover:text-gray-700">
                                <XCircle size={24} />
                            </button>
                        </div>

                        {/* Controls */}
                        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between gap-4 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        value={treeSearchTerm}
                                        onChange={(e) => setTreeSearchTerm(e.target.value)}
                                        placeholder="搜索用户名..."
                                        className="pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 text-sm w-64"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={expandAllNodes}
                                    className="text-xs text-blue-500 hover:underline"
                                >
                                    展开全部
                                </button>
                                <button
                                    onClick={collapseAllNodes}
                                    className="text-xs text-blue-500 hover:underline"
                                >
                                    折叠全部
                                </button>
                                <button
                                    onClick={() => loadFullTree(selectedTree)}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                                    title="刷新"
                                >
                                    <RefreshCw size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Tree Content */}
                        <div className="flex-1 overflow-auto p-4">
                            {fullTreeLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <RefreshCw className="animate-spin text-purple-500" size={32} />
                                </div>
                            ) : fullTreeData?.tree && fullTreeData.tree.length > 0 ? (
                                <div className="space-y-2">
                                    {fullTreeData.tree.map((node) => (
                                        <TreeNodeComponent
                                            key={node.userId}
                                            node={node}
                                            expanded={treeExpanded}
                                            onToggle={toggleTreeNode}
                                            searchTerm={treeSearchTerm}
                                            onUserClick={handleUserClick}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                                    暂无用户数据
                                </div>
                            )}
                        </div>

                        {/* Footer Stats */}
                        {fullTreeData?.stats && (
                            <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 shrink-0">
                                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <div className="flex items-center gap-4">
                                        <span><Users size={14} className="inline mr-1" />总用户: {fullTreeData.stats.totalUsers}</span>
                                        <span><Activity size={14} className="inline mr-1" />活跃用户: {fullTreeData.stats.activeUsers}</span>
                                        <span>活跃率: {fullTreeData.stats.totalUsers > 0 ? Math.round(fullTreeData.stats.activeUsers / fullTreeData.stats.totalUsers * 100) : 0}%</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span>邀请码: {fullTreeData.stats.usedCodes}/{fullTreeData.stats.totalCodes}</span>
                                        <span>最大深度: {fullTreeData.stats.maxDepth} 层</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
