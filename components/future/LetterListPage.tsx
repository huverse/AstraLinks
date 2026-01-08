/**
 * Future Letters - Letter List Page
 * Shared component for sent/received/drafts views
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    ArrowLeft,
    Mail,
    Send,
    Inbox,
    FileText,
    Clock,
    Lock,
    Music,
    ChevronRight,
    Loader2,
    Trash2,
    Edit2,
    RefreshCw,
    XCircle,
    Globe,
    GlobeLock,
} from 'lucide-react';
import type { FutureView, FutureLetterSummary, LetterListResponse, LetterStatus } from './types';
import { STATUS_LABELS, STATUS_COLORS } from './types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from './ToastProvider';
import { API_BASE } from '../../utils/api';

type ListType = 'sent' | 'received' | 'drafts';

interface LetterListPageProps {
    type: ListType;
    onBack: () => void;
    onNavigate: (view: FutureView, letterId?: string) => void;
}

const LIST_CONFIG: Record<ListType, { title: string; icon: React.ElementType; emptyText: string; emptyAction: string }> = {
    sent: {
        title: '已发送',
        icon: Send,
        emptyText: '还没有发送过信件',
        emptyAction: '写一封信',
    },
    received: {
        title: '已收到',
        icon: Inbox,
        emptyText: '还没有收到信件',
        emptyAction: '等待来自过去的惊喜',
    },
    drafts: {
        title: '草稿箱',
        icon: FileText,
        emptyText: '没有草稿',
        emptyAction: '开始写信',
    },
};

export default function LetterListPage({ type, onBack, onNavigate }: LetterListPageProps) {
    const { token } = useAuth();
    const toast = useToast();
    const [letters, setLetters] = useState<FutureLetterSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | undefined>();
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [togglingPublicId, setTogglingPublicId] = useState<string | null>(null);

    const config = LIST_CONFIG[type];
    const Icon = config.icon;

    const loadLetters = useCallback(async (cursor?: string, append = false) => {
        if (cursor) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const params = new URLSearchParams({
                type,
                limit: '20',
                sort: 'created_at',
                order: 'desc',
            });
            if (cursor) params.set('cursor', cursor);

            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/letters?${params}`, {
                credentials: 'include',
                headers,
            });

            if (!response.ok) {
                throw new Error('加载失败');
            }

            const data: LetterListResponse = await response.json();

            if (append) {
                setLetters(prev => [...prev, ...data.letters]);
            } else {
                setLetters(data.letters);
            }
            setNextCursor(data.nextCursor);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [type, token]);

    useEffect(() => {
        loadLetters();
        // 进入已收到列表时，自动标记所有未读为已读
        if (type === 'received') {
            markAllAsRead();
        }
        // 进入已发送列表时，自动标记所有未查看的状态变化为已查看
        if (type === 'sent') {
            markAllSentViewed();
        }
    }, [loadLetters, type]);

    // 标记所有已收到信件为已读
    const markAllAsRead = async () => {
        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            await fetch(`${API_BASE}/api/future/letters/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers,
            });
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    // 标记所有已发送信件为已查看
    const markAllSentViewed = async () => {
        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            await fetch(`${API_BASE}/api/future/letters/mark-all-sent-viewed`, {
                method: 'POST',
                credentials: 'include',
                headers,
            });
        } catch (error) {
            console.error('Failed to mark all sent as viewed:', error);
        }
    };

    const handleLoadMore = () => {
        if (nextCursor && !isLoadingMore) {
            loadLetters(nextCursor, true);
        }
    };

    const handleDelete = async (letterId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('确定要删除这封信吗？')) return;

        setDeletingId(letterId);
        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/letters/${letterId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers,
            });

            if (!response.ok) {
                throw new Error('删除失败');
            }

            setLetters(prev => prev.filter(l => l.id !== letterId));
            setTotal(prev => prev - 1);
            toast.success('删除成功');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '删除失败');
        } finally {
            setDeletingId(null);
        }
    };

    const handleEdit = (letterId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onNavigate('compose', letterId);
    };

    // 取消已排期但未送达的信件
    const handleCancel = async (letterId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('确定要取消发送这封信吗？取消后无法恢复。')) return;

        setCancellingId(letterId);
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/letters/${letterId}/cancel`, {
                method: 'POST',
                credentials: 'include',
                headers,
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error?.message || '取消失败');
            }

            // 更新本地状态
            setLetters(prev => prev.map(l =>
                l.id === letterId ? { ...l, status: 'cancelled' as LetterStatus } : l
            ));
            toast.success('已取消发送');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '取消失败');
        } finally {
            setCancellingId(null);
        }
    };

    // 切换公开状态
    const handleTogglePublic = async (letterId: string, currentIsPublic: boolean, e: React.MouseEvent) => {
        e.stopPropagation();
        const newIsPublic = !currentIsPublic;
        const confirmMsg = newIsPublic
            ? '确定要将这封信设为公开吗？公开后会显示在公开信墙上。'
            : '确定要将这封信设为非公开吗？设为非公开后将从公开信墙上移除。';
        if (!confirm(confirmMsg)) return;

        setTogglingPublicId(letterId);
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/letters/${letterId}/public`, {
                method: 'PATCH',
                credentials: 'include',
                headers,
                body: JSON.stringify({ isPublic: newIsPublic }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error?.message || '操作失败');
            }

            // 更新本地状态
            setLetters(prev => prev.map(l =>
                l.id === letterId ? { ...l, isPublic: newIsPublic } : l
            ));
            toast.success(newIsPublic ? '已设为公开' : '已设为非公开');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '操作失败');
        } finally {
            setTogglingPublicId(null);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusBadge = (status: LetterStatus) => {
        const color = STATUS_COLORS[status];
        const label = STATUS_LABELS[status];
        return (
            <span className={`text-xs px-2 py-1 rounded-full bg-${color}-500/20 text-${color}-400`}>
                {label}
            </span>
        );
    };

    return (
        <div className="min-h-[100dvh] text-white relative z-10">
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
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Icon className="w-5 h-5" />
                        {config.title}
                    </h1>
                    <button
                        onClick={() => loadLetters()}
                        disabled={isLoading}
                        className="p-2 text-white/70 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6">
                {/* Stats */}
                <div className="mb-6 text-white/60 text-sm">
                    共 {total} 封信件
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                    </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                    <div className="text-center py-12">
                        <p className="text-red-400 mb-4">{error}</p>
                        <button
                            onClick={() => loadLetters()}
                            className="px-6 py-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                        >
                            重试
                        </button>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && letters.length === 0 && (
                    <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
                        <Mail className="w-12 h-12 mx-auto mb-4 text-white/30" />
                        <p className="text-white/50 mb-4">{config.emptyText}</p>
                        {type !== 'received' && (
                            <button
                                onClick={() => onNavigate('compose')}
                                className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-medium hover:shadow-lg hover:shadow-purple-500/30 transition-shadow"
                            >
                                {config.emptyAction}
                            </button>
                        )}
                    </div>
                )}

                {/* Letter List */}
                {!isLoading && !error && letters.length > 0 && (
                    <div className="space-y-3">
                        {letters.map((letter) => (
                            <button
                                key={letter.id}
                                onClick={() => onNavigate('detail', letter.id)}
                                className="w-full bg-white/5 hover:bg-white/10 rounded-xl p-4 text-left transition-colors border border-white/10 hover:border-white/20 group"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium truncate mb-1 group-hover:text-purple-300 transition-colors">
                                            {letter.title || '无标题'}
                                        </h4>
                                        <div className="flex items-center gap-2 text-sm text-white/50 flex-wrap">
                                            <span>
                                                {type === 'received'
                                                    ? '来自过去'
                                                    : letter.recipientType === 'self'
                                                        ? '给自己'
                                                        : letter.recipientName || '给他人'}
                                            </span>
                                            <span>·</span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {type === 'received' || letter.status === 'delivered'
                                                    ? formatDate(letter.createdAt)
                                                    : `预计 ${formatDate(letter.scheduledAtUtc)}`}
                                            </span>
                                            {letter.attachmentCount > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span>{letter.attachmentCount} 个附件</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {letter.isEncrypted && (
                                            <span title="加密信件">
                                                <Lock className="w-4 h-4 text-amber-400" />
                                            </span>
                                        )}
                                        {letter.hasMusic && (
                                            <span title="有背景音乐">
                                                <Music className="w-4 h-4 text-pink-400" />
                                            </span>
                                        )}
                                        {getStatusBadge(letter.status)}

                                        {/* Actions for drafts */}
                                        {type === 'drafts' && (
                                            <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => handleEdit(letter.id, e)}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                                    title="编辑"
                                                >
                                                    <Edit2 className="w-4 h-4 text-blue-400" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDelete(letter.id, e)}
                                                    disabled={deletingId === letter.id}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                                    title="删除"
                                                >
                                                    {deletingId === letter.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    )}
                                                </button>
                                            </div>
                                        )}

                                        {/* Actions for sent letters */}
                                        {type === 'sent' && (
                                            <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {/* 公开状态切换 */}
                                                {letter.status !== 'cancelled' && (
                                                    <button
                                                        onClick={(e) => handleTogglePublic(letter.id, letter.isPublic, e)}
                                                        disabled={togglingPublicId === letter.id}
                                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                                        title={letter.isPublic ? '设为非公开' : '设为公开'}
                                                    >
                                                        {togglingPublicId === letter.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : letter.isPublic ? (
                                                            <Globe className="w-4 h-4 text-green-400" />
                                                        ) : (
                                                            <GlobeLock className="w-4 h-4 text-gray-400" />
                                                        )}
                                                    </button>
                                                )}
                                                {/* 取消发送按钮 - 仅对可取消状态显示 */}
                                                {['approved', 'scheduled', 'pending_review'].includes(letter.status) && (
                                                    <button
                                                        onClick={(e) => handleCancel(letter.id, e)}
                                                        disabled={cancellingId === letter.id}
                                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                                        title="取消发送"
                                                    >
                                                        {cancellingId === letter.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <XCircle className="w-4 h-4 text-red-400" />
                                                        )}
                                                    </button>
                                                )}
                                                {/* 删除按钮 */}
                                                <button
                                                    onClick={(e) => handleDelete(letter.id, e)}
                                                    disabled={deletingId === letter.id}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                                    title="删除"
                                                >
                                                    {deletingId === letter.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    )}
                                                </button>
                                            </div>
                                        )}

                                        <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                                    </div>
                                </div>
                            </button>
                        ))}

                        {/* Load More */}
                        {nextCursor && (
                            <button
                                onClick={handleLoadMore}
                                disabled={isLoadingMore}
                                className="w-full py-4 text-center text-white/60 hover:text-white transition-colors disabled:opacity-50"
                            >
                                {isLoadingMore ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        加载中...
                                    </span>
                                ) : (
                                    '加载更多'
                                )}
                            </button>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
