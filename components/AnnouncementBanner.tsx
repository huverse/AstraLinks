import React, { useState, useEffect } from 'react';
import { X, Megaphone, FileText, Shield, AlertTriangle, ChevronRight, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../utils/api';

interface Announcement {
    id: number;
    title: string;
    content: string;
    content_type: 'general' | 'important' | 'terms' | 'privacy';
    priority: 'low' | 'normal' | 'high' | 'critical';
    is_mandatory?: boolean;
}

interface AnnouncementBannerProps {
    isOpen: boolean;
    onClose: () => void;
}

const DISMISS_KEY = 'announcement_dismissed_until';

export default function AnnouncementBanner({ isOpen, onClose }: AnnouncementBannerProps) {
    const { isAuthenticated, token } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showFullContent, setShowFullContent] = useState(false);
    const [dontShowToday, setDontShowToday] = useState(false);

    // Check if should show based on dismiss setting
    const shouldShow = () => {
        const dismissedUntil = localStorage.getItem(DISMISS_KEY);
        if (dismissedUntil) {
            const until = parseInt(dismissedUntil, 10);
            if (Date.now() < until) {
                return false;
            }
        }
        return true;
    };

    useEffect(() => {
        if (isOpen && shouldShow()) {
            fetchAnnouncements();
        } else if (isOpen && !shouldShow()) {
            // Auto-close if dismissed
            onClose();
        }
    }, [isOpen, isAuthenticated]);

    const fetchAnnouncements = async () => {
        try {
            setLoading(true);
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
                // Filter out terms and privacy from regular announcements
                const filtered = (data.announcements || []).filter((a: Announcement) =>
                    a.content_type !== 'terms' && a.content_type !== 'privacy'
                );
                setAnnouncements(filtered);
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
        if (dontShowToday) {
            // Set dismiss until 24 hours from now
            const until = Date.now() + 24 * 60 * 60 * 1000;
            localStorage.setItem(DISMISS_KEY, until.toString());
        }
        onClose();
    };

    const handleNext = async () => {
        const current = announcements[currentIndex];
        if (current && isAuthenticated) {
            await markAsRead(current.id);
        }

        if (currentIndex < announcements.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setShowFullContent(false);
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

    if (!isOpen || loading || announcements.length === 0 || !shouldShow()) return null;

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
            case 'critical': return 'from-red-600 to-pink-600';
            case 'high': return 'from-amber-600 to-orange-600';
            case 'normal': return 'from-blue-600 to-indigo-600';
            default: return 'from-slate-600 to-gray-600';
        }
    };

    const getTypeLabel = () => {
        switch (current.content_type) {
            case 'terms': return '用户协议';
            case 'privacy': return '隐私政策';
            case 'important': return '重要通知';
            default: return '公告';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 animate-scale-in">
                {/* Header */}
                <div className={`px-6 py-5 bg-gradient-to-r ${getPriorityColor()} flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-xl">
                            {getIcon()}
                        </div>
                        <div>
                            <span className="text-xs font-bold text-white/70 uppercase tracking-wider">
                                {getTypeLabel()}
                            </span>
                            <h2 className="text-lg font-bold text-white line-clamp-1">
                                {current.title}
                            </h2>
                        </div>
                    </div>
                    {!current.is_mandatory && (
                        <button
                            onClick={handleClose}
                            className="p-2 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 max-h-[50vh] overflow-y-auto">
                    <div
                        className={`prose prose-sm dark:prose-invert max-w-none ${!showFullContent && current.content.length > 500 ? 'line-clamp-6' : ''}`}
                        dangerouslySetInnerHTML={{ __html: current.content.replace(/\n/g, '<br/>') }}
                    />

                    {current.content.length > 500 && !showFullContent && (
                        <button
                            onClick={() => setShowFullContent(true)}
                            className="mt-4 text-blue-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1"
                        >
                            查看完整内容 <ChevronRight size={14} />
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {/* Don't show today checkbox */}
                            <button
                                type="button"
                                onClick={() => setDontShowToday(!dontShowToday)}
                                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all ${dontShowToday
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-white dark:bg-slate-700 border-2 border-slate-300 dark:border-slate-600'
                                    }`}
                            >
                                {dontShowToday && <Check size={14} />}
                            </button>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                一天内不再显示
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {announcements.length > 1 && (
                                <span className="text-sm text-slate-500">{currentIndex + 1} / {announcements.length}</span>
                            )}
                            <button
                                onClick={handleNext}
                                className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all active:scale-95"
                            >
                                {currentIndex < announcements.length - 1 ? '下一条' : '我知道了'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
