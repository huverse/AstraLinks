/**
 * 告警配置面板
 * 
 * @module components/workflow/AlertConfigPanel
 * @description 配置工作流失败告警：邮件通知、微信通知
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Mail, MessageCircle, X, Save, Loader2, Check, AlertTriangle, Trash2 } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface AlertConfig {
    id?: string;
    enabled: boolean;
    emailEnabled: boolean;
    emailRecipients: string[];
    webhookEnabled: boolean;
    webhookUrl: string;
    triggerOn: ('failed' | 'completed' | 'cancelled')[];
    cooldownMinutes: number;
}

interface AlertConfigPanelProps {
    workflowId: string;
    isOpen: boolean;
    onClose: () => void;
}

// ============================================
// API 辅助函数
// ============================================

const getApiBase = () => {
    if (typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz') {
        return 'https://astralinks.xyz';
    }
    return 'http://localhost:3001';
};

const getToken = () => {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('galaxyous_token');
    }
    return null;
};

// ============================================
// 默认配置
// ============================================

const defaultConfig: AlertConfig = {
    enabled: false,
    emailEnabled: false,
    emailRecipients: [],
    webhookEnabled: false,
    webhookUrl: '',
    triggerOn: ['failed'],
    cooldownMinutes: 30,
};

// ============================================
// 组件
// ============================================

export function AlertConfigPanel({ workflowId, isOpen, onClose }: AlertConfigPanelProps) {
    const [config, setConfig] = useState<AlertConfig>(defaultConfig);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [newEmail, setNewEmail] = useState('');

    // 获取告警配置
    const fetchConfig = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(
                `${getApiBase()}/api/workflows/${workflowId}/alerts/config`,
                { headers: { 'Authorization': `Bearer ${getToken()}` } }
            );

            if (response.ok) {
                const data = await response.json();
                if (data.config) {
                    setConfig({ ...defaultConfig, ...data.config });
                }
            }
        } catch (err: any) {
            console.log('No alert config yet');
        } finally {
            setLoading(false);
        }
    }, [workflowId]);

    useEffect(() => {
        if (isOpen && workflowId) {
            fetchConfig();
        }
    }, [isOpen, workflowId, fetchConfig]);

    // 保存配置
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const response = await fetch(
                `${getApiBase()}/api/workflows/${workflowId}/alerts/config`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`,
                    },
                    body: JSON.stringify(config),
                }
            );

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '保存失败');
            }

            setSuccess('告警配置已保存');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // 添加邮箱
    const addEmail = () => {
        if (!newEmail.trim() || !newEmail.includes('@')) return;
        if (config.emailRecipients.includes(newEmail.trim())) return;
        setConfig(prev => ({
            ...prev,
            emailRecipients: [...prev.emailRecipients, newEmail.trim()],
        }));
        setNewEmail('');
    };

    // 移除邮箱
    const removeEmail = (email: string) => {
        setConfig(prev => ({
            ...prev,
            emailRecipients: prev.emailRecipients.filter(e => e !== email),
        }));
    };

    // 切换触发条件
    const toggleTrigger = (trigger: 'failed' | 'completed' | 'cancelled') => {
        setConfig(prev => ({
            ...prev,
            triggerOn: prev.triggerOn.includes(trigger)
                ? prev.triggerOn.filter(t => t !== trigger)
                : [...prev.triggerOn, trigger],
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
                {/* 头部 */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Bell className="text-orange-400" size={20} />
                        <h2 className="text-lg font-bold text-white">告警配置</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* 消息提示 */}
                {(error || success) && (
                    <div className={`px-4 py-2 text-sm ${error ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                        {error || success}
                    </div>
                )}

                {/* 内容区 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="animate-spin text-orange-400" size={24} />
                        </div>
                    ) : (
                        <>
                            {/* 启用开关 */}
                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                                <div>
                                    <div className="font-medium text-white">启用告警</div>
                                    <div className="text-xs text-slate-500">开启后将发送失败通知</div>
                                </div>
                                <button
                                    onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                                    className={`w-12 h-6 rounded-full transition-colors ${config.enabled ? 'bg-orange-500' : 'bg-slate-700'
                                        }`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-0.5'
                                        }`} />
                                </button>
                            </div>

                            {/* 触发条件 */}
                            <div className="p-3 bg-white/5 rounded-xl">
                                <div className="font-medium text-white mb-2">触发条件</div>
                                <div className="flex gap-2">
                                    {[
                                        { key: 'failed' as const, label: '执行失败', color: 'red' },
                                        { key: 'completed' as const, label: '执行完成', color: 'green' },
                                        { key: 'cancelled' as const, label: '被取消', color: 'yellow' },
                                    ].map(({ key, label, color }) => (
                                        <button
                                            key={key}
                                            onClick={() => toggleTrigger(key)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${config.triggerOn.includes(key)
                                                    ? `bg-${color}-500/30 text-${color}-400 border border-${color}-500/50`
                                                    : 'bg-white/5 text-slate-400 border border-white/10'
                                                }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 邮件通知 */}
                            <div className="p-3 bg-white/5 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Mail size={16} className="text-blue-400" />
                                        <span className="font-medium text-white">邮件通知</span>
                                    </div>
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, emailEnabled: !prev.emailEnabled }))}
                                        className={`w-10 h-5 rounded-full transition-colors ${config.emailEnabled ? 'bg-blue-500' : 'bg-slate-700'
                                            }`}
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${config.emailEnabled ? 'translate-x-5' : 'translate-x-0.5'
                                            }`} />
                                    </button>
                                </div>

                                {config.emailEnabled && (
                                    <>
                                        <div className="flex gap-2">
                                            <input
                                                type="email"
                                                value={newEmail}
                                                onChange={e => setNewEmail(e.target.value)}
                                                placeholder="添加邮箱..."
                                                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                                                onKeyDown={e => e.key === 'Enter' && addEmail()}
                                            />
                                            <button
                                                onClick={addEmail}
                                                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
                                            >
                                                添加
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {config.emailRecipients.map(email => (
                                                <div key={email} className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-xs">
                                                    <span>{email}</span>
                                                    <button onClick={() => removeEmail(email)} className="hover:text-white">
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Webhook 通知 */}
                            <div className="p-3 bg-white/5 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <MessageCircle size={16} className="text-green-400" />
                                        <span className="font-medium text-white">Webhook 通知</span>
                                    </div>
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, webhookEnabled: !prev.webhookEnabled }))}
                                        className={`w-10 h-5 rounded-full transition-colors ${config.webhookEnabled ? 'bg-green-500' : 'bg-slate-700'
                                            }`}
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${config.webhookEnabled ? 'translate-x-5' : 'translate-x-0.5'
                                            }`} />
                                    </button>
                                </div>

                                {config.webhookEnabled && (
                                    <input
                                        type="url"
                                        value={config.webhookUrl}
                                        onChange={e => setConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                                        placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                                    />
                                )}
                            </div>

                            {/* 冷却时间 */}
                            <div className="p-3 bg-white/5 rounded-xl">
                                <div className="font-medium text-white mb-2">告警冷却时间</div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        max="1440"
                                        value={config.cooldownMinutes}
                                        onChange={e => setConfig(prev => ({ ...prev, cooldownMinutes: parseInt(e.target.value) || 30 }))}
                                        className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-center focus:outline-none focus:border-orange-500"
                                    />
                                    <span className="text-sm text-slate-400">分钟 (同一工作流不重复发送)</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* 底部保存按钮 */}
                <div className="p-4 border-t border-white/10 shrink-0">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        <span>保存配置</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AlertConfigPanel;
