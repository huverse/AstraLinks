/**
 * Future Letters - Compose Letter Page
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ArrowLeft,
    Save,
    Send,
    User,
    Users,
    Calendar,
    Clock,
    Lock,
    Unlock,
    Music,
    Image,
    Mic,
    Sparkles,
    FileText,
    Globe,
    Info,
    X,
    Loader2,
    Check,
    Grid,
    List,
} from 'lucide-react';
import type {
    RecipientType,
    LetterType,
    ComposeState,
    FutureLetterTemplate,
    CreateLetterRequest,
    UpdateLetterRequest,
    MusicInfo,
    WritingAssistRequest,
    WritingAssistResponse,
    TemplateCategory,
} from './types';
import { TEMPLATE_CATEGORY_LABELS } from './types';

// 模板预览样式配置
const TEMPLATE_PREVIEW_STYLES: Record<string, string> = {
    'template-classic': 'bg-gradient-to-br from-amber-100/30 to-amber-50/20',
    'template-kraft': 'bg-gradient-to-br from-[#c4a77d]/40 to-[#a08060]/30',
    'template-starry': 'bg-gradient-to-br from-indigo-600/40 via-purple-700/30 to-blue-800/40',
    'template-sakura': 'bg-gradient-to-br from-pink-300/40 via-rose-200/30 to-pink-400/40',
    'template-newyear': 'bg-gradient-to-br from-red-700/40 via-amber-600/30 to-red-800/40',
    'template-business': 'bg-gradient-to-br from-slate-600/40 to-slate-700/40',
};
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE } from '../../utils/api';

// 用户信息接口
interface UserInfo {
    email?: string;
    username?: string;
}
import AttachmentUploader, { type AttachmentItem } from './components/AttachmentUploader';
import MusicSelector from './components/MusicSelector';
import { COMMON_TIMEZONES } from './types';

interface ComposeLetterPageProps {
    onBack: () => void;
    draftId?: string;
}

const INITIAL_STATE: ComposeState = {
    recipientType: 'self',
    recipientEmail: '',
    recipientName: '',
    title: '',
    content: '',
    scheduledLocal: '',
    scheduledTz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    isEncrypted: false,
    encryptionHint: '',
    musicUrl: '',
    letterType: 'electronic',
    aiOptIn: true,
    attachments: [],
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    version: 1,
    // 公开信选项
    isPublic: false,
    publicAnonymous: false,
    publicAlias: '',
};

export default function ComposeLetterPage({ onBack, draftId }: ComposeLetterPageProps) {
    const { token } = useAuth();
    const [state, setState] = useState<ComposeState>(INITIAL_STATE);
    const [attachmentItems, setAttachmentItems] = useState<AttachmentItem[]>([]);
    const [templates, setTemplates] = useState<FutureLetterTemplate[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [templateCategory, setTemplateCategory] = useState<TemplateCategory | null>(null);
    const [showMusicSearch, setShowMusicSearch] = useState(false);
    const [showAIAssist, setShowAIAssist] = useState(false);
    const [aiAssistType, setAiAssistType] = useState<'improve' | 'expand' | 'simplify' | 'emotional'>('improve');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState<WritingAssistResponse | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const contentRef = useRef<HTMLTextAreaElement>(null);
    const bottomBarRef = useRef<HTMLDivElement>(null);

    // 加载草稿或初始化
    useEffect(() => {
        if (draftId) {
            loadDraft(draftId);
        }
        loadTemplates();
        loadUserInfo();
    }, [draftId]);

    // 加载用户信息（获取邮箱）
    const loadUserInfo = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/auth/me`, {
                credentials: 'include',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            if (response.ok) {
                const data = await response.json();
                setUserInfo({
                    email: data.user?.email,
                    username: data.user?.username,
                });
            }
        } catch (error) {
            console.error('Failed to load user info:', error);
        }
    };

    // 自动保存
    useEffect(() => {
        if (!state.isDirty || !state.title.trim()) return;

        const timer = setTimeout(() => {
            saveDraft();
        }, 3000);

        return () => clearTimeout(timer);
    }, [state.isDirty, state.title, state.content]);

    const loadDraft = async (id: string) => {
        try {
            const response = await fetch(`${API_BASE}/api/future/letters/${id}`, {
                credentials: 'include',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            if (!response.ok) throw new Error('Failed to load draft');

            const letter = await response.json();
            setState(prev => ({
                ...prev,
                recipientType: letter.recipientType,
                recipientEmail: letter.recipientEmail || '',
                recipientName: letter.recipientName || '',
                title: letter.title,
                content: letter.content,
                templateId: letter.templateId,
                scheduledLocal: letter.scheduledLocal?.slice(0, 16) || '',
                scheduledTz: letter.scheduledTz,
                isEncrypted: letter.isEncrypted,
                encryptionHint: letter.encryptionHint || '',
                musicUrl: letter.musicUrl || '',
                musicInfo: letter.musicName ? {
                    id: letter.musicId || '',
                    name: letter.musicName,
                    artist: letter.musicArtist || '',
                    coverUrl: letter.musicCoverUrl,
                } : undefined,
                letterType: letter.letterType,
                aiOptIn: letter.aiOptIn,
                draftId: letter.id,
                version: letter.version,
                isDirty: false,
                // 公开信选项
                isPublic: letter.isPublic || false,
                publicAnonymous: letter.publicAnonymous || false,
                publicAlias: letter.publicAlias || '',
            }));

            // 加载附件
            const attachmentsRes = await fetch(`${API_BASE}/api/future/letters/${id}/attachments`, {
                credentials: 'include',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            if (attachmentsRes.ok) {
                const attachments = await attachmentsRes.json();
                setAttachmentItems(attachments);
            }
        } catch (error) {
            console.error('Failed to load draft:', error);
            setError('加载草稿失败');
        }
    };

    const loadTemplates = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/future/templates`);
            if (response.ok) {
                const data = await response.json();
                setTemplates(data);
            }
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    };

    const updateState = <K extends keyof ComposeState>(key: K, value: ComposeState[K]) => {
        setState(prev => ({
            ...prev,
            [key]: value,
            isDirty: true,
        }));
    };

    const saveDraft = async () => {
        if (state.isSaving) return;

        setState(prev => ({ ...prev, isSaving: true }));
        setError(null);

        try {
            const payload: CreateLetterRequest | UpdateLetterRequest = {
                recipientType: state.recipientType,
                recipientEmail: state.recipientEmail || undefined,  // 所有类型都需要邮箱
                recipientName: state.recipientName || undefined,
                title: state.title,
                content: state.content,
                templateId: state.templateId,
                scheduledLocal: state.scheduledLocal,
                scheduledTz: state.scheduledTz,
                isEncrypted: state.isEncrypted,
                encryptionHint: state.isEncrypted ? state.encryptionHint : undefined,
                musicUrl: state.musicUrl || undefined,
                letterType: state.letterType,
                aiOptIn: state.aiOptIn,
                // 公开信选项
                isPublic: state.isPublic,
                publicAnonymous: state.publicAnonymous,
                publicAlias: state.publicAlias || undefined,
            };

            let response: Response;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            if (state.draftId) {
                response = await fetch(`${API_BASE}/api/future/letters/${state.draftId}`, {
                    method: 'PUT',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify({ ...payload, version: state.version }),
                });
            } else {
                response = await fetch(`${API_BASE}/api/future/letters`, {
                    method: 'POST',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error?.message || 'Failed to save');
            }

            const savedLetter = await response.json();
            setState(prev => ({
                ...prev,
                draftId: savedLetter.id,
                version: savedLetter.version,
                isDirty: false,
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setError(message);
        } finally {
            setState(prev => ({ ...prev, isSaving: false }));
        }
    };

    const handleSubmit = async () => {
        // 验证
        if (!state.title.trim()) {
            setError('请填写标题');
            return;
        }
        if (!state.content.trim()) {
            setError('请填写内容');
            return;
        }
        if (!state.scheduledLocal) {
            setError('请选择送达时间');
            return;
        }
        // 所有类型都需要邮箱
        if (!state.recipientEmail.trim()) {
            setError(state.recipientType === 'self' ? '请填写你的邮箱' : '请填写收件人邮箱');
            return;
        }

        // 先保存
        if (state.isDirty || !state.draftId) {
            await saveDraft();
        }

        if (!state.draftId) {
            setError('保存失败，请重试');
            return;
        }

        setState(prev => ({ ...prev, isSubmitting: true }));
        setError(null);

        try {
            const submitHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) submitHeaders['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/letters/${state.draftId}/submit`, {
                method: 'POST',
                headers: submitHeaders,
                credentials: 'include',
                body: JSON.stringify({ turnstileToken }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error?.message || 'Failed to submit');
            }

            // 成功后返回
            onBack();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setError(message);
        } finally {
            setState(prev => ({ ...prev, isSubmitting: false }));
        }
    };

    // AI 辅助写作
    const handleAIAssist = async () => {
        if (!state.content.trim()) {
            setAiError('请先输入内容');
            return;
        }

        setAiLoading(true);
        setAiError(null);
        setAiResult(null);

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/ai/compose`, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    content: state.content,
                    assistType: aiAssistType,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'AI 生成失败');
            }

            setAiResult(data);
        } catch (err) {
            setAiError(err instanceof Error ? err.message : 'AI 生成失败');
        } finally {
            setAiLoading(false);
        }
    };

    const applyAISuggestion = () => {
        if (aiResult?.suggestion) {
            updateState('content', aiResult.suggestion);
            setShowAIAssist(false);
            setAiResult(null);
        }
    };

    // 获取最小日期时间（当前时间+1小时）
    const getMinDateTime = () => {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        return now.toISOString().slice(0, 16);
    };

    return (
        <div className="h-[100dvh] flex flex-col text-white overflow-hidden relative z-10">
            {/* Header */}
            <header className="flex-shrink-0 z-40 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>返回</span>
                    </button>
                    <h1 className="text-lg font-semibold">
                        {state.draftId ? '编辑信件' : '写一封信'}
                    </h1>
                    <div className="flex items-center gap-2">
                        {state.isSaving && (
                            <span className="text-sm text-white/50 flex items-center gap-1">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                保存中...
                            </span>
                        )}
                        {!state.isSaving && state.draftId && !state.isDirty && !error && (
                            <span className="text-sm text-green-400">已保存</span>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto px-4 py-6 pb-8">
                {/* Error Message */}
                {error && (
                    <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-3">
                        <Info className="w-5 h-5 text-red-400 flex-shrink-0" />
                        <span className="text-red-200">{error}</span>
                        <button onClick={() => setError(null)} className="ml-auto">
                            <X className="w-5 h-5 text-red-400 hover:text-red-300" />
                        </button>
                    </div>
                )}

                {/* Recipient Type */}
                <section className="mb-8">
                    <label className="block text-sm font-medium text-white/70 mb-3">收件人</label>
                    <div className="flex gap-3">
                        <button
                            onClick={() => updateState('recipientType', 'self')}
                            className={`flex-1 p-4 rounded-xl border transition-all ${
                                state.recipientType === 'self'
                                    ? 'border-purple-500 bg-purple-500/20'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                        >
                            <User className="w-6 h-6 mx-auto mb-2" />
                            <div className="font-medium">给自己</div>
                            <div className="text-xs text-white/50 mt-1">未来的我</div>
                        </button>
                        <button
                            onClick={() => updateState('recipientType', 'other')}
                            className={`flex-1 p-4 rounded-xl border transition-all ${
                                state.recipientType === 'other'
                                    ? 'border-purple-500 bg-purple-500/20'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                        >
                            <Users className="w-6 h-6 mx-auto mb-2" />
                            <div className="font-medium">给他人</div>
                            <div className="text-xs text-white/50 mt-1">发送到邮箱</div>
                        </button>
                    </div>

                    {/* Self Email Input */}
                    {state.recipientType === 'self' && (
                        <div className="mt-4 space-y-3">
                            <div className="relative">
                                <input
                                    type="email"
                                    value={state.recipientEmail}
                                    onChange={(e) => updateState('recipientEmail', e.target.value)}
                                    placeholder="你的邮箱 *（信件将发送到此邮箱）"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                                />
                                {userInfo?.email && !state.recipientEmail && (
                                    <button
                                        type="button"
                                        onClick={() => updateState('recipientEmail', userInfo.email || '')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-purple-500/30 text-purple-300 rounded-lg hover:bg-purple-500/40 transition-colors"
                                    >
                                        使用 {userInfo.email}
                                    </button>
                                )}
                            </div>
                            {!userInfo?.email && (
                                <p className="text-xs text-amber-400/80 flex items-center gap-1">
                                    <Info className="w-3 h-3" />
                                    你还没有在个人中心绑定邮箱，请手动输入
                                </p>
                            )}
                            {userInfo?.email && state.recipientEmail && state.recipientEmail !== userInfo.email && (
                                <p className="text-xs text-white/50">
                                    将发送到：{state.recipientEmail}（与个人中心绑定邮箱不同）
                                </p>
                            )}
                        </div>
                    )}

                    {/* Other Recipient Email */}
                    {state.recipientType === 'other' && (
                        <div className="mt-4 space-y-3">
                            <input
                                type="email"
                                value={state.recipientEmail}
                                onChange={(e) => updateState('recipientEmail', e.target.value)}
                                placeholder="收件人邮箱 *"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                            />
                            <input
                                type="text"
                                value={state.recipientName}
                                onChange={(e) => updateState('recipientName', e.target.value)}
                                placeholder="收件人称呼（可选）"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                            />
                        </div>
                    )}
                </section>

                {/* Title */}
                <section className="mb-6">
                    <label className="block text-sm font-medium text-white/70 mb-2">标题</label>
                    <input
                        type="text"
                        value={state.title}
                        onChange={(e) => updateState('title', e.target.value)}
                        placeholder="给这封信取个标题"
                        maxLength={200}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-lg"
                    />
                </section>

                {/* Content */}
                <section className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-white/70">内容</label>
                        <button
                            onClick={() => setShowAIAssist(true)}
                            className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                            <Sparkles className="w-4 h-4" />
                            AI助写
                        </button>
                    </div>
                    <textarea
                        ref={contentRef}
                        value={state.content}
                        onChange={(e) => updateState('content', e.target.value)}
                        placeholder="在这里写下你想说的话...

支持 Markdown 格式"
                        rows={12}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors resize-none leading-relaxed"
                    />
                </section>

                {/* Scheduled Time */}
                <section className="mb-6">
                    <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        送达时间
                    </label>
                    <div className="flex gap-3">
                        <input
                            type="datetime-local"
                            value={state.scheduledLocal}
                            onChange={(e) => updateState('scheduledLocal', e.target.value)}
                            min={getMinDateTime()}
                            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                        />
                        <select
                            value={state.scheduledTz}
                            onChange={(e) => updateState('scheduledTz', e.target.value)}
                            className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                        >
                            {COMMON_TIMEZONES.map((tz) => (
                                <option key={tz.value} value={tz.value}>
                                    {tz.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </section>

                {/* Options */}
                <section className="mb-6 space-y-4">
                    {/* Encryption */}
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {state.isEncrypted ? (
                                    <Lock className="w-5 h-5 text-amber-400" />
                                ) : (
                                    <Unlock className="w-5 h-5 text-white/50" />
                                )}
                                <div>
                                    <div className="font-medium">加密保护</div>
                                    <div className="text-xs text-white/50">收件人需要密码才能阅读</div>
                                </div>
                            </div>
                            <button
                                onClick={() => updateState('isEncrypted', !state.isEncrypted)}
                                className={`w-12 h-6 rounded-full transition-colors ${
                                    state.isEncrypted ? 'bg-amber-500' : 'bg-white/20'
                                }`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                                    state.isEncrypted ? 'translate-x-6' : 'translate-x-0.5'
                                }`} />
                            </button>
                        </div>
                        {state.isEncrypted && (
                            <input
                                type="text"
                                value={state.encryptionHint}
                                onChange={(e) => updateState('encryptionHint', e.target.value)}
                                placeholder="密码提示（可选，帮助收件人回忆密码）"
                                className="w-full mt-3 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:border-amber-500 focus:outline-none"
                            />
                        )}
                    </div>

                    {/* Music */}
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Music className="w-5 h-5 text-pink-400" />
                                <div>
                                    <div className="font-medium">背景音乐</div>
                                    <div className="text-xs text-white/50">添加网易云音乐</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowMusicSearch(true)}
                                className="px-3 py-1.5 bg-pink-500/20 text-pink-400 rounded-lg text-sm hover:bg-pink-500/30 transition-colors"
                            >
                                {state.musicInfo ? '更换' : '添加'}
                            </button>
                        </div>
                        {state.musicInfo && (
                            <div className="mt-3 flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                                {state.musicInfo.coverUrl && (
                                    <img
                                        src={state.musicInfo.coverUrl}
                                        alt={state.musicInfo.name}
                                        className="w-10 h-10 rounded"
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{state.musicInfo.name}</div>
                                    <div className="text-xs text-white/50 truncate">{state.musicInfo.artist}</div>
                                </div>
                                <button
                                    onClick={() => {
                                        updateState('musicUrl', '');
                                        updateState('musicInfo', undefined);
                                    }}
                                    className="p-1 text-white/50 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Template */}
                    <button
                        onClick={() => setShowTemplates(true)}
                        className="w-full p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-blue-400" />
                            <div className="text-left">
                                <div className="font-medium">信纸模板</div>
                                <div className="text-xs text-white/50">
                                    {state.templateId
                                        ? templates.find(t => t.id === state.templateId)?.name || '已选择'
                                        : '选择一个漂亮的信纸'}
                                </div>
                            </div>
                        </div>
                        <div className="text-white/50">→</div>
                    </button>

                    {/* Public Letter Wall */}
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Globe className="w-5 h-5 text-indigo-400" />
                                <div>
                                    <div className="font-medium">公开信墙</div>
                                    <div className="text-xs text-white/50">送达后展示在公开信墙上</div>
                                </div>
                            </div>
                            <button
                                onClick={() => updateState('isPublic', !state.isPublic)}
                                className={`w-12 h-6 rounded-full transition-colors ${
                                    state.isPublic ? 'bg-indigo-500' : 'bg-white/20'
                                }`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                                    state.isPublic ? 'translate-x-6' : 'translate-x-0.5'
                                }`} />
                            </button>
                        </div>
                        {state.isPublic && (
                            <div className="mt-4 space-y-3">
                                {/* Anonymous toggle */}
                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <div className="text-sm">匿名发布</div>
                                        <div className="text-xs text-white/50">隐藏你的名字</div>
                                    </div>
                                    <button
                                        onClick={() => updateState('publicAnonymous', !state.publicAnonymous)}
                                        className={`w-10 h-5 rounded-full transition-colors ${
                                            state.publicAnonymous ? 'bg-indigo-500' : 'bg-white/20'
                                        }`}
                                    >
                                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                            state.publicAnonymous ? 'translate-x-5' : 'translate-x-0.5'
                                        }`} />
                                    </button>
                                </div>
                                {/* Display alias */}
                                {!state.publicAnonymous && (
                                    <input
                                        type="text"
                                        value={state.publicAlias}
                                        onChange={(e) => updateState('publicAlias', e.target.value)}
                                        placeholder="显示名称（可选，留空使用默认昵称）"
                                        maxLength={50}
                                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
                                    />
                                )}
                                <p className="text-xs text-amber-400/80 flex items-center gap-1">
                                    <Info className="w-3 h-3" />
                                    公开信会在送达后显示在公开信墙，所有人可见
                                </p>
                            </div>
                        )}
                    </div>
                </section>

                {/* Attachments */}
                <section className="mb-6">
                    <label className="block text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        附件
                    </label>
                    <AttachmentUploader
                        letterId={state.draftId}
                        attachments={attachmentItems}
                        onAttachmentsChange={setAttachmentItems}
                        maxImages={2}
                        maxAudio={1}
                        disabled={state.isSubmitting}
                    />
                </section>
                </div>
            </main>

            {/* Bottom Actions */}
            <div
                ref={bottomBarRef}
                className="flex-shrink-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
            >
                <div className="max-w-4xl mx-auto flex gap-3">
                    <button
                        onClick={saveDraft}
                        disabled={state.isSaving || !state.isDirty}
                        className="flex-1 py-3 px-6 bg-white/10 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-5 h-5" />
                        保存草稿
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={state.isSubmitting || !state.title.trim() || !state.content.trim() || !state.scheduledLocal || !state.recipientEmail.trim()}
                        className="flex-1 py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {state.isSubmitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                        {state.isSubmitting ? '发送中...' : '发送信件'}
                    </button>
                </div>
            </div>

            {/* Template Selector Modal - TODO */}

            {/* Music Selector Modal */}
            <MusicSelector
                isOpen={showMusicSearch}
                onClose={() => setShowMusicSearch(false)}
                onSelect={(musicInfo, musicUrl) => {
                    updateState('musicInfo', musicInfo);
                    updateState('musicUrl', musicUrl);
                }}
                currentMusic={state.musicInfo}
            />

            {/* AI Assist Panel */}
            {showAIAssist && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-400" />
                                <h3 className="text-lg font-semibold">AI 助写</h3>
                            </div>
                            <button
                                onClick={() => {
                                    setShowAIAssist(false);
                                    setAiResult(null);
                                    setAiError(null);
                                }}
                                className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4">
                            {/* Assist Type Selection */}
                            <div>
                                <label className="block text-sm text-white/70 mb-2">选择辅助类型</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { type: 'improve' as const, label: '润色', desc: '提升表达质量' },
                                        { type: 'expand' as const, label: '扩写', desc: '丰富内容细节' },
                                        { type: 'simplify' as const, label: '精简', desc: '简洁明了' },
                                        { type: 'emotional' as const, label: '增情', desc: '增强情感表达' },
                                    ].map(({ type, label, desc }) => (
                                        <button
                                            key={type}
                                            onClick={() => setAiAssistType(type)}
                                            className={`p-3 rounded-xl text-left transition-all ${
                                                aiAssistType === type
                                                    ? 'bg-purple-500/30 border-purple-500 border'
                                                    : 'bg-white/5 border-white/10 border hover:bg-white/10'
                                            }`}
                                        >
                                            <div className="font-medium">{label}</div>
                                            <div className="text-xs text-white/50">{desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Generate Button */}
                            <button
                                onClick={handleAIAssist}
                                disabled={aiLoading || !state.content.trim()}
                                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {aiLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        AI 正在思考...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5" />
                                        生成建议
                                    </>
                                )}
                            </button>

                            {/* Error */}
                            {aiError && (
                                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
                                    {aiError}
                                </div>
                            )}

                            {/* Result */}
                            {aiResult && (
                                <div className="space-y-3">
                                    {/* Model Info */}
                                    {(aiResult.provider || aiResult.modelName) && (
                                        <div className="flex items-center gap-2 text-xs text-white/50">
                                            <Info className="w-3 h-3" />
                                            <span>
                                                使用模型: {aiResult.provider}{aiResult.modelName ? ` / ${aiResult.modelName}` : ''}
                                            </span>
                                        </div>
                                    )}

                                    {/* Suggestion Content */}
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/10 max-h-64 overflow-y-auto">
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                            {aiResult.suggestion}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={handleAIAssist}
                                            disabled={aiLoading}
                                            className="flex-1 py-2.5 bg-white/10 rounded-xl text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
                                        >
                                            重新生成
                                        </button>
                                        <button
                                            onClick={applyAISuggestion}
                                            className="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-green-500/30 transition-all"
                                        >
                                            采用建议
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Tip */}
                            {!aiResult && !aiLoading && (
                                <div className="text-xs text-white/40 text-center">
                                    提示：AI 将基于你当前的信件内容生成优化建议
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Template Selector Modal */}
            {showTemplates && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-white/10 w-full max-w-4xl max-h-[85vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10">
                            <div>
                                <h2 className="text-xl font-bold">选择信纸模板</h2>
                                <p className="text-sm text-white/50 mt-1">为你的信件选择一个漂亮的信纸</p>
                            </div>
                            <button
                                onClick={() => setShowTemplates(false)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Category Tabs */}
                        <div className="flex items-center gap-2 p-4 border-b border-white/10 overflow-x-auto">
                            <button
                                onClick={() => setTemplateCategory(null)}
                                className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                                    !templateCategory
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-white/5 hover:bg-white/10 text-white/70'
                                }`}
                            >
                                全部
                            </button>
                            {(Object.keys(TEMPLATE_CATEGORY_LABELS) as TemplateCategory[]).map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setTemplateCategory(cat)}
                                    className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                                        templateCategory === cat
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-white/5 hover:bg-white/10 text-white/70'
                                    }`}
                                >
                                    {TEMPLATE_CATEGORY_LABELS[cat]}
                                </button>
                            ))}
                        </div>

                        {/* Template Grid */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {templates.length === 0 ? (
                                <div className="text-center py-12 text-white/50">
                                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>暂无可用模板</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {/* No Template Option */}
                                    <button
                                        onClick={() => {
                                            updateState('templateId', undefined);
                                            setShowTemplates(false);
                                        }}
                                        className={`relative aspect-[3/4] rounded-xl border-2 transition-all overflow-hidden group ${
                                            !state.templateId
                                                ? 'border-blue-500 ring-2 ring-blue-500/30'
                                                : 'border-white/10 hover:border-white/30'
                                        }`}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                                            <div className="text-center p-4">
                                                <FileText className="w-8 h-8 mx-auto mb-2 text-white/50" />
                                                <span className="text-sm text-white/70">纯文本</span>
                                            </div>
                                        </div>
                                        {!state.templateId && (
                                            <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                                <Check className="w-4 h-4" />
                                            </div>
                                        )}
                                    </button>

                                    {/* Template Options */}
                                    {templates
                                        .filter(t => !templateCategory || t.category === templateCategory)
                                        .map(template => (
                                            <button
                                                key={template.id}
                                                onClick={() => {
                                                    updateState('templateId', template.id);
                                                    setShowTemplates(false);
                                                }}
                                                className={`relative aspect-[3/4] rounded-xl border-2 transition-all overflow-hidden group ${
                                                    state.templateId === template.id
                                                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                                                        : 'border-white/10 hover:border-white/30'
                                                }`}
                                            >
                                                {/* Template Preview */}
                                                {template.thumbnailUrl || template.previewUrl ? (
                                                    <img
                                                        src={template.thumbnailUrl || template.previewUrl}
                                                        alt={template.name}
                                                        className="absolute inset-0 w-full h-full object-cover"
                                                    />
                                                ) : template.backgroundUrl ? (
                                                    <div
                                                        className="absolute inset-0"
                                                        style={{
                                                            backgroundImage: `url(${template.backgroundUrl})`,
                                                            backgroundSize: 'cover',
                                                            backgroundPosition: 'center',
                                                        }}
                                                    />
                                                ) : (
                                                    <div className={`absolute inset-0 flex items-center justify-center ${
                                                        template.cssClass && TEMPLATE_PREVIEW_STYLES[template.cssClass]
                                                            ? TEMPLATE_PREVIEW_STYLES[template.cssClass]
                                                            : 'bg-gradient-to-br from-purple-900/50 to-slate-800'
                                                    }`}>
                                                        <div className="text-center p-2">
                                                            <FileText className="w-8 h-8 mx-auto mb-1 text-white/70" />
                                                            <span className="text-sm text-white font-medium block truncate px-1">{template.name}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Overlay */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                                {/* Template Info */}
                                                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                                                    <div className="font-medium text-sm truncate">{template.name}</div>
                                                    <div className="text-xs text-white/50 flex items-center gap-2">
                                                        <span>{TEMPLATE_CATEGORY_LABELS[template.category]}</span>
                                                        {template.isPremium && (
                                                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">
                                                                高级
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Selected Indicator */}
                                                {state.templateId === template.id && (
                                                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                                        <Check className="w-4 h-4" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between p-4 border-t border-white/10">
                            <div className="text-sm text-white/50">
                                {state.templateId
                                    ? `已选择: ${templates.find(t => t.id === state.templateId)?.name || '模板'}`
                                    : '未选择模板'}
                            </div>
                            <button
                                onClick={() => setShowTemplates(false)}
                                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors"
                            >
                                确定
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
