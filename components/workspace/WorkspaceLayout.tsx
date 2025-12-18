/**
 * Workspace 布局组件
 * 
 * @module components/workspace/WorkspaceLayout
 * @description 包含侧边栏和主内容区的 Workspace 布局 - 生产版本
 */

import React, { useState } from 'react';
import {
    GitBranch, History, FolderOpen, Settings,
    ChevronLeft, Plus, Search, Cloud, Wand2, Key, X, CheckCircle, AlertCircle, RefreshCw,
    BookOpen, Users, Plug, BarChart3, Folder, CheckSquare, Code
} from 'lucide-react';
import { useWorkflows, Workflow } from '../../hooks/useWorkspace';
import { WorkflowEditor } from '../workflow';
import ExecutionMonitor from './ExecutionMonitor';
import FileManager from './FileManager';
import WorkspaceSettings from './settings/WorkspaceSettings';
import ConfigCenter from './ConfigCenter';
import KnowledgeBasePanel from './KnowledgeBase';
import AgentPanel from './AgentPanel';
import MCPPanel from './MCPPanel';
import TokenStatsPanel from './TokenStatsPanel';
import ProjectPanel from './ProjectPanel';
import TaskPanel from './TaskPanel';
import SandboxPanel from './SandboxPanel';

// ============================================
// 执行历史面板
// ============================================

function ExecutionHistoryPanel({ workspaceId }: { workspaceId: string }) {
    // 使用 ExecutionMonitor 组件显示执行历史
    return (
        <div className="h-full overflow-auto">
            <ExecutionMonitor
                workspaceId={workspaceId}
                onRefresh={() => console.log('Refreshing executions...')}
                onViewDetails={(exec) => console.log('View details:', exec.id)}
            />
        </div>
    );
}

// ============================================
// 文件管理面板
// ============================================

function FileManagerPanel({ workspaceId }: { workspaceId: string }) {
    const handleFileSelect = (file: any) => {
        console.log('Selected file:', file.path);
    };

    return (
        <div className="h-full overflow-auto">
            <FileManager
                workspaceId={workspaceId}
                onFileSelect={handleFileSelect}
            />
        </div>
    );
}

// ============================================
// 提示词优化面板 (Gemini AI 驱动)
// ============================================

