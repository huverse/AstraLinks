import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { Plus, Edit, Trash2, Eye, EyeOff, Download, Upload, FileCode, Shield, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';

interface ConfigTemplate {
    id: number;
    name: string;
    description: string;
    config_data: any[];
    tier_required: 'free' | 'pro' | 'ultra';
    allowed_models: string[] | null;
    token_limit: number;
    is_active: boolean;
    download_count: number;
    created_at: string;
    created_by_username: string;
    template_type?: 'participant' | 'multimodal';
}

interface ModelTier {
    id: number;
    model_pattern: string;
    tier: 'free' | 'pro' | 'ultra';
    description: string;
}

interface ParticipantForm {
    id: string;
    name: string;
    provider: 'GEMINI' | 'OPENAI_COMPATIBLE';
    modelName: string;
    apiKey: string;
    baseUrl: string;
    temperature: number;
    enabled: boolean;
    systemInstruction: string;
}

const defaultParticipant: ParticipantForm = {
    id: '',
    name: '',
    provider: 'GEMINI',
    modelName: '',
    apiKey: '',
    baseUrl: '',
    temperature: 1.0,
    enabled: true,
    systemInstruction: ''
};

const tierColors = {
    free: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    pro: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    ultra: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
};

const tierLabels = {
    free: 'Free',
    pro: 'Pro',
    ultra: 'Ultra'
};

export default function ConfigTemplates() {
    const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
    const [modelTiers, setModelTiers] = useState<ModelTier[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'templates' | 'tiers'>('templates');
    const [templateTypeFilter, setTemplateTypeFilter] = useState<'participant' | 'multimodal'>('participant');
    const [showEditor, setShowEditor] = useState(false);
    const [editingItem, setEditingItem] = useState<ConfigTemplate | null>(null);

    // Template form state
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formTier, setFormTier] = useState<'free' | 'pro' | 'ultra'>('free');
    const [formTokenLimit, setFormTokenLimit] = useState(0);
    const [formIsActive, setFormIsActive] = useState(true);
    const [formTemplateType, setFormTemplateType] = useState<'participant' | 'multimodal'>('participant');
    const [formParticipants, setFormParticipants] = useState<ParticipantForm[]>([]);
    const [expandedParticipant, setExpandedParticipant] = useState<number | null>(null);

    // Multimodal form state
    const [formMultimodal, setFormMultimodal] = useState({
        provider: 'GEMINI' as 'GEMINI' | 'OPENAI_COMPATIBLE',
        apiKey: '',
        baseUrl: '',
        modelName: '',
        customModels: [] as string[]
    });

    // Model tier form
    const [tierForm, setTierForm] = useState<{
        model_pattern: string;
        tier: 'free' | 'pro' | 'ultra';
        description: string;
    }>({
        model_pattern: '',
        tier: 'free',
        description: ''
    });
    const [showTierEditor, setShowTierEditor] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [templatesData, tiersData] = await Promise.all([
                adminAPI.getConfigTemplates(),
                adminAPI.getModelTiers()
            ]);
            setTemplates(templatesData.templates || []);
            setModelTiers(tiersData.tiers || []);
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const resetForm = () => {
        setFormName('');
        setFormDescription('');
        setFormTier('free');
        setFormTokenLimit(0);
        setFormIsActive(true);
        setFormTemplateType(templateTypeFilter);
        setFormParticipants([]);
        setFormMultimodal({ provider: 'GEMINI', apiKey: '', baseUrl: '', modelName: '', customModels: [] });
        setExpandedParticipant(null);
        setEditingItem(null);
    };

    const openEditor = (item?: ConfigTemplate) => {
        if (item) {
            setEditingItem(item);
            setFormName(item.name);
            setFormDescription(item.description || '');
            setFormTier(item.tier_required);
            setFormTokenLimit(item.token_limit);
            setFormIsActive(item.is_active);
            setFormTemplateType(item.template_type || 'participant');

            if (item.template_type === 'multimodal') {
                // Load multimodal config
                const config = item.config_data as any;
                setFormMultimodal({
                    provider: config?.provider || 'GEMINI',
                    apiKey: config?.apiKey || '',
                    baseUrl: config?.baseUrl || '',
                    modelName: config?.modelName || '',
                    customModels: config?.customModels || []
                });
                setFormParticipants([]);
            } else {
                // Load participant configs
                const configData = Array.isArray(item.config_data) ? item.config_data : [];
                setFormParticipants(configData.map((p: any, idx: number) => ({
                    id: p.id || `participant-${idx}`,
                    name: p.name || '',
                    provider: p.provider || 'GEMINI',
                    modelName: p.config?.modelName || '',
                    apiKey: p.config?.apiKey || '',
                    baseUrl: p.config?.baseUrl || '',
                    temperature: p.config?.temperature ?? 1.0,
                    enabled: p.config?.enabled ?? true,
                    systemInstruction: p.config?.systemInstruction || ''
                })));
                setFormMultimodal({ provider: 'GEMINI', apiKey: '', baseUrl: '', modelName: '', customModels: [] });
            }
        } else {
            resetForm();
        }
        setShowEditor(true);
    };

    const addParticipant = () => {
        const newP = { ...defaultParticipant, id: `new-${Date.now()}` };
        setFormParticipants([...formParticipants, newP]);
        setExpandedParticipant(formParticipants.length);
    };

    const removeParticipant = (index: number) => {
        setFormParticipants(formParticipants.filter((_, i) => i !== index));
    };

    const updateParticipant = (index: number, field: keyof ParticipantForm, value: any) => {
        setFormParticipants(prev => prev.map((p, i) =>
            i === index ? { ...p, [field]: value } : p
        ));
    };

    const handleSaveTemplate = async () => {
        if (!formName) {
            alert('请输入模板名称');
            return;
        }

        // Validate based on template type
        if (formTemplateType === 'participant' && formParticipants.length === 0) {
            alert('请至少添加一个模型配置');
            return;
        }
        if (formTemplateType === 'multimodal' && !formMultimodal.apiKey) {
            alert('请输入 API Key');
            return;
        }

        try {
            // Build config_data based on template type
            let configData;
            if (formTemplateType === 'participant') {
                configData = formParticipants.map(p => ({
                    id: p.id,
                    name: p.name,
                    provider: p.provider,
                    avatar: p.provider === 'GEMINI' ? '✨' : '🤖',
                    color: '#3B82F6',
                    description: '',
                    config: {
                        apiKey: p.apiKey,
                        baseUrl: p.baseUrl,
                        modelName: p.modelName,
                        enabled: p.enabled,
                        temperature: p.temperature,
                        systemInstruction: p.systemInstruction
                    }
                }));
            } else {
                // Multimodal config format
                configData = formMultimodal;
            }

            const data = {
                name: formName,
                description: formDescription,
                config_data: configData,
                tier_required: formTier,
                allowed_models: null,
                token_limit: formTokenLimit,
                is_active: formIsActive,
                template_type: formTemplateType
            };

            if (editingItem) {
                await adminAPI.updateConfigTemplate(editingItem.id, data);
            } else {
                await adminAPI.createConfigTemplate(data);
            }

            setShowEditor(false);
            resetForm();
            loadData();
        } catch (err: any) {
            alert('保存失败：' + err.message);
        }
    };

    const handleDeleteTemplate = async (id: number) => {
        if (!confirm('确定删除此配置模板？')) return;
        try {
            await adminAPI.deleteConfigTemplate(id);
            loadData();
        } catch (err: any) {
            alert('删除失败：' + err.message);
        }
    };

    const toggleActive = async (item: ConfigTemplate) => {
        try {
            await adminAPI.updateConfigTemplate(item.id, { is_active: !item.is_active });
            loadData();
        } catch (err: any) {
            alert('操作失败：' + err.message);
        }
    };

    const handleSaveModelTier = async () => {
        if (!tierForm.model_pattern || !tierForm.tier) {
            alert('模型模式和等级为必填项');
            return;
        }
        try {
            await adminAPI.createModelTier(tierForm);
            setShowTierEditor(false);
            setTierForm({ model_pattern: '', tier: 'free', description: '' });
            loadData();
        } catch (err: any) {
            alert('保存失败：' + err.message);
        }
    };

    const handleDeleteModelTier = async (id: number) => {
        if (!confirm('确定删除此模型等级规则？')) return;
        try {
            await adminAPI.deleteModelTier(id);
            loadData();
        } catch (err: any) {
            alert('删除失败：' + err.message);
        }
    };

    const handleImportConfig = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.galaxy';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                const configs = Array.isArray(parsed) ? parsed : [parsed];

                setFormParticipants(configs.map((p: any, idx: number) => ({
                    id: p.id || `import-${idx}`,
                    name: p.name || '',
                    provider: p.provider || 'GEMINI',
                    modelName: p.config?.modelName || p.modelName || '',
                    apiKey: p.config?.apiKey || '',
                    baseUrl: p.config?.baseUrl || '',
                    temperature: p.config?.temperature ?? 1.0,
                    enabled: p.config?.enabled ?? true,
                    systemInstruction: p.config?.systemInstruction || ''
                })));
                setFormName(file.name.replace(/\.(json|galaxy)$/, ''));
                setShowEditor(true);
            } catch (err) {
                alert('读取文件失败或格式错误');
            }
        };
        input.click();
    };

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">配置模板管理</h1>
                <div className="flex gap-2">
                    <button
                        onClick={handleImportConfig}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                    >
                        <Upload size={18} />
                        导入文件
                    </button>
                    <button
                        onClick={() => activeTab === 'templates' ? openEditor() : setShowTierEditor(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={18} />
                        {activeTab === 'templates' ? '创建模板' : '添加规则'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'templates'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                >
                    <FileCode size={18} />
                    配置模板
                </button>
                <button
                    onClick={() => setActiveTab('tiers')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'tiers'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                >
                    <Shield size={18} />
                    模型等级规则
                </button>
            </div>

            {/* Templates Tab */}
            {activeTab === 'templates' && (
                <>
                    {/* Template Type Filter */}
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setTemplateTypeFilter('participant')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${templateTypeFilter === 'participant'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                : 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'
                                }`}
                        >
                            ⚡ 对话配置
                        </button>
                        <button
                            onClick={() => setTemplateTypeFilter('multimodal')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${templateTypeFilter === 'multimodal'
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                : 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'
                                }`}
                        >
                            🎨 多模态配置
                        </button>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                        {loading ? (
                            <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                        ) : templates.filter(t => (t.template_type || 'participant') === templateTypeFilter).length === 0 ? (
                            <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                                暂无{templateTypeFilter === 'participant' ? '对话' : '多模态'}配置模板
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200 dark:divide-slate-700">
                                {templates.filter(t => (t.template_type || 'participant') === templateTypeFilter).map(item => (
                                    <div key={item.id} className={`p-6 ${!item.is_active ? 'opacity-50' : ''}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h3 className="text-lg font-semibold">{item.name}</h3>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${tierColors[item.tier_required]}`}>
                                                        {tierLabels[item.tier_required]}
                                                    </span>
                                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                                        {item.config_data?.length || 0} 个模型
                                                    </span>
                                                </div>
                                                {item.description && (
                                                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">{item.description}</p>
                                                )}
                                                <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                                                    <span className="flex items-center gap-1">
                                                        <Download size={12} />
                                                        下载次数: {item.download_count}
                                                    </span>
                                                    {item.token_limit > 0 && (
                                                        <span>Token限额: {item.token_limit.toLocaleString()}</span>
                                                    )}
                                                    <span>创建者: {item.created_by_username}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 ml-4">
                                                <button
                                                    onClick={() => toggleActive(item)}
                                                    className={`p-2 rounded ${item.is_active ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                                                    title={item.is_active ? '点击禁用' : '点击启用'}
                                                >
                                                    {item.is_active ? <Eye size={18} /> : <EyeOff size={18} />}
                                                </button>
                                                <button
                                                    onClick={() => openEditor(item)}
                                                    className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                                    title="编辑"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTemplate(item.id)}
                                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                    title="删除"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Model Tiers Tab */}
            {activeTab === 'tiers' && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">模型模式</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">等级</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">描述</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {modelTiers.map(tier => (
                                <tr key={tier.id}>
                                    <td className="px-6 py-4 font-mono text-sm">{tier.model_pattern}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${tierColors[tier.tier]}`}>
                                            {tierLabels[tier.tier]}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{tier.description}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDeleteModelTier(tier.id)}
                                            className="text-red-500 hover:text-red-700"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Visual Template Editor Modal */}
            {showEditor && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b dark:border-slate-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold">{editingItem ? '编辑模板' : '创建模板'}</h2>
                            <button onClick={() => { setShowEditor(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">模板名称 *</label>
                                    <input
                                        type="text"
                                        value={formName}
                                        onChange={e => setFormName(e.target.value)}
                                        className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                        placeholder="例如：Gemini Pro 配置包"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">所需等级</label>
                                    <select
                                        value={formTier}
                                        onChange={e => setFormTier(e.target.value as any)}
                                        className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    >
                                        <option value="free">Free (免费)</option>
                                        <option value="pro">Pro (专业)</option>
                                        <option value="ultra">Ultra (旗舰)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
                                <input
                                    type="text"
                                    value={formDescription}
                                    onChange={e => setFormDescription(e.target.value)}
                                    className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    placeholder="模板功能描述"
                                />
                            </div>

                            {/* Participants */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">模型配置 ({formParticipants.length})</label>
                                    <button
                                        onClick={addParticipant}
                                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                                    >
                                        <Plus size={16} />
                                        添加模型
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {formParticipants.map((p, idx) => (
                                        <div key={p.id} className="border dark:border-slate-600 rounded-lg overflow-hidden">
                                            <div
                                                className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-slate-700 cursor-pointer"
                                                onClick={() => setExpandedParticipant(expandedParticipant === idx ? null : idx)}
                                            >
                                                <GripVertical size={16} className="text-gray-400" />
                                                <span className="flex-1 font-medium">{p.name || `模型 ${idx + 1}`}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{p.modelName}</span>
                                                <span className={`text-xs ${p.apiKey ? 'text-green-500' : 'text-red-500'}`}>
                                                    {p.apiKey ? '已配置Key' : '未配置Key'}
                                                </span>
                                                {expandedParticipant === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </div>

                                            {expandedParticipant === idx && (
                                                <div className="p-4 space-y-3">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">显示名称</label>
                                                            <input
                                                                type="text"
                                                                value={p.name}
                                                                onChange={e => updateParticipant(idx, 'name', e.target.value)}
                                                                className="w-full px-2 py-1.5 border dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700"
                                                                placeholder="Gemini Pro"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Provider</label>
                                                            <select
                                                                value={p.provider}
                                                                onChange={e => updateParticipant(idx, 'provider', e.target.value)}
                                                                className="w-full px-2 py-1.5 border dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700"
                                                            >
                                                                <option value="GEMINI">Gemini</option>
                                                                <option value="OPENAI_COMPATIBLE">OpenAI 兼容</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">模型标识</label>
                                                            <input
                                                                type="text"
                                                                value={p.modelName}
                                                                onChange={e => updateParticipant(idx, 'modelName', e.target.value)}
                                                                className="w-full px-2 py-1.5 border dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 font-mono"
                                                                placeholder="gemini-2.5-pro"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API Key</label>
                                                            <input
                                                                type="password"
                                                                value={p.apiKey}
                                                                onChange={e => updateParticipant(idx, 'apiKey', e.target.value)}
                                                                className="w-full px-2 py-1.5 border dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 font-mono"
                                                                placeholder="sk-xxxxx 或 AIzaSy..."
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Base URL (可选)</label>
                                                            <input
                                                                type="text"
                                                                value={p.baseUrl}
                                                                onChange={e => updateParticipant(idx, 'baseUrl', e.target.value)}
                                                                className="w-full px-2 py-1.5 border dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 font-mono"
                                                                placeholder="https://api.openai.com/v1"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">温度 ({p.temperature})</label>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="2"
                                                                step="0.1"
                                                                value={p.temperature}
                                                                onChange={e => updateParticipant(idx, 'temperature', parseFloat(e.target.value))}
                                                                className="w-full"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">系统指令 (可选)</label>
                                                        <textarea
                                                            value={p.systemInstruction}
                                                            onChange={e => updateParticipant(idx, 'systemInstruction', e.target.value)}
                                                            rows={2}
                                                            className="w-full px-2 py-1.5 border dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 resize-none"
                                                            placeholder="你是一个有帮助的AI助手..."
                                                        />
                                                    </div>

                                                    <div className="flex justify-between items-center pt-2">
                                                        <label className="flex items-center gap-2 text-sm">
                                                            <input
                                                                type="checkbox"
                                                                checked={p.enabled}
                                                                onChange={e => updateParticipant(idx, 'enabled', e.target.checked)}
                                                                className="w-4 h-4 rounded"
                                                            />
                                                            默认启用
                                                        </label>
                                                        <button
                                                            onClick={() => removeParticipant(idx)}
                                                            className="text-sm text-red-500 hover:text-red-700"
                                                        >
                                                            删除此模型
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {formParticipants.length === 0 && (
                                        <div className="text-center py-8 text-gray-400 dark:text-gray-500 border-2 border-dashed dark:border-slate-600 rounded-lg">
                                            点击"添加模型"开始配置
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Options */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Token限额 (0=无限制)</label>
                                    <input
                                        type="number"
                                        value={formTokenLimit}
                                        onChange={e => setFormTokenLimit(parseInt(e.target.value) || 0)}
                                        className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={formIsActive}
                                            onChange={e => setFormIsActive(e.target.checked)}
                                            className="w-4 h-4 rounded"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">立即启用</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t dark:border-slate-700 flex justify-end gap-3">
                            <button
                                onClick={() => { setShowEditor(false); resetForm(); }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveTemplate}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Model Tier Editor Modal */}
            {showTierEditor && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md">
                        <div className="p-6 border-b dark:border-slate-700">
                            <h2 className="text-xl font-bold">添加模型等级规则</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">模型模式 *</label>
                                <input
                                    type="text"
                                    value={tierForm.model_pattern}
                                    onChange={e => setTierForm({ ...tierForm, model_pattern: e.target.value })}
                                    className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700"
                                    placeholder="例如：gpt-4o 或 claude-*"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">支持通配符 * 匹配任意字符</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">等级 *</label>
                                <select
                                    value={tierForm.tier}
                                    onChange={e => setTierForm({ ...tierForm, tier: e.target.value as any })}
                                    className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700"
                                >
                                    <option value="free">Free (免费)</option>
                                    <option value="pro">Pro (专业)</option>
                                    <option value="ultra">Ultra (旗舰)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
                                <input
                                    type="text"
                                    value={tierForm.description}
                                    onChange={e => setTierForm({ ...tierForm, description: e.target.value })}
                                    className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700"
                                    placeholder="例如：OpenAI GPT-4o"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t dark:border-slate-700 flex justify-end gap-3">
                            <button
                                onClick={() => { setShowTierEditor(false); setTierForm({ model_pattern: '', tier: 'free', description: '' }); }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveModelTier}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
