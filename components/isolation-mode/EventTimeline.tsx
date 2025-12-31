/**
 * 事件时间线组件
 *
 * 显示讨论事件流，支持自动滚动和 Agent 名称映射
 */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Bot, User, AlertCircle, PlayCircle, Loader2, ArrowDown, Pause, RefreshCw } from 'lucide-react';
import { DiscussionEvent, Agent } from './types';

interface EventTimelineProps {
    events: DiscussionEvent[];
    agents?: Agent[];
    autoScroll?: boolean;
    title?: string;
    showControls?: boolean;
    isPaused?: boolean;
    onTogglePause?: () => void;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
    events,
    agents = [],
    autoScroll = true,
    title = '讨论实况',
    showControls = false,
    isPaused = false,
    onTogglePause,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [liveUpdate, setLiveUpdate] = useState(true);

    // 自动滚动到最新消息
    useEffect(() => {
        if (autoScroll && liveUpdate && isAtBottom && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [events.length, autoScroll, liveUpdate, isAtBottom]);

    // 监听滚动位置
    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
    };

    // 滚动到底部
    const scrollToBottom = () => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
            setIsAtBottom(true);
        }
    };

    // 根据 sourceId 获取 Agent 名称
    const getAgentName = (sourceId: string): string => {
        if (sourceId === 'moderator' || sourceId === 'system') return sourceId;
        const agent = agents.find(a => a.id === sourceId);
        return agent?.name || sourceId;
    };

    // 根据 sourceId 获取 Agent 立场
    const getAgentStance = (sourceId: string): 'for' | 'against' | 'neutral' | null => {
        const agent = agents.find(a => a.id === sourceId);
        return agent?.stance || null;
    };

    // 获取事件图标和样式
    const getEventStyle = (event: DiscussionEvent) => {
        const type = event.type;
        if (type === 'agent:speak' || type === 'agent:speaking' || type === 'SPEECH') {
            return {
                icon: <Bot size={14} />,
                bg: 'bg-slate-800/50 border-white/5',
                label: '发言'
            };
        }
        if (type === 'agent:thinking') {
            return {
                icon: <Bot size={14} className="animate-pulse" />,
                bg: 'bg-blue-500/10 border-blue-500/20',
                label: '思考中'
            };
        }
        if (type === 'moderator:intervention' || type === 'moderator:speak') {
            return {
                icon: <User size={14} />,
                bg: 'bg-purple-500/10 border-purple-500/20',
                label: '主持人'
            };
        }
        if (type === 'round:start' || type === 'round:end') {
            return {
                icon: <PlayCircle size={14} />,
                bg: 'bg-green-500/10 border-green-500/20',
                label: type === 'round:start' ? '轮次开始' : '轮次结束'
            };
        }
        if (type.includes('error')) {
            return {
                icon: <AlertCircle size={14} />,
                bg: 'bg-red-500/10 border-red-500/20',
                label: '错误'
            };
        }
        return {
            icon: <MessageSquare size={14} />,
            bg: 'bg-slate-700/30 border-white/5',
            label: '系统'
        };
    };

    if (events.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <MessageSquare className="mx-auto mb-2 opacity-50" size={32} />
                <p>等待讨论开始...</p>
            </div>
        );
    }

    // 过滤只显示有内容的事件，并处理思考中状态
    const visibleEvents = useMemo(() => {
        // 记录每个 Agent 最后一个 thinking 事件的索引
        const lastThinkingIndex = new Map<string, number>();
        events.forEach((event, index) => {
            if (event.type === 'agent:thinking' && event.sourceId) {
                lastThinkingIndex.set(event.sourceId, index);
            }
        });

        return events.filter((event, index) => {
            // 隐藏 done 事件
            if (event.type === 'agent:done') return false;
            // thinking 事件只显示每个 Agent 最新的一个
            if (event.type === 'agent:thinking') {
                return lastThinkingIndex.get(event.sourceId) === index;
            }
            // 其他正常过滤
            return Boolean(event.payload?.content || event.payload?.message || event.type.includes('round'));
        });
    }, [events]);

    return (
        <div className="flex flex-col h-full">
            {/* 标题栏和控制 */}
            {showControls && (
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                        {title}
                    </h3>
                    <div className="flex items-center gap-2">
                        {onTogglePause && (
                            <button
                                onClick={onTogglePause}
                                className={`p-1.5 rounded-lg transition-colors ${
                                    isPaused ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-slate-400'
                                }`}
                                title={isPaused ? '继续' : '暂停'}
                            >
                                <Pause size={14} />
                            </button>
                        )}
                        <button
                            onClick={() => setLiveUpdate(!liveUpdate)}
                            className={`p-1.5 rounded-lg transition-colors ${
                                liveUpdate ? 'bg-green-500/20 text-green-400' : 'hover:bg-white/10 text-slate-400'
                            }`}
                            title={liveUpdate ? '实时更新已开启' : '实时更新已关闭'}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* 事件列表 */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 space-y-3 overflow-y-auto pr-2 scroll-smooth"
            >
                {visibleEvents.map(event => {
                    const style = getEventStyle(event);
                    const agentName = getAgentName(event.sourceId);
                    const agentStance = getAgentStance(event.sourceId);
                    const isThinking = event.type === 'agent:thinking';
                    const content = isThinking ? '正在思考...' : (event.payload?.content || event.payload?.message);

                    // 立场颜色
                    const stanceColor = agentStance === 'for' ? 'text-emerald-400' :
                                        agentStance === 'against' ? 'text-purple-400' : 'text-slate-400';
                    const stanceBg = agentStance === 'for' ? 'bg-emerald-500/10 border-emerald-500/20' :
                                     agentStance === 'against' ? 'bg-purple-500/10 border-purple-500/20' : style.bg;

                    return (
                        <div
                            key={event.id}
                            className={`p-4 rounded-xl border ${isThinking ? style.bg : stanceBg} transition-all duration-200`}
                        >
                            <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                                <span className="text-slate-500">
                                    {new Date(event.timestamp).toLocaleTimeString()}
                                </span>
                                {agentStance && (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        agentStance === 'for' ? 'bg-emerald-500/20 text-emerald-300' :
                                        agentStance === 'against' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700/50 text-slate-400'
                                    }`}>
                                        {agentStance === 'for' ? '正方' : agentStance === 'against' ? '反方' : '中立'}
                                    </span>
                                )}
                                <span className={`flex items-center gap-1 font-medium ${stanceColor}`}>
                                    {isThinking ? (
                                        <Loader2 size={14} className="animate-spin text-yellow-400" />
                                    ) : style.icon}
                                    {event.sourceId === 'moderator' ? '主持人' :
                                     event.sourceId === 'system' ? '系统' : agentName}
                                </span>
                                <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px]">
                                    {style.label}
                                </span>
                                {!isThinking && (
                                    <span className="text-slate-600">#{event.sequence}</span>
                                )}
                            </div>
                            {content && (
                                <div className={`text-sm whitespace-pre-wrap ${isThinking ? 'text-slate-400 italic' : 'text-slate-200'}`}>
                                    {content}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 滚动到底部按钮 */}
            {!isAtBottom && (
                <button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 right-4 p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-all"
                    title="滚动到底部"
                >
                    <ArrowDown size={16} />
                </button>
            )}
        </div>
    );
};
