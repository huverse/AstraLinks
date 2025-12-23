/**
 * EventLog 存储接口
 * 
 * 抽象存储层，支持多种后端实现:
 * - MemoryEventLogStore: 内存存储 (单进程/开发)
 * - RedisEventLogStore: Redis 存储 (多进程/生产)
 */

import { Event, EventType, EventSpeaker, EventContentPayload, EventMeta } from '../core/types';

// ============================================
// 存储接口
// ============================================

export interface IEventLogStore {
    /**
     * 追加事件
     */
    append(event: Event): Promise<void>;

    /**
     * 获取会话的所有事件
     */
    getBySession(sessionId: string): Promise<Event[]>;

    /**
     * 获取 Agent 可见的事件
     */
    getAgentVisible(sessionId: string, agentId: string, limit?: number): Promise<Event[]>;

    /**
     * 获取最近事件
     */
    getRecent(sessionId: string, limit: number): Promise<Event[]>;

    /**
     * 获取特定类型的事件
     */
    getByType(sessionId: string, type: EventType): Promise<Event[]>;

    /**
     * 获取下一个序号
     */
    getNextSequence(sessionId: string): Promise<number>;

    /**
     * 清理过期事件 (保留最近 N 条)
     */
    prune(sessionId: string, keepCount: number): Promise<number>;

    /**
     * 清除会话所有事件
     */
    clear(sessionId: string): Promise<void>;

    /**
     * 获取事件数量
     */
    count(sessionId: string): Promise<number>;
}

// ============================================
// 事件构建辅助
// ============================================

export interface AppendEventParams {
    sessionId: string;
    type: EventType;
    speaker: EventSpeaker;
    content: string | EventContentPayload;
    meta?: EventMeta;
}

export function buildEvent(params: AppendEventParams, sequence: number): Event {
    const { sessionId, type, speaker, content, meta } = params;

    return {
        eventId: `evt-${sessionId}-${sequence}`,
        sessionId,
        type,
        speaker,
        content,
        timestamp: new Date().toISOString(),
        sequence,
        meta,
    };
}
