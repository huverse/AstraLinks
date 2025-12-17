/**
 * 工作区配置中心组件
 * 
 * @module components/workspace/ConfigCenter
 * @description 工作区独立 AI 配置管理
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Settings, Key, Plus, Trash2, Check, X, Eye, EyeOff,
    Cpu, Cloud, Thermometer, Hash, RefreshCw, Save, Zap,
    AlertCircle
} from 'lucide-react';
import { authFetch } from '../../utils/api';

// 获取 token
const getToken = () => localStorage.getItem('galaxyous_token');

// API 调用
const fetchAPI = async <T = any>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const token = getToken();
    return authFetch<T>(endpoint, token, options);
};

// ============================================
// 类型定义
// ============================================

interface AIConfig {
    id: string;
    name: string;
    provider: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
    apiKey?: string;  // 遮罩版本的 API Key，用于显示
    hasApiKey: boolean;
    isActive: boolean;
}

interface ConfigCenterProps {
    workspaceId: string;
    onClose?: () => void;
}

// ============================================
// 提供商选项
// ============================================

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] },
    { id: 'google', name: 'Google', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] },
    { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-coder'] },
    { id: 'custom', name: '自定义', models: [] },
];

// ============================================
// 配置卡片
// ============================================

function ConfigCard({
    config,
    isEditing,
    onEdit,
    onDelete,
    onSetActive,
}: {
    config: AIConfig;
    isEditing: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onSetActive: () => void;
}) {
    return (
        <div className={`p-4 rounded-xl border transition-all ${config.isActive
            ? 'bg-purple-900/30 border-purple-500/50'
            : 'bg-white/5 border-white/10 hover:border-white/20'
            }`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.isActive ? 'bg-purple-500/20' : 'bg-white/10'}`}>
                        <Cpu size={18} className={config.isActive ? 'text-purple-400' : 'text-slate-400'} />
                    </div>
                    <div>
                        <h4 className="font-medium text-white">{config.name}</h4>
                        <p className="text-xs text-slate-400">{config.provider} / {config.model}</p>
                    </div>
                </div>

                {config.isActive && (
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                        当前使用
                    </span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                <div className="p-2 bg-black/20 rounded-lg">
                    <div className="text-slate-500 mb-1">温度</div>
                    <div className="text-white">{config.temperature}</div>
                </div>
                <div className="p-2 bg-black/20 rounded-lg">
                    <div className="text-slate-500 mb-1">最大 Token</div>
                    <div className="text-white">{config.maxTokens}</div>
                </div>
                <div className="p-2 bg-black/20 rounded-lg">
                    <div className="text-slate-500 mb-1">API Key</div>
                    <div className={config.hasApiKey ? 'text-green-400' : 'text-red-400'}>
                        {config.hasApiKey ? '已配置' : '未配置'}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                {!config.isActive && (
                    <button
                        onClick={onSetActive}
                        className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
                    >
                        设为当前
                    </button>
                )}
                <button
                    onClick={onEdit}
                    className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg transition-colors"
                >
                    <Settings size={16} />
                </button>
                <button
                    onClick={onDelete}
                    className="p-2 bg-white/5 hover:bg-red-900/30 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}

// ============================================
// 添加/编辑配置表单
// ============================================

function ConfigForm({
    initialConfig,
    onSave,
    onCancel,
}: {
    initialConfig?: AIConfig;
    onSave: (config: any) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState({
        name: initialConfig?.name || '',
        provider: initialConfig?.provider || 'custom',
        model: initialConfig?.model || '',
        // 编辑时如果有 API Key，显示遮罩版本
        apiKey: initialConfig?.hasApiKey ? (initialConfig?.apiKey || '••••••••••••') : '',
        baseUrl: initialConfig?.baseUrl || '',
        temperature: initialConfig?.temperature ?? 0.7,
        maxTokens: initialConfig?.maxTokens ?? 4096,
    });
    const [showApiKey, setShowApiKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const selectedProvider = PROVIDERS.find(p => p.id === form.provider);

    // 测试连接
    const testConnection = async () => {
        // 如果没有 API Key 且不是编辑现有配置，则提示输入
        const hasStoredKey = initialConfig?.hasApiKey && form.apiKey.startsWith('••••');
        const hasNewKey = form.apiKey && !form.apiKey.startsWith('••••');

        if (!hasStoredKey && !hasNewKey) {
            setTestResult({ success: false, message: '请输入 API Key 进行测试' });
            return;
        }

        setTesting(true);
        setTestResult(null);

        try {
            // 简单验证 API Key 格式
            const baseUrl = form.baseUrl || getDefaultBaseUrl(form.provider);
            const response = await fetch('/api/workspace-config/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('galaxyous_token')}`
                },
                body: JSON.stringify({
                    provider: form.provider,
                    model: form.model,
                    // 如果是已保存的 Key，发送 configId 让服务器使用存储的 Key
                    apiKey: hasNewKey ? form.apiKey : undefined,
                    configId: hasStoredKey ? initialConfig?.id : undefined,
                    baseUrl
                })
            });

            if (response.ok) {
                setTestResult({ success: true, message: '连接成功！API 配置有效' });
            } else {
                const data = await response.json();
                setTestResult({ success: false, message: data.error || '连接失败' });
            }
        } catch (error) {
            setTestResult({ success: false, message: '网络错误，请稍后重试' });
        } finally {
            setTesting(false);
        }
    };

    // 获取默认 Base URL
    const getDefaultBaseUrl = (provider: string) => {
        switch (provider) {
            case 'openai': return 'https://api.openai.com/v1';
            case 'anthropic': return 'https://api.anthropic.com';
            case 'google': return 'https://generativelanguage.googleapis.com';
            case 'deepseek': return 'https://api.deepseek.com';
            default: return '';
        }
    };

    return (
        <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
            <h4 className="text-white font-medium">
                {initialConfig ? '编辑配置' : '添加新配置'}
            </h4>

            {/* 配置名称 */}
            <div>
                <label className="block text-sm text-slate-400 mb-1">配置名称</label>
                <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="例如: 工作流专用 GPT-4"
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                />
            </div>

            {/* 提供商和模型 */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm text-slate-400 mb-1">提供商</label>
                    <select
                        value={form.provider}
                        onChange={e => setForm({ ...form, provider: e.target.value, model: '' })}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    >
                        {PROVIDERS.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm text-slate-400 mb-1">模型</label>
                    {selectedProvider?.models.length ? (
                        <select
                            value={form.model}
                            onChange={e => setForm({ ...form, model: e.target.value })}
                            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        >
                            <option value="">选择模型</option>
                            {selectedProvider.models.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            value={form.model}
                            onChange={e => setForm({ ...form, model: e.target.value })}
                            placeholder="输入模型名称"
                            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                        />
                    )}
                </div>
            </div>

            {/* API Key */}
            <div>
                <label className="block text-sm text-slate-400 mb-1">API Key</label>
                <div className="relative">
                    <input
                        type={showApiKey ? 'text' : 'password'}
                        value={form.apiKey}
                        onChange={e => setForm({ ...form, apiKey: e.target.value })}
                        placeholder={initialConfig?.hasApiKey ? '留空保持原有 Key' : '输入 API Key'}
                        className="w-full px-3 py-2 pr-10 bg-black/30 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
            </div>

            {/* Base URL */}
            <div>
                <label className="block text-sm text-slate-400 mb-1">Base URL (可选)</label>
                <input
                    type="text"
                    value={form.baseUrl}
                    onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                />
            </div>

            {/* 参数 */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm text-slate-400 mb-1">温度 (0-2)</label>
                    <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={form.temperature}
                        onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    />
                </div>
                <div>
                    <label className="block text-sm text-slate-400 mb-1">最大 Token</label>
                    <input
                        type="number"
                        min="256"
                        max="128000"
                        value={form.maxTokens}
                        onChange={e => setForm({ ...form, maxTokens: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    />
                </div>
            </div>

            {/* 测试结果 */}
            {testResult && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${testResult.success
                    ? 'bg-green-900/30 border border-green-500/30 text-green-400'
                    : 'bg-red-900/30 border border-red-500/30 text-red-400'
                    }`}>
                    {testResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
                    <span className="text-sm">{testResult.message}</span>
                </div>
            )}

            {/* 按钮 */}
            <div className="flex gap-2 pt-2">
                <button
                    onClick={testConnection}
                    disabled={testing}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                    {testing ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                    测试
                </button>
                <button
                    onClick={() => onSave(form)}
                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <Save size={16} />
                    保存
                </button>
                <button
                    onClick={onCancel}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg transition-colors"
                >
                    取消
                </button>
            </div>
        </div>
    );
}

// ============================================
// 主组件
// ============================================

export function ConfigCenter({ workspaceId, onClose }: ConfigCenterProps) {
    const [configs, setConfigs] = useState<AIConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null);

    const loadConfigs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchAPI<{ configs: AIConfig[] }>(`/api/workspace-config/${workspaceId}/ai`);
            setConfigs(data.configs || []);
        } catch (error) {
            console.error('Failed to load configs:', error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        loadConfigs();
    }, [loadConfigs]);

    const handleSave = async (formData: any) => {
        try {
            if (editingConfig) {
                // 更新现有配置
                // 处理 API Key 的特殊情况：
                // - 如果有新的 apiKey，使用新的
                // - 如果 apiKey 为空但原配置有 key，发送 __PRESERVE__ 标记让后端保留原来的
                // - 如果 apiKey 为空且原配置也没有，发送空字符串
                let apiKeyToSend = formData.apiKey;
                if (!formData.apiKey && editingConfig.hasApiKey) {
                    apiKeyToSend = '__PRESERVE__';
                }

                const updatedConfigs = configs.map(c =>
                    c.id === editingConfig.id
                        ? {
                            ...c,
                            name: formData.name,
                            provider: formData.provider,
                            model: formData.model,
                            baseUrl: formData.baseUrl,
                            temperature: formData.temperature,
                            maxTokens: formData.maxTokens,
                            apiKey: apiKeyToSend,
                        }
                        : { ...c, apiKey: c.hasApiKey ? '__PRESERVE__' : '' }
                );
                await fetchAPI(`/api/workspace-config/${workspaceId}/ai`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ configs: updatedConfigs }),
                });
            } else {
                // 添加新配置
                await fetchAPI(`/api/workspace-config/${workspaceId}/ai`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });
            }
            loadConfigs();
            setShowForm(false);
            setEditingConfig(null);
        } catch (error) {
            console.error('Failed to save config:', error);
            alert('保存失败');
        }
    };

    const handleDelete = async (configId: string) => {
        if (!confirm('确定删除此配置？')) return;
        try {
            await fetchAPI(`/api/workspace-config/${workspaceId}/ai/${configId}`, {
                method: 'DELETE',
            });
            loadConfigs();
        } catch (error) {
            console.error('Failed to delete config:', error);
        }
    };

    const handleSetActive = async (configId: string) => {
        try {
            const updatedConfigs = configs.map(c => ({
                ...c,
                isActive: c.id === configId,
            }));
            await fetchAPI(`/api/workspace-config/${workspaceId}/ai`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ configs: updatedConfigs }),
            });
            loadConfigs();
        } catch (error) {
            console.error('Failed to set active config:', error);
        }
    };

    return (
        <div className="bg-slate-900 rounded-2xl border border-white/10 overflow-hidden max-w-2xl w-full">
            {/* 头部 */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Key size={20} className="text-purple-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">AI 配置中心</h3>
                        <p className="text-xs text-slate-400">工作区独立配置，不影响主应用</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadConfigs}
                        className="p-2 text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* 内容 */}
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
                    </div>
                ) : showForm || editingConfig ? (
                    <ConfigForm
                        initialConfig={editingConfig || undefined}
                        onSave={handleSave}
                        onCancel={() => { setShowForm(false); setEditingConfig(null); }}
                    />
                ) : (
                    <>
                        {/* 配置列表 */}
                        {configs.length === 0 ? (
                            <div className="text-center py-8">
                                <Cloud size={48} className="mx-auto mb-4 text-slate-600" />
                                <p className="text-slate-400 mb-4">暂无 AI 配置</p>
                                <button
                                    onClick={() => setShowForm(true)}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                                >
                                    添加第一个配置
                                </button>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {configs.map(config => (
                                    <ConfigCard
                                        key={config.id}
                                        config={config}
                                        isEditing={false}
                                        onEdit={() => setEditingConfig(config)}
                                        onDelete={() => handleDelete(config.id)}
                                        onSetActive={() => handleSetActive(config.id)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* 添加按钮 */}
                        {configs.length > 0 && (
                            <button
                                onClick={() => setShowForm(true)}
                                className="w-full py-3 border-2 border-dashed border-white/10 hover:border-purple-500/50 rounded-xl text-slate-400 hover:text-purple-400 transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus size={18} />
                                添加新配置
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* 底部提示 */}
            <div className="p-3 border-t border-white/10 bg-white/5">
                <p className="text-xs text-slate-500 text-center">
                    💡 工作区配置独立于主应用，在工作流中使用时会优先使用这里的配置
                </p>
            </div>
        </div>
    );
}

export default ConfigCenter;
