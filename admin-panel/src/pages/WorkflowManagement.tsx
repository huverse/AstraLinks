/**
 * 工作流管理页面
 * 
 * @module admin-panel/src/pages/WorkflowManagement
 * @description 管理员工作流监控和管理
 */

import { useState } from 'react';
import { Activity, Play, Pause, Trash2, Eye, RefreshCw, AlertCircle, XCircle, Clock } from 'lucide-react';

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
    workspaceId: string;
    ownerName: string;
    executions: number;
    lastExecution?: string;
    status: 'active' | 'disabled' | 'draft';
    createdAt: string;
}

interface ExecutionItem {
    id: string;
    workflowName: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    progress: number;
    startedAt: string;
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
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-gray-500">{title}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
                <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('500', '100')}`}>
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
        active: 'bg-green-100 text-green-700',
        disabled: 'bg-gray-100 text-gray-700',
        draft: 'bg-yellow-100 text-yellow-700',
        queued: 'bg-blue-100 text-blue-700',
        running: 'bg-yellow-100 text-yellow-700',
        completed: 'bg-green-100 text-green-700',
        failed: 'bg-red-100 text-red-700',
    };

    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
            {status}
        </span>
    );
}

// ============================================
// 队列监控
// ============================================

function QueueMonitor({ executions }: { executions: ExecutionItem[] }) {
    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Activity size={20} className="text-blue-500" />
                执行队列
            </h3>

            <div className="space-y-3">
                {executions.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">暂无执行中的任务</p>
                ) : (
                    executions.map(exec => (
                        <div key={exec.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{exec.workflowName}</span>
                                    <StatusBadge status={exec.status} />
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    开始于 {new Date(exec.startedAt).toLocaleTimeString()}
                                </div>
                            </div>

                            {exec.status === 'running' && (
                                <div className="w-24">
                                    <div className="h-2 bg-gray-200 rounded-full">
                                        <div
                                            className="h-2 bg-blue-500 rounded-full transition-all"
                                            style={{ width: `${exec.progress}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 text-center mt-1">{exec.progress}%</p>
                                </div>
                            )}

                            <button className="p-2 text-gray-500 hover:text-red-500">
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
    const [stats] = useState<WorkflowStats>({
        totalWorkflows: 156,
        todayExecutions: 423,
        runningExecutions: 12,
        failureRate: 2.3,
    });

    const [workflows, setWorkflows] = useState<WorkflowItem[]>([
        { id: '1', name: '数据处理流程', workspaceId: 'ws-1', ownerName: '张三', executions: 150, lastExecution: new Date().toISOString(), status: 'active', createdAt: '2024-01-15' },
        { id: '2', name: 'AI 分析任务', workspaceId: 'ws-2', ownerName: '李四', executions: 89, status: 'active', createdAt: '2024-02-20' },
        { id: '3', name: '报告生成器', workspaceId: 'ws-3', ownerName: '王五', executions: 45, status: 'disabled', createdAt: '2024-03-10' },
    ]);

    const [executions] = useState<ExecutionItem[]>([
        { id: 'e1', workflowName: '数据处理流程', status: 'running', progress: 65, startedAt: new Date(Date.now() - 120000).toISOString() },
        { id: 'e2', workflowName: 'AI 分析任务', status: 'queued', progress: 0, startedAt: new Date().toISOString() },
    ]);

    const handleDisable = (id: string) => {
        setWorkflows(workflows.map(w =>
            w.id === id ? { ...w, status: w.status === 'active' ? 'disabled' : 'active' } : w
        ));
    };

    const handleDelete = (id: string) => {
        if (confirm('确定删除此工作流？')) {
            setWorkflows(workflows.filter(w => w.id !== id));
        }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">工作流管理</h1>
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    <RefreshCw size={16} />
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
                <div className="col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold mb-4">工作流列表</h3>

                    <table className="w-full">
                        <thead className="text-left text-sm text-gray-500 border-b">
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
                                <tr key={wf.id} className="border-b border-gray-50">
                                    <td className="py-3 font-medium">{wf.name}</td>
                                    <td className="py-3 text-gray-600">{wf.ownerName}</td>
                                    <td className="py-3">{wf.executions}</td>
                                    <td className="py-3"><StatusBadge status={wf.status} /></td>
                                    <td className="py-3">
                                        <div className="flex items-center gap-2">
                                            <button className="p-1 text-gray-500 hover:text-blue-500"><Eye size={16} /></button>
                                            <button
                                                className="p-1 text-gray-500 hover:text-yellow-500"
                                                onClick={() => handleDisable(wf.id)}
                                            >
                                                {wf.status === 'active' ? <Pause size={16} /> : <Play size={16} />}
                                            </button>
                                            <button
                                                className="p-1 text-gray-500 hover:text-red-500"
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
                </div>

                {/* 队列监控 */}
                <QueueMonitor executions={executions} />
            </div>
        </div>
    );
}
