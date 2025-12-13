/**
 * 执行监控组件
 * 
 * @module components/workspace/ExecutionMonitor
 * @description 工作流执行历史和实时监控
 */

import React, { useState, useEffect } from 'react';
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
    const [executions, setExecutions] = useState<ExecutionRecord[]>(propExecutions || []);
    const [loading, setLoading] = useState(!propExecutions);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // 获取真实执行历史
    useEffect(() => {
        if (propExecutions) return; // 如果有传入的数据就不请求

        const fetchExecutions = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('galaxyous_token');
                const response = await fetch(`/api/workspace-config/${workspaceId}/executions`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                });

                if (response.ok) {
                    const data = await response.json();
                    setExecutions(data.executions || []);
                    // 自动展开运行中的任务
                    const runningIds = (data.executions || [])
                        .filter((e: ExecutionRecord) => e.status === 'running')
                        .map((e: ExecutionRecord) => e.id);
                    setExpandedIds(new Set(runningIds));
                }
            } catch (error) {
                console.error('Failed to fetch executions:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchExecutions();
    }, [workspaceId, propExecutions]);

    const handleRefresh = () => {
        if (onRefresh) {
            onRefresh();
        } else {
            // 重新获取数据
            setLoading(true);
            const token = localStorage.getItem('galaxyous_token');
            fetch(`/api/workspace-config/${workspaceId}/executions`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            })
                .then(res => res.json())
                .then(data => setExecutions(data.executions || []))
                .finally(() => setLoading(false));
        }
    };

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
                    onClick={handleRefresh}
                    className="p-1.5 text-slate-400 hover:text-white transition-colors"
                    disabled={loading}
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
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
