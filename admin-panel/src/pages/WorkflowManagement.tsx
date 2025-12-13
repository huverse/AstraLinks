/**
 * 工作流管理页面
 * 
 * @module admin-panel/src/pages/WorkflowManagement
 * @description 管理员工作流监控和管理 - 生产版本
 */

import { useState, useEffect } from 'react';
import { Activity, Play, Pause, Trash2, Eye, RefreshCw, AlertCircle, XCircle, Clock } from 'lucide-react';
import { fetchAPI } from '../services/api';

// ============================================
// 类型定义
// ============================================

interface WorkflowStats {
    totalWorkflows: number;
    todayExecutions: number;
    runningExecutions: number;
    failureRate: number;
}

interface WorkflowItem {
    id: string;
    name: string;
    workspace_id: string;
    owner_name?: string;
    executions?: number;
    last_execution?: string;
    status: 'active' | 'disabled' | 'draft';
    created_at: string;
}

interface ExecutionItem {
    id: string;
    workflow_name: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    progress: number;
    started_at: string;
    duration?: number;
}

// ============================================
// 统计卡片
// ============================================

function StatCard({ title, value, icon: Icon, color }: {
    title: string;
    value: string | number;
    icon: any;
    color: string;
}) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">{title}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
                <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('500', '100')} dark:opacity-80`}>
                    <Icon className={color} size={24} />
                </div>
            </div>
        </div>
    );
}

// ============================================
// 状态徽章
// ============================================

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        disabled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
        draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
        queued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        running: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
        completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };

    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 dark:bg-gray-800'}`}>
            {status}
        </span>
    );
}

// ============================================
// 队列监控
// ============================================

function QueueMonitor({ executions, loading }: { executions: ExecutionItem[]; loading: boolean }) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                <Activity size={20} className="text-blue-500" />
                执行队列
            </h3>

            <div className="space-y-3">
                {loading ? (
                    <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
                    </div>
                ) : executions.length === 0 ? (
                    <p className="text-gray-500 dark:text-slate-400 text-center py-4">暂无执行中的任务</p>
                ) : (
                    executions.map(exec => (
                        <div key={exec.id} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900 dark:text-white">{exec.workflow_name}</span>
                                    <StatusBadge status={exec.status} />
                                </div>
                                <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                    开始于 {new Date(exec.started_at).toLocaleTimeString()}
                                </div>
                            </div>

                            {exec.status === 'running' && (
                                <div className="w-24">
                                    <div className="h-2 bg-gray-200 dark:bg-slate-600 rounded-full">
                                        <div
                                            className="h-2 bg-blue-500 rounded-full transition-all"
                                            style={{ width: `${exec.progress}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-slate-400 text-center mt-1">{exec.progress}%</p>
                                </div>
                            )}

                            <button className="p-2 text-gray-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400">
                                <XCircle size={16} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ============================================
// 主页面
// ============================================

export default function WorkflowManagement() {
    const [stats, setStats] = useState<WorkflowStats>({
        totalWorkflows: 0,
        todayExecutions: 0,
        runningExecutions: 0,
        failureRate: 0,
    });
    const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
    const [executions, setExecutions] = useState<ExecutionItem[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        try {
            // 获取工作流列表
            const workflowsRes = await fetchAPI('/admin/workflows');
            if (workflowsRes.success && workflowsRes.data) {
                setWorkflows(workflowsRes.data);
            }

            // 获取统计
            const statsRes = await fetchAPI('/admin/workflows/stats');
            if (statsRes.success && statsRes.data) {
                setStats(statsRes.data);
            }

            // 获取执行队列
            const execRes = await fetchAPI('/admin/workflows/executions');
            if (execRes.success && execRes.data) {
                setExecutions(execRes.data);
            }
        } catch (error) {
            console.error('Failed to load workflow data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleDisable = async (id: string) => {
        const workflow = workflows.find(w => w.id === id);
        if (!workflow) return;

        const newStatus = workflow.status === 'active' ? 'disabled' : 'active';
        try {
            await fetchAPI(`/admin/workflows/${id}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus }),
            });
            setWorkflows(workflows.map(w =>
                w.id === id ? { ...w, status: newStatus } : w
            ));
        } catch (error) {
            console.error('Failed to update workflow status:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('确定删除此工作流？')) return;

        try {
            await fetchAPI(`/admin/workflows/${id}`, { method: 'DELETE' });
            setWorkflows(workflows.filter(w => w.id !== id));
        } catch (error) {
            console.error('Failed to delete workflow:', error);
        }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">工作流管理</h1>
                <button
                    onClick={loadData}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    刷新
                </button>
            </div>

            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard title="总工作流数" value={stats.totalWorkflows} icon={Activity} color="text-blue-500" />
                <StatCard title="今日执行" value={stats.todayExecutions} icon={Play} color="text-green-500" />
                <StatCard title="执行中" value={stats.runningExecutions} icon={Clock} color="text-yellow-500" />
                <StatCard title="失败率" value={`${stats.failureRate}%`} icon={AlertCircle} color="text-red-500" />
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* 工作流列表 */}
                <div className="col-span-2 bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">工作流列表</h3>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                        </div>
                    ) : workflows.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 dark:text-slate-400">暂无工作流</p>
                    ) : (
                        <table className="w-full">
                            <thead className="text-left text-sm text-gray-500 dark:text-slate-400 border-b dark:border-slate-700">
                                <tr>
                                    <th className="pb-3">名称</th>
                                    <th className="pb-3">所有者</th>
                                    <th className="pb-3">执行次数</th>
                                    <th className="pb-3">状态</th>
                                    <th className="pb-3">操作</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {workflows.map(wf => (
                                    <tr key={wf.id} className="border-b border-gray-50 dark:border-slate-700/50">
                                        <td className="py-3 font-medium text-gray-900 dark:text-white">{wf.name}</td>
                                        <td className="py-3 text-gray-600 dark:text-slate-400">{wf.owner_name || '-'}</td>
                                        <td className="py-3 text-gray-900 dark:text-white">{wf.executions || 0}</td>
                                        <td className="py-3"><StatusBadge status={wf.status} /></td>
                                        <td className="py-3">
                                            <div className="flex items-center gap-2">
                                                <button className="p-1 text-gray-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400">
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    className="p-1 text-gray-500 hover:text-yellow-500 dark:text-slate-400 dark:hover:text-yellow-400"
                                                    onClick={() => handleDisable(wf.id)}
                                                >
                                                    {wf.status === 'active' ? <Pause size={16} /> : <Play size={16} />}
                                                </button>
                                                <button
                                                    className="p-1 text-gray-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
                                                    onClick={() => handleDelete(wf.id)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 队列监控 */}
                <QueueMonitor executions={executions} loading={loading} />
            </div>
        </div>
    );
}
