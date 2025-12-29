/**
 * 事件时间线组件
 *
 * 显示讨论事件流，支持自动滚动和 Agent 名称映射
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { MessageSquare, Bot, User, AlertCircle, PlayCircle, Loader2 } from 'lucide-react';
import { DiscussionEvent, Agent } from './types';

interface EventTimelineProps {
    events: DiscussionEvent[];
    agents?: Agent[];
    autoScroll?: boolean;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
    events,
    agents = [],
    autoScroll = true
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // 自动滚动到最新消息
    useEffect(() => {
        if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [events.length, autoScroll]);

    // 根据 sourceId 获取 Agent 名称
    const getAgentName = (sourceId: string): string => {
        if (sourceId === 'moderator' || sourceId === 'system') return sourceId;
        const agent = agents.find(a => a.id === sourceId);
        return agent?.name || sourceId;
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
        <div
            ref={containerRef}
            className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 scroll-smooth"
        >
            {visibleEvents.map(event => {
                const style = getEventStyle(event);
                const agentName = getAgentName(event.sourceId);
                const isThinking = event.type === 'agent:thinking';
                const content = isThinking ? '正在思考...' : (event.payload?.content || event.payload?.message);

                return (
                    <div
                        key={event.id}
                        className={`p-4 rounded-xl border ${style.bg} transition-all duration-200`}
                    >
                        <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1 font-medium text-purple-400">
                                {isThinking ? (
                                    <Loader2 size={14} className="animate-spin text-yellow-400" />
                                ) : style.icon}
                                {event.sourceId === 'moderator' ? '🎙️ 主持人' :
                                 event.sourceId === 'system' ? '⚙️ 系统' :
                                 `👤 ${agentName}`}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px]">
                                {style.label}
                            </span>
                            {!isThinking && (
                                <>
                                    <span className="text-slate-600">•</span>
                                    <span>#{event.sequence}</span>
                                </>
                            )}
                            <span className="ml-auto">
                                {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
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
    );
};
