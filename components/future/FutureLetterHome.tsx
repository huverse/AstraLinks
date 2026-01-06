/**
 * Future Letters - Home Page (Entry with flip animation)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Mail,
    Send,
    Inbox,
    FileText,
    Settings,
    Plus,
    Clock,
    Lock,
    Music,
    ChevronRight,
    ArrowLeft,
    Globe,
    Trash2,
    Loader2,
} from 'lucide-react';
import type { FutureView, FutureLetterSummary, LetterListResponse } from './types';
import { STATUS_LABELS, STATUS_COLORS } from './types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from './ToastProvider';
import { API_BASE } from '../../utils/api';

interface FutureLetterHomeProps {
    onBack: () => void;
    onNavigate: (view: FutureView, letterId?: string) => void;
}

export default function FutureLetterHome({ onBack, onNavigate }: FutureLetterHomeProps) {
    const { token } = useAuth();
    const toast = useToast();
    const [recentLetters, setRecentLetters] = useState<FutureLetterSummary[]>([]);
    const [stats, setStats] = useState({
        drafts: 0,
        scheduled: 0,
        delivered: 0,
        receivedUnread: 0,  // 未读的收到信件数
    });
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadHomeData = useCallback(async () => {
        setIsLoading(true);
        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // 并行加载最近信件和统计数据
            const [lettersRes, statsRes] = await Promise.all([
                fetch(`${API_BASE}/api/future/letters?limit=5&sort=created_at&order=desc`, {
                    credentials: 'include',
                    headers,
                }),
                fetch(`${API_BASE}/api/future/stats`, {
                    credentials: 'include',
                    headers,
                }),
            ]);

            if (lettersRes.ok) {
                const data: LetterListResponse = await lettersRes.json();
                setRecentLetters(data.letters);
            }

            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats({
                    drafts: statsData.drafts || 0,
                    scheduled: (statsData.sent || 0) + (statsData.scheduled || 0),
                    delivered: statsData.received || 0,
                    receivedUnread: statsData.receivedUnread || 0,
                });
            }
        } catch (error) {
            console.error('Failed to load home data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadHomeData();
    }, [loadHomeData]);

    // 删除信件（只能删除草稿）
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
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error?.message || '删除失败');
            }

            setRecentLetters(prev => prev.filter(l => l.id !== letterId));
            // 更新草稿数统计
            setStats(prev => ({ ...prev, drafts: Math.max(0, prev.drafts - 1) }));
            toast.success('删除成功');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '删除失败');
        } finally {
            setDeletingId(null);
        }
    };

    const menuItems = [
        {
            icon: Plus,
            label: '写一封信',
            description: '给未来的自己或他人写信',
            color: 'from-purple-500 to-pink-500',
            onClick: () => onNavigate('compose'),
        },
        {
            icon: Send,
            label: '已发送',
            description: '查看发出的信件',
            color: 'from-blue-500 to-cyan-500',
            count: stats.scheduled,
            onClick: () => onNavigate('sent'),
        },
        {
            icon: Inbox,
            label: '已收到',
            description: '来自过去的信件',
            color: 'from-green-500 to-emerald-500',
            count: stats.receivedUnread,
            onClick: () => onNavigate('received'),
        },
        {
            icon: FileText,
            label: '草稿箱',
            description: '未完成的信件',
            color: 'from-orange-500 to-amber-500',
            count: stats.drafts,
            onClick: () => onNavigate('drafts'),
        },
        {
            icon: Globe,
            label: '公开信墙',
            description: '浏览公开分享的信件',
            color: 'from-indigo-500 to-purple-500',
            onClick: () => onNavigate('public'),
        },
    ];

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
                    <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                        时光信
                    </h1>
                    <button
                        onClick={() => onNavigate('settings')}
                        className="p-2 text-white/70 hover:text-white transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-6 shadow-lg shadow-purple-500/30">
                        <Mail className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-bold mb-3">
                        给未来写一封信
                    </h2>
                    <p className="text-white/60 max-w-md mx-auto">
                        时光信会在你指定的时间送达，穿越时间与自己或他人对话
                    </p>
                </div>

                {/* Menu Grid */}
                <div className="grid grid-cols-2 gap-4 mb-12">
                    {menuItems.map((item, index) => (
                        <button
                            key={index}
                            onClick={item.onClick}
                            className="relative group bg-white/5 hover:bg-white/10 rounded-2xl p-6 text-left transition-all duration-300 border border-white/10 hover:border-white/20 overflow-hidden"
                        >
                            {/* Gradient Background */}
                            <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-10 transition-opacity`} />

                            {/* Content */}
                            <div className="relative">
                                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${item.color} mb-4`}>
                                    <item.icon className="w-6 h-6" />
                                </div>
                                <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                                    {item.label}
                                    {item.count !== undefined && item.count > 0 && (
                                        <span className="text-sm px-2 py-0.5 bg-white/20 rounded-full">
                                            {item.count}
                                        </span>
                                    )}
                                </h3>
                                <p className="text-white/50 text-sm">{item.description}</p>
                            </div>

                            {/* Arrow */}
                            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                        </button>
                    ))}
                </div>

                {/* Recent Letters */}
                <section>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-purple-400" />
                        最近的信件
                    </h3>

                    {isLoading ? (
                        <div className="text-center py-8 text-white/50">
                            加载中...
                        </div>
                    ) : recentLetters.length === 0 ? (
                        <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
                            <Mail className="w-12 h-12 mx-auto mb-4 text-white/30" />
                            <p className="text-white/50 mb-4">还没有写过信</p>
                            <button
                                onClick={() => onNavigate('compose')}
                                className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-medium hover:shadow-lg hover:shadow-purple-500/30 transition-shadow"
                            >
                                写第一封信
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recentLetters.map((letter) => (
                                <div
                                    key={letter.id}
                                    className="w-full bg-white/5 hover:bg-white/10 rounded-xl p-4 text-left transition-colors border border-white/10 hover:border-white/20 group"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <button
                                            onClick={() => onNavigate('detail', letter.id)}
                                            className="flex-1 min-w-0 text-left"
                                        >
                                            <h4 className="font-medium truncate mb-1 group-hover:text-purple-300 transition-colors">
                                                {letter.title || '无标题'}
                                            </h4>
                                            <div className="flex items-center gap-2 text-sm text-white/50">
                                                <span>
                                                    {letter.recipientType === 'self' ? '给自己' : letter.recipientName || '给他人'}
                                                </span>
                                                <span>·</span>
                                                <span>
                                                    {new Date(letter.scheduledAtUtc).toLocaleString('zh-CN', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>
                                        </button>
                                        <div className="flex items-center gap-2">
                                            {letter.isEncrypted && (
                                                <Lock className="w-4 h-4 text-amber-400" />
                                            )}
                                            {letter.hasMusic && (
                                                <Music className="w-4 h-4 text-pink-400" />
                                            )}
                                            <span className={`text-xs px-2 py-1 rounded-full bg-${STATUS_COLORS[letter.status]}-500/20 text-${STATUS_COLORS[letter.status]}-400`}>
                                                {STATUS_LABELS[letter.status]}
                                            </span>
                                            {/* 草稿状态显示删除按钮 */}
                                            {letter.status === 'draft' && (
                                                <button
                                                    onClick={(e) => handleDelete(letter.id, e)}
                                                    disabled={deletingId === letter.id}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                                    title="删除草稿"
                                                >
                                                    {deletingId === letter.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    )}
                                                </button>
                                            )}
                                            <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

            </main>

            {/* 底部安全区域 */}
            <div className="pb-24" />
        </div>
    );
}
