/**
 * 观点追踪组件
 *
 * 可视化各Agent立场演变
 */

import React, { useMemo } from 'react';
import { TrendingUp, Circle } from 'lucide-react';
import { Agent, DiscussionEvent, StanceRecord } from './types';

interface StanceTrackerProps {
    agents: Agent[];
    events: DiscussionEvent[];
    currentRound: number;
}

const STANCE_COLORS = {
    for: '#22c55e',      // green
    against: '#ef4444',  // red
    neutral: '#6b7280',  // gray
};

const STANCE_LABELS = {
    for: '正方',
    against: '反方',
    neutral: '中立',
};

export const StanceTracker: React.FC<StanceTrackerProps> = ({
    agents,
    events,
    currentRound
}) => {
    // 从事件中提取立场变化
    const stanceHistory = useMemo(() => {
        const history: StanceRecord[] = [];
        let currentRoundNum = 0;

        // 初始化每个Agent的初始立场
        agents.forEach(agent => {
            history.push({
                agentId: agent.id,
                round: 0,
                stance: agent.stance || 'neutral',
                confidence: 1,
                timestamp: 0,
            });
        });

        // 遍历事件寻找立场变化
        events.forEach(event => {
            if (event.type === 'round:start') {
                currentRoundNum = (event.payload?.round as number) || currentRoundNum + 1;
            }

            // 检查发言中的立场标记
            if (event.type === 'agent:speak' || event.type === 'SPEECH') {
                const agentId = event.payload?.speaker as string || event.sourceId;
                const stanceChange = event.payload?.stanceChange as string;

                if (stanceChange && ['for', 'against', 'neutral'].includes(stanceChange)) {
                    history.push({
                        agentId,
                        round: currentRoundNum,
                        stance: stanceChange as 'for' | 'against' | 'neutral',
                        confidence: (event.payload?.stanceConfidence as number) || 0.8,
                        timestamp: event.timestamp,
                    });
                }
            }
        });

        return history;
    }, [agents, events]);

    // 获取每个Agent当前立场
    const getCurrentStance = (agentId: string): StanceRecord | undefined => {
        const agentRecords = stanceHistory.filter(r => r.agentId === agentId);
        return agentRecords[agentRecords.length - 1];
    };

    // 计算某个Agent在某轮的立场位置 (用于可视化)
    const getStancePosition = (stance: 'for' | 'against' | 'neutral'): number => {
        if (stance === 'for') return 0;
        if (stance === 'neutral') return 50;
        return 100;
    };

    const maxRound = Math.max(currentRound, 1);

    return (
        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp size={12} />
                    观点追踪
                </h4>
                <div className="flex items-center gap-2 text-[10px]">
                    <span className="flex items-center gap-1">
                        <Circle size={8} fill={STANCE_COLORS.for} stroke="none" />
                        正方
                    </span>
                    <span className="flex items-center gap-1">
                        <Circle size={8} fill={STANCE_COLORS.neutral} stroke="none" />
                        中立
                    </span>
                    <span className="flex items-center gap-1">
                        <Circle size={8} fill={STANCE_COLORS.against} stroke="none" />
                        反方
                    </span>
                </div>
            </div>

            {/* 立场图 */}
            <div className="space-y-2">
                {agents.map(agent => {
                    const currentStance = getCurrentStance(agent.id);
                    const agentRecords = stanceHistory
                        .filter(r => r.agentId === agent.id)
                        .sort((a, b) => a.round - b.round);

                    return (
                        <div key={agent.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 truncate">{agent.name}</span>
                                <span
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{
                                        backgroundColor: `${STANCE_COLORS[currentStance?.stance || 'neutral']}20`,
                                        color: STANCE_COLORS[currentStance?.stance || 'neutral']
                                    }}
                                >
                                    {STANCE_LABELS[currentStance?.stance || 'neutral']}
                                </span>
                            </div>

                            {/* 立场演变条 */}
                            <div className="relative h-6 bg-slate-900/60 rounded overflow-hidden">
                                {/* 背景分区 */}
                                <div className="absolute inset-0 flex">
                                    <div className="flex-1 border-r border-white/5" style={{ backgroundColor: `${STANCE_COLORS.for}10` }} />
                                    <div className="flex-1 border-r border-white/5" style={{ backgroundColor: `${STANCE_COLORS.neutral}10` }} />
                                    <div className="flex-1" style={{ backgroundColor: `${STANCE_COLORS.against}10` }} />
                                </div>

                                {/* 立场点 */}
                                {agentRecords.map((record, idx) => {
                                    const x = maxRound > 0 ? (record.round / maxRound) * 90 + 5 : 50;
                                    const y = getStancePosition(record.stance);

                                    return (
                                        <div
                                            key={idx}
                                            className="absolute w-2 h-2 rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                                            style={{
                                                left: `${x}%`,
                                                top: '50%',
                                                backgroundColor: STANCE_COLORS[record.stance],
                                                opacity: 0.5 + record.confidence * 0.5,
                                            }}
                                            title={`第${record.round}轮: ${STANCE_LABELS[record.stance]}`}
                                        />
                                    );
                                })}

                                {/* 连线 (简化版) */}
                                {agentRecords.length > 1 && (
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                                        {agentRecords.slice(1).map((record, idx) => {
                                            const prev = agentRecords[idx];
                                            const x1 = maxRound > 0 ? (prev.round / maxRound) * 90 + 5 : 50;
                                            const x2 = maxRound > 0 ? (record.round / maxRound) * 90 + 5 : 50;

                                            return (
                                                <line
                                                    key={idx}
                                                    x1={`${x1}%`}
                                                    y1="50%"
                                                    x2={`${x2}%`}
                                                    y2="50%"
                                                    stroke={STANCE_COLORS[record.stance]}
                                                    strokeWidth="1"
                                                    strokeOpacity="0.3"
                                                />
                                            );
                                        })}
                                    </svg>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 轮次标记 */}
            <div className="flex justify-between text-[10px] text-slate-600 px-1">
                <span>第0轮</span>
                <span>第{maxRound}轮</span>
            </div>
        </div>
    );
};
