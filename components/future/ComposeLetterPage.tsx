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
} from 'lucide-react';
import type {
    RecipientType,
    LetterType,
    ComposeState,
    FutureLetterTemplate,
    CreateLetterRequest,
    UpdateLetterRequest,
    MusicInfo,
} from './types';
import AttachmentUploader, { type AttachmentItem } from './components/AttachmentUploader';
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
};

export default function ComposeLetterPage({ onBack, draftId }: ComposeLetterPageProps) {
    const [state, setState] = useState<ComposeState>(INITIAL_STATE);
    const [attachmentItems, setAttachmentItems] = useState<AttachmentItem[]>([]);
    const [templates, setTemplates] = useState<FutureLetterTemplate[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showMusicSearch, setShowMusicSearch] = useState(false);
    const [showAIAssist, setShowAIAssist] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const contentRef = useRef<HTMLTextAreaElement>(null);

    // 加载草稿或初始化
    useEffect(() => {
        if (draftId) {
            loadDraft(draftId);
        }
        loadTemplates();
    }, [draftId]);

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
            const response = await fetch(`/api/future/letters/${id}`, {
                credentials: 'include',
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
            }));

            // 加载附件
            const attachmentsRes = await fetch(`/api/future/letters/${id}/attachments`, {
                credentials: 'include',
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
            const response = await fetch('/api/future/templates');
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
                recipientEmail: state.recipientType === 'other' ? state.recipientEmail : undefined,
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
            };

            let response: Response;
            if (state.draftId) {
                response = await fetch(`/api/future/letters/${state.draftId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ ...payload, version: state.version }),
                });
            } else {
                response = await fetch('/api/future/letters', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
        if (state.recipientType === 'other' && !state.recipientEmail.trim()) {
            setError('请填写收件人邮箱');
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
            const response = await fetch(`/api/future/letters/${state.draftId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    // 获取最小日期时间（当前时间+1小时）
    const getMinDateTime = () => {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        return now.toISOString().slice(0, 16);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
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
                        {!state.isSaving && state.draftId && !state.isDirty && (
                            <span className="text-sm text-green-400">已保存</span>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6 pb-32">
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

                    {/* Recipient Email (for others) */}
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
            </main>

            {/* Bottom Actions */}
            <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 p-4">
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
                        disabled={state.isSubmitting || !state.title.trim() || !state.content.trim() || !state.scheduledLocal}
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
            {/* Music Search Modal - TODO */}
            {/* AI Assist Panel - TODO */}
        </div>
    );
}
