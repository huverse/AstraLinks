/**
 * 事件总线
 * 
 * 发布/订阅机制，用于 Agent 监听事件
 */

import { EventEmitter } from 'events';
import { DiscussionEvent, EventType } from '../core/types';
import { IEventBus, EventHandler } from '../core/interfaces';

/**
 * 事件总线实现
 */
export class EventBus implements IEventBus {
    private emitter: EventEmitter;
    private sessionSubscribers: Map<string, Set<EventHandler>> = new Map();

    constructor() {
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(100);
    }

    /**
     * 发布事件
     */
    publish(event: DiscussionEvent): void {
        // 全局事件
        this.emitter.emit('event', event);

        // 按类型发布
        this.emitter.emit(`type:${event.type}`, event);

        // 按会话发布
        const sessionHandlers = this.sessionSubscribers.get(event.sessionId);
        if (sessionHandlers) {
            sessionHandlers.forEach(handler => {
                try {
                    handler(event);
                } catch (err) {
                    console.error('[EventBus] Handler error:', err);
                }
            });
        }
    }

    /**
     * 订阅所有事件
     */
    subscribe(handler: EventHandler): () => void {
        this.emitter.on('event', handler);
        return () => this.emitter.off('event', handler);
    }

    /**
     * 订阅特定类型事件
     */
    subscribeToType(type: EventType, handler: EventHandler): () => void {
        const eventName = `type:${type}`;
        this.emitter.on(eventName, handler);
        return () => this.emitter.off(eventName, handler);
    }

    /**
     * 订阅特定会话的事件
     */
    subscribeToSession(sessionId: string, handler: EventHandler): () => void {
        if (!this.sessionSubscribers.has(sessionId)) {
            this.sessionSubscribers.set(sessionId, new Set());
        }
        this.sessionSubscribers.get(sessionId)!.add(handler);

        return () => {
            const handlers = this.sessionSubscribers.get(sessionId);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    /**
     * 清除所有订阅
     */
    clear(): void {
        this.emitter.removeAllListeners();
        this.sessionSubscribers.clear();
    }

    /**
     * 清除会话订阅
     */
    clearSession(sessionId: string): void {
        this.sessionSubscribers.delete(sessionId);
    }
}

export const eventBus = new EventBus();
