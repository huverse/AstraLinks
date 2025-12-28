/**
 * 实时统计面板
 *
 * 显示发言次数、时长、轮次等统计
 */

import React, { useMemo } from 'react';
import { BarChart3, Clock, MessageSquare, Users } from 'lucide-react';
import { Agent, DiscussionEvent, SessionStats } from './types';

interface StatsPanelProps {
    agents: Agent[];
    events: DiscussionEvent[];
    currentRound: number;
    startTime?: number;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
    agents,
    events,
    currentRound,
    startTime
}) => {
    const stats = useMemo<SessionStats>(() => {
        const agentStats: Record<string, { speechCount: number; totalDuration: number; lastSpeakTime?: number }> = {};

        // 初始化
        agents.forEach(a => {
            agentStats[a.id] = { speechCount: 0, totalDuration: 0 };
        });

        // 统计发言
        let lastSpeakStart: Record<string, number> = {};

        events.forEach(event => {
            const agentId = event.payload?.speaker as string || event.payload?.agentId as string || event.sourceId;

            if (event.type === 'agent:speaking' || event.type === 'agent:speak') {
                if (agentStats[agentId]) {
                    agentStats[agentId].speechCount++;
                    agentStats[agentId].lastSpeakTime = event.timestamp;
                    lastSpeakStart[agentId] = event.timestamp;
                }
            }

            if ((event.type === 'agent:done' || event.type === 'turn:end') && lastSpeakStart[agentId]) {
                const duration = event.timestamp - lastSpeakStart[agentId];
                if (agentStats[agentId]) {
                    agentStats[agentId].totalDuration += duration;
                }
                delete lastSpeakStart[agentId];
            }
        });

        const totalSpeechCount = Object.values(agentStats).reduce((sum, s) => sum + s.speechCount, 0);
        const totalDuration = startTime ? Date.now() - startTime : 0;

        return {
            totalSpeechCount,
            totalDuration,
            roundCount: currentRound,
            agentStats: Object.fromEntries(
                Object.entries(agentStats).map(([id, s]) => [
                    id,
                    {
                        ...s,
                        avgDuration: s.speechCount > 0 ? s.totalDuration / s.speechCount : 0
                    }
                ])
            )
        };
    }, [agents, events, currentRound, startTime]);

    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes > 0) {
            return `${minutes}分${seconds % 60}秒`;
        }
        return `${seconds}秒`;
    };

    const maxSpeechCount = Math.max(...Object.values(stats.agentStats).map(s => s.speechCount), 1);

    return (
        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 size={12} />
                    实时统计
                </h4>
            </div>

            {/* 总览 */}
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-900/40 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-white">{stats.roundCount}</div>
                    <div className="text-[10px] text-slate-500">轮次</div>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-white">{stats.totalSpeechCount}</div>
                    <div className="text-[10px] text-slate-500">发言</div>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-white">
                        {Math.floor(stats.totalDuration / 60000)}
                    </div>
                    <div className="text-[10px] text-slate-500">分钟</div>
                </div>
            </div>

            {/* Agent 发言统计 */}
            <div className="space-y-2">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Users size={12} />
                    发言分布
                </div>
                {agents.map(agent => {
                    const agentStat = stats.agentStats[agent.id];
                    const barWidth = (agentStat?.speechCount || 0) / maxSpeechCount * 100;

                    return (
                        <div key={agent.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 truncate">{agent.name}</span>
                                <span className="text-slate-500">
                                    {agentStat?.speechCount || 0}次
                                </span>
                            </div>
                            <div className="h-1.5 bg-slate-900/60 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-purple-500 rounded-full transition-all duration-300"
                                    style={{ width: `${barWidth}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
