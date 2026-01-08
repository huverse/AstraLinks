/**
 * Open Letter Wall (公开信墙)
 * Displays publicly shared letters without authentication
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ArrowLeft,
    ScrollText,
    User,
    Clock,
    Loader2,
    ChevronRight,
    RefreshCw,
    Music,
    Globe,
} from 'lucide-react';
import { API_BASE } from '../../utils/api';

interface OpenLetterWallProps {
    onBack: () => void;
}

// 分类标签定义
type LetterCategory = 'love' | 'family' | 'friendship' | 'growth' | 'gratitude' | 'time';

interface CategoryTab {
    key: LetterCategory | 'all';
    label: string;
}

const CATEGORY_TABS: CategoryTab[] = [
    { key: 'all', label: '全部' },
    { key: 'love', label: '爱情' },
    { key: 'family', label: '亲情' },
    { key: 'friendship', label: '友情' },
    { key: 'growth', label: '成长' },
    { key: 'gratitude', label: '感恩' },
    { key: 'time', label: '时光' },
];

interface PublicLetterSummary {
    id: string;
    title: string;
    category: LetterCategory | null;
    contentPreview: string;
    displayName: string;
    publishedAt: string;
}

interface PublicLetterDetail {
    id: string;
    title: string;
    content: string;
    contentHtmlSanitized?: string;
    displayName: string;
    publishedAt: string;
    music?: {
        id: string;
        name: string;
        artist: string;
        coverUrl?: string;
    };
}

interface PublicLetterListResponse {
    letters: PublicLetterSummary[];
    nextCursor?: string;
    total: number;
}

const PAGE_LIMIT = 20;

export default function OpenLetterWall({ onBack }: OpenLetterWallProps) {
    // 分类筛选状态
    const [activeCategory, setActiveCategory] = useState<LetterCategory | 'all'>('all');
    const tabsContainerRef = useRef<HTMLDivElement>(null);

    // List state
    const [letters, setLetters] = useState<PublicLetterSummary[]>([]);
    const [nextCursor, setNextCursor] = useState<string | undefined>();
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Detail state
    const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
    const [selectedLetter, setSelectedLetter] = useState<PublicLetterDetail | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    /**
     * Load public letters list
     */
    const loadLetters = useCallback(async (cursor?: string, append = false, category?: LetterCategory | 'all') => {
        if (cursor) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const params = new URLSearchParams({
                limit: String(PAGE_LIMIT),
            });
            if (cursor) params.set('cursor', cursor);
            // 只有非「全部」分类时才传 category 参数
            const categoryToUse = category !== undefined ? category : activeCategory;
            if (categoryToUse && categoryToUse !== 'all') {
                params.set('category', categoryToUse);
            }

            const response = await fetch(`${API_BASE}/api/future/public/letters?${params.toString()}`, {
                credentials: 'include',
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error?.message || '加载失败');
            }

            const data: PublicLetterListResponse = await response.json();

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
    }, [activeCategory]);

    /**
     * Load single letter detail
     */
    const loadDetail = useCallback(async (letterId: string) => {
        setSelectedLetterId(letterId);
        setIsDetailLoading(true);
        setDetailError(null);
        setSelectedLetter(null);

        try {
            const response = await fetch(`${API_BASE}/api/future/public/letters/${letterId}`, {
                credentials: 'include',
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error?.message || '加载失败');
            }

            const data: PublicLetterDetail = await response.json();
            setSelectedLetter(data);
        } catch (err) {
            setDetailError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsDetailLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadLetters();
    }, [loadLetters]);

    /**
     * Handle category tab change
     */
    const handleCategoryChange = (category: LetterCategory | 'all') => {
        if (category === activeCategory) return;
        setActiveCategory(category);
        setLetters([]);
        setNextCursor(undefined);
        loadLetters(undefined, false, category);
    };

    /**
     * Handle back navigation
     */
    const handleBack = () => {
        if (selectedLetterId) {
            setSelectedLetterId(null);
            setSelectedLetter(null);
            setDetailError(null);
            setIsDetailLoading(false);
            return;
        }
        onBack();
    };

    /**
     * Load more letters
     */
    const handleLoadMore = () => {
        if (nextCursor && !isLoadingMore) {
            loadLetters(nextCursor, true);
        }
    };

    /**
     * Format date for display - 人性化日期时间格式
     */
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // 今天内显示时间
        if (diffDays === 0 && date.toDateString() === now.toDateString()) {
            return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
        }
        // 昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
        }
        // 7天内显示几天前
        if (diffDays < 7 && diffDays > 0) {
            return `${diffDays}天前`;
        }
        // 同年显示月日时分
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        }
        // 不同年显示完整日期时间
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const isDetailView = selectedLetterId !== null;

    return (
        <div className="min-h-screen text-white relative z-10">
            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>{isDetailView ? '返回列表' : '返回'}</span>
                    </button>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Globe className="w-5 h-5 text-purple-300" />
                        公开信墙
                    </h1>
                    <button
                        onClick={() => {
                            if (isDetailView && selectedLetterId) {
                                loadDetail(selectedLetterId);
                            } else {
                                loadLetters();
                            }
                        }}
                        disabled={isLoading || isDetailLoading}
                        className="p-2 text-white/70 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-5 h-5 ${(isLoading || isDetailLoading) ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6">
                {/* List View */}
                {!isDetailView && (
                    <>
                        {/* Stats */}
                        <div className="mb-4 flex items-center justify-between">
                            <p className="text-white/60 text-sm">
                                共 {total} 封公开信
                            </p>
                        </div>

                        {/* Category Tabs - 水平滚动分类标签 */}
                        <div className="mb-6 -mx-4 px-4">
                            <div
                                ref={tabsContainerRef}
                                className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                                {CATEGORY_TABS.map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => handleCategoryChange(tab.key)}
                                        className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                            activeCategory === tab.key
                                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                                                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Loading */}
                        {isLoading && (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                            </div>
                        )}

                        {/* Error */}
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
                                <ScrollText className="w-12 h-12 mx-auto mb-4 text-white/30" />
                                <p className="text-white/50">还没有公开信</p>
                                <p className="text-white/30 text-sm mt-2">成为第一个分享的人吧</p>
                            </div>
                        )}

                        {/* Letter List */}
                        {!isLoading && !error && letters.length > 0 && (
                            <div className="space-y-3">
                                {letters.map((letter) => (
                                    <button
                                        key={letter.id}
                                        onClick={() => loadDetail(letter.id)}
                                        className="w-full bg-white/5 hover:bg-white/10 rounded-xl p-4 text-left transition-colors border border-white/10 hover:border-white/20 group"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium truncate mb-1 group-hover:text-purple-300 transition-colors">
                                                    {letter.title}
                                                </h4>
                                                <div className="flex items-center gap-2 text-sm text-white/50 flex-wrap">
                                                    <span className="flex items-center gap-1">
                                                        <User className="w-3 h-3" />
                                                        {letter.displayName}
                                                    </span>
                                                    <span>·</span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDate(letter.publishedAt)}
                                                    </span>
                                                </div>
                                                {letter.contentPreview && (
                                                    <p className="mt-2 text-sm text-white/70 whitespace-pre-wrap line-clamp-2">
                                                        {letter.contentPreview}
                                                    </p>
                                                )}
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0" />
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
                    </>
                )}

                {/* Detail View */}
                {isDetailView && (
                    <>
                        {/* Loading */}
                        {isDetailLoading && (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                            </div>
                        )}

                        {/* Error */}
                        {detailError && !isDetailLoading && (
                            <div className="text-center py-12">
                                <p className="text-red-400 mb-4">{detailError}</p>
                                <button
                                    onClick={() => selectedLetterId && loadDetail(selectedLetterId)}
                                    className="px-6 py-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                                >
                                    重试
                                </button>
                            </div>
                        )}

                        {/* Letter Content */}
                        {selectedLetter && !isDetailLoading && !detailError && (
                            <div>
                                {/* Header */}
                                <div className="mb-6">
                                    <h2 className="text-2xl font-bold mb-2">
                                        {selectedLetter.title}
                                    </h2>
                                    <div className="flex items-center gap-3 text-sm text-white/60 flex-wrap">
                                        <span className="flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {selectedLetter.displayName}
                                        </span>
                                        <span>·</span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDate(selectedLetter.publishedAt)}
                                        </span>
                                    </div>
                                </div>

                                {/* Music (if any) */}
                                {selectedLetter.music && (
                                    <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-4">
                                        {selectedLetter.music.coverUrl && (
                                            <img
                                                src={selectedLetter.music.coverUrl}
                                                alt="Album cover"
                                                className="w-12 h-12 rounded-lg object-cover"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-purple-300 text-sm mb-1">
                                                <Music className="w-3 h-3" />
                                                <span>背景音乐</span>
                                            </div>
                                            <p className="font-medium truncate">{selectedLetter.music.name}</p>
                                            <p className="text-sm text-white/50 truncate">{selectedLetter.music.artist}</p>
                                        </div>
                                        {/* NeteaseCloud Music Player Widget */}
                                        <iframe
                                            frameBorder="no"
                                            width="330"
                                            height="86"
                                            src={`//music.163.com/outchain/player?type=2&id=${selectedLetter.music.id}&auto=0&height=66`}
                                            className="rounded-lg"
                                        />
                                    </div>
                                )}

                                {/* Content */}
                                <div className="bg-white/5 rounded-2xl p-6 md:p-8 border border-white/10">
                                    {selectedLetter.contentHtmlSanitized ? (
                                        <div
                                            className="prose prose-invert prose-purple max-w-none"
                                            dangerouslySetInnerHTML={{ __html: selectedLetter.contentHtmlSanitized }}
                                        />
                                    ) : (
                                        <div className="whitespace-pre-wrap text-white/90 leading-relaxed">
                                            {selectedLetter.content}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
