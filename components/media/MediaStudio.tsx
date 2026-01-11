/**
 * Media Studio - 多媒体创作工作室
 */

import React, { useState, useEffect } from 'react';
import {
    X, Image, Video, Music, Wand2, Play, Pause, Download,
    Trash2, RefreshCw, Loader2, Clock, CheckCircle2, XCircle
} from 'lucide-react';
import { API_BASE, authFetch } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

type MediaType = 'image' | 'video' | 'audio';
type PipelineType = 'image_gen' | 'image_edit' | 'video_gen' | 'audio_gen' | 'tts' | 'composite';
type JobStatus = 'pending' | 'processing' | 'streaming' | 'completed' | 'failed' | 'cancelled';

interface MediaJob {
    id: string;
    pipelineType: PipelineType;
    status: JobStatus;
    inputPrompt: string | null;
    outputAssetId: string | null;
    progress: number;
    model: string | null;
    errorMessage: string | null;
    createdAt: string;
}

interface MediaAsset {
    id: string;
    type: MediaType;
    storageUrl: string;
    thumbnailUrl: string | null;
    metadata: {
        width?: number;
        height?: number;
        duration?: number;
        format?: string;
    } | null;
    createdAt: string;
}

interface MediaStudioProps {
    onClose: () => void;
}

const PIPELINE_OPTIONS = [
    { type: 'image_gen' as PipelineType, label: '图像生成', icon: Image, description: '从文字生成图像' },
    { type: 'tts' as PipelineType, label: '文字转语音', icon: Music, description: '将文字转为语音' },
    { type: 'video_gen' as PipelineType, label: '视频生成', icon: Video, description: '从文字生成视频 (即将推出)', disabled: true },
];

const MODEL_OPTIONS: Record<PipelineType, { id: string; name: string }[]> = {
    image_gen: [
        { id: 'dall-e-3', name: 'DALL-E 3' },
        { id: 'dall-e-2', name: 'DALL-E 2' },
    ],
    tts: [
        { id: 'tts-1', name: 'TTS-1' },
        { id: 'tts-1-hd', name: 'TTS-1 HD' },
    ],
    video_gen: [
        { id: 'veo-2', name: 'Veo 2' },
    ],
    image_edit: [],
    audio_gen: [],
    composite: [],
};

