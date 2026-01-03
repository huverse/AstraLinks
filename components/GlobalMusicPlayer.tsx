/**
 * Global Background Music Player
 * 入站背景音乐播放器 - 固定在页面右下角
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Music, EyeOff, Volume2, VolumeX } from 'lucide-react';
import { API_BASE } from '../utils/api';

interface BackgroundMusicSettings {
    enabled: boolean;
    songId: string;
    autoplay: boolean;
}

// LocalStorage keys
const STORAGE_KEYS = {
    VISIBLE: 'galaxyous_bgm_visible',
    MUTED: 'galaxyous_bgm_muted',
} as const;

// 网易云音乐外链播放器
const NETEASE_WIDGET_BASE = 'https://music.163.com/outchain/player';

function generateWidgetUrl(songId: string, autoplay: boolean): string {
    return `${NETEASE_WIDGET_BASE}?type=2&id=${songId}&auto=${autoplay ? 1 : 0}&height=66`;
}

function loadStoredBoolean(key: string, defaultValue: boolean): boolean {
    try {
        const stored = localStorage.getItem(key);
        if (stored === null) return defaultValue;
        return stored === 'true';
    } catch {
        return defaultValue;
    }
}

function saveStoredBoolean(key: string, value: boolean): void {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Ignore storage errors
    }
}

export default function GlobalMusicPlayer() {
    const [settings, setSettings] = useState<BackgroundMusicSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isVisible, setIsVisible] = useState(() => loadStoredBoolean(STORAGE_KEYS.VISIBLE, true));
    const [isMuted, setIsMuted] = useState(() => loadStoredBoolean(STORAGE_KEYS.MUTED, false));
    const [isExpanded, setIsExpanded] = useState(false);

    // Fetch settings on mount
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        const fetchSettings = async () => {
            try {
                const response = await fetch(`${API_BASE}/api/settings/public/background-music`, {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                if (!isMounted) return;

                setSettings({
                    enabled: Boolean(data.enabled),
                    songId: String(data.songId || '').trim(),
                    autoplay: Boolean(data.autoplay),
                });
            } catch (error: any) {
                if (error?.name === 'AbortError') return;
                console.warn('Failed to fetch background music settings:', error);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchSettings();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, []);

    // Persist visibility preference
    useEffect(() => {
        saveStoredBoolean(STORAGE_KEYS.VISIBLE, isVisible);
    }, [isVisible]);

    // Persist mute preference
    useEffect(() => {
        saveStoredBoolean(STORAGE_KEYS.MUTED, isMuted);
    }, [isMuted]);

    const toggleVisible = useCallback(() => {
        setIsVisible(prev => !prev);
    }, []);

    const toggleMuted = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    const toggleExpanded = useCallback(() => {
        setIsExpanded(prev => !prev);
    }, []);

    // Don't render if loading, disabled, or no song configured
    if (isLoading || !settings?.enabled || !settings.songId) {
        return null;
    }

    // Hidden player iframe - keeps playing when panel is hidden or collapsed
    const hiddenPlayer = !isMuted && (
        <div
            className="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none"
            aria-hidden="true"
        >
            <iframe
                src={generateWidgetUrl(settings.songId, settings.autoplay)}
                width="330"
                height="86"
                frameBorder="0"
                allow="autoplay"
                title="网易云音乐播放器 (后台)"
            />
        </div>
    );

    // Only show the collapsed button when player is hidden
    if (!isVisible) {
        return (
            <>
                {hiddenPlayer}
                <button
                    onClick={toggleVisible}
                    className="fixed bottom-24 right-4 md:bottom-24 md:right-6 z-40 p-3 rounded-full shadow-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:shadow-pink-500/30 hover:scale-105 transition-all"
                    title="显示音乐播放器"
                >
                    <Music size={20} />
                </button>
            </>
        );
    }

    return (
        <div className="fixed bottom-24 right-4 md:bottom-24 md:right-6 z-40">
            <div className={`bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ${
                isExpanded ? 'w-80' : 'w-14'
            }`}>
                {/* Header / Collapsed Button */}
                <div className="flex items-center justify-between p-2">
                    <button
                        onClick={toggleExpanded}
                        className="p-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:shadow-lg hover:shadow-pink-500/30 transition-all"
                        title={isExpanded ? '收起播放器' : '展开播放器'}
                    >
                        <Music size={18} />
                    </button>

                    {isExpanded && (
                        <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mr-2">
                                背景音乐
                            </span>
                            <button
                                onClick={toggleMuted}
                                className={`p-1.5 rounded-lg transition-colors ${
                                    isMuted
                                        ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                                }`}
                                title={isMuted ? '取消静音' : '静音'}
                            >
                                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                            </button>
                            <button
                                onClick={toggleVisible}
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 transition-colors"
                                title="隐藏播放器"
                            >
                                <EyeOff size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Player Content */}
                {isExpanded ? (
                    <div className="px-2 pb-2">
                        {isMuted ? (
                            <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">
                                <VolumeX className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                已静音
                            </div>
                        ) : (
                            <div className="rounded-lg overflow-hidden bg-slate-100/50 dark:bg-white/5">
                                <iframe
                                    src={generateWidgetUrl(settings.songId, settings.autoplay)}
                                    width="100%"
                                    height="86"
                                    frameBorder="0"
                                    allow="autoplay"
                                    title="网易云音乐播放器"
                                    className="w-full"
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    // Collapsed state - keep hidden player for background playback
                    hiddenPlayer
                )}
            </div>
        </div>
    );
}
