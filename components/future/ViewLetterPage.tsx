/**
 * Future Letters - View Letter Page
 * Display letter details with unlock for encrypted letters
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    ArrowLeft,
    Clock,
    Lock,
    Unlock,
    Music,
    Image,
    Headphones,
    Calendar,
    User,
    Mail,
    Loader2,
    Share2,
    Download,
    Play,
    Pause,
    Eye,
    EyeOff,
    Package,
} from 'lucide-react';
import type { FutureLetterDetail, FutureView, PhysicalOrderResponse } from './types';
import { STATUS_LABELS, STATUS_COLORS, SHIPPING_STATUS_LABELS, ORDER_STATUS_LABELS } from './types';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE } from '../../utils/api';

interface ViewLetterPageProps {
    letterId: string;
    onBack: () => void;
    onNavigate: (view: FutureView, letterId?: string) => void;
}

export default function ViewLetterPage({ letterId, onBack, onNavigate }: ViewLetterPageProps) {
    const { token } = useAuth();
    const [letter, setLetter] = useState<FutureLetterDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Encryption state
    const [isLocked, setIsLocked] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Music player state
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

    const loadLetter = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/letters/${letterId}`, {
                credentials: 'include',
                headers,
            });

            if (response.status === 404) {
                throw new Error('信件不存在或已被删除');
            }

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error?.message || '加载失败');
            }

            const data: FutureLetterDetail = await response.json();
            setLetter(data);
            setIsLocked(data.isEncrypted && !data.content);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
        }
    }, [letterId, token]);

    useEffect(() => {
        loadLetter();
    }, [loadLetter]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (audioRef) {
                audioRef.pause();
                audioRef.src = '';
            }
        };
    }, [audioRef]);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!unlockPassword.trim()) return;

        setIsUnlocking(true);
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/letters/${letterId}/unlock`, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({ password: unlockPassword }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error?.message || '解锁失败');
            }

            const data: FutureLetterDetail = await response.json();
            setLetter(data);
            setIsLocked(false);
            setUnlockPassword('');
        } catch (err) {
            alert(err instanceof Error ? err.message : '解锁失败，请检查密码');
        } finally {
            setIsUnlocking(false);
        }
    };

    const toggleMusic = () => {
        if (!letter?.musicUrl) return;

        if (audioRef) {
            if (isPlaying) {
                audioRef.pause();
            } else {
                audioRef.play();
            }
            setIsPlaying(!isPlaying);
        } else {
            const audio = new Audio(letter.musicUrl);
            audio.loop = true;
            audio.play();
            setAudioRef(audio);
            setIsPlaying(true);

            audio.addEventListener('ended', () => setIsPlaying(false));
        }
    };

    const formatDate = (dateStr: string, tz?: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: tz || 'Asia/Shanghai',
        });
    };

    const handleShare = async () => {
        if (!letter) return;

        const shareData = {
            title: letter.title,
            text: `来自时光信的一封信：${letter.title}`,
            url: window.location.href,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                // User cancelled
            }
        } else {
            await navigator.clipboard.writeText(window.location.href);
            alert('链接已复制到剪贴板');
        }
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-[100dvh] text-white flex items-center justify-center relative z-10">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
        );
    }

    // Error state
    if (error || !letter) {
        return (
            <div className="min-h-[100dvh] text-white relative z-10">
                <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
                    <div className="max-w-4xl mx-auto px-4 py-4">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span>返回</span>
                        </button>
                    </div>
                </header>
                <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                        <p className="text-red-400 mb-4">{error || '信件不存在'}</p>
                        <button
                            onClick={onBack}
                            className="px-6 py-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                        >
                            返回列表
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Locked state - need password
    if (isLocked) {
        return (
            <div className="min-h-[100dvh] text-white relative z-10">
                <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
                    <div className="max-w-4xl mx-auto px-4 py-4">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span>返回</span>
                        </button>
                    </div>
                </header>

                <div className="max-w-md mx-auto px-4 py-20">
                    <div className="bg-white/5 rounded-2xl p-8 border border-white/10 text-center">
                        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-6">
                            <Lock className="w-8 h-8 text-amber-400" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">加密信件</h2>
                        <p className="text-white/60 mb-6">
                            这是一封加密信件，需要密码才能查看
                        </p>

                        {letter.encryptionHint && (
                            <div className="bg-white/5 rounded-lg p-3 mb-6 text-sm text-white/70">
                                <span className="text-white/50">提示：</span>{letter.encryptionHint}
                            </div>
                        )}

                        <form onSubmit={handleUnlock} className="space-y-4">
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={unlockPassword}
                                    onChange={(e) => setUnlockPassword(e.target.value)}
                                    placeholder="输入密码"
                                    className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20 focus:border-purple-500 outline-none text-white placeholder-white/40"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            <button
                                type="submit"
                                disabled={isUnlocking || !unlockPassword.trim()}
                                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl font-medium hover:shadow-lg hover:shadow-amber-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isUnlocking ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        解锁中...
                                    </>
                                ) : (
                                    <>
                                        <Unlock className="w-5 h-5" />
                                        解锁信件
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    // Normal view - show letter content
    const statusColor = STATUS_COLORS[letter.status];

    return (
        <div className="min-h-screen text-white relative z-10">
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
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleShare}
                            className="p-2 text-white/70 hover:text-white transition-colors"
                            title="分享"
                        >
                            <Share2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* Letter Header */}
                <div className="mb-8">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <h1 className="text-2xl font-bold">{letter.title || '无标题'}</h1>
                        <span className={`text-sm px-3 py-1 rounded-full bg-${statusColor}-500/20 text-${statusColor}-400 whitespace-nowrap`}>
                            {STATUS_LABELS[letter.status]}
                        </span>
                    </div>

                    {/* Meta Info */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
                        <div className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            <span>
                                {letter.recipientType === 'self'
                                    ? '写给自己'
                                    : `写给 ${letter.recipientName || letter.recipientEmail || '他人'}`}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>创建于 {formatDate(letter.createdAt)}</span>
                        </div>
                        {letter.status === 'delivered' && letter.deliveredAt && (
                            <div className="flex items-center gap-1 text-green-400">
                                <Mail className="w-4 h-4" />
                                <span>送达于 {formatDate(letter.deliveredAt)}</span>
                            </div>
                        )}
                        {letter.status === 'scheduled' && (
                            <div className="flex items-center gap-1 text-blue-400">
                                <Clock className="w-4 h-4" />
                                <span>预计 {formatDate(letter.scheduledAtUtc, letter.scheduledTz)} 送达</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Music Player */}
                {letter.musicUrl && (
                    <div className="mb-6 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-xl p-4 border border-pink-500/30">
                        <div className="flex items-center gap-4">
                            {letter.musicCoverUrl ? (
                                <img
                                    src={letter.musicCoverUrl}
                                    alt="Album cover"
                                    className="w-14 h-14 rounded-lg object-cover"
                                />
                            ) : (
                                <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center">
                                    <Music className="w-6 h-6 text-pink-400" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{letter.musicName || '背景音乐'}</p>
                                {letter.musicArtist && (
                                    <p className="text-sm text-white/60 truncate">{letter.musicArtist}</p>
                                )}
                            </div>
                            <button
                                onClick={toggleMusic}
                                className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                            >
                                {isPlaying ? (
                                    <Pause className="w-5 h-5" />
                                ) : (
                                    <Play className="w-5 h-5 ml-0.5" />
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Letter Content */}
                <div className="bg-white/5 rounded-2xl p-6 md:p-8 border border-white/10 mb-6">
                    {letter.contentHtmlSanitized ? (
                        <div
                            className="prose prose-invert prose-purple max-w-none"
                            dangerouslySetInnerHTML={{ __html: letter.contentHtmlSanitized }}
                        />
                    ) : (
                        <div className="whitespace-pre-wrap text-white/90 leading-relaxed">
                            {letter.content}
                        </div>
                    )}
                </div>

                {/* Attachments */}
                {letter.attachmentsList && letter.attachmentsList.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Image className="w-5 h-5 text-purple-400" />
                            附件 ({letter.attachmentsList.length})
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {letter.attachmentsList.map((attachment) => (
                                <div
                                    key={attachment.id}
                                    className="bg-white/5 rounded-xl p-3 border border-white/10"
                                >
                                    {attachment.attachmentType === 'image' ? (
                                        <a
                                            href={`/api/future/attachments/${attachment.storageKey}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block aspect-square rounded-lg overflow-hidden bg-white/10 mb-2"
                                        >
                                            <img
                                                src={attachment.thumbnailKey
                                                    ? `/api/future/attachments/${attachment.thumbnailKey}`
                                                    : `/api/future/attachments/${attachment.storageKey}`}
                                                alt={attachment.originalName || 'Image'}
                                                className="w-full h-full object-cover"
                                            />
                                        </a>
                                    ) : (
                                        <div className="aspect-square rounded-lg bg-white/10 flex items-center justify-center mb-2">
                                            <Headphones className="w-8 h-8 text-purple-400" />
                                        </div>
                                    )}
                                    <p className="text-xs text-white/60 truncate">
                                        {attachment.originalName || `附件 ${attachment.id}`}
                                    </p>
                                    {attachment.attachmentType === 'audio' && attachment.durationMs && (
                                        <p className="text-xs text-white/40">
                                            {Math.floor(attachment.durationMs / 1000)}秒
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Template Info */}
                {letter.template && (
                    <div className="text-sm text-white/50 text-center">
                        使用模板：{letter.template.name}
                    </div>
                )}

                {/* Physical Letter Order Section */}
                {['approved', 'scheduled', 'delivering', 'delivered'].includes(letter.status) && (
                    <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/10">
                        <div className="flex items-center gap-3 mb-4">
                            <Package className="w-6 h-6 text-emerald-400" />
                            <h3 className="text-lg font-semibold">实体信服务</h3>
                        </div>

                        {letter.physicalOrder ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-white/50">订单状态</span>
                                        <p className="font-medium">
                                            {ORDER_STATUS_LABELS[letter.physicalOrder.orderStatus]}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-white/50">物流状态</span>
                                        <p className="font-medium">
                                            {SHIPPING_STATUS_LABELS[letter.physicalOrder.shippingStatus]}
                                        </p>
                                    </div>
                                    {letter.physicalOrder.trackingNumber && (
                                        <div className="col-span-2">
                                            <span className="text-white/50">快递单号</span>
                                            <p className="font-medium font-mono">
                                                {letter.physicalOrder.carrier && `${letter.physicalOrder.carrier}: `}
                                                {letter.physicalOrder.trackingNumber}
                                            </p>
                                        </div>
                                    )}
                                    {letter.physicalOrder.shippingFee && (
                                        <div>
                                            <span className="text-white/50">费用</span>
                                            <p className="font-medium">¥{letter.physicalOrder.shippingFee.toFixed(2)}</p>
                                        </div>
                                    )}
                                </div>
                                {letter.physicalOrder.adminNote && (
                                    <div className="p-3 bg-white/5 rounded-lg text-sm">
                                        <span className="text-white/50">备注：</span>
                                        {letter.physicalOrder.adminNote}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className="text-white/60 mb-4">
                                    将这封信制作成实体信件，通过邮寄送达收件人
                                </p>
                                <button
                                    onClick={() => onNavigate('physical', letter.id)}
                                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl font-medium hover:shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center gap-2 mx-auto"
                                >
                                    <Package className="w-5 h-5" />
                                    创建实体信订单
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Edit Button for Drafts */}
                {letter.status === 'draft' && (
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => onNavigate('compose', letter.id)}
                            className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/30 transition-all"
                        >
                            继续编辑
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
