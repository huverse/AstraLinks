/**
 * 任务追踪面板
 * 
 * @module components/workspace/TaskPanel
 * @description 工作区任务管理 - 支持看板视图和列表视图
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    CheckSquare, Plus, MoreVertical, Calendar, Clock, Flag,
    Trash2, Edit2, ChevronRight, AlertCircle, Play, Check, X,
    Filter, List, LayoutGrid, Tag, Workflow
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface Task {
    id: string;
    workspace_id: string;
    project_id?: string;
    project_name?: string;
    project_color?: string;
    title: string;
    description?: string;
    status: 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    due_date?: string;
    completed_at?: string;
    assignee?: string;
    tags?: string[];
    trigger_workflow_id?: string;
    on_complete_workflow_id?: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

interface TaskPanelProps {
    workspaceId: string;
    projectId?: string;
    onRunWorkflow?: (workflowId: string, taskId: string) => void;
}

// 状态配置
const STATUS_CONFIG = {
    todo: { label: '待办', color: 'bg-slate-500', textColor: 'text-slate-400' },
    in_progress: { label: '进行中', color: 'bg-blue-500', textColor: 'text-blue-400' },
    review: { label: '审核中', color: 'bg-yellow-500', textColor: 'text-yellow-400' },
    done: { label: '完成', color: 'bg-green-500', textColor: 'text-green-400' },
    cancelled: { label: '取消', color: 'bg-red-500', textColor: 'text-red-400' },
};

const PRIORITY_CONFIG = {
    low: { label: '低', color: 'text-slate-400', icon: '○' },
    medium: { label: '中', color: 'text-blue-400', icon: '◐' },
    high: { label: '高', color: 'text-orange-400', icon: '●' },
    urgent: { label: '紧急', color: 'text-red-400', icon: '🔴' },
};

// ============================================
// 任务卡片组件
// ============================================

interface TaskCardProps {
    task: Task;
    onEdit: () => void;
    onDelete: () => void;
    onStatusChange: (status: Task['status']) => void;
    onRunWorkflow?: () => void;
}

function TaskCard({ task, onEdit, onDelete, onStatusChange, onRunWorkflow }: TaskCardProps) {
    const [showMenu, setShowMenu] = useState(false);
    const statusConfig = STATUS_CONFIG[task.status];
    const priorityConfig = PRIORITY_CONFIG[task.priority];

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        const now = new Date();
        const diff = date.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        if (days < 0) return '已逾期';
        if (days === 0) return '今天';
        if (days === 1) return '明天';
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    };

    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
    const isDone = task.status === 'done';

    return (
        <div className={`group bg-white/5 rounded-xl p-3 border transition-all ${isDone ? 'border-green-500/30 opacity-60' :
                isOverdue ? 'border-red-500/30' : 'border-white/10 hover:border-purple-500/50'
            }`}>
            <div className="flex items-start gap-3">
                {/* 状态切换按钮 */}
                <button
                    onClick={() => onStatusChange(isDone ? 'todo' : 'done')}
                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isDone
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-slate-500 hover:border-green-500 text-transparent hover:text-green-500'
                        }`}
                >
                    <Check size={12} />
                </button>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-medium ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
                            {task.title}
                        </span>
                        <span className={`text-xs ${priorityConfig.color}`}>
                            {priorityConfig.icon}
                        </span>
                    </div>

                    {task.description && (
                        <p className="text-xs text-slate-500 mb-2 line-clamp-1">{task.description}</p>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* 项目标签 */}
                        {task.project_name && (
                            <span
                                className="px-1.5 py-0.5 rounded text-[10px]"
                                style={{ backgroundColor: task.project_color + '30', color: task.project_color }}
                            >
                                {task.project_name}
                            </span>
                        )}

                        {/* 状态标签 */}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusConfig.color} text-white`}>
                            {statusConfig.label}
                        </span>

                        {/* 截止日期 */}
                        {task.due_date && (
                            <span className={`flex items-center gap-1 text-[10px] ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                                <Calendar size={10} />
                                {formatDate(task.due_date)}
                            </span>
                        )}

                        {/* 标签 */}
                        {task.tags && task.tags.length > 0 && (
                            <div className="flex gap-1">
                                {task.tags.slice(0, 2).map((tag, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-400">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* 工作流触发 */}
                        {task.trigger_workflow_id && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onRunWorkflow?.(); }}
                                className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300"
                            >
                                <Workflow size={10} /> 触发工作流
                            </button>
                        )}
                    </div>
                </div>

                {/* 菜单 */}
                <div className="relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        className="p-1 text-slate-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <MoreVertical size={14} />
                    </button>

                    {showMenu && (
                        <div className="absolute right-0 top-6 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden min-w-[100px]">
                            <button onClick={() => { onEdit(); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 hover:bg-white/10">
                                <Edit2 size={12} /> 编辑
                            </button>
                            <div className="border-t border-white/10 my-1" />
                            {task.status !== 'in_progress' && (
                                <button onClick={() => { onStatusChange('in_progress'); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-blue-400 hover:bg-white/10">
                                    <Play size={12} /> 开始
                                </button>
                            )}
                            {task.status !== 'review' && task.status !== 'done' && (
                                <button onClick={() => { onStatusChange('review'); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-yellow-400 hover:bg-white/10">
                                    <AlertCircle size={12} /> 待审核
                                </button>
                            )}
                            <div className="border-t border-white/10 my-1" />
                            <button onClick={() => { onDelete(); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-white/10">
                                <Trash2 size={12} /> 删除
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================
// 创建/编辑任务对话框
// ============================================

interface TaskDialogProps {
    isOpen: boolean;
    task?: Task | null;
    projects?: { id: string; name: string; color: string }[];
    onClose: () => void;
    onSave: (data: Partial<Task>) => Promise<void>;
}

function TaskDialog({ isOpen, task, projects = [], onClose, onSave }: TaskDialogProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [projectId, setProjectId] = useState<string>('');
    const [status, setStatus] = useState<Task['status']>('todo');
    const [priority, setPriority] = useState<Task['priority']>('medium');
    const [dueDate, setDueDate] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setDescription(task.description || '');
            setProjectId(task.project_id || '');
            setStatus(task.status);
            setPriority(task.priority);
            setDueDate(task.due_date?.split('T')[0] || '');
            setTagsInput(task.tags?.join(', ') || '');
        } else {
            setTitle('');
            setDescription('');
            setProjectId('');
            setStatus('todo');
            setPriority('medium');
            setDueDate('');
            setTagsInput('');
        }
    }, [task, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        setLoading(true);
        try {
            await onSave({
                title: title.trim(),
                description: description.trim() || undefined,
                project_id: projectId || undefined,
                status,
                priority,
                due_date: dueDate || undefined,
                tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
            });
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-4">
                    {task ? '编辑任务' : '创建任务'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* 标题 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">标题</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="任务标题"
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
                            placeholder="任务描述..."
                            rows={2}
                            className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                        />
                    </div>

                    {/* 项目选择 */}
                    {projects.length > 0 && (
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">所属项目</label>
                            <select
                                value={projectId}
                                onChange={e => setProjectId(e.target.value)}
                                className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
                            >
                                <option value="">无</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {/* 优先级 */}
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">优先级</label>
                            <select
                                value={priority}
                                onChange={e => setPriority(e.target.value as Task['priority'])}
                                className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
                            >
                                {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                                    <option key={key} value={key}>{config.label}</option>
                                ))}
                            </select>
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
                    </div>

                    {/* 标签 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">标签 (逗号分隔)</label>
                        <input
                            type="text"
                            value={tagsInput}
                            onChange={e => setTagsInput(e.target.value)}
                            placeholder="设计, 前端, 紧急"
                            className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
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
                            disabled={loading || !title.trim()}
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

export function TaskPanel({ workspaceId, projectId, onRunWorkflow }: TaskPanelProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<{ id: string; name: string; color: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDialog, setShowDialog] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [statusFilter, setStatusFilter] = useState<Task['status'] | 'all'>('all');
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

    const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
        ? 'https://astralinks.xyz'
        : 'http://localhost:3001';

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('galaxyous_token');
            let url = `${API_BASE}/api/workspace-projects/${workspaceId}/tasks`;
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (projectId) params.set('project_id', projectId);
            if (params.toString()) url += '?' + params.toString();

            const response = await fetch(url, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            if (response.ok) {
                const data = await response.json();
                setTasks(data.tasks || []);
            }
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, statusFilter, projectId, API_BASE]);

    const fetchProjects = useCallback(async () => {
        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/projects`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            if (response.ok) {
                const data = await response.json();
                setProjects((data.projects || []).map((p: any) => ({ id: p.id, name: p.name, color: p.color })));
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
        }
    }, [workspaceId, API_BASE]);

    useEffect(() => {
        fetchTasks();
        fetchProjects();
    }, [fetchTasks, fetchProjects]);

    const handleSave = async (data: Partial<Task>) => {
        const token = localStorage.getItem('galaxyous_token');
        const url = editingTask
            ? `${API_BASE}/api/workspace-projects/${workspaceId}/tasks/${editingTask.id}`
            : `${API_BASE}/api/workspace-projects/${workspaceId}/tasks`;

        await fetch(url, {
            method: editingTask ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(data),
        });

        fetchTasks();
    };

    const handleStatusChange = async (task: Task, status: Task['status']) => {
        const token = localStorage.getItem('galaxyous_token');
        await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/tasks/${task.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ status }),
        });
        fetchTasks();
    };

    const handleDelete = async (task: Task) => {
        if (!confirm(`确定删除任务 "${task.title}" 吗？`)) return;

        const token = localStorage.getItem('galaxyous_token');
        await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/tasks/${task.id}`, {
            method: 'DELETE',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        fetchTasks();
    };

    // 按状态分组 (用于看板视图)
    const groupedTasks = {
        todo: tasks.filter(t => t.status === 'todo'),
        in_progress: tasks.filter(t => t.status === 'in_progress'),
        review: tasks.filter(t => t.status === 'review'),
        done: tasks.filter(t => t.status === 'done'),
    };

    const filteredTasks = statusFilter === 'all' ? tasks : tasks.filter(t => t.status === statusFilter);

    // 统计
    const stats = {
        total: tasks.length,
        todo: tasks.filter(t => t.status === 'todo').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        done: tasks.filter(t => t.status === 'done').length,
        overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
    };

    return (
        <div className="h-full flex flex-col bg-slate-900/50 rounded-xl border border-white/10">
            {/* 头部 */}
            <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <CheckSquare size={20} className="text-purple-400" />
                        <span className="font-medium text-white">任务追踪</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
                            className="p-1.5 bg-white/5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"
                            title={viewMode === 'list' ? '看板视图' : '列表视图'}
                        >
                            {viewMode === 'list' ? <LayoutGrid size={14} /> : <List size={14} />}
                        </button>
                        <button
                            onClick={() => { setEditingTask(null); setShowDialog(true); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 transition-colors"
                        >
                            <Plus size={14} /> 新建
                        </button>
                    </div>
                </div>

                {/* 统计卡片 */}
                <div className="grid grid-cols-4 gap-2">
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-white">{stats.total}</div>
                        <div className="text-[10px] text-slate-500">总计</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-blue-400">{stats.inProgress}</div>
                        <div className="text-[10px] text-slate-500">进行中</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-green-400">{stats.done}</div>
                        <div className="text-[10px] text-slate-500">完成</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                        <div className={`text-lg font-bold ${stats.overdue > 0 ? 'text-red-400' : 'text-slate-400'}`}>{stats.overdue}</div>
                        <div className="text-[10px] text-slate-500">逾期</div>
                    </div>
                </div>
            </div>

            {/* 筛选 */}
            <div className="p-3 flex gap-2 overflow-x-auto border-b border-white/5">
                {(['all', 'todo', 'in_progress', 'review', 'done'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${statusFilter === s
                                ? 'bg-purple-600 text-white'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        {s === 'all' ? '全部' : STATUS_CONFIG[s].label}
                    </button>
                ))}
            </div>

            {/* 任务列表 */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
                    </div>
                ) : filteredTasks.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <CheckSquare size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">暂无任务</p>
                        <p className="text-xs mt-1">点击上方按钮创建第一个任务</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredTasks.map(task => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                onEdit={() => { setEditingTask(task); setShowDialog(true); }}
                                onDelete={() => handleDelete(task)}
                                onStatusChange={(status) => handleStatusChange(task, status)}
                                onRunWorkflow={() => task.trigger_workflow_id && onRunWorkflow?.(task.trigger_workflow_id, task.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 对话框 */}
            <TaskDialog
                isOpen={showDialog}
                task={editingTask}
                projects={projects}
                onClose={() => { setShowDialog(false); setEditingTask(null); }}
                onSave={handleSave}
            />
        </div>
    );
}

export default TaskPanel;
