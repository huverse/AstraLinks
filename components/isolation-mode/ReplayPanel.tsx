/**
 * 回放面板组件
 *
 * 提供讨论历史回放功能：
 * - 时间线进度条
 * - 播放/暂停/速度控制
 * - 逐事件播放
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Play, Pause, SkipBack, SkipForward,
    FastForward, Rewind, Clock, ChevronLeft
} from 'lucide-react';
import { DiscussionEvent, Agent } from './types';
import { EventTimeline } from './EventTimeline';

interface ReplayPanelProps {
    events: DiscussionEvent[];
    agents?: Agent[];
    sessionInfo?: {
        topic?: string;
        scenarioName?: string;
        startTime?: string;
        endTime?: string;
    };
    onClose?: () => void;
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2, 4];

export const ReplayPanel: React.FC<ReplayPanelProps> = ({
    events,
    agents = [],
    sessionInfo,
    onClose
}) => {
    // 播放状态
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);

    // 定时器引用
    const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 当前可见事件
    const visibleEvents = useMemo(() => {
        return events.slice(0, currentIndex + 1);
    }, [events, currentIndex]);

    // 计算进度
    const progress = useMemo(() => {
        if (events.length === 0) return 0;
        return ((currentIndex + 1) / events.length) * 100;
    }, [currentIndex, events.length]);

    // 计算时间信息
    const timeInfo = useMemo(() => {
        if (events.length === 0) return { current: '00:00', total: '00:00' };

        const firstTime = new Date(events[0].timestamp).getTime();
        const lastTime = new Date(events[events.length - 1].timestamp).getTime();
        const currentTime = new Date(events[currentIndex]?.timestamp || firstTime).getTime();

        const formatTime = (ms: number) => {
            const seconds = Math.floor(ms / 1000);
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        return {
            current: formatTime(currentTime - firstTime),
            total: formatTime(lastTime - firstTime)
        };
    }, [events, currentIndex]);

    // 停止播放
    const stopPlayback = useCallback(() => {
        if (playbackTimerRef.current) {
            clearInterval(playbackTimerRef.current);
            playbackTimerRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    // 开始播放
    const startPlayback = useCallback(() => {
        if (currentIndex >= events.length - 1) {
            setCurrentIndex(0);
        }

        setIsPlaying(true);

        // 计算每帧间隔 (模拟真实时间流逝)
        const baseInterval = 1000 / playbackSpeed;

        playbackTimerRef.current = setInterval(() => {
            setCurrentIndex(prev => {
                if (prev >= events.length - 1) {
                    stopPlayback();
                    return prev;
                }
                return prev + 1;
            });
        }, baseInterval);
    }, [currentIndex, events.length, playbackSpeed, stopPlayback]);

    // 切换播放/暂停
    const togglePlayback = useCallback(() => {
        if (isPlaying) {
            stopPlayback();
        } else {
            startPlayback();
        }
    }, [isPlaying, stopPlayback, startPlayback]);

    // 跳转到指定位置
    const seekTo = useCallback((index: number) => {
        const clampedIndex = Math.max(0, Math.min(events.length - 1, index));
        setCurrentIndex(clampedIndex);
    }, [events.length]);

    // 进度条点击
    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        const newIndex = Math.floor(percent * events.length);
        seekTo(newIndex);
    }, [events.length, seekTo]);

    // 前进/后退
    const stepForward = useCallback(() => seekTo(currentIndex + 1), [currentIndex, seekTo]);
    const stepBackward = useCallback(() => seekTo(currentIndex - 1), [currentIndex, seekTo]);
    const jumpForward = useCallback(() => seekTo(currentIndex + 5), [currentIndex, seekTo]);
    const jumpBackward = useCallback(() => seekTo(currentIndex - 5), [currentIndex, seekTo]);

    // 切换速度
    const cycleSpeed = useCallback(() => {
        const currentSpeedIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
        const nextIndex = (currentSpeedIndex + 1) % PLAYBACK_SPEEDS.length;
        setPlaybackSpeed(PLAYBACK_SPEEDS[nextIndex]);
    }, [playbackSpeed]);

    // 清理定时器
    useEffect(() => {
        return () => {
            if (playbackTimerRef.current) {
                clearInterval(playbackTimerRef.current);
            }
        };
    }, []);

    // 速度变化时重新开始播放
    useEffect(() => {
        if (isPlaying) {
            stopPlayback();
            startPlayback();
        }
    }, [playbackSpeed]);

    // 键盘快捷键
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    togglePlayback();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (e.shiftKey) {
                        jumpForward();
                    } else {
                        stepForward();
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.shiftKey) {
                        jumpBackward();
                    } else {
                        stepBackward();
                    }
                    break;
                case 'Home':
                    e.preventDefault();
                    seekTo(0);
                    break;
                case 'End':
                    e.preventDefault();
                    seekTo(events.length - 1);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlayback, stepForward, stepBackward, jumpForward, jumpBackward, seekTo, events.length]);

    if (events.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <Clock className="mx-auto mb-2 opacity-50" size={32} />
                <p>暂无可回放的事件</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* 头部信息 */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <ChevronLeft size={20} />
                        </button>
                    )}
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            {sessionInfo?.topic || '讨论回放'}
                        </h2>
                        {sessionInfo?.scenarioName && (
                            <p className="text-sm text-slate-400">
                                {sessionInfo.scenarioName}
                            </p>
                        )}
                    </div>
                </div>

                <div className="text-sm text-slate-400 flex items-center gap-2">
                    <Clock size={14} />
                    <span>{timeInfo.current} / {timeInfo.total}</span>
                    <span className="text-slate-600">•</span>
                    <span>{currentIndex + 1} / {events.length} 事件</span>
                </div>
            </div>

            {/* 事件时间线 */}
            <div className="flex-1 overflow-hidden p-4">
                <EventTimeline
                    events={visibleEvents}
                    agents={agents}
                    autoScroll={true}
                />
            </div>

            {/* 控制面板 */}
            <div className="p-4 border-t border-white/10 bg-slate-900/50">
                {/* 进度条 */}
                <div
                    className="h-2 bg-slate-700 rounded-full cursor-pointer mb-4 group"
                    onClick={handleProgressClick}
                >
                    <div
                        className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full relative transition-all"
                        style={{ width: `${progress}%` }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>

                {/* 控制按钮 */}
                <div className="flex items-center justify-center gap-4">
                    {/* 快退 */}
                    <button
                        onClick={jumpBackward}
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
                        title="快退5步 (Shift+←)"
                    >
                        <Rewind size={20} />
                    </button>

                    {/* 上一步 */}
                    <button
                        onClick={stepBackward}
                        disabled={currentIndex === 0}
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white disabled:opacity-30"
                        title="上一步 (←)"
                    >
                        <SkipBack size={20} />
                    </button>

                    {/* 播放/暂停 */}
                    <button
                        onClick={togglePlayback}
                        className="p-4 bg-purple-500 hover:bg-purple-600 rounded-full transition-colors"
                        title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
                    >
                        {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
                    </button>

                    {/* 下一步 */}
                    <button
                        onClick={stepForward}
                        disabled={currentIndex >= events.length - 1}
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white disabled:opacity-30"
                        title="下一步 (→)"
                    >
                        <SkipForward size={20} />
                    </button>

                    {/* 快进 */}
                    <button
                        onClick={jumpForward}
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
                        title="快进5步 (Shift+→)"
                    >
                        <FastForward size={20} />
                    </button>

                    {/* 速度控制 */}
                    <button
                        onClick={cycleSpeed}
                        className="ml-4 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
                        title="切换播放速度"
                    >
                        {playbackSpeed}x
                    </button>
                </div>

                {/* 快捷键提示 */}
                <div className="mt-4 text-center text-xs text-slate-600">
                    空格: 播放/暂停 | ←/→: 单步 | Shift+←/→: 快进/快退 | Home/End: 跳转首尾
                </div>
            </div>
        </div>
    );
};
