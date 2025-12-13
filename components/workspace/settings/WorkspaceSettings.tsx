/**
 * Workspace 设置面板
 * 
 * @module components/workspace/settings/WorkspaceSettings
 * @description 模型配置、MCP 设置、功能开关、云端同步
 */

import React, { useState, useEffect } from 'react';
import {
    Bot, Plug, Settings as SettingsIcon, Cloud,
    Save, Loader2, Check, Plus, Trash2, RefreshCw
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface ModelConfig {
    id: string;
    name: string;
    provider: 'GEMINI' | 'OPENAI' | 'ANTHROPIC' | 'CUSTOM';
    apiKey: string;
    baseUrl?: string;
    modelName: string;
    temperature?: number;
    maxTokens?: number;
    isDefault: boolean;
}

interface WorkspaceSettingsProps {
    workspaceId: string;
    onClose?: () => void;
}

// ============================================
// 模型配置面板 (使用 ConfigCenter API)
// ============================================

function ModelConfigPanel({ workspaceId }: { workspaceId: string }) {
    const [configs, setConfigs] = useState<ModelConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // 从 API 加载配置
    useEffect(() => {
        const loadConfigs = async () => {
            try {
                const token = localStorage.getItem('galaxyous_token');
                const response = await fetch(`/api/workspace-config/${workspaceId}/ai`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                });
                if (response.ok) {
                    const data = await response.json();
                    // 映射 API 数据到本地格式
                    const mapped = (data.configs || []).map((c: any) => ({
                        id: c.id,
                        name: c.name || '',
                        provider: c.provider?.toUpperCase() || 'CUSTOM',
                        apiKey: c.hasApiKey ? '••••••••' : '',
                        baseUrl: c.baseUrl || '',
                        modelName: c.model || '',
                        temperature: c.temperature,
                        maxTokens: c.maxTokens,
                        isDefault: c.isActive || false,
                    }));
                    setConfigs(mapped);
                }
            } catch (e) {
                console.error('Failed to load configs:', e);
            } finally {
                setLoading(false);
            }
        };
        loadConfigs();
    }, [workspaceId]);

    const addConfig = async () => {
        const newConfig: ModelConfig = {
            id: Date.now().toString(),
            name: '',
            provider: 'CUSTOM',
            apiKey: '',
            modelName: '',
            isDefault: configs.length === 0,
        };
        setConfigs([...configs, newConfig]);
    };

    const deleteConfig = async (id: string) => {
        try {
            const token = localStorage.getItem('galaxyous_token');
            await fetch(`/api/workspace-config/${workspaceId}/ai/${id}`, {
                method: 'DELETE',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            setConfigs(configs.filter(c => c.id !== id));
        } catch (e) {
            console.error('Failed to delete config:', e);
        }
    };

    const setDefault = (id: string) => {
        setConfigs(configs.map(c => ({
            ...c,
            isDefault: c.id === id,
        })));
    };

    const saveConfigs = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('galaxyous_token');
            // 转换为 API 格式
            const apiConfigs = configs.map(c => ({
                id: c.id,
                name: c.name || `${c.provider} - ${c.modelName}`,
                provider: c.provider.toLowerCase(),
                model: c.modelName,
                apiKey: c.apiKey.startsWith('••') ? undefined : c.apiKey,
                baseUrl: c.baseUrl,
                temperature: c.temperature ?? 0.7,
                maxTokens: c.maxTokens ?? 4096,
                isActive: c.isDefault,
            }));

            await fetch(`/api/workspace-config/${workspaceId}/ai`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ configs: apiConfigs }),
            });
        } catch (e) {
            console.error('Failed to save configs:', e);
            alert('保存失败');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-center py-8 text-slate-400">加载中...</div>;
    }

    return (
        <div className="space-y-4">
            {/* 配置列表 */}
            <div className="space-y-2">
                {configs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                        <Bot size={32} className="mx-auto mb-2 opacity-50" />
                        <p>暂无模型配置</p>
                        <p className="text-sm">点击下方按钮添加第一个配置</p>
                    </div>
                ) : configs.map(config => (
                    <div
                        key={config.id}
                        className={`p-4 rounded-xl border ${config.isDefault
                            ? 'border-purple-500/50 bg-purple-900/20'
                            : 'border-white/10 bg-white/5'
                            }`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Bot size={16} className="text-purple-400" />
                                <input
                                    type="text"
                                    value={config.name}
                                    onChange={(e) => {
                                        setConfigs(configs.map(c =>
                                            c.id === config.id ? { ...c, name: e.target.value } : c
                                        ));
                                    }}
                                    placeholder="配置名称 (自定义)"
                                    className="bg-transparent text-white font-medium focus:outline-none border-b border-transparent hover:border-white/20 focus:border-purple-500"
                                />
                                {config.isDefault && (
                                    <span className="text-[10px] bg-purple-600 px-2 py-0.5 rounded-full">默认</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {!config.isDefault && (
                                    <button
                                        onClick={() => setDefault(config.id)}
                                        className="text-xs text-slate-400 hover:text-white"
                                    >
                                        设为默认
                                    </button>
                                )}
                                <button
                                    onClick={() => deleteConfig(config.id)}
                                    className="p-1 text-red-400 hover:text-red-300"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <label className="text-xs text-slate-500">Provider (可选)</label>
                                <select
                                    value={config.provider}
                                    onChange={(e) => {
                                        setConfigs(configs.map(c =>
                                            c.id === config.id ? { ...c, provider: e.target.value as any } : c
                                        ));
                                    }}
                                    className="w-full mt-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                >
                                    <option value="OPENAI">OpenAI</option>
                                    <option value="ANTHROPIC">Anthropic</option>
                                    <option value="GEMINI">Google Gemini</option>
                                    <option value="DEEPSEEK">DeepSeek</option>
                                    <option value="CUSTOM">自定义</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500">模型名称 (自定义)</label>
                                <input
                                    type="text"
                                    value={config.modelName}
                                    onChange={(e) => {
                                        setConfigs(configs.map(c =>
                                            c.id === config.id ? { ...c, modelName: e.target.value } : c
                                        ));
                                    }}
                                    placeholder="输入任意模型名称"
                                    className="w-full mt-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-slate-500">API Key</label>
                                <input
                                    type="password"
                                    value={config.apiKey}
                                    onChange={(e) => {
                                        setConfigs(configs.map(c =>
                                            c.id === config.id ? { ...c, apiKey: e.target.value } : c
                                        ));
                                    }}
                                    placeholder="输入 API Key"
                                    className="w-full mt-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-slate-500">Base URL (可选)</label>
                                <input
                                    type="text"
                                    value={config.baseUrl || ''}
                                    onChange={(e) => {
                                        setConfigs(configs.map(c =>
                                            c.id === config.id ? { ...c, baseUrl: e.target.value } : c
                                        ));
                                    }}
                                    placeholder="https://api.openai.com/v1 或自定义端点"
                                    className="w-full mt-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
                <button
                    onClick={addConfig}
                    className="flex-1 py-2 border border-dashed border-white/20 rounded-xl text-slate-400 hover:text-white hover:border-white/40 transition-colors flex items-center justify-center gap-2"
                >
                    <Plus size={16} />
                    <span>添加模型配置</span>
                </button>
                {configs.length > 0 && (
                    <button
                        onClick={saveConfigs}
                        disabled={saving}
                        className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        <span>保存</span>
                    </button>
                )}
            </div>
        </div>
    );
}

// ============================================
// MCP 配置面板
// ============================================

function MCPConfigPanel({ workspaceId }: { workspaceId: string }) {
    const [enabledMCPs, setEnabledMCPs] = useState(['mcp-web-search', 'mcp-http']);

    const availableMCPs = [
        { id: 'mcp-web-search', name: 'Web Search', description: '网页搜索' },
        { id: 'mcp-file-system', name: 'File System', description: '文件操作' },
        { id: 'mcp-code-exec', name: 'Code Executor', description: '代码执行' },
        { id: 'mcp-http', name: 'HTTP Client', description: 'HTTP请求' },
    ];

    const toggleMCP = (id: string) => {
        setEnabledMCPs(prev =>
            prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
        );
    };

    return (
        <div className="space-y-3">
            {availableMCPs.map(mcp => (
                <div
                    key={mcp.id}
                    className={`p-4 rounded-xl border cursor-pointer transition-colors ${enabledMCPs.includes(mcp.id)
                        ? 'border-green-500/50 bg-green-900/20'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                    onClick={() => toggleMCP(mcp.id)}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Plug size={16} className={enabledMCPs.includes(mcp.id) ? 'text-green-400' : 'text-slate-400'} />
                            <div>
                                <div className="font-medium text-white">{mcp.name}</div>
                                <div className="text-xs text-slate-400">{mcp.description}</div>
                            </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 ${enabledMCPs.includes(mcp.id)
                            ? 'bg-green-500 border-green-500'
                            : 'border-slate-500'
                            }`}>
                            {enabledMCPs.includes(mcp.id) && <Check size={12} className="text-white" />}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================
// 功能开关面板
// ============================================

function FeatureTogglePanel({ workspaceId }: { workspaceId: string }) {
    const [features, setFeatures] = useState({
        promptOptimization: false,
        autoSave: true,
        versionHistory: true,
    });

    const toggleFeature = (key: keyof typeof features) => {
        setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const featureList = [
        { key: 'promptOptimization', label: '提示词优化', description: '自动分析和优化提示词' },
        { key: 'autoSave', label: '自动保存', description: '每30秒自动保存工作流' },
        { key: 'versionHistory', label: '版本历史', description: '保留工作流历史版本' },
    ];

    return (
        <div className="space-y-3">
            {featureList.map(feature => (
                <div
                    key={feature.key}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5"
                >
                    <div>
                        <div className="font-medium text-white">{feature.label}</div>
                        <div className="text-xs text-slate-400">{feature.description}</div>
                    </div>
                    <button
                        onClick={() => toggleFeature(feature.key as keyof typeof features)}
                        className={`w-12 h-6 rounded-full transition-colors ${features[feature.key as keyof typeof features]
                            ? 'bg-purple-600'
                            : 'bg-slate-600'
                            }`}
                    >
                        <div
                            className={`w-5 h-5 rounded-full bg-white transition-transform ${features[feature.key as keyof typeof features]
                                ? 'translate-x-6'
                                : 'translate-x-0.5'
                                }`}
                        />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ============================================
// 云端同步面板
// ============================================

function CloudSyncPanel({ workspaceId }: { workspaceId: string }) {
    const [syncing, setSyncing] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const token = localStorage.getItem('galaxyous_token');
            // 获取工作区数据
            const wsResponse = await fetch(`/api/workspaces/${workspaceId}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            const wsData = await wsResponse.json();

            // 上传到云端
            const syncResponse = await fetch('/api/sync/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    workspaceId,
                    data: wsData,
                }),
            });

            if (syncResponse.ok) {
                setLastSync(new Date().toISOString());
            } else {
                throw new Error('Sync failed');
            }
        } catch (error) {
            console.error('Sync error:', error);
            alert('同步失败，请检查网络连接');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Cloud size={20} className="text-blue-400" />
                        <span className="font-medium text-white">云端同步</span>
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
                    >
                        {syncing ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                        <span>{syncing ? '同步中...' : '立即同步'}</span>
                    </button>
                </div>

                {lastSync ? (
                    <p className="text-sm text-slate-400">
                        上次同步: {new Date(lastSync).toLocaleString()}
                    </p>
                ) : (
                    <p className="text-sm text-slate-400">尚未同步</p>
                )}
            </div>

            <div className="text-xs text-slate-500">
                <p>同步内容包括: Workspace 配置、工作流定义、模型配置</p>
                <p>不包括: 执行历史、大型文件</p>
            </div>
        </div>
    );
}

// ============================================
// 主组件
// ============================================

export function WorkspaceSettings({ workspaceId, onClose }: WorkspaceSettingsProps) {
    const [activeTab, setActiveTab] = useState<'model' | 'mcp' | 'features' | 'sync'>('model');
    const [saving, setSaving] = useState(false);

    const tabs = [
        { id: 'model', label: '模型配置', icon: Bot },
        { id: 'mcp', label: 'MCP 工具', icon: Plug },
        { id: 'features', label: '功能设置', icon: SettingsIcon },
        { id: 'sync', label: '云端同步', icon: Cloud },
    ];

    const handleSave = async () => {
        setSaving(true);
        await new Promise(r => setTimeout(r, 1000));
        setSaving(false);
    };

    return (
        <div className="h-full flex flex-col bg-slate-900">
            {/* 头部 */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Workspace 设置</h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{saving ? '保存中...' : '保存设置'}</span>
                </button>
            </div>

            {/* 标签页 */}
            <div className="flex border-b border-white/10">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm transition-colors ${activeTab === tab.id
                            ? 'text-purple-400 border-b-2 border-purple-500'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <tab.icon size={16} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'model' && <ModelConfigPanel workspaceId={workspaceId} />}
                {activeTab === 'mcp' && <MCPConfigPanel workspaceId={workspaceId} />}
                {activeTab === 'features' && <FeatureTogglePanel workspaceId={workspaceId} />}
                {activeTab === 'sync' && <CloudSyncPanel workspaceId={workspaceId} />}
            </div>
        </div>
    );
}

export default WorkspaceSettings;
