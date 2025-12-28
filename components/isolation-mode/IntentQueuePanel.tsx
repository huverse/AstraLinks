/**
 * 意图队列面板
 *
 * 显示待处理的举手/插话请求
 */

import React from 'react';
import { Hand, Zap, Clock, Check, X, AlertCircle } from 'lucide-react';
import { SpeakIntent, IntentUrgency, Agent } from './types';

interface IntentQueuePanelProps {
    intents: SpeakIntent[];
    agents: Agent[];
    onApprove?: (intentId: string) => void;
    onReject?: (intentId: string) => void;
    onRefresh?: () => void;
    isLoading?: boolean;
}

const URGENCY_CONFIG: Record<IntentUrgency, { label: string; color: string; icon: React.ReactNode }> = {
    low: { label: '举手', color: 'text-slate-400 bg-slate-700/50', icon: <Hand size={12} /> },
    medium: { label: '请求', color: 'text-blue-400 bg-blue-500/20', icon: <Hand size={12} /> },
    high: { label: '紧急', color: 'text-yellow-400 bg-yellow-500/20', icon: <AlertCircle size={12} /> },
    critical: { label: '重要', color: 'text-orange-400 bg-orange-500/20', icon: <AlertCircle size={12} /> },
    interrupt: { label: '插话', color: 'text-purple-400 bg-purple-500/20', icon: <Zap size={12} /> },
};

export const IntentQueuePanel: React.FC<IntentQueuePanelProps> = ({
    intents,
    agents,
    onApprove,
    onReject,
    onRefresh,
    isLoading = false
}) => {
    const getAgentName = (agentId: string) => {
        return agents.find(a => a.id === agentId)?.name || agentId;
    };

    const pendingIntents = intents.filter(i => i.status === 'pending');

    return (
        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Hand size={12} />
                    发言请求
                    {pendingIntents.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded text-[10px]">
                            {pendingIntents.length}
                        </span>
                    )}
                </h4>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        disabled={isLoading}
                        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white disabled:opacity-50"
                        title="刷新"
                    >
                        <Clock size={12} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                )}
            </div>

            {pendingIntents.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-2">
                    暂无发言请求
                </div>
            ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {pendingIntents.map((intent, index) => {
                        const config = URGENCY_CONFIG[intent.urgency];
                        return (
                            <div
                                key={intent.id}
                                className="flex items-center justify-between p-2 bg-slate-900/40 rounded-lg"
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-xs text-slate-500">#{index + 1}</span>
                                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${config.color}`}>
                                        {config.icon}
                                        {config.label}
                                    </span>
                                    <span className="text-xs text-white truncate">
                                        {getAgentName(intent.agentId)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    {onApprove && (
                                        <button
                                            onClick={() => onApprove(intent.id)}
                                            className="p-1 hover:bg-green-500/20 rounded text-slate-400 hover:text-green-400"
                                            title="批准"
                                        >
                                            <Check size={12} />
                                        </button>
                                    )}
                                    {onReject && (
                                        <button
                                            onClick={() => onReject(intent.id)}
                                            className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                                            title="拒绝"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
