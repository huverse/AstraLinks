/**
 * 执行监控仪表盘
 * 
 * @module components/workflow/MonitoringDashboard
 * @description 显示工作流执行监控统计、历史趋势和性能分析
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, TrendingUp, Clock, CheckCircle, XCircle, AlertTriangle, Activity, X, RefreshCw, Loader2 } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface ExecutionStats {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
    avgDuration: number;
    successRate: number;
}

interface DailyStats {
    date: string;
    total: number;
    completed: number;
    failed: number;
}

interface NodePerformance {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    avgDuration: number;
    execCount: number;
    failCount: number;
}

interface MonitoringDashboardProps {
    workflowId: string;
    isOpen: boolean;
    onClose: () => void;
}

// ============================================
// API 辅助函数
// ============================================

const getApiBase = () => {
    if (typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz') {
        return 'https://astralinks.xyz';
    }
    return 'http://localhost:3001';
};

const getToken = () => {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('galaxyous_token');
    }
    return null;
};

// ============================================
// 组件
// ============================================

export function MonitoringDashboard({ workflowId, isOpen, onClose }: MonitoringDashboardProps) {
    const [stats, setStats] = useState<ExecutionStats | null>(null);
    const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
    const [nodePerformance, setNodePerformance] = useState<NodePerformance[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

    // 获取统计数据
    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const API_BASE = getApiBase();
            const headers = { 'Authorization': `Bearer ${getToken()}` };

            // 获取执行统计
            const statsRes = await fetch(
                `${API_BASE}/api/workflows/${workflowId}/analytics/stats?days=${timeRange.replace('d', '')}`,
                { headers }
            );

            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats({
                    total: data.total || 0,
                    completed: data.completed || 0,
                    failed: data.failed || 0,
                    cancelled: data.cancelled || 0,
                    running: data.running || 0,
                    avgDuration: data.avgDuration || 0,
                    successRate: data.total > 0 ? (data.completed / data.total) * 100 : 0,
                });
            }

            // 获取每日趋势
            const dailyRes = await fetch(
                `${API_BASE}/api/workflows/${workflowId}/analytics/daily?days=${timeRange.replace('d', '')}`,
                { headers }
            );

            if (dailyRes.ok) {
                const data = await dailyRes.json();
                setDailyStats(data.daily || []);
            }

            // 获取节点性能
            const perfRes = await fetch(
                `${API_BASE}/api/workflows/${workflowId}/analytics/performance`,
                { headers }
            );

            if (perfRes.ok) {
                const data = await perfRes.json();
                setNodePerformance(data.nodes || []);
            }

        } catch (err: any) {
            setError(err.message || '获取监控数据失败');
        } finally {
            setLoading(false);
        }
    }, [workflowId, timeRange]);

    useEffect(() => {
        if (isOpen && workflowId) {
            fetchStats();
        }
    }, [isOpen, workflowId, fetchStats]);

    // 计算图表最大值
    const maxDaily = useMemo(() => {
        return Math.max(...dailyStats.map(d => d.total), 1);
    }, [dailyStats]);

    // 格式化时长
    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                {/* 头部 */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="text-cyan-400" size={20} />
                        <h2 className="text-lg font-bold text-white">执行监控仪表盘</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* 时间范围选择 */}
                        <div className="flex bg-white/5 rounded-lg p-0.5">
                            {(['7d', '30d', '90d'] as const).map(range => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={`px-3 py-1 text-xs rounded-md transition-colors ${timeRange === range
                                            ? 'bg-cyan-600 text-white'
                                            : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    {range === '7d' ? '7天' : range === '30d' ? '30天' : '90天'}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={fetchStats}
                            disabled={loading}
                            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* 错误提示 */}
                {error && (
                    <div className="px-4 py-2 bg-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* 内容区 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="animate-spin text-cyan-400" size={32} />
                        </div>
                    ) : (
                        <>
                            {/* 统计卡片 */}
                            <div className="grid grid-cols-5 gap-3">
                                <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 rounded-xl p-4 border border-cyan-500/30">
                                    <div className="flex items-center gap-2 text-cyan-400 text-xs mb-1">
                                        <Activity size={14} />
                                        <span>总执行</span>
                                    </div>
                                    <div className="text-2xl font-bold text-white">{stats?.total || 0}</div>
                                </div>
                                <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl p-4 border border-green-500/30">
                                    <div className="flex items-center gap-2 text-green-400 text-xs mb-1">
                                        <CheckCircle size={14} />
                                        <span>成功</span>
                                    </div>
                                    <div className="text-2xl font-bold text-white">{stats?.completed || 0}</div>
                                </div>
                                <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl p-4 border border-red-500/30">
                                    <div className="flex items-center gap-2 text-red-400 text-xs mb-1">
                                        <XCircle size={14} />
                                        <span>失败</span>
                                    </div>
                                    <div className="text-2xl font-bold text-white">{stats?.failed || 0}</div>
                                </div>
                                <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl p-4 border border-purple-500/30">
                                    <div className="flex items-center gap-2 text-purple-400 text-xs mb-1">
                                        <TrendingUp size={14} />
                                        <span>成功率</span>
                                    </div>
                                    <div className="text-2xl font-bold text-white">
                                        {(stats?.successRate || 0).toFixed(1)}%
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-amber-500/20 to-orange-600/10 rounded-xl p-4 border border-amber-500/30">
                                    <div className="flex items-center gap-2 text-amber-400 text-xs mb-1">
                                        <Clock size={14} />
                                        <span>平均耗时</span>
                                    </div>
                                    <div className="text-2xl font-bold text-white">
                                        {formatDuration(stats?.avgDuration || 0)}
                                    </div>
                                </div>
                            </div>

                            {/* 每日趋势图 */}
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                                    <TrendingUp size={16} className="text-cyan-400" />
                                    每日执行趋势
                                </h3>
                                {dailyStats.length > 0 ? (
                                    <div className="flex items-end gap-1 h-32">
                                        {dailyStats.map((day, index) => {
                                            const height = (day.total / maxDaily) * 100;
                                            const failedHeight = (day.failed / maxDaily) * 100;
                                            return (
                                                <div key={index} className="flex-1 flex flex-col items-center group">
                                                    <div className="w-full relative" style={{ height: '100px' }}>
                                                        {/* 总执行柱 */}
                                                        <div
                                                            className="absolute bottom-0 w-full bg-cyan-500/60 rounded-t transition-all"
                                                            style={{ height: `${height}%` }}
                                                        />
                                                        {/* 失败柱 */}
                                                        <div
                                                            className="absolute bottom-0 w-full bg-red-500/80 rounded-t transition-all"
                                                            style={{ height: `${failedHeight}%` }}
                                                        />
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">
                                                        {new Date(day.date).getDate()}日
                                                    </div>
                                                    {/* Tooltip */}
                                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                                        {day.date}: {day.completed}成功 / {day.failed}失败
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
                                        暂无执行数据
                                    </div>
                                )}
                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-cyan-500/60 rounded" />
                                        <span>成功</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-red-500/80 rounded" />
                                        <span>失败</span>
                                    </div>
                                </div>
                            </div>

                            {/* 节点性能分析 */}
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-amber-400" />
                                    节点性能分析
                                </h3>
                                {nodePerformance.length > 0 ? (
                                    <div className="space-y-2">
                                        {nodePerformance.slice(0, 10).map((node, index) => (
                                            <div key={index} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                                                <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs text-white font-medium">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-white text-sm truncate">{node.nodeName}</div>
                                                    <div className="text-xs text-slate-500">{node.nodeType}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-medium text-amber-400">
                                                        {formatDuration(node.avgDuration)}
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        {node.execCount}次执行
                                                    </div>
                                                </div>
                                                {node.failCount > 0 && (
                                                    <div className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                                                        {node.failCount}失败
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center text-slate-500 text-sm">
                                        暂无节点性能数据
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MonitoringDashboard;
