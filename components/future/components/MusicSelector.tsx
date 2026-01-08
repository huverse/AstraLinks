/**
 * Future Letters - Music Selector Component
 * 网易云音乐选择器 - 使用官方外链播放器
 */

import React, { useState, useCallback } from 'react';
import {
    Music,
    X,
    Search,
    Link,
    Play,
    Loader2,
    ExternalLink,
    AlertCircle,
} from 'lucide-react';
import type { MusicInfo } from '../types';
import { API_BASE } from '../../../utils/api';

interface MusicSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (musicInfo: MusicInfo, musicUrl: string) => void;
    currentMusic?: MusicInfo;
}

// 网易云音乐外链播放器配置
const NETEASE_WIDGET_BASE = 'https://music.163.com/outchain/player';

/**
 * 从网易云音乐URL中提取歌曲ID
 * 支持格式:
 * - https://music.163.com/#/song?id=123456
 * - https://music.163.com/song?id=123456
 * - https://y.music.163.com/m/song?id=123456
 * - 纯数字ID
 */
function extractSongId(input: string): string | null {
    const trimmed = input.trim();

    // 纯数字
    if (/^\d+$/.test(trimmed)) {
        return trimmed;
    }

    // URL格式
    const patterns = [
        /music\.163\.com.*[?&]id=(\d+)/,
        /music\.163\.com\/song\/(\d+)/,
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}

/**
 * 生成网易云音乐外链播放器URL
 */
function generateWidgetUrl(songId: string, autoplay: boolean = false): string {
    // 使用iframe外链播放器
    // type=2 是单曲模式, auto=1 自动播放
    return `${NETEASE_WIDGET_BASE}?type=2&id=${songId}&auto=${autoplay ? 1 : 0}&height=66`;
}

export default function MusicSelector({
    isOpen,
    onClose,
    onSelect,
    currentMusic,
}: MusicSelectorProps) {
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewSongId, setPreviewSongId] = useState<string | null>(null);
    const [previewInfo, setPreviewInfo] = useState<MusicInfo | null>(null);

    const handleParse = useCallback(async () => {
        const songId = extractSongId(inputValue);
        if (!songId) {
            setError('无法识别歌曲ID，请输入正确的网易云音乐链接或歌曲ID');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 尝试获取歌曲信息（通过后端代理避免跨域）
            const response = await fetch(`${API_BASE}/api/future/music/parse?id=${songId}`, {
                credentials: 'include',
            });

            if (response.ok) {
                const data = await response.json();
                setPreviewInfo({
                    id: songId,
                    name: data.name || `歌曲 ${songId}`,
                    artist: data.artist || '未知艺术家',
                    coverUrl: data.coverUrl,
                });
            } else {
                // 即使获取信息失败，也允许使用（用户可能知道是什么歌）
                setPreviewInfo({
                    id: songId,
                    name: `歌曲 ${songId}`,
                    artist: '点击预览确认',
                });
            }

            setPreviewSongId(songId);
        } catch (err) {
            // 网络错误时仍然允许预览
            setPreviewInfo({
                id: songId,
                name: `歌曲 ${songId}`,
                artist: '点击预览确认',
            });
            setPreviewSongId(songId);
        } finally {
            setIsLoading(false);
        }
    }, [inputValue]);

    const handleConfirm = useCallback(() => {
        if (!previewSongId || !previewInfo) return;

        const musicUrl = `https://music.163.com/#/song?id=${previewSongId}`;
        onSelect(previewInfo, musicUrl);
        handleClose();
    }, [previewSongId, previewInfo, onSelect]);

    const handleClose = useCallback(() => {
        setInputValue('');
        setError(null);
        setPreviewSongId(null);
        setPreviewInfo(null);
        onClose();
    }, [onClose]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isLoading && inputValue.trim()) {
            handleParse();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-slate-800 rounded-2xl border border-white/10 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <Music className="w-5 h-5 text-pink-400" />
                        <h3 className="text-lg font-semibold">添加背景音乐</h3>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1 text-white/50 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Input */}
                    <div>
                        <label className="block text-sm text-white/70 mb-2">
                            输入网易云音乐链接或歌曲ID
                        </label>
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="https://music.163.com/#/song?id=... 或 歌曲ID"
                                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-pink-500 focus:outline-none transition-colors"
                                />
                            </div>
                            <button
                                onClick={handleParse}
                                disabled={isLoading || !inputValue.trim()}
                                className="px-4 py-3 bg-pink-500 rounded-xl font-medium hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Search className="w-4 h-4" />
                                )}
                                解析
                            </button>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Preview */}
                    {previewSongId && previewInfo && (
                        <div className="space-y-3">
                            <div className="text-sm text-white/70">预览</div>

                            {/* Song Info */}
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                                {previewInfo.coverUrl ? (
                                    <img
                                        src={previewInfo.coverUrl}
                                        alt={previewInfo.name}
                                        className="w-12 h-12 rounded"
                                    />
                                ) : (
                                    <div className="w-12 h-12 bg-pink-500/20 rounded flex items-center justify-center">
                                        <Music className="w-6 h-6 text-pink-400" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{previewInfo.name}</div>
                                    <div className="text-sm text-white/50 truncate">{previewInfo.artist}</div>
                                </div>
                                <a
                                    href={`https://music.163.com/#/song?id=${previewSongId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 text-white/50 hover:text-white transition-colors"
                                    title="在网易云音乐中打开"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>

                            {/* Netease Widget Player */}
                            <div className="rounded-lg overflow-hidden bg-white/5">
                                <iframe
                                    src={generateWidgetUrl(previewSongId, false)}
                                    width="100%"
                                    height="86"
                                    frameBorder="0"
                                    allow="autoplay"
                                    title="网易云音乐播放器"
                                    className="w-full"
                                />
                            </div>

                            <p className="text-xs text-white/40 text-center">
                                收件人查看信件时将看到此播放器
                            </p>
                        </div>
                    )}

                    {/* Help */}
                    {!previewSongId && (
                        <div className="text-xs text-white/40 bg-white/5 rounded-lg p-3">
                            <p className="font-medium text-white/60 mb-1">如何获取链接：</p>
                            <p>1. 打开网易云音乐网页版或APP</p>
                            <p>2. 找到想要的歌曲，点击分享或复制链接</p>
                            <p>3. 粘贴到上方输入框</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-white/10">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-white/70 hover:text-white transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!previewSongId}
                        className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg font-medium hover:shadow-lg hover:shadow-pink-500/30 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        确认选择
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * 网易云音乐外链播放器组件
 * 用于在信件查看页面嵌入播放器
 */
export function NeteasePlayer({
    songId,
    autoplay = false,
    className = '',
}: {
    songId: string;
    autoplay?: boolean;
    className?: string;
}) {
    return (
        <div className={`rounded-lg overflow-hidden ${className}`}>
            <iframe
                src={generateWidgetUrl(songId, autoplay)}
                width="100%"
                height="86"
                frameBorder="0"
                allow="autoplay"
                title="网易云音乐播放器"
                className="w-full"
            />
        </div>
    );
}
