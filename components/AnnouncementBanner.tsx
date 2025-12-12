import React, { useState, useEffect, useCallback } from 'react';
import { X, Megaphone, FileText, Shield, AlertTriangle, ChevronRight, Check, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../utils/api';

interface Announcement {
    id: number;
    title: string;
    content: string;
    content_type: string;
    display_type: string;
    priority: string;
    is_mandatory?: boolean;
    start_time?: string;
    end_time?: string;
}

interface AnnouncementBannerProps {
    isOpen: boolean;
    onClose: () => void;
}

// Store dismissed announcement IDs with timestamp
const DISMISS_KEY = 'announcement_dismissed_ids';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function AnnouncementBanner({ isOpen, onClose }: AnnouncementBannerProps) {
    const { isAuthenticated, token } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showFullContent, setShowFullContent] = useState(false);
    const [dontShowFor24h, setDontShowFor24h] = useState(false);

    // Get dismissed announcement IDs that are still valid
    const getDismissedIds = useCallback((): Set<number> => {
        try {
            const stored = localStorage.getItem(DISMISS_KEY);
            if (!stored) return new Set();

            const data = JSON.parse(stored);
            const now = Date.now();
            const validIds = new Set<number>();

            // Filter out expired dismissals
            Object.entries(data).forEach(([id, timestamp]) => {
                if (now - (timestamp as number) < DISMISS_DURATION_MS) {
                    validIds.add(parseInt(id));
                }
            });

            return validIds;
        } catch {
            return new Set();
        }
    }, []);

    // Dismiss a specific announcement for 24 hours
    const dismissAnnouncement = useCallback((id: number) => {
        try {
            const stored = localStorage.getItem(DISMISS_KEY);
            const data = stored ? JSON.parse(stored) : {};
            data[id] = Date.now();
            localStorage.setItem(DISMISS_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save dismiss state:', e);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchAnnouncements();
        }
    }, [isOpen, isAuthenticated]);

    const fetchAnnouncements = async () => {
        try {
            setLoading(true);
            setCurrentIndex(0);

            // Try authenticated endpoint first, fallback to public
            const endpoint = isAuthenticated
                ? `${API_BASE}/api/announcements/active`
                : `${API_BASE}/api/announcements/public`;

            const headers: Record<string, string> = {};
            if (isAuthenticated && token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            console.log('[Announcement] Fetching from:', endpoint);
            const res = await fetch(endpoint, { headers });

            if (res.ok) {
                const data = await res.json();
                console.log('[Announcement] Received:', data);

                const allAnnouncements = data.announcements || [];

                // Filter: exclude terms/privacy, exclude 24h dismissed
                const dismissedIds = getDismissedIds();
                const filtered = allAnnouncements.filter((a: Announcement) => {
                    // Exclude terms and privacy from regular announcement display
                    if (a.content_type === 'terms' || a.content_type === 'privacy') {
                        return false;
                    }
                    // Exclude recently dismissed (unless user opted to dismiss for 24h)
                    if (dismissedIds.has(a.id)) {
                        return false;
                    }
                    return true;
                });

                console.log('[Announcement] Filtered to', filtered.length, 'announcements');
                setAnnouncements(filtered);
            } else {
                console.error('[Announcement] Fetch failed:', res.status);
            }
        } catch (error) {
            console.error('Failed to fetch announcements:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id: number) => {
        if (!isAuthenticated || !token) return;

        try {
            await fetch(`${API_BASE}/api/announcements/${id}/read`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const handleDismiss = () => {
        const current = announcements[currentIndex];
        if (current && dontShowFor24h) {
            dismissAnnouncement(current.id);
        }
        onClose();
    };

    const handleNext = async () => {
        const current = announcements[currentIndex];
        if (current) {
            if (isAuthenticated) {
                await markAsRead(current.id);
            }
            if (dontShowFor24h) {
                dismissAnnouncement(current.id);
            }
        }

        if (currentIndex < announcements.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setShowFullContent(false);
            setDontShowFor24h(false);
        } else {
            handleDismiss();
        }
    };

    const handleClose = async () => {
        const current = announcements[currentIndex];
        if (current?.is_mandatory) {
            alert('请阅读完整公告后再继续');
            return;
        }

        if (current && isAuthenticated) {
            await markAsRead(current.id);
        }
        handleDismiss();
    };

    // Don't render if not open, loading, or no announcements
    if (!isOpen || loading) return null;
    if (announcements.length === 0) {
        // Close immediately if no announcements to show
        onClose();
        return null;
    }

    const current = announcements[currentIndex];

    const getIcon = () => {
        switch (current.content_type) {
            case 'terms': return <FileText className="text-blue-400" size={24} />;
            case 'privacy': return <Shield className="text-green-400" size={24} />;
            case 'important': return <AlertTriangle className="text-amber-400" size={24} />;
            default: return <Megaphone className="text-purple-400" size={24} />;
        }
    };

    const getPriorityColor = () => {
        switch (current.priority) {
            case 'critical': return 'border-red-500 bg-red-500/10';
            case 'urgent': return 'border-orange-500 bg-orange-500/10';
            case 'high': return 'border-amber-500 bg-amber-500/10';
            default: return 'border-blue-500/30 bg-blue-500/5';
        }
    };

    const formatTime = (timeStr?: string) => {
        if (!timeStr) return null;
        try {
            return new Date(timeStr).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className={`bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl border-2 ${getPriorityColor()}`}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600">
                    <div className="flex items-center gap-3">
                        {getIcon()}
                        <div>
                            <h3 className="text-lg font-bold text-white line-clamp-1">{current.title}</h3>
                            <div className="flex items-center gap-2 text-xs text-white/70">
                                <span>{currentIndex + 1} / {announcements.length}</span>
                                {current.end_time && (
                                    <span className="flex items-center gap-1">
                                        <Clock size={12} />
                                        有效期至 {formatTime(current.end_time)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    {!current.is_mandatory && (
                        <button
                            onClick={handleClose}
                            className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 max-h-[50vh] overflow-y-auto">
                    <div
                        className={`text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap ${!showFullContent && current.content.length > 300 ? 'line-clamp-6' : ''}`}
                    >
                        {current.content}
                    </div>
                    {current.content.length > 300 && !showFullContent && (
                        <button
                            onClick={() => setShowFullContent(true)}
                            className="mt-2 text-blue-500 hover:text-blue-600 text-sm flex items-center gap-1"
                        >
                            展开全文 <ChevronRight size={14} />
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-500 dark:text-slate-400">
                            <input
                                type="checkbox"
                                checked={dontShowFor24h}
                                onChange={(e) => setDontShowFor24h(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            24小时内不再显示
                        </label>

                        <button
                            onClick={handleNext}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all font-medium shadow-lg"
                        >
                            {currentIndex < announcements.length - 1 ? (
                                <>下一条 <ChevronRight size={18} /></>
                            ) : (
                                <><Check size={18} /> 知道了</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
