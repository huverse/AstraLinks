/**
 * 内存 EventLog 存储
 * 
 * 适用于: 单进程部署、开发环境
 * 限制: 无持久化，进程重启数据丢失
 */

import { Event, EventType } from '../core/types';
import { IEventLogStore } from './IEventLogStore';

export class MemoryEventLogStore implements IEventLogStore {
    private events: Map<string, Event[]> = new Map();
    private sequences: Map<string, number> = new Map();

    async append(event: Event): Promise<void> {
        const sessionId = event.sessionId;
        if (!this.events.has(sessionId)) {
            this.events.set(sessionId, []);
        }
        this.events.get(sessionId)!.push(event);
    }

    async getBySession(sessionId: string): Promise<Event[]> {
        return this.events.get(sessionId) || [];
    }

    async getAgentVisible(sessionId: string, agentId: string, limit = 100): Promise<Event[]> {
        const all = this.events.get(sessionId) || [];

        return all
            .filter(e => {
                const meta = e.meta;
                if (!meta) return true; // 无 meta 默认可见
                if (meta.visibility === 'public') return true;
                // 私有事件只对 scope 内的用户可见
                const scope = meta.scope as string[] | undefined;
                return scope?.includes(agentId) ?? false;
            })
            .slice(-limit);
    }

    async getRecent(sessionId: string, limit: number): Promise<Event[]> {
        const all = this.events.get(sessionId) || [];
        return all.slice(-limit);
    }

    async getByType(sessionId: string, type: EventType): Promise<Event[]> {
        const all = this.events.get(sessionId) || [];
        return all.filter(e => e.type === type);
    }

    async getNextSequence(sessionId: string): Promise<number> {
        const current = this.sequences.get(sessionId) || 0;
        const next = current + 1;
        this.sequences.set(sessionId, next);
        return next;
    }

    async setSequence(sessionId: string, sequence: number): Promise<void> {
        this.sequences.set(sessionId, sequence);
    }

    async prune(sessionId: string, keepCount: number): Promise<number> {
        const events = this.events.get(sessionId);
        if (!events || events.length <= keepCount) {
            return 0;
        }

        const pruneCount = events.length - keepCount;
        this.events.set(sessionId, events.slice(-keepCount));
        return pruneCount;
    }

    async clear(sessionId: string): Promise<void> {
        this.events.delete(sessionId);
        this.sequences.delete(sessionId);
    }

    async count(sessionId: string): Promise<number> {
        return this.events.get(sessionId)?.length || 0;
    }
}
