import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Cloud, Download, Lock, Crown, Zap, AlertTriangle, X, Check } from 'lucide-react';

interface ConfigTemplate {
    id: number;
    name: string;
    description: string;
    tier_required: 'free' | 'pro' | 'ultra';
    token_limit: number;
    download_count: number;
    accessible: boolean;
}

interface UserTierInfo {
    tier: 'free' | 'pro' | 'ultra';
    monthlyTokenUsage: number;
    tokenLimit: number;
}

interface ImportValidation {
    valid: any[];
    restricted: any[];
    hasRestrictions: boolean;
    userTier: string;
}

interface CloudConfigSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectTemplate: (configData: any) => void;
    onValidateImport?: (configData: any) => Promise<ImportValidation>;
}

const PROXY_API_BASE = (import.meta as any).env?.VITE_PROXY_API_BASE || 'http://localhost:3001';

const tierColors = {
    free: 'from-green-400 to-emerald-500',
    pro: 'from-blue-400 to-indigo-500',
    ultra: 'from-purple-400 to-pink-500'
};

const tierIcons = {
    free: Zap,
    pro: Crown,
    ultra: Crown
};

const tierLabels = {
    free: 'Free',
    pro: 'Pro',
    ultra: 'Ultra'
};

export default function CloudConfigSelector({ isOpen, onClose, onSelectTemplate }: CloudConfigSelectorProps) {
    const { token, isAuthenticated } = useAuth();
    const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
    const [userTier, setUserTier] = useState<UserTierInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Import validation state
    const [validationResult, setValidationResult] = useState<ImportValidation | null>(null);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [pendingConfig, setPendingConfig] = useState<any>(null);

    useEffect(() => {
        if (isOpen && isAuthenticated) {
            loadData();
        }
    }, [isOpen, isAuthenticated]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [templatesRes, tierRes] = await Promise.all([
                fetch(`${PROXY_API_BASE}/api/config-templates/available`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${PROXY_API_BASE}/api/config-templates/user-tier`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            if (templatesRes.ok) {
                const data = await templatesRes.json();
                setTemplates(data.templates || []);
            }

            if (tierRes.ok) {
                const data = await tierRes.json();
                setUserTier(data);
            }
        } catch (err) {
            setError('加载失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (template: ConfigTemplate) => {
        if (!template.accessible) {
            return; // Can't download inaccessible templates
        }

        setDownloading(template.id);
        try {
            const res = await fetch(`${PROXY_API_BASE}/api/config-templates/${template.id}/download`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                const data = await res.json();
                if (data.requiredTier) {
                    setError(`需要升级到 ${tierLabels[data.requiredTier as keyof typeof tierLabels]} 等级`);
                } else {
                    setError(data.error || '下载失败');
                }
                return;
            }

            const data = await res.json();
            onSelectTemplate(data.template.config_data);
            onClose();
        } catch (err) {
            setError('下载失败，请稍后重试');
        } finally {
            setDownloading(null);
        }
    };

    const validateAndImport = async (configData: any) => {
        try {
            const res = await fetch(`${PROXY_API_BASE}/api/config-templates/validate-import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ config_data: configData })
            });

            if (!res.ok) {
                throw new Error('验证失败');
            }

            const result: ImportValidation = await res.json();

            if (result.hasRestrictions) {
                setValidationResult(result);
                setPendingConfig(configData);
                setShowValidationModal(true);
            } else {
                onSelectTemplate(configData);
                onClose();
            }
        } catch (err) {
            setError('配置验证失败');
        }
    };

    const handleImportFiltered = () => {
        if (validationResult && validationResult.valid.length > 0) {
            onSelectTemplate(validationResult.valid);
            setShowValidationModal(false);
            setValidationResult(null);
            setPendingConfig(null);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                            <Cloud className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">云端配置</h2>
                            {userTier && (
                                <p className="text-sm text-slate-500">
                                    当前等级: <span className={`font-semibold bg-gradient-to-r ${tierColors[userTier.tier]} bg-clip-text text-transparent`}>
                                        {tierLabels[userTier.tier]}
                                    </span>
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {error && (
                        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg flex items-center gap-2">
                            <AlertTriangle size={18} />
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                            <p className="text-slate-500">加载中...</p>
                        </div>
                    ) : templates.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            暂无可用配置模板
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {templates.map(template => {
                                const TierIcon = tierIcons[template.tier_required];
                                const isAccessible = template.accessible;

                                return (
                                    <div
                                        key={template.id}
                                        className={`relative p-5 rounded-xl border-2 transition-all ${isAccessible
                                                ? 'border-slate-200 dark:border-slate-600 hover:border-blue-400 hover:shadow-lg cursor-pointer'
                                                : 'border-slate-100 dark:border-slate-700 opacity-60 cursor-not-allowed'
                                            }`}
                                        onClick={() => isAccessible && handleDownload(template)}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h3 className="font-semibold text-lg">{template.name}</h3>
                                                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r ${tierColors[template.tier_required]} text-white`}>
                                                        <TierIcon size={12} />
                                                        {tierLabels[template.tier_required]}
                                                    </span>
                                                </div>
                                                {template.description && (
                                                    <p className="text-sm text-slate-500 mb-2">{template.description}</p>
                                                )}
                                                <div className="flex items-center gap-4 text-xs text-slate-400">
                                                    <span className="flex items-center gap-1">
                                                        <Download size={12} />
                                                        {template.download_count} 次下载
                                                    </span>
                                                    {template.token_limit > 0 && (
                                                        <span>Token限额: {template.token_limit.toLocaleString()}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="ml-4">
                                                {isAccessible ? (
                                                    <button
                                                        disabled={downloading === template.id}
                                                        className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                                                    >
                                                        {downloading === template.id ? (
                                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <Download size={20} />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-xl">
                                                        <Lock size={20} className="text-slate-400" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {!isAccessible && (
                                            <div className="absolute inset-0 bg-gradient-to-r from-slate-50/80 to-white/80 dark:from-slate-800/80 dark:to-slate-900/80 rounded-xl flex items-center justify-center">
                                                <span className="text-sm font-medium text-slate-500">
                                                    需升级至 {tierLabels[template.tier_required]} 等级
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <p className="text-center text-xs text-slate-400">
                        升级账户解锁更多高级配置模板
                    </p>
                </div>
            </div>

            {/* Validation Modal */}
            {showValidationModal && validationResult && (
                <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
                        <div className="flex items-center gap-3 mb-4 text-amber-500">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-bold">配置包含高级内容</h3>
                        </div>

                        <p className="text-slate-600 dark:text-slate-300 mb-4">
                            此配置文件包含 {validationResult.restricted.length} 个需要更高等级的模型配置：
                        </p>

                        <ul className="mb-6 space-y-2 max-h-40 overflow-y-auto">
                            {validationResult.restricted.map((item: any, i: number) => (
                                <li key={i} className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                                    <Lock size={14} />
                                    {item.name || item.config?.modelName || '未知模型'} - {item.restrictedReason}
                                </li>
                            ))}
                        </ul>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowValidationModal(false);
                                    setValidationResult(null);
                                    setPendingConfig(null);
                                }}
                                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                取消导入
                            </button>
                            <button
                                onClick={handleImportFiltered}
                                disabled={validationResult.valid.length === 0}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Check size={16} />
                                保留可用内容 ({validationResult.valid.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
