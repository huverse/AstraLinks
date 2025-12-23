/**
 * 事件日志
 * 
 * Shared Event Log 是所有 Agent 间的唯一共享通道
 */

import { DiscussionEvent, EventType } from '../core/types';
import { IEventLog } from '../core/interfaces';

/**
 * 事件日志实现 (内存存储)
 */
export class EventLog implements IEventLog {
    private events: Map<string, DiscussionEvent[]> = new Map();

    /**
     * 追加事件
     */
    async append(event: DiscussionEvent): Promise<void> {
        const sessionId = event.sessionId;

        if (!this.events.has(sessionId)) {
            this.events.set(sessionId, []);
        }

        this.events.get(sessionId)!.push(event);
    }

    /**
     * 获取所有事件
     */
    async getEvents(sessionId: string): Promise<DiscussionEvent[]> {
        return this.events.get(sessionId) || [];
    }

    /**
     * 分页获取事件
     */
    async getEventsPaginated(
        sessionId: string,
        offset: number,
        limit: number
    ): Promise<{ events: DiscussionEvent[]; total: number }> {
        const all = this.events.get(sessionId) || [];
        return {
            events: all.slice(offset, offset + limit),
            total: all.length,
        };
    }

    /**
     * 按类型过滤
     */
    async getEventsByType(
        sessionId: string,
        types: EventType[]
    ): Promise<DiscussionEvent[]> {
        const all = this.events.get(sessionId) || [];
        return all.filter(e => types.includes(e.type));
    }

    /**
     * 获取最新事件
     */
    async getLatestEvents(sessionId: string, count: number): Promise<DiscussionEvent[]> {
        const all = this.events.get(sessionId) || [];
        return all.slice(-count);
    }

    /**
     * 获取某序号之后的事件
     */
    async getEventsAfter(
        sessionId: string,
        afterSequence: number
    ): Promise<DiscussionEvent[]> {
        const all = this.events.get(sessionId) || [];
        return all.filter(e => e.sequence > afterSequence);
    }

    /**
     * 清除会话事件
     */
    clearSession(sessionId: string): void {
        this.events.delete(sessionId);
    }

    /**
     * 获取事件数量
     */
    getEventCount(sessionId: string): number {
        return (this.events.get(sessionId) || []).length;
    }
}

export const eventLog = new EventLog();
