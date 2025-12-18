/**
 * 项目管理面板
 * 
 * @module components/workspace/ProjectPanel
 * @description 工作区项目管理 - Kanban风格的项目管理面板
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Folder, Plus, MoreVertical, Calendar, CheckCircle, Clock,
    Pause, Archive, Play, Trash2, Edit2, ChevronRight, Target
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface Project {
    id: string;
    workspace_id: string;
    name: string;
    description?: string;
    status: 'planning' | 'active' | 'paused' | 'completed' | 'archived';
    progress: number;
    start_date?: string;
    due_date?: string;
    color: string;
    icon: string;
    metadata?: any;
    task_count?: number;
    completed_task_count?: number;
    created_at: string;
    updated_at: string;
}

interface ProjectPanelProps {
    workspaceId: string;
    onSelectProject?: (project: Project) => void;
    onNavigateToTasks?: (projectId: string) => void;
}

// 状态配置
const STATUS_CONFIG = {
    planning: { label: '规划中', color: 'bg-blue-500', icon: Target },
    active: { label: '进行中', color: 'bg-green-500', icon: Play },
    paused: { label: '已暂停', color: 'bg-yellow-500', icon: Pause },
    completed: { label: '已完成', color: 'bg-purple-500', icon: CheckCircle },
    archived: { label: '已归档', color: 'bg-slate-500', icon: Archive },
};

// ============================================
// 项目卡片组件
// ============================================

interface ProjectCardProps {
    project: Project;
    onEdit: () => void;
    onDelete: () => void;
    onStatusChange: (status: Project['status']) => void;
    onNavigateToTasks: () => void;
}

function ProjectCard({ project, onEdit, onDelete, onStatusChange, onNavigateToTasks }: ProjectCardProps) {
    const [showMenu, setShowMenu] = useState(false);
    const config = STATUS_CONFIG[project.status];
    const StatusIcon = config.icon;

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return null;
        return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    };

    const isOverdue = project.due_date && new Date(project.due_date) < new Date() && project.status !== 'completed';

    return (
        <div
            className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-purple-500/50 transition-all cursor-pointer"
            style={{ borderLeftColor: project.color, borderLeftWidth: '4px' }}
        >
            {/* 头部 */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{project.icon}</span>
                    <div>
                        <h3 className="font-semibold text-white text-sm">{project.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color} text-white`}>
                                {config.label}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        className="p-1 text-slate-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <MoreVertical size={14} />
                    </button>

                    {showMenu && (
                        <div className="absolute right-0 top-6 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden min-w-[120px]">
                            <button onClick={() => { onEdit(); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 hover:bg-white/10">
                                <Edit2 size={12} /> 编辑
                            </button>
                            <div className="border-t border-white/10" />
                            {project.status !== 'active' && (
                                <button onClick={() => { onStatusChange('active'); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-green-400 hover:bg-white/10">
                                    <Play size={12} /> 开始
                                </button>
                            )}
                            {project.status === 'active' && (
                                <button onClick={() => { onStatusChange('paused'); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-yellow-400 hover:bg-white/10">
                                    <Pause size={12} /> 暂停
                                </button>
                            )}
                            {project.status !== 'completed' && (
                                <button onClick={() => { onStatusChange('completed'); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-purple-400 hover:bg-white/10">
                                    <CheckCircle size={12} /> 完成
                                </button>
                            )}
                            <div className="border-t border-white/10" />
                            <button onClick={() => { onDelete(); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-white/10">
                                <Trash2 size={12} /> 删除
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 描述 */}
            {project.description && (
                <p className="text-xs text-slate-400 mb-3 line-clamp-2">{project.description}</p>
            )}

            {/* 进度条 */}
            <div className="mb-3">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>进度</span>
                    <span>{project.progress}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="h-full transition-all"
                        style={{ width: `${project.progress}%`, backgroundColor: project.color }}
                    />
                </div>
            </div>

            {/* 底部信息 */}
            <div className="flex items-center justify-between text-[10px] text-slate-500">
                <div className="flex items-center gap-3">
                    {project.due_date && (
                        <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : ''}`}>
                            <Calendar size={10} />
                            {formatDate(project.due_date)}
                        </span>
                    )}
                    {project.task_count !== undefined && (
                        <span className="flex items-center gap-1">
                            <CheckCircle size={10} />
                            {project.completed_task_count || 0}/{project.task_count}
                        </span>
                    )}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onNavigateToTasks(); }}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                >
                    任务 <ChevronRight size={12} />
                </button>
            </div>
        </div>
    );
}

// ============================================
// 创建/编辑项目对话框
// ============================================

interface ProjectDialogProps {
    isOpen: boolean;
    project?: Project | null;
    onClose: () => void;
    onSave: (data: Partial<Project>) => Promise<void>;
}

