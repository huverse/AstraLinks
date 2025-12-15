/**
 * 多 Agent 协作面板
 * 
 * @module components/workspace/AgentPanel
 * @description 多 Agent 任务创建和执行
 */

import React, { useState, useEffect } from 'react';
import {
    Users, Play, Plus, Trash2, Settings,
    Loader2, CheckCircle, AlertCircle, X, Bot, ArrowRight
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface Agent {
    id: string;
    name: string;
    role: string;
    systemPrompt: string;
    model?: string;
}

interface AgentResult {
    agentId: string;
    status: 'completed' | 'failed';
    output: string;
    error?: string;
    tokensUsed: number;
    duration: number;
}

// 预设 Agent 模板 (12个专业角色)
const PRESET_AGENTS: (Omit<Agent, 'id'> & { icon: string; category: string })[] = [
    // 内容创作类
    {
        name: '研究员', role: 'researcher', icon: '🔍', category: '内容创作',
        systemPrompt: `你是一名专业的研究员。请深入分析主题，整理关键信息，以结构化方式呈现研究结果。`
    },
    {
        name: '写手', role: 'writer', icon: '✍️', category: '内容创作',
        systemPrompt: `你是一名专业的写手。请将资料转化为流畅、有吸引力的文章，确保逻辑清晰。`
    },
    {
        name: '审核编辑', role: 'reviewer', icon: '📝', category: '内容创作',
        systemPrompt: `你是一名审核编辑。请检查内容的准确性、完整性，提供改进建议和评分。`
    },
    {
        name: '摘要大师', role: 'summarizer', icon: '📋', category: '内容创作',
        systemPrompt: `你是一名摘要专家。请提取核心信息，生成一句话摘要、三点核心和详细摘要。`
    },
    // 技术类
    {
        name: '数据分析师', role: 'analyst', icon: '📊', category: '技术开发',
        systemPrompt: `你是一名数据分析师。请分析数据，发现模式和异常，提供数据驱动的决策建议。`
    },
    {
        name: '程序员', role: 'coder', icon: '💻', category: '技术开发',
        systemPrompt: `你是一名全栈程序员。请编写高质量代码，遵循最佳实践，提供完整示例。`
    },
    {
        name: '翻译官', role: 'translator', icon: '🌐', category: '技术开发',
        systemPrompt: `你是一名多语言翻译官。请准确翻译内容，保留原意和风格，处理文化差异。`
    },
    // 商业类
    {
        name: '项目规划师', role: 'planner', icon: '📅', category: '商业运营',
        systemPrompt: `你是一名项目规划师。请分解任务，制定时间线和里程碑，识别风险。`
    },
    {
        name: '客服专家', role: 'customer_service', icon: '💬', category: '商业运营',
        systemPrompt: `你是一名客服专家。请友好专业地回应询问，提供清晰的解决方案。`
    },
    {
        name: 'SEO专家', role: 'seo_expert', icon: '🎯', category: '商业运营',
        systemPrompt: `你是一名SEO专家。请分析内容的SEO潜力，建议关键词，优化标题和结构。`
    },
    // 创意类
    {
        name: '创意总监', role: 'creative', icon: '🎨', category: '创意设计',
        systemPrompt: `你是一名创意总监。请产出新颖的创意概念，打造有吸引力的品牌故事和文案。`
    },
    {
        name: '批评家', role: 'critic', icon: '🎭', category: '创意设计',
        systemPrompt: `你是一名批评家。请批判性分析观点，找出问题和漏洞，提供建设性批评。`
    },
];

// Agent 分类
const AGENT_CATEGORIES = ['内容创作', '技术开发', '商业运营', '创意设计'];

// ============================================
// Agent 面板组件
// ============================================

interface AgentPanelProps {
    workspaceId: string;
    onClose: () => void;
}

export default function AgentPanel({ workspaceId, onClose }: AgentPanelProps) {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [taskInput, setTaskInput] = useState('');

    // API 配置 - 完全自定义
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [model, setModel] = useState('gpt-4o-mini');
    const [temperature, setTemperature] = useState(0.7);

    const [mode, setMode] = useState<'sequential' | 'parallel'>('sequential');

    const [executing, setExecuting] = useState(false);
    const [currentAgentIndex, setCurrentAgentIndex] = useState(-1);
    const [results, setResults] = useState<AgentResult[]>([]);
    const [finalOutput, setFinalOutput] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [showAddAgent, setShowAddAgent] = useState(false);

    // 加载配置
    useEffect(() => {
        const saved = localStorage.getItem('agent_api_key');
        const savedModel = localStorage.getItem('agent_model');
        const savedBaseUrl = localStorage.getItem('agent_base_url');
        const savedTemp = localStorage.getItem('agent_temperature');
        if (saved) setApiKey(saved);
        if (savedModel) setModel(savedModel);
        if (savedBaseUrl) setBaseUrl(savedBaseUrl);
        if (savedTemp) setTemperature(parseFloat(savedTemp));
    }, []);

    // 添加预设 Agent
    const addPresetAgent = (preset: Omit<Agent, 'id'>) => {
        const newAgent: Agent = {
            ...preset,
            id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        };
        setAgents([...agents, newAgent]);
        setShowAddAgent(false);
    };

    // 删除 Agent
    const removeAgent = (id: string) => {
        setAgents(agents.filter(a => a.id !== id));
    };

    // 执行 Agent 任务
    const executeTask = async () => {
        if (!taskInput.trim() || !apiKey.trim() || agents.length === 0) {
            setError('请填写任务描述、API Key，并添加至少一个 Agent');
            return;
        }

        localStorage.setItem('agent_api_key', apiKey);
        localStorage.setItem('agent_model', model);
        localStorage.setItem('agent_base_url', baseUrl);
        localStorage.setItem('agent_temperature', temperature.toString());

        setExecuting(true);
        setError(null);
        setResults([]);
        setFinalOutput('');

        try {
            let currentInput = taskInput;

            for (let i = 0; i < agents.length; i++) {
                const agent = agents[i];
                setCurrentAgentIndex(i);

                // 构建请求
                const messages = [
                    { role: 'system', content: agent.systemPrompt },
                    { role: 'user', content: i === 0 ? currentInput : `前一个 Agent 的输出:\n${currentInput}\n\n请基于以上信息继续你的工作。` },
                ];

                // 调用 AI API
                const token = localStorage.getItem('galaxyous_token');
                const response = await fetch('/api/proxy/openai', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        apiKey,
                        model,
                        messages,
                        temperature,
                        maxTokens: 4096,
                    }),
                });

                const startTime = Date.now();

                if (response.ok) {
                    const data = await response.json();
                    const output = data.choices?.[0]?.message?.content || '';
                    const tokens = data.usage?.total_tokens || 0;

                    const result: AgentResult = {
                        agentId: agent.id,
                        status: 'completed',
                        output,
                        tokensUsed: tokens,
                        duration: Date.now() - startTime,
                    };

                    setResults(prev => [...prev, result]);
                    currentInput = output;
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'API 调用失败');
                }
            }

            setFinalOutput(currentInput);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setExecuting(false);
            setCurrentAgentIndex(-1);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Users size={20} className="text-purple-400" />
                        多 Agent 协作
                        <span className="text-xs bg-purple-600/50 px-2 py-0.5 rounded">{mode === 'sequential' ? '顺序模式' : '并行模式'}</span>
                        <span className="text-xs bg-green-600/50 px-2 py-0.5 rounded">12 个专业角色</span>
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 space-y-4">
                    {/* 错误提示 */}
                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
                        </div>
                    )}

                    {/* API 配置 - 完全自定义 */}
                    <div className="p-3 bg-white/5 rounded-lg space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">API Key</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="sk-xxx 或其他 API Key"
                                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">模型名称</label>
                                <input
                                    type="text"
                                    value={model}
                                    onChange={e => setModel(e.target.value)}
                                    placeholder="gpt-4o-mini / gemini-2.0-flash / ..."
                                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Base URL (可选)</label>
                            <input
                                type="text"
                                value={baseUrl}
                                onChange={e => setBaseUrl(e.target.value)}
                                placeholder="https://api.openai.com/v1 或自定义代理端点"
                                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                            />
                            <p className="text-xs text-slate-500 mt-1">留空使用默认 OpenAI 端点</p>
                        </div>

                        {/* Temperature 滑块 */}
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Temperature: {temperature.toFixed(1)}</label>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={temperature}
                                onChange={e => setTemperature(parseFloat(e.target.value))}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>精确 (0)</span>
                                <span>平衡 (0.7)</span>
                                <span>创意 (2)</span>
                            </div>
                        </div>
                    </div>

                    {/* Agent 列表 */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium text-white">Agent 团队 ({agents.length})</h3>
                            <button
                                onClick={() => setShowAddAgent(true)}
                                className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                            >
                                <Plus size={14} /> 添加 Agent
                            </button>
                        </div>

                        {agents.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 bg-white/5 rounded-lg">
                                <Bot className="mx-auto mb-2" />
                                请添加 Agent 成员
                            </div>
                        ) : (
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {agents.map((agent, i) => (
                                    <div
                                        key={agent.id}
                                        className={`flex-shrink-0 p-3 rounded-lg border ${currentAgentIndex === i ? 'bg-purple-900/30 border-purple-500' : 'bg-white/5 border-white/10'}`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">{PRESET_AGENTS.find(p => p.role === agent.role)?.icon || '🤖'}</span>
                                            <span className="text-sm text-white font-medium">{agent.name}</span>
                                            {currentAgentIndex === i && <Loader2 size={12} className="animate-spin text-purple-400" />}
                                            {results.find(r => r.agentId === agent.id)?.status === 'completed' && (
                                                <CheckCircle size={12} className="text-green-400" />
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400 mb-2">{agent.role}</p>
                                        <button
                                            onClick={() => removeAgent(agent.id)}
                                            className="text-red-400 hover:text-red-300 text-xs"
                                        >
                                            移除
                                        </button>
                                        {i < agents.length - 1 && (
                                            <ArrowRight size={14} className="text-slate-500 ml-2 inline" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 添加 Agent 弹窗 (分类显示) */}
                    {showAddAgent && (
                        <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                            <h4 className="text-sm font-medium text-white mb-3">选择 Agent 模板 (12 个专业角色)</h4>
                            {AGENT_CATEGORIES.map(cat => (
                                <div key={cat} className="mb-3">
                                    <p className="text-xs text-purple-300 mb-2">{cat}</p>
                                    <div className="grid grid-cols-4 gap-2">
                                        {PRESET_AGENTS.filter(p => p.category === cat).map(preset => (
                                            <button
                                                key={preset.role}
                                                onClick={() => addPresetAgent(preset)}
                                                className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-left flex items-center gap-2"
                                            >
                                                <span className="text-lg">{preset.icon}</span>
                                                <span className="text-xs text-white">{preset.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => setShowAddAgent(false)}
                                className="mt-2 text-sm text-slate-400"
                            >
                                取消
                            </button>
                        </div>
                    )}

                    {/* 任务输入 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">任务描述</label>
                        <textarea
                            value={taskInput}
                            onChange={e => setTaskInput(e.target.value)}
                            placeholder="描述你希望 Agent 团队完成的任务..."
                            className="w-full h-24 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white resize-none"
                        />
                        <button
                            onClick={executeTask}
                            disabled={executing || agents.length === 0}
                            className="mt-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {executing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                            {executing ? '执行中...' : '开始执行'}
                        </button>
                    </div>

                    {/* 执行结果 */}
                    {results.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-white mb-2">执行结果</h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {results.map((result, i) => {
                                    const agent = agents.find(a => a.id === result.agentId);
                                    return (
                                        <div key={i} className="p-3 bg-white/5 rounded-lg">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm text-white font-medium">{agent?.name}</span>
                                                <span className="text-xs bg-green-600/50 px-2 py-0.5 rounded">
                                                    {result.tokensUsed} tokens | {(result.duration / 1000).toFixed(1)}s
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-300 whitespace-pre-wrap line-clamp-4">{result.output}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 最终输出 */}
                    {finalOutput && (
                        <div>
                            <h3 className="text-sm font-medium text-white mb-2">最终输出</h3>
                            <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                                <pre className="text-sm text-green-300 whitespace-pre-wrap">{finalOutput}</pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