function PromptOptimizerPanel({ onClose }: { onClose: () => void }) {
    const [input, setInput] = useState('');
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [taskType, setTaskType] = useState<'chat' | 'code' | 'creative' | 'analysis' | 'translation'>('chat');

    // 从 localStorage 加载保存的 API Key
    React.useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            setGeminiApiKey(savedKey);
        }
    }, []);

    const handleOptimize = async () => {
        if (!input.trim()) return;
        if (!geminiApiKey.trim()) {
            setError('请输入 Gemini API Key');
            return;
        }

        // 保存 API Key 到 localStorage
        localStorage.setItem('gemini_api_key', geminiApiKey);

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch('/api/prompt/optimize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: input,
                    taskType,
                    geminiApiKey,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setResult(data);
            } else {
                const errorData = await response.json();
                setError(errorData.error || '优化失败');
            }
        } catch (e: any) {
            setError(`网络错误: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl border border-white/10">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wand2 size={20} className="text-purple-400" />
                        AI 提示词优化助手
                        <span className="text-xs bg-purple-600/50 px-2 py-0.5 rounded">Gemini</span>
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Gemini API Key */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Gemini API Key</label>
                        <input
                            type="password"
                            value={geminiApiKey}
                            onChange={e => setGeminiApiKey(e.target.value)}
                            placeholder="输入你的 Gemini API Key (从 Google AI Studio 获取)"
                            className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            获取方式: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-purple-400 hover:underline">Google AI Studio</a>
                        </p>
                    </div>

                    {/* 任务类型选择 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">任务类型</label>
                        <div className="flex gap-2 flex-wrap">
                            {[
                                { id: 'chat', label: '对话' },
                                { id: 'code', label: '代码' },
                                { id: 'creative', label: '创意' },
                                { id: 'analysis', label: '分析' },
                                { id: 'translation', label: '翻译' },
                            ].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setTaskType(t.id as any)}
                                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${taskType === t.id
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 输入区 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">输入提示词</label>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="在这里输入你的提示词，Gemini AI 会智能分析并给出优化建议..."
                            className="w-full h-32 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                        />
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    {/* 优化按钮 */}
                    <button
                        onClick={handleOptimize}
                        disabled={loading || !input.trim() || !geminiApiKey.trim()}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <RefreshCw size={18} className="animate-spin" />
                                AI 优化中...
                            </>
                        ) : (
                            <>
                                <Wand2 size={18} />
                                使用 Gemini 优化
                            </>
                        )}
                    </button>

                    {/* 结果展示 */}
                    {result && (
                        <div className="space-y-4">
                            {/* 评分对比 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white/5 rounded-xl">
                                    <p className="text-sm text-slate-400 mb-1">原始评分</p>
                                    <p className="text-2xl font-bold text-slate-300">{result.score.original}/100</p>
                                </div>
                                <div className="p-4 bg-purple-500/20 rounded-xl border border-purple-500/30">
                                    <p className="text-sm text-purple-300 mb-1">优化后评分</p>
                                    <p className="text-2xl font-bold text-purple-400">{result.score.optimized}/100</p>
                                </div>
                            </div>

                            {/* 优化建议 */}
                            {result.suggestions.length > 0 && (
                                <div>
                                    <p className="text-sm text-slate-400 mb-2">优化建议</p>
                                    <div className="space-y-2">
                                        {result.suggestions.map((s: any, i: number) => (
                                            <div key={i} className="p-3 bg-white/5 rounded-lg flex items-start gap-2">
                                                {s.type === 'warning' ? (
                                                    <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                                ) : (
                                                    <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
                                                )}
                                                <span className="text-sm text-slate-300">{s.message}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 优化后的提示词 */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm text-slate-400">优化后的提示词</p>
                                    <button
                                        onClick={() => handleCopy(result.optimizedPrompt)}
                                        className="text-xs text-purple-400 hover:text-purple-300"
                                    >
                                        复制
                                    </button>
                                </div>
                                <div className="p-4 bg-black/30 rounded-xl border border-purple-500/30">
                                    <p className="text-white whitespace-pre-wrap">{result.optimizedPrompt}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================
// 侧边栏
// ============================================

interface SidebarProps {
    workspaceId: string;
    workspaceName: string;
    activeTab: 'workflows' | 'projects' | 'tasks' | 'executions' | 'files' | 'sandbox' | 'settings';
    onTabChange: (tab: 'workflows' | 'projects' | 'tasks' | 'executions' | 'files' | 'sandbox' | 'settings') => void;
    onBack: () => void;
    workflows: Workflow[];
    selectedWorkflowId: string | null;
    onSelectWorkflow: (id: string) => void;
    onCreateWorkflow: () => void;
    onOpenConfigCenter: () => void;
    onOpenPromptOptimizer: () => void;
    onOpenKnowledgeBase: () => void;
    onOpenAgentPanel: () => void;
    onOpenMcpPanel: () => void;
    onOpenTokenStats: () => void;
}

function Sidebar({
    workspaceId, workspaceName, activeTab, onTabChange, onBack,
    workflows, selectedWorkflowId, onSelectWorkflow, onCreateWorkflow, onOpenConfigCenter, onOpenPromptOptimizer,
    onOpenKnowledgeBase, onOpenAgentPanel, onOpenMcpPanel, onOpenTokenStats
}: SidebarProps) {
    const tabs = [
        { id: 'workflows' as const, icon: GitBranch, label: '工作流' },
        { id: 'projects' as const, icon: Folder, label: '项目' },
        { id: 'tasks' as const, icon: CheckSquare, label: '任务' },
        { id: 'executions' as const, icon: History, label: '历史' },
        { id: 'files' as const, icon: FolderOpen, label: '文件' },
        { id: 'sandbox' as const, icon: Code, label: '沙箱' },
        { id: 'settings' as const, icon: Settings, label: '设置' },
    ];

    return (
        <div className="w-64 bg-slate-900/50 border-r border-white/10 flex flex-col">
            {/* 头部 */}
            <div className="p-4 border-b border-white/10">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-2"
                >
                    <ChevronLeft size={16} />
                    <span className="text-sm">返回列表</span>
                </button>
                <h2 className="font-semibold text-white truncate">{workspaceName}</h2>
            </div>

            {/* 标签页 */}
            <div className="flex border-b border-white/10">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs transition-colors ${activeTab === tab.id
                            ? 'text-purple-400 border-b-2 border-purple-500'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        <tab.icon size={18} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'workflows' && (
                    <div className="p-2">
                        {/* 搜索和新建 */}
                        <div className="flex gap-2 mb-2">
                            <div className="flex-1 relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="搜索..."
                                    className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <button
                                onClick={onCreateWorkflow}
                                className="p-1.5 bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors"
                            >
                                <Plus size={16} className="text-white" />
                            </button>
                        </div>

                        {/* 工作流列表 */}
                        <div className="space-y-1">
                            {workflows.length === 0 ? (
                                <p className="text-center text-slate-500 text-sm py-4">暂无工作流</p>
                            ) : (
                                workflows.map(wf => (
                                    <button
                                        key={wf.id}
                                        onClick={() => onSelectWorkflow(wf.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedWorkflowId === wf.id
                                            ? 'bg-purple-600/20 text-purple-400'
                                            : 'text-slate-300 hover:bg-white/5'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <GitBranch size={14} />
                                            <span className="text-sm truncate">{wf.name}</span>
                                        </div>
                                        <span className="text-xs text-slate-500 ml-5">v{wf.version}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'executions' && (
                    <ExecutionHistoryPanel workspaceId={workspaceId} />
                )}

                {activeTab === 'files' && (
                    <FileManagerPanel workspaceId={workspaceId} />
                )}

                {activeTab === 'settings' && (
                    <div className="p-2">
                        <p className="text-xs text-slate-400 mb-2">工作区设置在右侧面板显示</p>
                    </div>
                )}
            </div>

            {/* 快捷功能 */}
            <div className="p-2 border-t border-white/10 space-y-1">
                <button
                    onClick={onOpenConfigCenter}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-400 hover:text-white hover:bg-purple-500/20 rounded-lg transition-colors"
                >
                    <Key size={16} />
                    <span>AI 配置中心</span>
                </button>
                <button
                    onClick={() => onTabChange('settings')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                    <Cloud size={16} />
                    <span>云端同步</span>
                </button>
                <button
                    onClick={onOpenPromptOptimizer}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                    <Wand2 size={16} />
                    <span>提示词优化</span>
                </button>
                <button
                    onClick={onOpenKnowledgeBase}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:text-white hover:bg-blue-500/20 rounded-lg transition-colors"
                >
                    <BookOpen size={16} />
                    <span>知识库 (RAG)</span>
                </button>
                <button
                    onClick={onOpenAgentPanel}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-400 hover:text-white hover:bg-purple-500/20 rounded-lg transition-colors"
                >
                    <Users size={16} />
                    <span>多 Agent 协作</span>
                </button>
                <button
                    onClick={onOpenMcpPanel}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:text-white hover:bg-emerald-500/20 rounded-lg transition-colors"
                >
                    <Plug size={16} />
                    <span>MCP 工具</span>
                </button>
                <button
                    onClick={onOpenTokenStats}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-400 hover:text-white hover:bg-green-500/20 rounded-lg transition-colors"
                >
                    <BarChart3 size={16} />
                    <span>Token 统计</span>
                </button>
            </div>
        </div>
    );
}

// ============================================
// 主布局组件
// ============================================

interface WorkspaceLayoutProps {
    workspaceId: string;
    workspaceName: string;
    onBack: () => void;
    children?: React.ReactNode;
}

export function WorkspaceLayout({ workspaceId, workspaceName, onBack }: WorkspaceLayoutProps) {
    const [activeTab, setActiveTab] = useState<'workflows' | 'projects' | 'tasks' | 'executions' | 'files' | 'sandbox' | 'settings'>('workflows');
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showConfigCenter, setShowConfigCenter] = useState(false);
    const [showPromptOptimizer, setShowPromptOptimizer] = useState(false);
    const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
    const [showAgentPanel, setShowAgentPanel] = useState(false);
    const [showMcpPanel, setShowMcpPanel] = useState(false);
    const [showTokenStats, setShowTokenStats] = useState(false);
    const { workflows, createWorkflow } = useWorkflows(workspaceId);

    const handleCreateWorkflow = async () => {
        const name = prompt('工作流名称:');
        if (name) {
            const wf = await createWorkflow({ name });
            setSelectedWorkflowId(wf.id);
        }
    };

    const handleSaveWorkflow = async (nodes: any[], edges: any[]) => {
        if (!selectedWorkflowId) return;
        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`/api/workflows/${selectedWorkflowId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ nodes, edges }),
            });

            if (response.ok) {
                console.log('Workflow saved successfully');
            } else {
                throw new Error('Save failed');
            }
        } catch (error) {
            console.error('Save workflow error:', error);
            alert('保存失败');
        }
    };

    // 当切换到设置标签时显示设置面板
    React.useEffect(() => {
        if (activeTab === 'settings') {
            setShowSettings(true);
        }
    }, [activeTab]);

    return (
        <div className="h-full flex bg-slate-950">
            {/* 侧边栏 */}
            <Sidebar
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onBack={onBack}
                workflows={workflows}
                selectedWorkflowId={selectedWorkflowId}
                onSelectWorkflow={setSelectedWorkflowId}
                onCreateWorkflow={handleCreateWorkflow}
                onOpenConfigCenter={() => setShowConfigCenter(true)}
                onOpenPromptOptimizer={() => setShowPromptOptimizer(true)}
                onOpenKnowledgeBase={() => setShowKnowledgeBase(true)}
                onOpenAgentPanel={() => setShowAgentPanel(true)}
                onOpenMcpPanel={() => setShowMcpPanel(true)}
                onOpenTokenStats={() => setShowTokenStats(true)}
            />

            {/* 主内容区 */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* 内容区 */}
                <div className="flex-1 overflow-hidden p-4">
                    {activeTab === 'workflows' && (
                        selectedWorkflowId ? (
                            <WorkflowEditor
                                workflowId={selectedWorkflowId}
                                workspaceId={workspaceId}
                                onSave={handleSaveWorkflow}
                            />
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500">
                                <div className="text-center">
                                    <GitBranch size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>选择或创建一个工作流</p>
                                </div>
                            </div>
                        )
                    )}

                    {activeTab === 'projects' && (
                        <ProjectPanel
                            workspaceId={workspaceId}
                            onNavigateToTasks={(projectId) => {
                                setActiveTab('tasks');
                            }}
                        />
                    )}

                    {activeTab === 'tasks' && (
                        <TaskPanel
                            workspaceId={workspaceId}
                        />
                    )}

                    {activeTab === 'executions' && (
                        <ExecutionHistoryPanel workspaceId={workspaceId} />
                    )}

                    {activeTab === 'files' && (
                        <FileManagerPanel workspaceId={workspaceId} />
                    )}

                    {activeTab === 'sandbox' && (
                        <SandboxPanel workspaceId={workspaceId} />
                    )}
                </div>
            </div>

            {/* 设置面板 (弹出式) */}
            {showSettings && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="relative w-full max-w-4xl max-h-[90vh] overflow-auto">
                        <WorkspaceSettings
                            workspaceId={workspaceId}
                            onClose={() => {
                                setShowSettings(false);
                                setActiveTab('workflows');
                            }}
                        />
                    </div>
                </div>
            )}

            {/* 配置中心 (弹出式) */}
            {showConfigCenter && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <ConfigCenter
                        workspaceId={workspaceId}
                        onClose={() => setShowConfigCenter(false)}
                    />
                </div>
            )}

            {/* 提示词优化助手 */}
            {showPromptOptimizer && (
                <PromptOptimizerPanel onClose={() => setShowPromptOptimizer(false)} />
            )}

            {/* 知识库 RAG */}
            {showKnowledgeBase && (
                <KnowledgeBasePanel
                    workspaceId={workspaceId}
                    onClose={() => setShowKnowledgeBase(false)}
                />
            )}

            {/* 多 Agent 协作 */}
            {showAgentPanel && (
                <AgentPanel
                    workspaceId={workspaceId}
                    onClose={() => setShowAgentPanel(false)}
                />
            )}

            {/* MCP 工具面板 */}
            {showMcpPanel && (
                <MCPPanel
                    workspaceId={workspaceId}
                    onClose={() => setShowMcpPanel(false)}
                />
            )}

            {/* Token 成本统计 */}
            {showTokenStats && (
                <TokenStatsPanel
                    onClose={() => setShowTokenStats(false)}
                />
            )}
        </div>
    );
}

export default WorkspaceLayout;