function ProjectDialog({ isOpen, project, onClose, onSave }: ProjectDialogProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<Project['status']>('planning');
    const [dueDate, setDueDate] = useState('');
    const [color, setColor] = useState('#8B5CF6');
    const [icon, setIcon] = useState('📁');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (project) {
            setName(project.name);
            setDescription(project.description || '');
            setStatus(project.status);
            setDueDate(project.due_date?.split('T')[0] || '');
            setColor(project.color);
            setIcon(project.icon);
        } else {
            setName('');
            setDescription('');
            setStatus('planning');
            setDueDate('');
            setColor('#8B5CF6');
            setIcon('📁');
        }
    }, [project, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            await onSave({
                name: name.trim(),
                description: description.trim() || undefined,
                status,
                due_date: dueDate || undefined,
                color,
                icon,
            });
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];
    const icons = ['📁', '🚀', '💡', '🎯', '📊', '🔧', '📝', '🎨', '🌟', '⚡'];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-4">
                    {project ? '编辑项目' : '创建项目'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* 图标选择 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">图标</label>
                        <div className="flex gap-2 flex-wrap">
                            {icons.map(i => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setIcon(i)}
                                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${icon === i ? 'bg-purple-600 ring-2 ring-purple-400' : 'bg-white/5 hover:bg-white/10'
                                        }`}
                                >
                                    {i}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 名称 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">名称</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="项目名称"
                            className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                            required
                        />
                    </div>

                    {/* 描述 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">描述</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="项目描述..."
                            rows={2}
                            className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                        />
                    </div>

                    {/* 颜色选择 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">颜色</label>
                        <div className="flex gap-2">
                            {colors.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-white scale-110' : ''
                                        }`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* 截止日期 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">截止日期</label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
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
                            {loading ? '保存中...' : '保存'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ============================================
// 主组件
// ============================================

export function ProjectPanel({ workspaceId, onSelectProject, onNavigateToTasks }: ProjectPanelProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDialog, setShowDialog] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [filter, setFilter] = useState<Project['status'] | 'all'>('all');

    const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
        ? 'https://astralinks.xyz'
        : 'http://localhost:3001';

    const fetchProjects = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('galaxyous_token');
            const url = filter === 'all'
                ? `${API_BASE}/api/workspace-projects/${workspaceId}/projects`
                : `${API_BASE}/api/workspace-projects/${workspaceId}/projects?status=${filter}`;

            const response = await fetch(url, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            if (response.ok) {
                const data = await response.json();
                setProjects(data.projects || []);
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, filter, API_BASE]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleSave = async (data: Partial<Project>) => {
        const token = localStorage.getItem('galaxyous_token');
        const url = editingProject
            ? `${API_BASE}/api/workspace-projects/${workspaceId}/projects/${editingProject.id}`
            : `${API_BASE}/api/workspace-projects/${workspaceId}/projects`;

        await fetch(url, {
            method: editingProject ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(data),
        });

        fetchProjects();
    };

    const handleStatusChange = async (project: Project, status: Project['status']) => {
        const token = localStorage.getItem('galaxyous_token');
        await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/projects/${project.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ status }),
        });
        fetchProjects();
    };

    const handleDelete = async (project: Project) => {
        if (!confirm(`确定删除项目 "${project.name}" 吗？`)) return;

        const token = localStorage.getItem('galaxyous_token');
        await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/projects/${project.id}`, {
            method: 'DELETE',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        fetchProjects();
    };

    const filteredProjects = filter === 'all' ? projects : projects.filter(p => p.status === filter);

    return (
        <div className="h-full flex flex-col bg-slate-900/50 rounded-xl border border-white/10">
            {/* 头部 */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Folder size={20} className="text-purple-400" />
                    <span className="font-medium text-white">项目管理</span>
                    <span className="text-xs text-slate-500">({projects.length})</span>
                </div>
                <button
                    onClick={() => { setEditingProject(null); setShowDialog(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 transition-colors"
                >
                    <Plus size={14} /> 新建
                </button>
            </div>

            {/* 筛选 */}
            <div className="p-3 flex gap-2 overflow-x-auto border-b border-white/5">
                {(['all', 'planning', 'active', 'paused', 'completed'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${filter === s
                                ? 'bg-purple-600 text-white'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        {s === 'all' ? '全部' : STATUS_CONFIG[s].label}
                    </button>
                ))}
            </div>

            {/* 项目列表 */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <Folder size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">暂无项目</p>
                        <p className="text-xs mt-1">点击上方按钮创建第一个项目</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {filteredProjects.map(project => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                onEdit={() => { setEditingProject(project); setShowDialog(true); }}
                                onDelete={() => handleDelete(project)}
                                onStatusChange={(status) => handleStatusChange(project, status)}
                                onNavigateToTasks={() => onNavigateToTasks?.(project.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 对话框 */}
            <ProjectDialog
                isOpen={showDialog}
                project={editingProject}
                onClose={() => { setShowDialog(false); setEditingProject(null); }}
                onSave={handleSave}
            />
        </div>
    );
}

export default ProjectPanel;
