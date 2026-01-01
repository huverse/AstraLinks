/**
 * Agent 配置面板
 *
 * 允许用户自定义 Agent 并为每个 Agent 选择不同的 LLM
 * 支持从 Galaxyous 配置中心选择，或直接输入自定义配置
 */

import React, { useState } from 'react';
import { Plus, Trash2, User, Cpu, ChevronDown, ChevronUp, Key, MessageSquare, Sparkles } from 'lucide-react';
import { Participant } from '../../types';
import { Agent, AgentLlmConfig, CustomLlmConfig } from './types';

// 预设人格配置
const PERSONALITY_PRESETS = [
    {
        id: 'rational',
        name: '理性分析',
        icon: '🧠',
        personality: '冷静、理性、注重逻辑和数据支撑',
        systemPrompt: '你是一位理性分析者。在讨论中保持冷静客观，用数据和逻辑支撑观点，避免情绪化表达。善于发现论证中的逻辑漏洞。'
    },
    {
        id: 'passionate',
        name: '激情辩手',
        icon: '🔥',
        personality: '热情、有感染力、善于调动情绪',
        systemPrompt: '你是一位充满激情的辩手。表达观点时富有感染力，善于用生动的例子和修辞打动听众，但不失理性。'
    },
    {
        id: 'devil',
        name: '魔鬼代言',
        icon: '😈',
        personality: '犀利、善于质疑、喜欢唱反调',
        systemPrompt: '你扮演魔鬼代言人角色。对任何观点都保持怀疑态度，善于找出论证的薄弱环节，提出尖锐的反问。'
    },
    {
        id: 'mediator',
        name: '和事佬',
        icon: '🕊️',
        personality: '温和、善于调解、寻求共识',
        systemPrompt: '你是一位善于调解的和事佬。在激烈讨论中寻找各方共同点，用温和的方式化解分歧，推动达成共识。'
    },
    {
        id: 'scholar',
        name: '学术派',
        icon: '📚',
        personality: '严谨、引经据典、注重学术规范',
        systemPrompt: '你是一位学术型讨论者。发言严谨规范，善于引用权威资料和研究成果，用学术化的语言表达观点。'
    },
    {
        id: 'storyteller',
        name: '故事王',
        icon: '📖',
        personality: '善于讲故事、用案例说明问题',
        systemPrompt: '你是一位善于讲故事的人。用生动的案例、故事和比喻来阐述观点，让抽象的道理变得易懂有趣。'
    },
    {
        id: 'pragmatic',
        name: '实用主义',
        icon: '⚙️',
        personality: '务实、关注可行性和实际效果',
        systemPrompt: '你是一位实用主义者。关注方案的可行性和实际效果，善于从执行层面分析问题，提出切实可行的建议。'
    },
    {
        id: 'innovator',
        name: '创新者',
        icon: '💡',
        personality: '创新思维、打破常规、提出新颖观点',
        systemPrompt: '你是一位创新思考者。善于跳出传统框架，从全新角度看问题，提出独特新颖的见解和解决方案。'
    },
];

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

                                {/* 预设人格选择 */}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-2 flex items-center gap-1">
                                        <Sparkles size={12} />
                                        预设人格 (点击快速应用)
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {PERSONALITY_PRESETS.map(preset => {
                                            const isActive = agent.personality === preset.personality;
                                            return (
                                                <button
                                                    key={preset.id}
                                                    type="button"
                                                    onClick={() => handleUpdateAgent(agent.id, {
                                                        personality: preset.personality,
                                                        systemPrompt: preset.systemPrompt
                                                    })}
                                                    className={`
                                                        p-2 rounded-lg text-center transition-all
                                                        ${isActive
                                                            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
                                                            : 'bg-slate-700/50 border border-white/10 hover:border-purple-500/50 text-slate-300'
                                                        }
                                                    `}
                                                >
                                                    <div className="text-lg mb-1">{preset.icon}</div>
                                                    <div className="text-xs truncate">{preset.name}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
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
                                    <label className="block text-xs text-slate-400 mb-1">人格描述</label>
                                    <input
                                        type="text"
                                        value={agent.personality || ''}
                                        onChange={(e) => handleUpdateAgent(agent.id, { personality: e.target.value })}
                                        placeholder="例如: 犀利、幽默、严谨..."
                                        className="w-full px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded text-sm text-white"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">选择预设会自动填充，也可手动修改</p>
                                </div>

                                {/* 发言长度限制 */}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                                        <MessageSquare size={12} />
                                        发言长度限制 (tokens)
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="256"
                                            max="4096"
                                            step="128"
                                            value={agent.maxTokens || 1024}
                                            onChange={(e) => handleUpdateAgent(agent.id, { maxTokens: parseInt(e.target.value) })}
                                            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <input
                                            type="number"
                                            min="256"
                                            max="4096"
                                            step="128"
                                            value={agent.maxTokens || 1024}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val) && val >= 256 && val <= 4096) {
                                                    handleUpdateAgent(agent.id, { maxTokens: val });
                                                }
                                            }}
                                            className="w-20 px-2 py-1 bg-slate-700/50 border border-white/10 rounded text-xs text-white text-center"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        限制 AI 每次发言的最大长度，默认 1024 tokens (约 500-700 字)
                                    </p>
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
