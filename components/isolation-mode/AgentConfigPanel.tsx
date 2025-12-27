/**
 * Agent 配置面板
 *
 * 允许用户自定义 Agent 并为每个 Agent 选择不同的 LLM
 */

import React, { useState } from 'react';
import { Plus, Trash2, Settings, User, Cpu, ChevronDown, ChevronUp } from 'lucide-react';
import { Participant } from '../../types';
import { Agent, AgentLlmConfig } from './types';

interface AgentConfigPanelProps {
    agents: Agent[];
    onAgentsChange: (agents: Agent[]) => void;
    participants: Participant[];
    scenarioType?: string;
}

const ROLE_OPTIONS = [
    { value: 'debater', label: '辩论者' },
    { value: 'critic', label: '批评者' },
    { value: 'supporter', label: '支持者' },
    { value: 'analyst', label: '分析师' },
    { value: 'mediator', label: '调解者' },
    { value: 'custom', label: '自定义' },
];

const STANCE_OPTIONS = [
    { value: 'for', label: '正方' },
    { value: 'against', label: '反方' },
    { value: 'neutral', label: '中立' },
];

export const AgentConfigPanel: React.FC<AgentConfigPanelProps> = ({
    agents,
    onAgentsChange,
    participants,
    scenarioType,
}) => {
    const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

    const enabledParticipants = participants.filter(p => p.config.enabled && p.config.apiKey);

    const handleAddAgent = () => {
        const newAgent: Agent = {
            id: `agent-${Date.now()}`,
            name: `Agent ${agents.length + 1}`,
            role: 'debater',
            status: 'idle',
            speakCount: 0,
            systemPrompt: '',
            stance: agents.length % 2 === 0 ? 'for' : 'against',
            agentLlmConfig: { useSessionConfig: true, configSource: 'session' },
        };
        onAgentsChange([...agents, newAgent]);
    };

    const handleRemoveAgent = (id: string) => {
        if (agents.length <= 2) return;
        onAgentsChange(agents.filter(a => a.id !== id));
    };

    const handleUpdateAgent = (id: string, updates: Partial<Agent>) => {
        onAgentsChange(agents.map(a => a.id === id ? { ...a, ...updates } : a));
    };

    const handleLlmConfigChange = (agentId: string, participantId: string | 'session') => {
        const config: AgentLlmConfig = participantId === 'session'
            ? { useSessionConfig: true, configSource: 'session' }
            : { useSessionConfig: false, galaxyousConfigId: participantId, configSource: 'galaxyous' };
        handleUpdateAgent(agentId, { agentLlmConfig: config });
    };

    const getParticipantName = (config?: AgentLlmConfig) => {
        if (!config || config.useSessionConfig) return '使用默认配置';
        const p = participants.find(p => p.id === config.galaxyousConfigId);
        return p ? `${p.name} (${p.config.modelName})` : '使用默认配置';
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <User size={16} />
                    Agent 配置
                </h3>
                <button
                    onClick={handleAddAgent}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors"
                >
                    <Plus size={14} />
                    添加 Agent
                </button>
            </div>

            <div className="space-y-2">
                {agents.map((agent, index) => (
                    <div
                        key={agent.id}
                        className="bg-slate-800/50 rounded-lg border border-white/5 overflow-hidden"
                    >
                        {/* Agent 头部 */}
                        <div
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5"
                            onClick={() => setExpandedAgentId(expandedAgentId === agent.id ? null : agent.id)}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                    agent.stance === 'for' ? 'bg-green-500/20 text-green-400' :
                                    agent.stance === 'against' ? 'bg-red-500/20 text-red-400' :
                                    'bg-slate-500/20 text-slate-400'
                                }`}>
                                    {index + 1}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-white">{agent.name}</div>
                                    <div className="text-xs text-slate-400 flex items-center gap-2">
                                        <span>{ROLE_OPTIONS.find(r => r.value === agent.role)?.label}</span>
                                        <span className="text-slate-600">|</span>
                                        <span className="flex items-center gap-1">
                                            <Cpu size={10} />
                                            {getParticipantName(agent.agentLlmConfig)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {agents.length > 2 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRemoveAgent(agent.id); }}
                                        className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                                {expandedAgentId === agent.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                        </div>

                        {/* Agent 详细配置 */}
                        {expandedAgentId === agent.id && (
                            <div className="p-3 pt-0 space-y-3 border-t border-white/5">
                                {/* 名称 */}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">名称</label>
                                    <input
                                        type="text"
                                        value={agent.name}
                                        onChange={(e) => handleUpdateAgent(agent.id, { name: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded text-sm text-white"
                                    />
                                </div>

                                {/* 角色和立场 */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">角色</label>
                                        <select
                                            value={agent.role}
                                            onChange={(e) => handleUpdateAgent(agent.id, { role: e.target.value })}
                                            className="w-full px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded text-sm text-white"
                                        >
                                            {ROLE_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {scenarioType === 'debate' && (
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">立场</label>
                                            <select
                                                value={agent.stance || 'neutral'}
                                                onChange={(e) => handleUpdateAgent(agent.id, { stance: e.target.value as Agent['stance'] })}
                                                className="w-full px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded text-sm text-white"
                                            >
                                                {STANCE_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* LLM 配置选择 */}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                                        <Cpu size={12} />
                                        LLM 模型 (从 Galaxyous 配置中心选择)
                                    </label>
                                    <select
                                        value={agent.agentLlmConfig?.useSessionConfig !== false ? 'session' : agent.agentLlmConfig?.galaxyousConfigId || 'session'}
                                        onChange={(e) => handleLlmConfigChange(agent.id, e.target.value)}
                                        className="w-full px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded text-sm text-white"
                                    >
                                        <option value="session">使用默认配置</option>
                                        {enabledParticipants.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} ({p.config.modelName})
                                            </option>
                                        ))}
                                    </select>
                                    {enabledParticipants.length === 0 && (
                                        <p className="text-xs text-yellow-400 mt-1">
                                            请先在 Galaxyous 配置中心添加并启用 LLM 配置
                                        </p>
                                    )}
                                </div>

                                {/* 系统提示词 */}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">系统提示词</label>
                                    <textarea
                                        value={agent.systemPrompt || ''}
                                        onChange={(e) => handleUpdateAgent(agent.id, { systemPrompt: e.target.value })}
                                        placeholder="定义 Agent 的角色、性格、说话风格..."
                                        rows={3}
                                        className="w-full px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded text-sm text-white resize-none"
                                    />
                                </div>

                                {/* 人格描述 */}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">人格描述 (可选)</label>
                                    <input
                                        type="text"
                                        value={agent.personality || ''}
                                        onChange={(e) => handleUpdateAgent(agent.id, { personality: e.target.value })}
                                        placeholder="例如: 犀利、幽默、严谨..."
                                        className="w-full px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded text-sm text-white"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {agents.length < 2 && (
                <p className="text-xs text-yellow-400">至少需要 2 个 Agent 才能开始讨论</p>
            )}
        </div>
    );
};

export default AgentConfigPanel;