export default function MediaStudio({ onClose }: MediaStudioProps) {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState<'create' | 'jobs' | 'assets'>('create');
    const [jobs, setJobs] = useState<MediaJob[]>([]);
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 创建表单
    const [createForm, setCreateForm] = useState({
        pipelineType: 'image_gen' as PipelineType,
        prompt: '',
        model: 'dall-e-3',
    });
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (activeTab === 'jobs') loadJobs();
        if (activeTab === 'assets') loadAssets();
    }, [activeTab]);

    // 轮询更新进行中的任务
    useEffect(() => {
        const processingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing');
        if (processingJobs.length === 0) return;

        const interval = setInterval(loadJobs, 3000);
        return () => clearInterval(interval);
    }, [jobs]);

    const loadJobs = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const data = await authFetch<{ success: boolean; jobs: MediaJob[] }>('/api/media/jobs', token);
            setJobs(data.jobs);
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    const loadAssets = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const data = await authFetch<{ success: boolean; assets: MediaAsset[] }>('/api/media/assets', token);
            setAssets(data.assets);
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    const createJob = async () => {
        if (!token || !createForm.prompt.trim()) return;
        setCreating(true);
        setError(null);

        try {
            await authFetch('/api/media/jobs', token, {
                method: 'POST',
                body: JSON.stringify({
                    pipelineType: createForm.pipelineType,
                    inputPrompt: createForm.prompt,
                    model: createForm.model,
                }),
            });
            setCreateForm(f => ({ ...f, prompt: '' }));
            setActiveTab('jobs');
            loadJobs();
        } catch (err: any) {
            setError(err.message);
        }
        setCreating(false);
    };

    const cancelJob = async (jobId: string) => {
        if (!token) return;
        try {
            await authFetch(`/api/media/jobs/${jobId}/cancel`, token, { method: 'POST' });
            loadJobs();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const getStatusBadge = (status: JobStatus) => {
        const badges: Record<JobStatus, { color: string; text: string; icon: React.FC<any> }> = {
            pending: { color: 'bg-yellow-500/20 text-yellow-400', text: '等待���', icon: Clock },
            processing: { color: 'bg-blue-500/20 text-blue-400', text: '处理中', icon: Loader2 },
            streaming: { color: 'bg-purple-500/20 text-purple-400', text: '流式处理', icon: RefreshCw },
            completed: { color: 'bg-green-500/20 text-green-400', text: '完成', icon: CheckCircle2 },
            failed: { color: 'bg-red-500/20 text-red-400', text: '失败', icon: XCircle },
            cancelled: { color: 'bg-slate-500/20 text-slate-400', text: '已取消', icon: XCircle },
        };
        const badge = badges[status];
        const Icon = badge.icon;
        return (
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${badge.color}`}>
                <Icon size={12} className={status === 'processing' ? 'animate-spin' : ''} />
                {badge.text}
            </span>
        );
    };

    const getPipelineLabel = (type: PipelineType) => {
        return PIPELINE_OPTIONS.find(p => p.type === type)?.label || type;
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wand2 size={20} className="text-purple-400" />
                        媒体工作室
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10">
                    {[
                        { key: 'create', label: '创建', icon: Wand2 },
                        { key: 'jobs', label: '任务', icon: Clock },
                        { key: 'assets', label: '资产', icon: Image },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as any)}
                            className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors
                                ${activeTab === tab.key
                                    ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mx-4 mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {/* Create Tab */}
                    {activeTab === 'create' && (
                        <div className="space-y-4">
                            {/* Pipeline Selection */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">选择类型</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {PIPELINE_OPTIONS.map(option => (
                                        <button
                                            key={option.type}
                                            disabled={option.disabled}
                                            onClick={() => {
                                                setCreateForm(f => ({
                                                    ...f,
                                                    pipelineType: option.type,
                                                    model: MODEL_OPTIONS[option.type]?.[0]?.id || ''
                                                }));
                                            }}
                                            className={`p-4 rounded-xl text-left transition-all ${
                                                option.disabled
                                                    ? 'opacity-50 cursor-not-allowed bg-white/5'
                                                    : createForm.pipelineType === option.type
                                                    ? 'bg-purple-500/20 border-2 border-purple-500/50'
                                                    : 'bg-white/5 border-2 border-transparent hover:bg-white/10'
                                            }`}
                                        >
                                            <option.icon size={24} className={`mb-2 ${
                                                createForm.pipelineType === option.type ? 'text-purple-400' : 'text-slate-400'
                                            }`} />
                                            <div className="font-medium text-white text-sm">{option.label}</div>
                                            <div className="text-xs text-slate-500 mt-1">{option.description}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Model Selection */}
                            {MODEL_OPTIONS[createForm.pipelineType]?.length > 0 && (
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">模型</label>
                                    <select
                                        value={createForm.model}
                                        onChange={e => setCreateForm(f => ({ ...f, model: e.target.value }))}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:border-purple-500/50 focus:outline-none"
                                    >
                                        {MODEL_OPTIONS[createForm.pipelineType].map(model => (
                                            <option key={model.id} value={model.id}>{model.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Prompt Input */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    {createForm.pipelineType === 'tts' ? '文本内容' : '提示词'}
                                </label>
                                <textarea
                                    value={createForm.prompt}
                                    onChange={e => setCreateForm(f => ({ ...f, prompt: e.target.value }))}
                                    placeholder={createForm.pipelineType === 'tts'
                                        ? '输入要转换为语音的文字...'
                                        : '描述你想要生成的内容...'
                                    }
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-slate-600 focus:border-purple-500/50 focus:outline-none resize-none"
                                    rows={4}
                                />
                            </div>

                            {/* Create Button */}
                            <button
                                onClick={createJob}
                                disabled={!createForm.prompt.trim() || creating}
                                className="w-full px-4 py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                            >
                                {creating ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Wand2 size={16} />
                                )}
                                开始创作
                            </button>
                        </div>
                    )}

                    {/* Jobs Tab */}
                    {activeTab === 'jobs' && (
                        <div className="space-y-3">
                            {loading && jobs.length === 0 ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-purple-400" />
                                </div>
                            ) : jobs.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Clock size={48} className="mx-auto mb-4 opacity-30" />
                                    <p>暂无任务</p>
                                </div>
                            ) : (
                                jobs.map(job => (
                                    <div key={job.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-white text-sm">
                                                        {getPipelineLabel(job.pipelineType)}
                                                    </span>
                                                    {getStatusBadge(job.status)}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    {job.model} · {new Date(job.createdAt).toLocaleString()}
                                                </div>
                                            </div>
                                            {(job.status === 'pending' || job.status === 'processing') && (
                                                <button
                                                    onClick={() => cancelJob(job.id)}
                                                    className="text-slate-500 hover:text-red-400 text-xs"
                                                >
                                                    取消
                                                </button>
                                            )}
                                        </div>

                                        {/* Prompt Preview */}
                                        {job.inputPrompt && (
                                            <div className="text-xs text-slate-400 line-clamp-2 mb-2">
                                                {job.inputPrompt}
                                            </div>
                                        )}

                                        {/* Progress Bar */}
                                        {(job.status === 'pending' || job.status === 'processing') && (
                                            <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-purple-500 transition-all duration-300"
                                                    style={{ width: `${job.progress}%` }}
                                                />
                                            </div>
                                        )}

                                        {/* Error Message */}
                                        {job.status === 'failed' && job.errorMessage && (
                                            <div className="text-xs text-red-400 mt-2">
                                                {job.errorMessage}
                                            </div>
                                        )}

                                        {/* Output Preview */}
                                        {job.status === 'completed' && job.outputAssetId && (
                                            <div className="mt-2 text-xs text-green-400">
                                                资产已生成: {job.outputAssetId.slice(0, 8)}...
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Assets Tab */}
                    {activeTab === 'assets' && (
                        <div>
                            {loading && assets.length === 0 ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-purple-400" />
                                </div>
                            ) : assets.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Image size={48} className="mx-auto mb-4 opacity-30" />
                                    <p>暂无资产</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-3">
                                    {assets.map(asset => (
                                        <div
                                            key={asset.id}
                                            className="bg-white/5 rounded-xl overflow-hidden border border-white/10 group"
                                        >
                                            {/* Preview */}
                                            <div className="aspect-square bg-black/30 relative">
                                                {asset.type === 'image' && (
                                                    <img
                                                        src={asset.storageUrl}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                )}
                                                {asset.type === 'video' && (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Video size={32} className="text-slate-500" />
                                                    </div>
                                                )}
                                                {asset.type === 'audio' && (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Music size={32} className="text-slate-500" />
                                                    </div>
                                                )}

                                                {/* Hover Actions */}
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <a
                                                        href={asset.storageUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30"
                                                    >
                                                        <Download size={16} className="text-white" />
                                                    </a>
                                                </div>
                                            </div>

                                            {/* Info */}
                                            <div className="p-2">
                                                <div className="text-xs text-slate-400 capitalize">
                                                    {asset.type}
                                                    {asset.metadata?.format && ` · ${asset.metadata.format}`}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {new Date(asset.createdAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
