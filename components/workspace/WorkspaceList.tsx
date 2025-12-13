/**
 * Workspace 列表页面组件
 * 
 * @module components/workspace/WorkspaceList
 * @description 显示用户的所有 Workspace，支持创建和管理
 */

import React, { useState } from 'react';
import {
    Folder, Plus, Settings, Trash2, MoreVertical,
    GitBranch, Briefcase, Zap, FlaskConical,
    Clock, Tag
} from 'lucide-react';
import { useWorkspaces, WorkspaceType } from '../../hooks/useWorkspace';

// ============================================
// 类型图标映射
// ============================================

const TYPE_ICONS: Record<WorkspaceType, React.ReactNode> = {
    WORKFLOW: <GitBranch size={20} className="text-purple-400" />,
    PROJECT: <Briefcase size={20} className="text-blue-400" />,
    TASK: <Zap size={20} className="text-yellow-400" />,
    SANDBOX: <FlaskConical size={20} className="text-green-400" />,
};

const TYPE_COLORS: Record<WorkspaceType, string> = {
    WORKFLOW: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    PROJECT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    TASK: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    SANDBOX: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const TYPE_LABELS: Record<WorkspaceType, string> = {
    WORKFLOW: '工作流',
    PROJECT: '项目',
    TASK: '任务',
    SANDBOX: '沙箱',
};

// ============================================
// 创建对话框
// ============================================

interface CreateDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (params: { name: string; type: WorkspaceType; description?: string }) => Promise<void>;
}

function CreateDialog({ isOpen, onClose, onCreate }: CreateDialogProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<WorkspaceType>('WORKFLOW');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            await onCreate({ name: name.trim(), type, description: description.trim() || undefined });
            setName('');
            setDescription('');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-4">创建 Workspace</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* 名称 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">名称</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="我的工作流"
                            className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                            required
                        />
                    </div>

                    {/* 类型选择 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">类型</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['WORKFLOW', 'PROJECT', 'TASK', 'SANDBOX'] as WorkspaceType[]).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setType(t)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${type === t
                                            ? TYPE_COLORS[t] + ' border-2'
                                            : 'border-white/10 text-slate-400 hover:border-white/20'
                                        }`}
                                >
                                    {TYPE_ICONS[t]}
                                    <span className="text-sm">{TYPE_LABELS[t]}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 描述 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">描述 (可选)</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="简要描述此 Workspace 的用途..."
                            rows={3}
                            className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                        />
                    </div>

                    {/* 按钮 */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim()}
                            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? '创建中...' : '创建'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ============================================
// Workspace 卡片
// ============================================

interface WorkspaceCardProps {
    workspace: {
        id: string;
        name: string;
        type: WorkspaceType;
        description?: string;
        tags: string[];
        icon?: string;
        updatedAt: number;
    };
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}

function WorkspaceCard({ workspace, onSelect, onDelete }: WorkspaceCardProps) {
    const [showMenu, setShowMenu] = useState(false);

    const formatTime = (ts: number) => {
        const diff = Date.now() - ts;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
        return `${Math.floor(diff / 86400000)} 天前`;
    };

    return (
        <div
            className="group relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 rounded-2xl p-5 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 transition-all cursor-pointer backdrop-blur-sm"
            onClick={() => onSelect(workspace.id)}
        >
            {/* 菜单按钮 */}
            <button
                className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}
            >
                <MoreVertical size={16} />
            </button>

            {/* 下拉菜单 */}
            {showMenu && (
                <div className="absolute top-10 right-3 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                    <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
                        <Settings size={14} /> 设置
                    </button>
                    <button
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
                        onClick={e => { e.stopPropagation(); onDelete(workspace.id); setShowMenu(false); }}
                    >
                        <Trash2 size={14} /> 删除
                    </button>
                </div>
            )}

            {/* 图标和类型 */}
            <div className="flex items-start gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-white/5">
                    {workspace.icon ? (
                        <span className="text-2xl">{workspace.icon}</span>
                    ) : (
                        TYPE_ICONS[workspace.type]
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{workspace.name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border mt-1 ${TYPE_COLORS[workspace.type]}`}>
                        {TYPE_LABELS[workspace.type]}
                    </span>
                </div>
            </div>

            {/* 描述 */}
            {workspace.description && (
                <p className="text-sm text-slate-400 mb-3 line-clamp-2">{workspace.description}</p>
            )}

            {/* 底部信息 */}
            <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>{formatTime(workspace.updatedAt)}</span>
                </div>
                {workspace.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                        <Tag size={12} />
                        <span>{workspace.tags.length}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// 主组件
// ============================================

interface WorkspaceListProps {
    onSelectWorkspace: (id: string) => void;
}

export function WorkspaceList({ onSelectWorkspace }: WorkspaceListProps) {
    const { workspaces, loading, error, createWorkspace, deleteWorkspace } = useWorkspaces();
    const [showCreate, setShowCreate] = useState(false);
    const [filter, setFilter] = useState<WorkspaceType | 'ALL'>('ALL');

    const filteredWorkspaces = filter === 'ALL'
        ? workspaces
        : workspaces.filter(w => w.type === filter);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* 头部 */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-white">工作区</h1>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition-colors"
                >
                    <Plus size={18} />
                    新建
                </button>
            </div>

            {/* 筛选 */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {(['ALL', 'WORKFLOW', 'PROJECT', 'TASK', 'SANDBOX'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setFilter(t)}
                        className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${filter === t
                                ? 'bg-purple-600 text-white'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        {t === 'ALL' ? '全部' : TYPE_LABELS[t]}
                    </button>
                ))}
            </div>

            {/* 错误提示 */}
            {error && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                    {error}
                </div>
            )}

            {/* 空状态 */}
            {filteredWorkspaces.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Folder size={48} className="mb-4 opacity-50" />
                    <p className="text-lg">暂无工作区</p>
                    <p className="text-sm mt-1">点击右上角按钮创建你的第一个工作区</p>
                </div>
            ) : (
                /* 卡片网格 */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredWorkspaces.map(w => (
                        <WorkspaceCard
                            key={w.id}
                            workspace={w}
                            onSelect={onSelectWorkspace}
                            onDelete={deleteWorkspace}
                        />
                    ))}
                </div>
            )}

            {/* 创建对话框 */}
            <CreateDialog
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                onCreate={createWorkspace}
            />
        </div>
    );
}

export default WorkspaceList;
