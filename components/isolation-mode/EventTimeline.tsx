/**
 * 事件时间线组件
 */

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { DiscussionEvent } from './types';

interface EventTimelineProps {
    events: DiscussionEvent[];
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events }) => {
    if (events.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <MessageSquare className="mx-auto mb-2 opacity-50" size={32} />
                <p>等待讨论开始...</p>
            </div>
        );
    }

    return (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {events.map(event => {
                const isSpeech = event.type === 'agent:speak' || event.type === 'SPEECH';
                return (
                    <div
                        key={event.id}
                        className={`p-4 rounded-xl ${isSpeech
                            ? 'bg-slate-800/50 border border-white/5'
                            : 'bg-purple-500/10 border border-purple-500/20'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                            <span className="font-medium text-purple-400">
                                {event.sourceId === 'moderator' ? '🎙️ 主持人' : `👤 ${event.sourceId}`}
                            </span>
                            <span>•</span>
                            <span>#{event.sequence}</span>
                            <span>•</span>
                            <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-sm text-slate-200">
                            {event.payload?.content || event.payload?.message || ''}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
