/**
 * Agent 配置面板
 *
 * 允许用户自定义 Agent 并为每个 Agent 选择不同的 LLM
 * 支持从 Galaxyous 配置中心选择，或直接输入自定义配置
 */

import React, { useState } from 'react';
import { Plus, Trash2, User, Cpu, ChevronDown, ChevronUp, Key } from 'lucide-react';
import { Participant } from '../../types';
import { Agent, AgentLlmConfig, CustomLlmConfig } from './types';

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

    const handleLlmConfigChange = (agentId: string, value: string) => {
        let config: AgentLlmConfig;
        if (value === 'session') {
            config = { useSessionConfig: true, configSource: 'session' };
        } else if (value === 'custom') {
            config = {
                useSessionConfig: false,
                configSource: 'custom',
                customConfig: { provider: 'openai', apiKey: '', baseUrl: '', modelName: '' }
            };
        } else {
            config = { useSessionConfig: false, galaxyousConfigId: value, configSource: 'galaxyous' };
        }
        handleUpdateAgent(agentId, { agentLlmConfig: config });
    };

    const handleCustomConfigChange = (agentId: string, field: keyof CustomLlmConfig, value: string | number | undefined) => {
        const agent = agents.find(a => a.id === agentId);
        if (!agent?.agentLlmConfig?.customConfig) return;
        const updatedCustomConfig = { ...agent.agentLlmConfig.customConfig, [field]: value };
        handleUpdateAgent(agentId, {
            agentLlmConfig: { ...agent.agentLlmConfig, customConfig: updatedCustomConfig }
        });
    };

    const getParticipantName = (config?: AgentLlmConfig) => {
        if (!config || config.useSessionConfig) return '使用默认配置';
        if (config.configSource === 'custom' && config.customConfig) {
            const { provider, modelName } = config.customConfig;
            return modelName ? `自定义 (${provider}/${modelName})` : '自定义配置';
        }
        const p = participants.find(p => p.id === config.galaxyousConfigId);
        return p ? `${p.name} (${p.config.modelName})` : '使用默认配置';
    };

    const getLlmSelectValue = (config?: AgentLlmConfig) => {
        if (!config || config.useSessionConfig) return 'session';
        if (config.configSource === 'custom') return 'custom';
        return config.galaxyousConfigId || 'session';
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
                                        LLM 模型
                                    </label>
                                    <select
                                        value={getLlmSelectValue(agent.agentLlmConfig)}
                                        onChange={(e) => handleLlmConfigChange(agent.id, e.target.value)}
                                        className="w-full px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded text-sm text-white"
                                    >
                                        <option value="session">使用默认配置</option>
                                        <option value="custom">✨ 自定义配置</option>
                                        {enabledParticipants.length > 0 && (
                                            <optgroup label="Galaxyous 配置中心">
                                                {enabledParticipants.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} ({p.config.modelName})
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>

                                {/* 自定义 LLM 配置输入 */}
                                {agent.agentLlmConfig?.configSource === 'custom' && (
                                    <div className="space-y-2 p-3 bg-slate-900/50 rounded-lg border border-purple-500/20">
                                        <div className="flex items-center gap-1 text-xs text-purple-300 mb-2">
                                            <Key size={12} />
                                            自定义 LLM 配置
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Provider</label>
                                                <input
                                                    type="text"
                                                    value={agent.agentLlmConfig.customConfig?.provider || ''}
                                                    onChange={(e) => handleCustomConfigChange(agent.id, 'provider', e.target.value)}
                                                    placeholder="openai / claude / deepseek"
                                                    className="w-full px-2 py-1 bg-slate-800 border border-white/10 rounded text-xs text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Model Name</label>
                                                <input
                                                    type="text"
                                                    value={agent.agentLlmConfig.customConfig?.modelName || ''}
                                                    onChange={(e) => handleCustomConfigChange(agent.id, 'modelName', e.target.value)}
                                                    placeholder="gpt-4o / claude-3-opus"
                                                    className="w-full px-2 py-1 bg-slate-800 border border-white/10 rounded text-xs text-white"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Base URL</label>
                                            <input
                                                type="text"
                                                value={agent.agentLlmConfig.customConfig?.baseUrl || ''}
                                                onChange={(e) => handleCustomConfigChange(agent.id, 'baseUrl', e.target.value)}
                                                placeholder="https://api.openai.com/v1"
                                                className="w-full px-2 py-1 bg-slate-800 border border-white/10 rounded text-xs text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">API Key</label>
                                            <input
                                                type="password"
                                                value={agent.agentLlmConfig.customConfig?.apiKey || ''}
                                                onChange={(e) => handleCustomConfigChange(agent.id, 'apiKey', e.target.value)}
                                                placeholder="sk-..."
                                                className="w-full px-2 py-1 bg-slate-800 border border-white/10 rounded text-xs text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Temperature (可选)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="2"
                                                step="0.1"
                                                value={agent.agentLlmConfig.customConfig?.temperature ?? ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleCustomConfigChange(agent.id, 'temperature', val === '' ? undefined : parseFloat(val));
                                                }}
                                                placeholder="0.7"
                                                className="w-full px-2 py-1 bg-slate-800 border border-white/10 rounded text-xs text-white"
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">
                                            支持任何 OpenAI 兼容 API (Claude, DeepSeek, Ollama, vLLM 等)
                                        </p>
                                        {agent.agentLlmConfig.customConfig && (
                                            (!agent.agentLlmConfig.customConfig.modelName || !agent.agentLlmConfig.customConfig.apiKey) && (
                                                <p className="text-xs text-yellow-400 mt-1">
                                                    ⚠️ 请填写 Model Name 和 API Key (本地模型可填任意值)
                                                </p>
                                            )
                                        )}
                                    </div>
                                )}

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
