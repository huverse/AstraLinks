/**
 * 事件日志接口
 * 
 * Shared Event Log 是所有 Agent 间的唯一共享通道
 */

import { DiscussionEvent, EventType } from '../types';

/**
 * 事件处理器类型
 */
export type EventHandler = (event: DiscussionEvent) => void | Promise<void>;

/**
 * 事件日志接口
 */
export interface IEventLog {
    /**
     * 追加事件到日志
     */
    append(event: DiscussionEvent): Promise<void>;

    /**
     * 获取会话的所有事件
     */
    getEvents(sessionId: string): Promise<DiscussionEvent[]>;

    /**
     * 获取会话的事件 (分页)
     */
    getEventsPaginated(
        sessionId: string,
        offset: number,
        limit: number
    ): Promise<{ events: DiscussionEvent[]; total: number }>;

    /**
     * 按类型过滤事件
     */
    getEventsByType(
        sessionId: string,
        types: EventType[]
    ): Promise<DiscussionEvent[]>;

    /**
     * 获取最新 N 条事件
     */
    getLatestEvents(sessionId: string, count: number): Promise<DiscussionEvent[]>;

    /**
     * 获取某个事件之后的所有事件
     */
    getEventsAfter(
        sessionId: string,
        afterSequence: number
    ): Promise<DiscussionEvent[]>;
}

/**
 * 事件总线接口 (发布/订阅)
 */
export interface IEventBus {
    /**
     * 发布事件
     */
    publish(event: DiscussionEvent): void;

    /**
     * 订阅所有事件
     */
    subscribe(handler: EventHandler): () => void;

    /**
     * 订阅特定类型事件
     */
    subscribeToType(type: EventType, handler: EventHandler): () => void;

    /**
     * 订阅特定会话的事件
     */
    subscribeToSession(sessionId: string, handler: EventHandler): () => void;

    /**
     * 清除所有订阅
     */
    clear(): void;
}
