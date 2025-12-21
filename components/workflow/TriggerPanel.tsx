/**
 * 触发器配置面板
 * 
 * @module components/workflow/TriggerPanel
 * @description 工作流触发器管理 - Webhook 和定时任务
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Webhook,
    Clock,
    Plus,
    Trash2,
    Copy,
    Check,
    AlertCircle,
    Loader2,
    RefreshCw,
    History,
    Play,
    Pause
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface Trigger {
    id: string;
    workflowId: string;
    type: 'webhook' | 'schedule';
    name: string;
    webhookToken?: string;
    webhookUrl?: string;
    cronExpression?: string;
    timezone?: string;
    isActive: boolean;
    triggerCount: number;
    lastTriggeredAt?: string;
    lastError?: string;
}

interface TriggerHistory {
    id: string;
    triggerId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    input?: any;
    output?: any;
    error?: string;
    duration?: number;
    triggeredAt: string;
}

interface TriggerPanelProps {
    workflowId: string;
    onClose?: () => void;
}

// ============================================
// API 辅助函数
// ============================================

const getApiBase = () => {
    return typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
        ? 'https://astralinks.xyz'
        : 'http://localhost:3001';
};

const getAuthHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('galaxyous_token') : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
    };
};

// ============================================
// 常用 Cron 表达式
// ============================================

const CRON_PRESETS = [
    { label: '每分钟', value: '* * * * *' },
    { label: '每小时', value: '0 * * * *' },
    { label: '每天 9:00', value: '0 9 * * *' },
    { label: '每天 18:00', value: '0 18 * * *' },
    { label: '每周一 9:00', value: '0 9 * * 1' },
    { label: '每月1号 9:00', value: '0 9 1 * *' },
];

// ============================================
// 主组件
// ============================================

export function TriggerPanel({ workflowId, onClose }: TriggerPanelProps) {
    const [triggers, setTriggers] = useState<Trigger[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newTriggerType, setNewTriggerType] = useState<'webhook' | 'schedule'>('webhook');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // 创建表单状态
    const [newTriggerName, setNewTriggerName] = useState('');
    const [newCronExpression, setNewCronExpression] = useState('0 9 * * *');

    // 获取触发器列表
    const fetchTriggers = useCallback(async () => {
        try {
            const response = await fetch(
                `${getApiBase()}/api/webhooks/triggers?workflowId=${workflowId}`,
                { headers: getAuthHeaders() }
            );
            if (response.ok) {
                const data = await response.json();
                // 为 webhook 类型构建完整的 URL
                const triggersWithUrls = (data.triggers || []).map((t: any) => ({
                    ...t,
                    webhookUrl: t.webhookToken
                        ? `${getApiBase()}/api/webhooks/${t.webhookToken}/trigger`
                        : undefined
                }));
                setTriggers(triggersWithUrls);
            }
        } catch (error) {
            console.error('[TriggerPanel] Fetch error:', error);
        } finally {
            setLoading(false);
        }
    }, [workflowId]);

    useEffect(() => {
        fetchTriggers();
    }, [fetchTriggers]);

    // 创建触发器
    const handleCreate = async () => {
        if (!newTriggerName.trim()) return;

        setCreating(true);
        try {
            const response = await fetch(`${getApiBase()}/api/webhooks/triggers`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    workflowId,
                    type: newTriggerType,
                    name: newTriggerName,
                    cronExpression: newTriggerType === 'schedule' ? newCronExpression : undefined,
                }),
            });

            if (response.ok) {
                setShowCreateForm(false);
                setNewTriggerName('');
                await fetchTriggers();
            } else {
                const error = await response.json();
                alert(`创建失败: ${error.error}`);
            }
        } catch (error) {
            console.error('[TriggerPanel] Create error:', error);
            alert('创建失败');
        } finally {
            setCreating(false);
        }
    };

    // 切换激活状态
    const toggleActive = async (trigger: Trigger) => {
        try {
            const response = await fetch(
                `${getApiBase()}/api/webhooks/triggers/${trigger.id}`,
                {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ isActive: !trigger.isActive }),
                }
            );

            if (response.ok) {
                setTriggers(prev =>
                    prev.map(t =>
                        t.id === trigger.id ? { ...t, isActive: !t.isActive } : t
                    )
                );
            }
        } catch (error) {
            console.error('[TriggerPanel] Toggle error:', error);
        }
    };

    // 删除触发器
    const handleDelete = async (triggerId: string) => {
        if (!confirm('确定要删除这个触发器吗？')) return;

        try {
            const response = await fetch(
                `${getApiBase()}/api/webhooks/triggers/${triggerId}`,
                {
                    method: 'DELETE',
                    headers: getAuthHeaders(),
                }
            );

            if (response.ok) {
                setTriggers(prev => prev.filter(t => t.id !== triggerId));
            }
        } catch (error) {
            console.error('[TriggerPanel] Delete error:', error);
        }
    };

    // 复制 URL
    const copyToClipboard = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (error) {
            console.error('[TriggerPanel] Copy error:', error);
        }
    };

    return (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Webhook size={16} className="text-purple-400" />
                    触发器管理
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchTriggers}
                        className="p-1.5 text-slate-400 hover:text-white transition-colors"
                        title="刷新"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                    >
                        <Plus size={12} />
                        添加触发器
                    </button>
                </div>
            </div>

            {/* 创建表单 */}
            {showCreateForm && (
                <div className="p-4 border-b border-slate-700 bg-slate-900/50">
                    <div className="space-y-3">
                        {/* 类型选择 */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setNewTriggerType('webhook')}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${newTriggerType === 'webhook'
                                        ? 'border-purple-500 bg-purple-600/20 text-white'
                                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                                    }`}
                            >
                                <Webhook size={16} />
                                <span className="text-sm">Webhook</span>
                            </button>
                            <button
                                onClick={() => setNewTriggerType('schedule')}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${newTriggerType === 'schedule'
                                        ? 'border-purple-500 bg-purple-600/20 text-white'
                                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                                    }`}
                            >
                                <Clock size={16} />
                                <span className="text-sm">定时任务</span>
                            </button>
                        </div>

                        {/* 名称 */}
                        <input
                            type="text"
                            value={newTriggerName}
                            onChange={(e) => setNewTriggerName(e.target.value)}
                            placeholder="触发器名称"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                        />

                        {/* Cron 表达式 (仅定时任务) */}
                        {newTriggerType === 'schedule' && (
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Cron 表达式</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newCronExpression}
                                        onChange={(e) => setNewCronExpression(e.target.value)}
                                        placeholder="0 9 * * *"
                                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                                    />
                                    <select
                                        onChange={(e) => setNewCronExpression(e.target.value)}
                                        className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="">预设...</option>
                                        {CRON_PRESETS.map((preset) => (
                                            <option key={preset.value} value={preset.value}>
                                                {preset.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* 按钮 */}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setShowCreateForm(false)}
                                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={creating || !newTriggerName.trim()}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50"
                            >
                                {creating && <Loader2 size={12} className="animate-spin" />}
                                创建
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 触发器列表 */}
            <div className="max-h-80 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={24} className="animate-spin text-slate-400" />
                    </div>
                ) : triggers.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-sm">
                        <Webhook size={32} className="mx-auto mb-2 opacity-50" />
                        <p>暂无触发器</p>
                        <p className="text-xs mt-1">添加 Webhook 或定时任务来自动执行工作流</p>
                    </div>
                ) : (
                    triggers.map((trigger) => (
                        <div
                            key={trigger.id}
                            className="p-3 border-b border-slate-700/50 hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    {/* 名称和类型 */}
                                    <div className="flex items-center gap-2">
                                        {trigger.type === 'webhook' ? (
                                            <Webhook size={14} className="text-green-400 shrink-0" />
                                        ) : (
                                            <Clock size={14} className="text-blue-400 shrink-0" />
                                        )}
                                        <span className="text-sm text-white font-medium truncate">
                                            {trigger.name}
                                        </span>
                                        {!trigger.isActive && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded">
                                                已暂停
                                            </span>
                                        )}
                                    </div>

                                    {/* Webhook URL */}
                                    {trigger.type === 'webhook' && trigger.webhookUrl && (
                                        <div className="mt-1 flex items-center gap-1">
                                            <code className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">
                                                {trigger.webhookUrl}
                                            </code>
                                            <button
                                                onClick={() => copyToClipboard(trigger.webhookUrl!, trigger.id)}
                                                className="p-0.5 text-slate-500 hover:text-white transition-colors"
                                                title="复制 URL"
                                            >
                                                {copiedId === trigger.id ? (
                                                    <Check size={12} className="text-green-400" />
                                                ) : (
                                                    <Copy size={12} />
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {/* Cron 表达式 */}
                                    {trigger.type === 'schedule' && trigger.cronExpression && (
                                        <div className="mt-1">
                                            <code className="text-[10px] text-slate-400 font-mono">
                                                {trigger.cronExpression}
                                            </code>
                                        </div>
                                    )}

                                    {/* 统计 */}
                                    <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
                                        <span>触发 {trigger.triggerCount} 次</span>
                                        {trigger.lastTriggeredAt && (
                                            <span>
                                                上次: {new Date(trigger.lastTriggeredAt).toLocaleString()}
                                            </span>
                                        )}
                                    </div>

                                    {/* 错误 */}
                                    {trigger.lastError && (
                                        <div className="mt-1 flex items-center gap-1 text-[10px] text-red-400">
                                            <AlertCircle size={10} />
                                            <span className="truncate">{trigger.lastError}</span>
                                        </div>
                                    )}
                                </div>

                                {/* 操作按钮 */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => toggleActive(trigger)}
                                        className={`p-1.5 rounded transition-colors ${trigger.isActive
                                                ? 'text-green-400 hover:bg-green-600/20'
                                                : 'text-slate-500 hover:bg-slate-700'
                                            }`}
                                        title={trigger.isActive ? '暂停' : '启用'}
                                    >
                                        {trigger.isActive ? <Pause size={14} /> : <Play size={14} />}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(trigger.id)}
                                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-600/20 rounded transition-colors"
                                        title="删除"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 底部提示 */}
            <div className="px-4 py-2 border-t border-slate-700 bg-slate-900/50">
                <p className="text-[10px] text-slate-500">
                    💡 Webhook 可被外部系统调用 | 定时任务使用 Cron 表达式
                </p>
            </div>
        </div>
    );
}

export default TriggerPanel;
