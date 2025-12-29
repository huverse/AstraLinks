/**
 * Agent 卡片组件
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Agent } from './types';

interface AgentCardProps {
    agent: Agent;
    isActive?: boolean;
}

const STATUS_COLORS = {
    idle: 'bg-slate-600',
    thinking: 'bg-yellow-500 animate-pulse',
    speaking: 'bg-green-500 animate-pulse',
};

const STATUS_LABELS: Record<Agent['status'], string> = {
    idle: '空闲',
    thinking: '思考中',
    speaking: '发言中',
};

const STATUS_TEXT_COLORS: Record<Agent['status'], string> = {
    idle: 'text-slate-400',
    thinking: 'text-yellow-400',
    speaking: 'text-green-400',
};

export const AgentCard: React.FC<AgentCardProps> = ({ agent, isActive }) => {
    return (
        <div className={`
            p-4 rounded-xl border transition-all
            ${isActive
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-white/10 bg-slate-800/50 hover:bg-slate-800'}
        `}>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                    {agent.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{agent.name}</div>
                    <div className="text-xs text-slate-400">{agent.role}</div>
                </div>
                <div className="flex items-center gap-1.5">
                    {agent.status === 'thinking' && (
                        <Loader2 size={12} className="animate-spin text-yellow-400" />
                    )}
                    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[agent.status]}`} />
                </div>
            </div>
            <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
                <span>发言 {agent.speakCount} 次</span>
                <span className={STATUS_TEXT_COLORS[agent.status]}>
                    {STATUS_LABELS[agent.status]}
                </span>
            </div>
        </div>
    );
};
