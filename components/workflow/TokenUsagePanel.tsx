/**
 * Token 使用统计面板
 * 
 * @module components/workflow/TokenUsagePanel
 * @description 显示工作流执行的 Token 使用详情和成本估算
 */

import React, { useMemo } from 'react';
import { Coins, TrendingUp, DollarSign, BarChart3, X } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface NodeTokenUsage {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    provider?: string;
    model?: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface TokenUsagePanelProps {
    nodeUsages: NodeTokenUsage[];
    isOpen: boolean;
    onClose: () => void;
}

// ============================================
// 模型定价 (每 1M tokens, USD)
// ============================================

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    // OpenAI
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10, output: 30 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    // Gemini
    'gemini-2.5-flash': { input: 0.075, output: 0.3 },
    'gemini-2.5-pro': { input: 1.25, output: 5 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    'gemini-1.5-pro': { input: 1.25, output: 5 },
    // Anthropic
    'claude-3-5-sonnet': { input: 3, output: 15 },
    'claude-3-opus': { input: 15, output: 75 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    // DeepSeek
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'deepseek-coder': { input: 0.14, output: 0.28 },
    // 默认
    'default': { input: 0.5, output: 1 },
};

// ============================================
// 工具函数
// ============================================

const getModelPricing = (model?: string) => {
    if (!model) return MODEL_PRICING['default'];
    const lowerModel = model.toLowerCase();
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
        if (lowerModel.includes(key.toLowerCase())) {
            return pricing;
        }
    }
    return MODEL_PRICING['default'];
};

const calculateCost = (usage: NodeTokenUsage): number => {
    const pricing = getModelPricing(usage.model);
    const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
};

const formatCost = (cost: number): string => {
    if (cost < 0.001) return '< $0.001';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
};

const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
};

// ============================================
// 组件
// ============================================

export function TokenUsagePanel({ nodeUsages, isOpen, onClose }: TokenUsagePanelProps) {
    // 计算汇总
    const summary = useMemo(() => {
        const totalPrompt = nodeUsages.reduce((sum, n) => sum + n.promptTokens, 0);
        const totalCompletion = nodeUsages.reduce((sum, n) => sum + n.completionTokens, 0);
        const totalTokens = nodeUsages.reduce((sum, n) => sum + n.totalTokens, 0);
        const totalCost = nodeUsages.reduce((sum, n) => sum + calculateCost(n), 0);
        return { totalPrompt, totalCompletion, totalTokens, totalCost };
    }, [nodeUsages]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
                {/* 头部 */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Coins className="text-yellow-400" size={20} />
                        <h2 className="text-lg font-bold text-white">Token 使用统计</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* 汇总卡片 */}
                <div className="p-4 grid grid-cols-4 gap-3">
                    <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-xl p-3 border border-blue-500/30">
                        <div className="flex items-center gap-2 text-blue-400 text-xs mb-1">
                            <TrendingUp size={14} />
                            <span>输入 Tokens</span>
                        </div>
                        <div className="text-xl font-bold text-white">{formatNumber(summary.totalPrompt)}</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl p-3 border border-green-500/30">
                        <div className="flex items-center gap-2 text-green-400 text-xs mb-1">
                            <TrendingUp size={14} />
                            <span>输出 Tokens</span>
                        </div>
                        <div className="text-xl font-bold text-white">{formatNumber(summary.totalCompletion)}</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl p-3 border border-purple-500/30">
                        <div className="flex items-center gap-2 text-purple-400 text-xs mb-1">
                            <BarChart3 size={14} />
                            <span>总计 Tokens</span>
                        </div>
                        <div className="text-xl font-bold text-white">{formatNumber(summary.totalTokens)}</div>
                    </div>
                    <div className="bg-gradient-to-br from-yellow-500/20 to-orange-600/10 rounded-xl p-3 border border-yellow-500/30">
                        <div className="flex items-center gap-2 text-yellow-400 text-xs mb-1">
                            <DollarSign size={14} />
                            <span>估算成本</span>
                        </div>
                        <div className="text-xl font-bold text-white">{formatCost(summary.totalCost)}</div>
                    </div>
                </div>

                {/* 节点列表 */}
                <div className="p-4 pt-0 max-h-[400px] overflow-y-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-slate-400 border-b border-white/10">
                                <th className="text-left py-2 px-2">节点</th>
                                <th className="text-left py-2 px-2">模型</th>
                                <th className="text-right py-2 px-2">输入</th>
                                <th className="text-right py-2 px-2">输出</th>
                                <th className="text-right py-2 px-2">总计</th>
                                <th className="text-right py-2 px-2">成本</th>
                            </tr>
                        </thead>
                        <tbody>
                            {nodeUsages.map((usage, index) => (
                                <tr key={index} className="text-sm border-b border-white/5 hover:bg-white/5">
                                    <td className="py-2 px-2">
                                        <div className="font-medium text-white">{usage.nodeName}</div>
                                        <div className="text-xs text-slate-500">{usage.nodeType}</div>
                                    </td>
                                    <td className="py-2 px-2 text-slate-300">
                                        {usage.model || 'unknown'}
                                    </td>
                                    <td className="py-2 px-2 text-right text-blue-400">
                                        {formatNumber(usage.promptTokens)}
                                    </td>
                                    <td className="py-2 px-2 text-right text-green-400">
                                        {formatNumber(usage.completionTokens)}
                                    </td>
                                    <td className="py-2 px-2 text-right text-purple-400">
                                        {formatNumber(usage.totalTokens)}
                                    </td>
                                    <td className="py-2 px-2 text-right text-yellow-400">
                                        {formatCost(calculateCost(usage))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {nodeUsages.length === 0 && (
                        <div className="text-center py-8 text-slate-500">
                            暂无 Token 使用数据
                        </div>
                    )}
                </div>

                {/* 底部说明 */}
                <div className="p-3 border-t border-white/10 text-xs text-slate-500 text-center">
                    💡 成本估算基于公开定价，实际费用以 API 账单为准
                </div>
            </div>
        </div>
    );
}

export default TokenUsagePanel;
