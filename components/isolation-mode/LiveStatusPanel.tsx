import React from 'react';
import { Hand, ThumbsUp, ThumbsDown, MinusCircle, SkipForward, Mic, Crown } from 'lucide-react';
import type { Agent, DiscussionEvent } from './types';

type DecisionState = 'thinking' | 'hands' | 'speaking' | 'idle';

interface LiveStatusPanelProps {
    agents: Agent[];
    events: DiscussionEvent[];
    currentRound: number;
    sessionStatus: 'pending' | 'active' | 'paused' | 'completed';
    currentSpeakerId?: string;
    decisionState?: DecisionState;
    countdown?: number;
    onSkipSpeaker?: () => void;
    onStanceAction?: (action: 'hand' | 'positive' | 'negative' | 'abstain') => void;
}

/** 头像组件 */
const Avatar: React.FC<{ name: string; tone?: string; size?: string }> = ({
    name,
    tone = 'bg-slate-700 text-white',
    size = 'w-9 h-9',
}) => (
    <div className={`${size} rounded-full flex items-center justify-center font-semibold text-xs ${tone}`}>
        {name.slice(0, 2)}
    </div>
);

/** 实时状态面板 - 按设计图重构 */
export const LiveStatusPanel: React.FC<LiveStatusPanelProps> = ({
    agents,
    events,
    currentRound,
    sessionStatus,
    currentSpeakerId,
    decisionState = 'idle',
    countdown = 0,
    onSkipSpeaker,
    onStanceAction,
}) => {
    // 计算当前发言者
    const currentSpeaker = agents.find(a => a.id === currentSpeakerId);

    // 计算举手Agent（思考中的Agent视为想要发言）
    const handRaiseAgents = agents.filter(a => a.status === 'thinking');

    // 计算得分（简单统计speakCount作为分数）
    const proAgents = agents.filter(a => a.stance === 'for');
    const conAgents = agents.filter(a => a.stance === 'against');
    const proScore = proAgents.reduce((sum, a) => sum + (a.speakCount || 0) * 10, 0);
    const conScore = conAgents.reduce((sum, a) => sum + (a.speakCount || 0) * 10, 0);

    // 个人得分排名
    const ranking = [...agents]
        .map(a => ({ ...a, score: (a.speakCount || 0) * 10 }))
        .sort((a, b) => b.score - a.score);

    // 本轮评分（从最近的评分事件中提取）
    const roundScores = agents.map(a => ({
        id: a.id,
        name: a.name,
        delta: Math.floor(Math.random() * 10) - 3, // 占位：实际应从评分系统获取
    }));

    const decisionStyles: Record<DecisionState, string> = {
        idle: 'bg-slate-800/50 border-white/10',
        thinking: 'bg-blue-500/10 border-blue-400/30',
        hands: 'bg-yellow-500/10 border-yellow-400/30',
        speaking: 'bg-emerald-500/10 border-emerald-400/30',
    };

    const isLive = sessionStatus === 'active';

    return (
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-4">
            {/* LIVE 指示器 */}
            <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 text-sm font-semibold ${
                    isLive ? 'text-emerald-400' : 'text-slate-400'
                }`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${
                        isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                    }`} />
                    {isLive ? 'LIVE' : sessionStatus === 'paused' ? '已暂停' : '等待中'}
                </div>
                <div className="text-xs text-slate-400">R{currentRound} 轮次</div>
            </div>

            {/* 主持人决策卡片 */}
            <div className={`rounded-xl border p-4 ${decisionStyles[decisionState]}`}>
                {decisionState === 'idle' && (
                    <div className="text-center text-slate-400 text-sm py-2">
                        等待讨论开始...
                    </div>
                )}
                {decisionState === 'thinking' && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Avatar name="主持" tone="bg-blue-400/20 text-blue-200" />
                            <div>
                                <div className="text-xs text-blue-300">主持人思考中</div>
                                <div className="text-white font-medium">正在分析...</div>
                            </div>
                        </div>
                        <div className="text-sm text-blue-200 font-semibold">{countdown}s</div>
                    </div>
                )}
                {decisionState === 'hands' && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Avatar name="举手" tone="bg-yellow-400/20 text-yellow-200" />
                            <div>
                                <div className="text-xs text-yellow-300">举手环节</div>
                                <div className="text-white font-medium">选手决定是否发言</div>
                            </div>
                        </div>
                        <div className="text-sm text-yellow-200 font-semibold">{countdown}s</div>
                    </div>
                )}
                {decisionState === 'speaking' && currentSpeaker && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Avatar name={currentSpeaker.name} tone="bg-emerald-400/20 text-emerald-200" />
                            <div>
                                <div className="text-xs text-emerald-300">发言中</div>
                                <div className="text-white font-medium">{currentSpeaker.name} 正在发...</div>
                            </div>
                        </div>
                        <div className="text-sm text-emerald-200 font-semibold">LIVE</div>
                    </div>
                )}
            </div>

            {/* 当前发言者 */}
            {currentSpeaker && (
                <div className="bg-slate-800/50 rounded-xl border border-white/10 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Mic size={14} className="text-emerald-400" />
                        当前发言者
                    </div>
                    <div className="flex items-center gap-2">
                        <Avatar name={currentSpeaker.name} size="w-7 h-7" tone="bg-emerald-400/20 text-emerald-200" />
                        <span className="text-white font-medium">{currentSpeaker.name}</span>
                    </div>
                </div>
            )}

            {/* 举手情况 */}
            <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        举手情况
                    </h3>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-white">{handRaiseAgents.length} 人</span>
                        {onSkipSpeaker && (
                            <button
                                onClick={onSkipSpeaker}
                                className="px-3 py-1.5 text-xs rounded-lg bg-slate-700/70 hover:bg-slate-600/70 text-slate-100 flex items-center gap-1.5"
                            >
                                <SkipForward size={12} />
                                跳过
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {handRaiseAgents.length > 0 ? (
                        handRaiseAgents.map(agent => (
                            <div
                                key={agent.id}
                                className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900/60 border border-white/10 rounded-lg text-sm"
                            >
                                <Avatar name={agent.name} size="w-6 h-6" />
                                <span className="text-slate-100">{agent.name}</span>
                            </div>
                        ))
                    ) : (
                        <div className="text-xs text-slate-500">暂无举手</div>
                    )}
                </div>
            </div>

            {/* 立场分布 */}
            <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4 space-y-3">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    立场分布
                </h3>
                <div className="grid grid-cols-4 gap-2">
                    <button
                        onClick={() => onStanceAction?.('hand')}
                        className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg bg-slate-900/60 border border-white/10 text-xs text-slate-100 hover:border-yellow-400/40"
                    >
                        <Hand size={16} className="text-yellow-300" />
                        举手
                    </button>
                    <button
                        onClick={() => onStanceAction?.('positive')}
                        className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg bg-slate-900/60 border border-white/10 text-xs text-slate-100 hover:border-emerald-400/40"
                    >
                        <ThumbsUp size={16} className="text-emerald-300" />
                        正面
                    </button>
                    <button
                        onClick={() => onStanceAction?.('negative')}
                        className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg bg-slate-900/60 border border-white/10 text-xs text-slate-100 hover:border-red-400/40"
                    >
                        <ThumbsDown size={16} className="text-red-300" />
                        反对
                    </button>
                    <button
                        onClick={() => onStanceAction?.('abstain')}
                        className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg bg-slate-900/60 border border-white/10 text-xs text-slate-100 hover:border-slate-400/40"
                    >
                        <MinusCircle size={16} className="text-slate-300" />
                        弃权
                    </button>
                </div>
            </div>

            {/* 得分榜 */}
            <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4 space-y-3">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    得分榜
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3 text-center">
                        <div className="text-xs text-emerald-200">正方</div>
                        <div className="text-3xl font-bold text-emerald-100">{proScore}</div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-400/30 rounded-xl p-3 text-center">
                        <div className="text-xs text-purple-200">反方</div>
                        <div className="text-3xl font-bold text-purple-100">{conScore}</div>
                    </div>
                </div>
            </div>

            {/* 个人得分 */}
            <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4 space-y-3">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    个人得分
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {ranking.map((agent, index) => (
                        <div
                            key={agent.id}
                            className="flex items-center justify-between bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2"
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-slate-700 text-slate-200 text-xs flex items-center justify-center">
                                    {index + 1}
                                </div>
                                <span className="text-white text-sm">{agent.name}</span>
                                {index === 0 && <Crown size={12} className="text-yellow-300" />}
                            </div>
                            <span className="text-slate-200 font-semibold text-sm">{agent.score}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 本轮评分 */}
            {events.length > 0 && (
                <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4 space-y-3">
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        本轮评分
                    </h3>
                    <div className="space-y-2">
                        {roundScores.slice(0, 5).map(score => (
                            <div key={score.id} className="flex items-center justify-between text-sm">
                                <span className="text-white">{score.name}</span>
                                <span
                                    className={`font-semibold ${
                                        score.delta >= 0 ? 'text-emerald-300' : 'text-red-300'
                                    }`}
                                >
                                    {score.delta >= 0 ? `+${score.delta}` : score.delta}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveStatusPanel;
