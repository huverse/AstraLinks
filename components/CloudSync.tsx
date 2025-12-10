import React, { useState, useEffect } from 'react';
import { Cloud, Download, Upload, Trash2, RefreshCw, Check, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface CloudConfig {
    id: number;
    config_name: string;
    config_type: string;
    encrypted: boolean;
    created_at: string;
    updated_at: string;
}

interface CloudSyncProps {
    currentConfig: any;
    onLoadConfig: (config: any) => void;
    configType?: 'participant' | 'multimodal' | 'session';
}

// @ts-ignore - Vite env
const PROXY_API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

export default function CloudSync({ currentConfig, onLoadConfig, configType = 'participant' }: CloudSyncProps) {
    const { isAuthenticated, token } = useAuth();
    const [configs, setConfigs] = useState<CloudConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [configName, setConfigName] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (isAuthenticated && token) {
            loadConfigs();
        }
    }, [isAuthenticated, token]);

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
    };

    const loadConfigs = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(`${PROXY_API_BASE}/api/configs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setConfigs(data.configs || []);
            }
        } catch (err) {
            console.error('Failed to load configs:', err);
            showMessage('error', '加载云端配置失败');
        } finally {
            setLoading(false);
        }
    };

    const uploadConfig = async () => {
        if (!token || !currentConfig) return;
        if (!configName.trim()) {
            showMessage('error', '请输入配置名称');
            return;
        }

        setSaving(true);
        try {
            const response = await fetch(`${PROXY_API_BASE}/api/configs/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    config_name: configName,
                    config_data: currentConfig,
                    config_type: configType,
                    encrypted: false
                })
            });

            if (response.ok) {
                showMessage('success', '配置已保存到云端');
                setConfigName('');
                loadConfigs();
            } else {
                const error = await response.json();
                showMessage('error', error.error || '保存失败');
            }
        } catch (err) {
            console.error('Failed to upload config:', err);
            showMessage('error', '上传失败');
        } finally {
            setSaving(false);
        }
    };

    const downloadConfig = async (id: number) => {
        if (!token) return;
        try {
            const response = await fetch(`${PROXY_API_BASE}/api/configs/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                const configData = typeof data.config_data === 'string'
                    ? JSON.parse(data.config_data)
                    : data.config_data;
                onLoadConfig(configData);
                showMessage('success', '配置已加载');
            }
        } catch (err) {
            console.error('Failed to download config:', err);
            showMessage('error', '下载失败');
        }
    };

    const deleteConfig = async (id: number) => {
        if (!token) return;
        if (!window.confirm('确定删除此配置？')) return;

        try {
            const response = await fetch(`${PROXY_API_BASE}/api/configs/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                showMessage('success', '配置已删除');
                loadConfigs();
            }
        } catch (err) {
            console.error('Failed to delete config:', err);
            showMessage('error', '删除失败');
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                    <AlertCircle size={18} />
                    <span className="text-sm">登录后可使用云端同步功能</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Cloud size={20} className="text-blue-500" />
                    云端配置同步
                </h3>
                <button
                    onClick={loadConfigs}
                    disabled={loading}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${message.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                    {message.type === 'success' ? <Check size={16} /> : <X size={16} />}
                    <span className="text-sm">{message.text}</span>
                </div>
            )}

            {/* Upload Section */}
            <div className="p-4 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl space-y-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">上传当前配置</h4>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={configName}
                        onChange={(e) => setConfigName(e.target.value)}
                        placeholder="配置名称..."
                        className="flex-1 px-3 py-2 border border-gray-200 dark:border-white/20 bg-white dark:bg-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        onClick={uploadConfig}
                        disabled={saving || !configName.trim()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2 text-sm"
                    >
                        <Upload size={16} />
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>

            {/* Configs List */}
            <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">云端配置列表</h4>
                {loading ? (
                    <div className="text-center py-4 text-gray-400 dark:text-gray-500">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                        加载中...
                    </div>
                ) : configs.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                        <Cloud size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">暂无云端配置</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {configs.map((config) => (
                            <div
                                key={config.id}
                                className="flex items-center justify-between p-3 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl hover:shadow-sm dark:hover:bg-white/10 transition-all"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{config.config_name}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                        {new Date(config.updated_at).toLocaleString('zh-CN')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                    <button
                                        onClick={() => downloadConfig(config.id)}
                                        className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/20 rounded-lg transition-colors"
                                        title="加载此配置"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <button
                                        onClick={() => deleteConfig(config.id)}
                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-lg transition-colors"
                                        title="删除"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
