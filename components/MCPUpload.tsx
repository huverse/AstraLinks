/**
 * 用户 MCP 上传组件
 * 
 * @module components/MCPUpload
 * @description 允许用户上传自定义 MCP 配置
 */

import React, { useState, useCallback } from 'react';
import { Upload, Plug, X, Check, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { authFetch } from '../utils/api';

// ============================================
// 类型定义
// ============================================

interface MCPToolInput {
    name: string;
    type: string;
    description: string;
    required: boolean;
}

interface MCPToolDef {
    name: string;
    description: string;
    inputs: MCPToolInput[];
}

interface MCPUploadForm {
    name: string;
    description: string;
    version: string;
    connectionType: 'http' | 'stdio';
    url: string;
    command: string;
    args: string;
    tools: MCPToolDef[];
}

// ============================================
// 主组件
// ============================================

export function MCPUpload({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
    const [form, setForm] = useState<MCPUploadForm>({
        name: '',
        description: '',
        version: '1.0.0',
        connectionType: 'http',
        url: '',
        command: '',
        args: '',
        tools: [{ name: '', description: '', inputs: [] }],
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const updateField = useCallback(<K extends keyof MCPUploadForm>(key: K, value: MCPUploadForm[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
    }, []);

    const addTool = useCallback(() => {
        setForm(prev => ({
            ...prev,
            tools: [...prev.tools, { name: '', description: '', inputs: [] }],
        }));
    }, []);

    const removeTool = useCallback((index: number) => {
        setForm(prev => ({
            ...prev,
            tools: prev.tools.filter((_, i) => i !== index),
        }));
    }, []);

    const updateTool = useCallback((index: number, field: keyof MCPToolDef, value: any) => {
        setForm(prev => ({
            ...prev,
            tools: prev.tools.map((t, i) => i === index ? { ...t, [field]: value } : t),
        }));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const token = localStorage.getItem('galaxyous_token');

            // 构建 MCP 配置
            const mcpConfig = {
                name: form.name,
                description: form.description,
                version: form.version,
                providerType: 'custom',
                connection: form.connectionType === 'http'
                    ? { type: 'http', url: form.url }
                    : { type: 'stdio', command: form.command, args: form.args.split(' ').filter(Boolean) },
                tools: form.tools.filter(t => t.name).map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: {
                        type: 'object',
                        properties: Object.fromEntries(
                            t.inputs.map(i => [i.name, { type: i.type, description: i.description }])
                        ),
                        required: t.inputs.filter(i => i.required).map(i => i.name),
                    },
                })),
                permissions: [],
                metadata: {
                    author: 'user',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            };

            const result = await authFetch<{ success: boolean; error?: string }>('/api/mcp-registry', token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mcpConfig),
            });

            if (result.success) {
                setSuccess(true);
                setTimeout(() => {
                    onSuccess?.();
                    onClose();
                }, 1500);
            } else {
                setError(result.error || '上传失败');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check size={32} className="text-green-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">上传成功!</h3>
                    <p className="text-slate-400">MCP 已提交审核</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* 头部 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Upload size={20} className="text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">上传自定义 MCP</h2>
                            <p className="text-xs text-slate-400">配置您的 MCP 工具并提交审核</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                {/* 表单 */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">MCP 名称 *</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => updateField('name', e.target.value)}
                                required
                                placeholder="My Custom MCP"
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">版本</label>
                            <input
                                type="text"
                                value={form.version}
                                onChange={(e) => updateField('version', e.target.value)}
                                placeholder="1.0.0"
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">描述 *</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => updateField('description', e.target.value)}
                            required
                            rows={2}
                            placeholder="描述您的 MCP 功能..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500 resize-none"
                        />
                    </div>

                    {/* 连接方式 */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">连接方式</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={form.connectionType === 'http'}
                                    onChange={() => updateField('connectionType', 'http')}
                                    className="text-purple-500"
                                />
                                <span className="text-sm text-white">HTTP API</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={form.connectionType === 'stdio'}
                                    onChange={() => updateField('connectionType', 'stdio')}
                                    className="text-purple-500"
                                />
                                <span className="text-sm text-white">本地命令 (stdio)</span>
                            </label>
                        </div>
                    </div>

                    {form.connectionType === 'http' ? (
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">API URL *</label>
                            <input
                                type="url"
                                value={form.url}
                                onChange={(e) => updateField('url', e.target.value)}
                                required
                                placeholder="https://api.example.com/mcp"
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">命令 *</label>
                                <input
                                    type="text"
                                    value={form.command}
                                    onChange={(e) => updateField('command', e.target.value)}
                                    required
                                    placeholder="python"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">参数</label>
                                <input
                                    type="text"
                                    value={form.args}
                                    onChange={(e) => updateField('args', e.target.value)}
                                    placeholder="-m my_mcp_server"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                        </div>
                    )}

                    {/* 工具定义 */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm text-slate-400">工具列表</label>
                            <button
                                type="button"
                                onClick={addTool}
                                className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                            >
                                <Plus size={14} /> 添加工具
                            </button>
                        </div>
                        <div className="space-y-3">
                            {form.tools.map((tool, index) => (
                                <div key={index} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <Plug size={16} className="text-emerald-400 mt-2 shrink-0" />
                                        <div className="flex-1 grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                value={tool.name}
                                                onChange={(e) => updateTool(index, 'name', e.target.value)}
                                                placeholder="工具名称"
                                                className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-sm text-white"
                                            />
                                            <input
                                                type="text"
                                                value={tool.description}
                                                onChange={(e) => updateTool(index, 'description', e.target.value)}
                                                placeholder="工具描述"
                                                className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-sm text-white"
                                            />
                                        </div>
                                        {form.tools.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeTool(index)}
                                                className="p-1 text-slate-500 hover:text-red-400"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}
                </form>

                {/* 底部按钮 */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !form.name || !form.description}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                        {submitting ? '上传中...' : '提交审核'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default MCPUpload;
