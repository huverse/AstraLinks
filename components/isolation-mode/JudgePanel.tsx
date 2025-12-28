/**
 * 评委系统面板
 *
 * 显示5维度评分、排名和评语
 */

import React from 'react';
import { Trophy, Star, Award, TrendingUp, MessageSquare } from 'lucide-react';
import { ScoringResult, Agent } from './types';

interface JudgePanelProps {
    scoringResult: ScoringResult | null;
    agents: Agent[];
    isLoading?: boolean;
    onTriggerScore?: () => void;
    disabled?: boolean;
}

export const JudgePanel: React.FC<JudgePanelProps> = ({
    scoringResult,
    agents,
    isLoading = false,
    onTriggerScore,
    disabled = false
}) => {
    const getAgentName = (agentId: string) => {
        return agents.find(a => a.id === agentId)?.name || agentId;
    };

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy size={16} className="text-yellow-400" />;
        if (rank === 2) return <Award size={16} className="text-slate-300" />;
        if (rank === 3) return <Award size={16} className="text-amber-600" />;
        return <span className="text-xs text-slate-500">#{rank}</span>;
    };

    const getScoreColor = (score: number, maxScore: number = 10) => {
        const ratio = score / maxScore;
        if (ratio >= 0.8) return 'text-green-400';
        if (ratio >= 0.6) return 'text-yellow-400';
        if (ratio >= 0.4) return 'text-orange-400';
        return 'text-red-400';
    };

    if (!scoringResult && !isLoading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Star size={12} />
                        评委评分
                    </h4>
                </div>
                <button
                    onClick={onTriggerScore}
                    disabled={disabled || isLoading}
                    className="w-full py-2 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                    <Trophy size={14} />
                    触发评分
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">
                    讨论结束后可触发评分
                </p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent" />
                    <span className="ml-2 text-sm text-slate-400">评分中...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Star size={12} />
                    评委评分
                </h4>
                <span className="text-xs text-slate-500">
                    {new Date(scoringResult!.generatedAt).toLocaleTimeString()}
                </span>
            </div>

            {/* 排名 */}
            <div className="space-y-2">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <TrendingUp size={12} />
                    排名
                </div>
                {scoringResult!.ranking.map(item => (
                    <div
                        key={item.agentId}
                        className={`flex items-center justify-between p-2 rounded-lg ${
                            item.rank === 1 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-slate-900/40'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            {getRankIcon(item.rank)}
                            <span className="text-sm text-white">{getAgentName(item.agentId)}</span>
                        </div>
                        <span className={`text-sm font-medium ${getScoreColor(item.score)}`}>
                            {item.score.toFixed(1)}
                        </span>
                    </div>
                ))}
            </div>

            {/* 维度评分详情 (折叠) */}
            <details className="group">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform">▶</span>
                    维度详情
                </summary>
                <div className="mt-2 space-y-3">
                    {scoringResult!.ranking.map(item => {
                        const agentScores = scoringResult!.judgeScores.filter(s => s.agentId === item.agentId);
                        const avgScores: Record<string, number> = {};

                        scoringResult!.dimensions.forEach(dim => {
                            const scores = agentScores.map(s => s.dimensionScores[dim.id] || 0);
                            avgScores[dim.id] = scores.length > 0
                                ? scores.reduce((a, b) => a + b, 0) / scores.length
                                : 0;
                        });

                        return (
                            <div key={item.agentId} className="bg-slate-900/40 rounded-lg p-2">
                                <div className="text-xs text-white mb-2">{getAgentName(item.agentId)}</div>
                                <div className="grid grid-cols-5 gap-1">
                                    {scoringResult!.dimensions.map(dim => (
                                        <div key={dim.id} className="text-center">
                                            <div className="text-[10px] text-slate-500 truncate" title={dim.name}>
                                                {dim.name.slice(0, 2)}
                                            </div>
                                            <div className={`text-xs font-medium ${getScoreColor(avgScores[dim.id], dim.maxScore)}`}>
                                                {avgScores[dim.id].toFixed(1)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </details>

            {/* 总评 */}
            {scoringResult!.finalComment && (
                <div className="bg-slate-900/40 rounded-lg p-3">
                    <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                        <MessageSquare size={12} />
                        总评
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">
                        {scoringResult!.finalComment}
                    </p>
                </div>
            )}
        </div>
    );
};
