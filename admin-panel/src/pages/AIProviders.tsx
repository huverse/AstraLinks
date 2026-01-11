/**
 * AI Providers Management - AI 提供商管理页面
 */

import { useState, useEffect } from 'react';
import { Cpu, Plus, RefreshCw, Pencil, Trash2, X, Globe, Eye, EyeOff } from 'lucide-react';
import { fetchAPI } from '../services/api';

interface AIProvider {
    id: string;
    name: string;
    type: 'openai_compatible' | 'gemini' | 'claude' | 'custom';
    baseUrl: string | null;
    defaultHeaders: Record<string, string> | null;
    capabilities: {
        text?: boolean;
        vision?: boolean;
        stream?: boolean;
        tools?: boolean;
        embedding?: boolean;
    } | null;
    defaultModels: { id: string; name: string; tier: string }[];
    isBuiltin: boolean;
    isActive: boolean;
    createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
    openai_compatible: 'OpenAI 兼容',
    gemini: 'Google Gemini',
    claude: 'Anthropic Claude',
    custom: '自定义'
};

export default function AIProviders() {
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        type: 'openai_compatible' as AIProvider['type'],
        baseUrl: '',
        capabilities: {
            text: true,
            vision: false,
            stream: true,
            tools: false,
            embedding: false
        },
        defaultModels: [] as { id: string; name: string; tier: string }[],
        isActive: true
    });
    const [modelInput, setModelInput] = useState({ id: '', name: '', tier: 'free' });

    useEffect(() => {
        loadProviders();
    }, []);

    const loadProviders = async () => {
        setLoading(true);
        try {
            const data = await fetchAPI('/api/ai-providers/admin/all');
            setProviders(data.providers ?? []);
        } catch (err) {
            console.error('Load providers error:', err);
        }
        setLoading(false);
    };

    const handleSubmit = async () => {
        try {
            const payload = {
                name: formData.name,
                type: formData.type,
                baseUrl: formData.baseUrl || null,
                capabilities: formData.capabilities,
                defaultModels: formData.defaultModels,
                isActive: formData.isActive
            };

            if (editingId) {
                await fetchAPI(`/api/ai-providers/${editingId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
            } else {
                await fetchAPI('/api/ai-providers', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }

            setShowForm(false);
            setEditingId(null);
            resetForm();
            loadProviders();
        } catch (err) {
            console.error('Save provider error:', err);
        }
    };

    const handleEdit = (provider: AIProvider) => {
        const defaultCaps = {
            text: true,
            vision: false,
            stream: true,
            tools: false,
            embedding: false
        };
        setFormData({
            name: provider.name,
            type: provider.type,
            baseUrl: provider.baseUrl ?? '',
            capabilities: {
                text: provider.capabilities?.text ?? defaultCaps.text,
                vision: provider.capabilities?.vision ?? defaultCaps.vision,
                stream: provider.capabilities?.stream ?? defaultCaps.stream,
                tools: provider.capabilities?.tools ?? defaultCaps.tools,
                embedding: provider.capabilities?.embedding ?? defaultCaps.embedding
            },
            defaultModels: provider.defaultModels ?? [],
            isActive: provider.isActive
        });
        setEditingId(provider.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('确定删除该提供商？')) return;
        try {
            await fetchAPI(`/api/ai-providers/${id}`, { method: 'DELETE' });
            loadProviders();
        } catch (err) {
            console.error('Delete provider error:', err);
        }
    };

    const toggleActive = async (id: string, isActive: boolean) => {
        try {
            await fetchAPI(`/api/ai-providers/${id}/toggle`, {
                method: 'PATCH',
                body: JSON.stringify({ isActive })
            });
            loadProviders();
        } catch (err) {
            console.error('Toggle provider error:', err);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            type: 'openai_compatible',
            baseUrl: '',
            capabilities: {
                text: true,
                vision: false,
                stream: true,
                tools: false,
                embedding: false
            },
            defaultModels: [],
            isActive: true
        });
        setModelInput({ id: '', name: '', tier: 'free' });
    };

    const addModel = () => {
        if (!modelInput.id || !modelInput.name) return;
        setFormData(f => ({
            ...f,
            defaultModels: [...f.defaultModels, { ...modelInput }]
        }));
        setModelInput({ id: '', name: '', tier: 'free' });
    };

    const removeModel = (idx: number) => {
        setFormData(f => ({
            ...f,
            defaultModels: f.defaultModels.filter((_, i) => i !== idx)
        }));
    };

    const getCapabilityBadges = (cap: AIProvider['capabilities']) => {
        const badges = [];
        if (cap?.text) badges.push({ label: '文本', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' });
        if (cap?.vision) badges.push({ label: '视觉', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' });
        if (cap?.stream) badges.push({ label: '流式', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' });
        if (cap?.tools) badges.push({ label: '工具', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' });
        if (cap?.embedding) badges.push({ label: 'Embedding', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400' });
        return badges;
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Cpu className="text-purple-500" />
                    AI 提供商管理
                </h1>
                <div className="flex gap-2">
                    <button
                        onClick={loadProviders}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600"
                    >
                        <RefreshCw size={16} />
                        刷新
                    </button>
                    <button
                        onClick={() => { resetForm(); setEditingId(null); setShowForm(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                    >
                        <Plus size={16} />
                        添加提供商
                    </button>
                </div>
            </div>

            {/* Provider Cards */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <RefreshCw size={24} className="animate-spin text-purple-500" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {providers.map(provider => (
                        <div
                            key={provider.id}
                            className={`bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border-2 ${
                                provider.isActive
                                    ? 'border-green-200 dark:border-green-900/50'
                                    : 'border-gray-200 dark:border-slate-700 opacity-60'
                            }`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                        {provider.name}
                                        {provider.isBuiltin && (
                                            <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 rounded">
                                                内置
                                            </span>
                                        )}
                                    </h3>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                        {TYPE_LABELS[provider.type]}
                                    </span>
                                </div>
                                <button
                                    onClick={() => toggleActive(provider.id, !provider.isActive)}
                                    className={`p-2 rounded-lg transition-colors ${
                                        provider.isActive
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-400'
                                    }`}
                                    title={provider.isActive ? '禁用' : '启用'}
                                >
                                    {provider.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                                </button>
                            </div>

                            {provider.baseUrl && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1">
                                    <Globe size={12} />
                                    <span className="truncate">{provider.baseUrl}</span>
                                </div>
                            )}

                            {/* Capabilities */}
                            <div className="flex flex-wrap gap-1 mb-3">
                                {getCapabilityBadges(provider.capabilities).map((badge, i) => (
                                    <span key={i} className={`px-2 py-0.5 text-xs rounded ${badge.color}`}>
                                        {badge.label}
                                    </span>
                                ))}
                            </div>

                            {/* Models */}
                            {provider.defaultModels?.length > 0 && (
                                <div className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                    <span className="font-medium">模型:</span>{' '}
                                    {provider.defaultModels.slice(0, 3).map(m => m.name).join(', ')}
                                    {provider.defaultModels.length > 3 && ` +${provider.defaultModels.length - 3}`}
                                </div>
                            )}

                            {/* Actions */}
                            {!provider.isBuiltin && (
                                <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-slate-700">
                                    <button
                                        onClick={() => handleEdit(provider)}
                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                    >
                                        <Pencil size={14} />
                                        编辑
                                    </button>
                                    <button
                                        onClick={() => handleDelete(provider.id)}
                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                    >
                                        <Trash2 size={14} />
                                        删除
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
                            {editingId ? '编辑提供商' : '添加提供商'}
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    名称
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    类型
                                </label>
                                <select
                                    value={formData.type}
                                    onChange={e => setFormData(f => ({ ...f, type: e.target.value as any }))}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-white"
                                >
                                    <option value="openai_compatible">OpenAI 兼容</option>
                                    <option value="gemini">Google Gemini</option>
                                    <option value="claude">Anthropic Claude</option>
                                    <option value="custom">自定义</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Base URL (可选)
                                </label>
                                <input
                                    type="text"
                                    value={formData.baseUrl}
                                    onChange={e => setFormData(f => ({ ...f, baseUrl: e.target.value }))}
                                    placeholder="https://api.example.com/v1"
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    能力
                                </label>
                                <div className="flex flex-wrap gap-3">
                                    {[
                                        { key: 'text', label: '文本' },
                                        { key: 'vision', label: '视觉' },
                                        { key: 'stream', label: '流式' },
                                        { key: 'tools', label: '工具调用' },
                                        { key: 'embedding', label: 'Embedding' }
                                    ].map(cap => (
                                        <label key={cap.key} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.capabilities[cap.key as keyof typeof formData.capabilities]}
                                                onChange={e => setFormData(f => ({
                                                    ...f,
                                                    capabilities: { ...f.capabilities, [cap.key]: e.target.checked }
                                                }))}
                                                className="rounded"
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">{cap.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    默认模型
                                </label>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        value={modelInput.id}
                                        onChange={e => setModelInput(m => ({ ...m, id: e.target.value }))}
                                        placeholder="模型 ID"
                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-white"
                                    />
                                    <input
                                        type="text"
                                        value={modelInput.name}
                                        onChange={e => setModelInput(m => ({ ...m, name: e.target.value }))}
                                        placeholder="显示名称"
                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-white"
                                    />
                                    <select
                                        value={modelInput.tier}
                                        onChange={e => setModelInput(m => ({ ...m, tier: e.target.value }))}
                                        className="px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-white"
                                    >
                                        <option value="free">Free</option>
                                        <option value="pro">Pro</option>
                                        <option value="ultra">Ultra</option>
                                    </select>
                                    <button
                                        onClick={addModel}
                                        className="px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    {formData.defaultModels.map((model, idx) => (
                                        <div key={idx} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-slate-900 rounded text-sm">
                                            <span className="text-gray-800 dark:text-white">
                                                {model.name} <span className="text-gray-500">({model.id})</span>
                                            </span>
                                            <button
                                                onClick={() => removeModel(idx)}
                                                className="text-red-500 hover:text-red-600"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.isActive}
                                    onChange={e => setFormData(f => ({ ...f, isActive: e.target.checked }))}
                                    className="rounded"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">启用</span>
                            </label>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setShowForm(false); setEditingId(null); }}
                                className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                            >
                                {editingId ? '保存' : '创建'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
