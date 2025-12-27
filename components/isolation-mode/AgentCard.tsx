/**
 * Agent 卡片组件
 */

import React from 'react';
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
                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status]}`} />
            </div>
            <div className="mt-3 text-xs text-slate-500">
                发言 {agent.speakCount} 次
            </div>
        </div>
    );
};
