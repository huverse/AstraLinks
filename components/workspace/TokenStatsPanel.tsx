/**
 * Token 成本统计面板
 * 
 * @module components/workspace/TokenStatsPanel
 * @description 实时显示 API Token 使用量和费用统计
 */

import React, { useState, useEffect } from 'react';
import {
    X, BarChart3, TrendingUp, DollarSign, Zap,
    Clock, Hash, RefreshCw
} from 'lucide-react';

// Token 价格表 (每 1M tokens 的美元价格)
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
    // OpenAI
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'text-embedding-3-small': { input: 0.02, output: 0 },
    'text-embedding-3-large': { input: 0.13, output: 0 },
    // Gemini
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    'gemini-embedding-001': { input: 0.00, output: 0 }, // Free tier
};

interface TokenUsage {
    timestamp: number;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    source: 'chat' | 'agent' | 'workflow' | 'rag';
}

interface TokenStatsPanelProps {
    onClose: () => void;
}

export default function TokenStatsPanel({ onClose }: TokenStatsPanelProps) {
    const [usageHistory, setUsageHistory] = useState<TokenUsage[]>([]);
    const [totalStats, setTotalStats] = useState({
        totalTokens: 0,
        totalCost: 0,
        promptTokens: 0,
        completionTokens: 0,
    });
    const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('today');

    // 加载使用历史
    useEffect(() => {
        loadUsageHistory();
    }, [timeRange]);

    const loadUsageHistory = () => {
        const savedHistory = localStorage.getItem('token_usage_history');
        let history: TokenUsage[] = savedHistory ? JSON.parse(savedHistory) : [];

        // 按时间范围过滤
        const now = Date.now();
        const ranges = {
            today: 24 * 60 * 60 * 1000,
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
            all: Infinity,
        };

        history = history.filter(u => now - u.timestamp < ranges[timeRange]);
        setUsageHistory(history);

        // 计算总计
        const stats = history.reduce(
            (acc, u) => ({
                totalTokens: acc.totalTokens + u.totalTokens,
                totalCost: acc.totalCost + u.cost,
                promptTokens: acc.promptTokens + u.promptTokens,
                completionTokens: acc.completionTokens + u.completionTokens,
            }),
            { totalTokens: 0, totalCost: 0, promptTokens: 0, completionTokens: 0 }
        );
        setTotalStats(stats);
    };

    // 按模型分组统计
    const statsByModel = usageHistory.reduce((acc, u) => {
        if (!acc[u.model]) {
            acc[u.model] = { tokens: 0, cost: 0, count: 0 };
        }
        acc[u.model].tokens += u.totalTokens;
        acc[u.model].cost += u.cost;
        acc[u.model].count += 1;
        return acc;
    }, {} as Record<string, { tokens: number; cost: number; count: number }>);

    // 按来源分组
    const statsBySource = usageHistory.reduce((acc, u) => {
        if (!acc[u.source]) {
            acc[u.source] = { tokens: 0, cost: 0 };
        }
        acc[u.source].tokens += u.totalTokens;
        acc[u.source].cost += u.cost;
        return acc;
    }, {} as Record<string, { tokens: number; cost: number }>);

    // 格式化数字
    const formatNumber = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    };

    // 清空历史
    const clearHistory = () => {
        if (confirm('确定要清空所有使用历史吗？')) {
            localStorage.removeItem('token_usage_history');
            setUsageHistory([]);
            setTotalStats({ totalTokens: 0, totalCost: 0, promptTokens: 0, completionTokens: 0 });
        }
    };

    const sourceLabels: Record<string, string> = {
        chat: '💬 对话',
        agent: '🤖 Agent',
        workflow: '⚡ 工作流',
        rag: '📚 知识库',
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <BarChart3 size={20} className="text-green-400" />
                        Token 统计
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={clearHistory}
                            className="text-xs text-slate-400 hover:text-red-400 px-2 py-1"
                        >
                            清空历史
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-white">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Time Range Selector */}
                <div className="p-4 border-b border-white/10">
                    <div className="flex gap-2">
                        {(['today', 'week', 'month', 'all'] as const).map(range => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`px-3 py-1 rounded-lg text-sm ${timeRange === range
                                    ? 'bg-green-600 text-white'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                    }`}
                            >
                                {range === 'today' ? '今日' : range === 'week' ? '本周' : range === 'month' ? '本月' : '全部'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 space-y-4">
                    {/* 总计卡片 */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl p-4 border border-blue-500/30">
                            <div className="flex items-center gap-2 text-blue-400 mb-2">
                                <Hash size={16} />
                                <span className="text-xs">总 Token</span>
                            </div>
                            <div className="text-2xl font-bold text-white">
                                {formatNumber(totalStats.totalTokens)}
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-xl p-4 border border-purple-500/30">
                            <div className="flex items-center gap-2 text-purple-400 mb-2">
                                <TrendingUp size={16} />
                                <span className="text-xs">输入 Token</span>
                            </div>
                            <div className="text-2xl font-bold text-white">
                                {formatNumber(totalStats.promptTokens)}
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/20 rounded-xl p-4 border border-orange-500/30">
                            <div className="flex items-center gap-2 text-orange-400 mb-2">
                                <Zap size={16} />
                                <span className="text-xs">输出 Token</span>
                            </div>
                            <div className="text-2xl font-bold text-white">
                                {formatNumber(totalStats.completionTokens)}
                            </div>
                        </div>
                    </div>

                    {/* 按模型统计 */}
                    <div className="bg-white/5 rounded-xl p-4">
                        <h3 className="text-sm font-medium text-slate-400 mb-3">📊 按模型统计</h3>
                        {Object.keys(statsByModel).length > 0 ? (
                            <div className="space-y-2">
                                {Object.entries(statsByModel)
                                    .sort((a, b) => b[1].cost - a[1].cost)
                                    .map(([model, stats]) => (
                                        <div key={model} className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                                            <div>
                                                <span className="text-sm text-white font-medium">{model}</span>
                                                <span className="text-xs text-slate-500 ml-2">{stats.count} 次调用</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm text-green-400">${stats.cost.toFixed(4)}</div>
                                                <div className="text-xs text-slate-500">{formatNumber(stats.tokens)} tokens</div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        ) : (
                            <div className="text-center text-slate-500 py-4">暂无使用记录</div>
                        )}
                    </div>

                    {/* 按来源统计 */}
                    <div className="bg-white/5 rounded-xl p-4">
                        <h3 className="text-sm font-medium text-slate-400 mb-3">🏷️ 按来源统计</h3>
                        {Object.keys(statsBySource).length > 0 ? (
                            <div className="grid grid-cols-4 gap-2">
                                {Object.entries(statsBySource).map(([source, stats]) => (
                                    <div key={source} className="p-3 bg-black/20 rounded-lg text-center">
                                        <div className="text-lg mb-1">{sourceLabels[source] || source}</div>
                                        <div className="text-sm text-green-400">${stats.cost.toFixed(4)}</div>
                                        <div className="text-xs text-slate-500">{formatNumber(stats.tokens)} tokens</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-slate-500 py-4">暂无使用记录</div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

// 工具函数：记录 Token 使用
export function recordTokenUsage(usage: Omit<TokenUsage, 'timestamp' | 'cost'>) {
    const prices = TOKEN_PRICES[usage.model] || { input: 0.01, output: 0.03 };
    const cost = (usage.promptTokens * prices.input + usage.completionTokens * prices.output) / 1000000;

    const record: TokenUsage = {
        ...usage,
        timestamp: Date.now(),
        cost,
    };

    const savedHistory = localStorage.getItem('token_usage_history');
    const history: TokenUsage[] = savedHistory ? JSON.parse(savedHistory) : [];
    history.push(record);

    // 只保留最近 1000 条
    if (history.length > 1000) {
        history.splice(0, history.length - 1000);
    }

    localStorage.setItem('token_usage_history', JSON.stringify(history));
}
