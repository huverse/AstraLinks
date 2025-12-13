/**
 * 执行监控组件
 * 
 * @module components/workspace/ExecutionMonitor
 * @description 工作流执行历史和实时监控
 */

import React, { useState } from 'react';
import {
    Clock, CheckCircle, XCircle, Loader2, AlertCircle,
    ChevronRight, ChevronDown, Zap, Bot, RefreshCw
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface ExecutionRecord {
    id: string;
    workflowId: string;
    workflowName: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    startTime: string;
    endTime?: string;
    duration?: number;
    totalTokens?: number;
    nodeCount: number;
    completedNodes: number;
    error?: string;
    logs?: { timestamp: number; level: string; message: string }[];
}

interface ExecutionMonitorProps {
    workspaceId: string;
    executions?: ExecutionRecord[];
    onRefresh?: () => void;
    onViewDetails?: (execution: ExecutionRecord) => void;
}

// ============================================
// 状态图标
// ============================================

function StatusIcon({ status }: { status: ExecutionRecord['status'] }) {
    switch (status) {
        case 'running':
            return <Loader2 size={16} className="animate-spin text-yellow-400" />;
        case 'completed':
            return <CheckCircle size={16} className="text-green-400" />;
        case 'failed':
            return <XCircle size={16} className="text-red-400" />;
        case 'cancelled':
            return <AlertCircle size={16} className="text-orange-400" />;
        default:
            return <Clock size={16} className="text-slate-400" />;
    }
}

// ============================================
// 格式化时间
// ============================================

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============================================
// 执行卡片
// ============================================

interface ExecutionCardProps {
    execution: ExecutionRecord;
    isExpanded: boolean;
    onToggle: () => void;
    onViewDetails: () => void;
}

function ExecutionCard({ execution, isExpanded, onToggle, onViewDetails }: ExecutionCardProps) {
    return (
        <div className={`bg-white/5 rounded-xl border ${execution.status === 'running' ? 'border-yellow-500/50' :
                execution.status === 'failed' ? 'border-red-500/30' :
                    'border-white/10'
            } overflow-hidden`}>
            {/* 卡片头部 */}
            <div
                className="p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5"
                onClick={onToggle}
            >
                <span className="text-slate-500">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <StatusIcon status={execution.status} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">
                            {execution.workflowName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                            #{execution.id.slice(-6)}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{formatTime(execution.startTime)}</span>
                        {execution.duration && (
                            <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {formatDuration(execution.duration)}
                            </span>
                        )}
                        <span>
                            {execution.completedNodes}/{execution.nodeCount} 节点
                        </span>
                    </div>
                </div>

                {/* 指标 */}
                <div className="flex items-center gap-4 text-xs">
                    {execution.totalTokens && (
                        <div className="flex items-center gap-1 text-purple-400">
                            <Bot size={12} />
                            <span>{execution.totalTokens}</span>
                        </div>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
                        className="px-2 py-1 bg-white/5 rounded-lg hover:bg-white/10 text-slate-300"
                    >
                        详情
                    </button>
                </div>
            </div>

            {/* 展开内容 */}
            {isExpanded && (
                <div className="border-t border-white/10 p-3">
                    {/* 进度条 */}
                    <div className="mb-3">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>进度</span>
                            <span>{Math.round(execution.completedNodes / execution.nodeCount * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all ${execution.status === 'failed' ? 'bg-red-500' :
                                        execution.status === 'running' ? 'bg-yellow-500' : 'bg-green-500'
                                    }`}
                                style={{ width: `${execution.completedNodes / execution.nodeCount * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* 错误信息 */}
                    {execution.error && (
                        <div className="p-2 bg-red-900/30 border border-red-800 rounded-lg mb-3">
                            <p className="text-xs text-red-400">{execution.error}</p>
                        </div>
                    )}

                    {/* 日志 */}
                    {execution.logs && execution.logs.length > 0 && (
                        <div className="max-h-[100px] overflow-y-auto bg-black/30 rounded-lg p-2">
                            {execution.logs.slice(-5).map((log, i) => (
                                <div key={i} className={`text-xs font-mono ${log.level === 'error' ? 'text-red-400' :
                                        log.level === 'warn' ? 'text-yellow-400' : 'text-slate-400'
                                    }`}>
                                    <span className="text-slate-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                    {' '}{log.message}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================
// 主组件
// ============================================

export function ExecutionMonitor({ workspaceId, executions: propExecutions, onRefresh, onViewDetails }: ExecutionMonitorProps) {
    // 模拟数据
    const [executions] = useState<ExecutionRecord[]>(propExecutions || [
        {
            id: 'exec-001',
            workflowId: 'wf-1',
            workflowName: '数据处理流程',
            status: 'completed',
            startTime: new Date(Date.now() - 300000).toISOString(),
            endTime: new Date(Date.now() - 280000).toISOString(),
            duration: 20000,
            totalTokens: 1250,
            nodeCount: 5,
            completedNodes: 5,
        },
        {
            id: 'exec-002',
            workflowId: 'wf-2',
            workflowName: 'AI 分析任务',
            status: 'running',
            startTime: new Date(Date.now() - 10000).toISOString(),
            duration: 10000,
            totalTokens: 320,
            nodeCount: 8,
            completedNodes: 3,
            logs: [
                { timestamp: Date.now() - 8000, level: 'info', message: '开始执行节点: AI分析' },
                { timestamp: Date.now() - 5000, level: 'info', message: 'AI调用完成, tokens: 180' },
                { timestamp: Date.now() - 2000, level: 'info', message: '执行条件判断...' },
            ],
        },
        {
            id: 'exec-003',
            workflowId: 'wf-1',
            workflowName: '数据处理流程',
            status: 'failed',
            startTime: new Date(Date.now() - 600000).toISOString(),
            endTime: new Date(Date.now() - 590000).toISOString(),
            duration: 10000,
            nodeCount: 5,
            completedNodes: 2,
            error: 'AI节点调用失败: 超时',
        },
    ]);

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['exec-002']));

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // 统计
    const stats = {
        total: executions.length,
        running: executions.filter(e => e.status === 'running').length,
        completed: executions.filter(e => e.status === 'completed').length,
        failed: executions.filter(e => e.status === 'failed').length,
    };

    return (
        <div className="h-full flex flex-col bg-slate-900/50 rounded-xl border border-white/10">
            {/* 头部 */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Zap size={20} className="text-purple-400" />
                    <span className="font-medium text-white">执行监控</span>
                </div>
                <button
                    onClick={onRefresh}
                    className="p-1.5 text-slate-400 hover:text-white transition-colors"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* 统计卡片 */}
            <div className="p-3 grid grid-cols-4 gap-2">
                {[
                    { label: '总计', value: stats.total, color: 'text-white' },
                    { label: '运行中', value: stats.running, color: 'text-yellow-400' },
                    { label: '完成', value: stats.completed, color: 'text-green-400' },
                    { label: '失败', value: stats.failed, color: 'text-red-400' },
                ].map(stat => (
                    <div key={stat.label} className="bg-white/5 rounded-lg p-2 text-center">
                        <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-[10px] text-slate-500">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* 执行列表 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {executions.map(execution => (
                    <ExecutionCard
                        key={execution.id}
                        execution={execution}
                        isExpanded={expandedIds.has(execution.id)}
                        onToggle={() => toggleExpand(execution.id)}
                        onViewDetails={() => onViewDetails?.(execution)}
                    />
                ))}

                {executions.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                        <Clock size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">暂无执行记录</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ExecutionMonitor;
