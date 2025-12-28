/**
 * 隔离模式云端同步组件
 *
 * 支持会话配置的云端上传/下载
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Cloud, Upload, Download, Trash2, Loader2, RefreshCw, Check } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { Agent, Scenario } from './types';

interface IsolationCloudSyncProps {
    token: string | null;
    currentConfig: {
        scenarioId?: string;
        agents: Agent[];
        topic?: string;
    };
    onLoadConfig: (config: {
        scenarioId: string;
        agents: Agent[];
        topic?: string;
    }) => void;
}

interface CloudConfig {
    id: number;
    config_name: string;
    config_type: string;
    created_at: string;
    updated_at: string;
}

export const IsolationCloudSync: React.FC<IsolationCloudSyncProps> = ({
    token,
    currentConfig,
    onLoadConfig
}) => {
    const [configs, setConfigs] = useState<CloudConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [downloadingId, setDownloadingId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [configName, setConfigName] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
    };

    const loadConfigs = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/configs?type=isolation`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setConfigs(data.data || []);
            }
        } catch (e) {
            console.error('Failed to load configs', e);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadConfigs();
    }, [loadConfigs]);

    const handleUpload = async () => {
        if (!token || !configName.trim()) {
            showMessage('error', '请输入配置名称');
            return;
        }

        setUploading(true);
        try {
            const response = await fetch(`${API_BASE}/api/configs/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    config_name: configName.trim(),
                    config_type: 'isolation',
                    config_data: {
                        scenarioId: currentConfig.scenarioId,
                        agents: currentConfig.agents.map(a => ({
                            id: a.id,
                            name: a.name,
                            role: a.role,
                            stance: a.stance,
                            systemPrompt: a.systemPrompt,
                            personality: a.personality,
                            agentLlmConfig: a.agentLlmConfig,
                        })),
                        topic: currentConfig.topic,
                    },
                }),
            });

            if (response.ok) {
                showMessage('success', '配置已上传');
                setConfigName('');
                loadConfigs();
            } else {
                const data = await response.json();
                showMessage('error', data.error || '上传失败');
            }
        } catch (e) {
            showMessage('error', '上传失败');
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (id: number) => {
        if (!token) return;
        setDownloadingId(id);
        try {
            const response = await fetch(`${API_BASE}/api/configs/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                const configData = data.data?.config_data;
                if (configData) {
                    onLoadConfig({
                        scenarioId: configData.scenarioId || 'debate',
                        agents: configData.agents || [],
                        topic: configData.topic,
                    });
                    showMessage('success', '配置已加载');
                }
            } else {
                showMessage('error', '下载失败');
            }
        } catch (e) {
            showMessage('error', '下载失败');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleDelete = async (id: number) => {
        if (!token) return;
        const confirmed = window.confirm('确定删除此配置？');
        if (!confirmed) return;

        setDeletingId(id);
        try {
            const response = await fetch(`${API_BASE}/api/configs/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                showMessage('success', '配置已删除');
                loadConfigs();
            } else {
                showMessage('error', '删除失败');
            }
        } catch (e) {
            showMessage('error', '删除失败');
        } finally {
            setDeletingId(null);
        }
    };

    if (!token) {
        return (
            <div className="text-xs text-slate-500 text-center py-4">
                登录后可使用云端同步
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Cloud size={12} />
                    云端同步
                </h4>
                <button
                    onClick={loadConfigs}
                    disabled={loading}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white disabled:opacity-50"
                    title="刷新"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* 消息提示 */}
            {message && (
                <div className={`text-xs px-2 py-1 rounded ${
                    message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                    {message.text}
                </div>
            )}

            {/* 上传区域 */}
            <div className="space-y-2">
                <input
                    type="text"
                    value={configName}
                    onChange={e => setConfigName(e.target.value)}
                    placeholder="配置名称..."
                    className="w-full px-2 py-1.5 bg-slate-900/60 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none"
                />
                <button
                    onClick={handleUpload}
                    disabled={uploading || !configName.trim()}
                    className="w-full py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                    {uploading ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <Upload size={14} />
                    )}
                    上传当前配置
                </button>
            </div>

            {/* 配置列表 */}
            <div className="space-y-2 max-h-40 overflow-y-auto">
                {configs.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-2">
                        {loading ? '加载中...' : '暂无云端配置'}
                    </div>
                ) : (
                    configs.map(config => (
                        <div
                            key={config.id}
                            className="flex items-center justify-between p-2 bg-slate-900/40 rounded-lg"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-xs text-white truncate">{config.config_name}</div>
                                <div className="text-[10px] text-slate-500">
                                    {new Date(config.updated_at).toLocaleDateString()}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleDownload(config.id)}
                                    disabled={downloadingId === config.id}
                                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-green-400 disabled:opacity-50"
                                    title="加载"
                                >
                                    {downloadingId === config.id ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <Download size={12} />
                                    )}
                                </button>
                                <button
                                    onClick={() => handleDelete(config.id)}
                                    disabled={deletingId === config.id}
                                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-red-400 disabled:opacity-50"
                                    title="删除"
                                >
                                    {deletingId === config.id ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <Trash2 size={12} />
                                    )}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
