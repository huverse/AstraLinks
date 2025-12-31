import { useState, useEffect } from 'react';
import { Users, ChevronDown, ChevronRight, RefreshCw, User, Clock, Award, Loader2 } from 'lucide-react';
import { API_BASE } from '../utils/api';

interface TreeNode {
    userId: number;
    username: string;
    createdAt: string;
    lastActive?: string | null;
    invitedCount: number;
    isCurrentUser?: boolean;
    children: TreeNode[];
}

interface InviteTreeData {
    tree: TreeNode | null;
    totalDescendants: number;
    treeId: string;
    message?: string;
}

interface UserInviteTreeProps {
    token: string | null;
    isVisible: boolean;
}

function TreeNodeComponent({ node, depth = 0, expanded, onToggle }: {
    node: TreeNode;
    depth?: number;
    expanded: Set<number>;
    onToggle: (userId: number) => void;
}) {
    const isExpanded = expanded.has(node.userId);
    const hasChildren = node.children && node.children.length > 0;

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
                    node.isCurrentUser
                        ? 'bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700'
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
                    <div className="w-8 h-8 bg-gradient-to-br from-gray-300 to-gray-400 dark:from-slate-500 dark:to-slate-600 rounded-full flex items-center justify-center">
                        <User size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`font-medium truncate ${
                                node.isCurrentUser ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'
                            }`}>
                                {node.username}
                            </span>
                            {node.isCurrentUser && (
                                <span className="text-xs bg-purple-500 text-white px-1.5 py-0.5 rounded">我</span>
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
                            {!node.isCurrentUser && (
                                <span>活跃: {formatRelativeTime(node.lastActive)}</span>
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function UserInviteTree({ token, isVisible }: UserInviteTreeProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<InviteTreeData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [isExpanded, setIsExpanded] = useState(false);

    const fetchTree = async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/split-invitation/my-tree`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                setData(result);
                // Auto-expand current user
                if (result.tree) {
                    setExpanded(new Set([result.tree.userId]));
                }
            } else {
                const err = await res.json();
                setError(err.error || '获取邀请树失败');
            }
        } catch (err: any) {
            setError(err.message || '网络错误');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isVisible && isExpanded && !data && !loading) {
            fetchTree();
        }
    }, [isVisible, isExpanded]);

    const toggleNode = (userId: number) => {
        setExpanded(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    };

    const expandAll = () => {
        if (!data?.tree) return;
        const collectIds = (node: TreeNode): number[] => {
            return [node.userId, ...node.children.flatMap(collectIds)];
        };
        setExpanded(new Set(collectIds(data.tree)));
    };

    const collapseAll = () => {
        if (!data?.tree) return;
        setExpanded(new Set([data.tree.userId]));
    };

    return (
        <div className="space-y-3">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Users size={18} className="text-purple-500" />
                    <span className="font-medium text-gray-900 dark:text-white">我的邀请树</span>
                    {data && (
                        <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded">
                            {data.totalDescendants} 人
                        </span>
                    )}
                </div>
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>

            {isExpanded && (
                <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="animate-spin text-purple-500" size={24} />
                        </div>
                    ) : error ? (
                        <div className="text-center py-4">
                            <p className="text-red-500 dark:text-red-400 mb-2">{error}</p>
                            <button
                                onClick={fetchTree}
                                className="text-sm text-blue-500 hover:underline"
                            >
                                重试
                            </button>
                        </div>
                    ) : data?.tree ? (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    共 {data.totalDescendants} 名下线（最多显示3层）
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={expandAll}
                                        className="text-xs text-blue-500 hover:underline"
                                    >
                                        展开全部
                                    </button>
                                    <button
                                        onClick={collapseAll}
                                        className="text-xs text-blue-500 hover:underline"
                                    >
                                        折叠全部
                                    </button>
                                    <button
                                        onClick={fetchTree}
                                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                                        title="刷新"
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                            </div>
                            <TreeNodeComponent
                                node={data.tree}
                                expanded={expanded}
                                onToggle={toggleNode}
                            />
                        </div>
                    ) : (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                            {data?.message || '暂无邀请记录'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
