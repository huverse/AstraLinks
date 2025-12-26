/**
 * EventLogService - 公共事件日志服务
 * 
 * 这是整个多 Agent 讨论系统中：
 * - 唯一允许信息共享的通道
 * - Moderator 与 Agent 交互的核心枢纽
 * 
 * 设计原则：
 * 1. 事件是"事实记录"，不是对话历史
 * 2. 从架构层面防止 token 爆炸
 * 3. 不提供 getAllEvents() 方法
 * 4. 所有读取都必须显式指定 limit
 */

import { v4 as uuidv4 } from 'uuid';
import {
    Event,
    EventType,
    EventSpeaker,
    EventContentPayload,
    EventMeta,
    PruneStrategy,
    AgentVisibleEvent,
    toAgentVisibleEvent
} from '../core/types/event.types';
import { IEventLogStore } from './IEventLogStore';
import { getEventLogStore } from './RedisEventLogStore';

// ============================================
// 常量
// ============================================

/** 默认读取限制 */
const DEFAULT_LIMIT = 20;

/** 最大读取限制（硬性上限） */
const MAX_LIMIT = 100;

/** 单个会话最大事件数（超过则自动裁剪） */
const DEFAULT_MAX_EVENTS_PER_SESSION = 500;

// ============================================
// EventLogService 实现
// ============================================

export class EventLogService {
    private store: IEventLogStore | null = null;

    private getStore(): IEventLogStore {
        if (!this.store) {
            this.store = getEventLogStore();
        }
        return this.store;
    }

    private getMaxEventsPerSession(): number {
        const raw = process.env.WE_EVENT_LOG_MAX_SIZE;
        if (!raw) {
            return DEFAULT_MAX_EVENTS_PER_SESSION;
        }
        const parsed = parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed > 0
            ? parsed
            : DEFAULT_MAX_EVENTS_PER_SESSION;
    }

    // ===== 写入操作 =====

    /**
     * 追加事件
     * 
     * @param params 事件参数（不含 eventId、sequence、timestamp）
     * @returns 创建的完整事件
     */
    async appendEvent(params: {
        sessionId: string;
        type: EventType;
        speaker: EventSpeaker;
        content: string | EventContentPayload;
        meta?: EventMeta;
    }): Promise<Event> {
        const { sessionId, type, speaker, content, meta } = params;
        const store = this.getStore();

        const sequence = await store.getNextSequence(sessionId);
        const event: Event = {
            eventId: uuidv4(),
            type,
            speaker,
            content,
            timestamp: new Date().toISOString(),
            sessionId,
            sequence,
            meta,
        };

        await store.append(event);

        const maxEvents = this.getMaxEventsPerSession();
        const count = await store.count(sessionId);
        if (count > maxEvents) {
            await this.autoPrune(sessionId, maxEvents);
        }

        return event;
    }

    // ===== 读取操作 =====

    /**
     * 获取最近的事件
     * 
     * ?? 必须显式指定 limit，防止 token 爆炸
     * 
     * @param sessionId 会话 ID
     * @param limit 返回事件数量上限（必填，最大 100）
     * @returns 最近的事件列表（按时间正序）
     */
    async getRecentEvents(sessionId: string, limit: number): Promise<Event[]> {
        this.validateLimit(limit);
        return this.getStore().getRecent(sessionId, limit);
    }

    /**
     * 获取指定类型的事件
     * 
     * @param sessionId 会话 ID
     * @param type 事件类型
     * @param limit 返回事件数量上限（默认 20，最大 100）
     * @returns 匹配类型的事件列表（按时间正序）
     */
    async getEventsByType(sessionId: string, type: EventType, limit: number = DEFAULT_LIMIT): Promise<Event[]> {
        this.validateLimit(limit);

        const events = await this.getStore().getByType(sessionId, type);
        if (events.length <= limit) {
            return events;
        }

        return events.slice(-limit);
    }

    /**
     * 获取某序号之后的事件（增量获取）
     * 
     * @param sessionId 会话 ID
     * @param afterSequence 起始序号（不包含）
     * @param limit 返回事件数量上限（默认 20，最大 100）
     * @returns 序号大于 afterSequence 的事件
     */
    async getEventsAfterSequence(
        sessionId: string,
        afterSequence: number,
        limit: number = DEFAULT_LIMIT
    ): Promise<Event[]> {
        this.validateLimit(limit);

        const events = await this.getStore().getBySession(sessionId);
        return events
            .filter(e => e.sequence > afterSequence)
            .slice(0, limit);
    }

    /**
     * 获取 Agent 可见的事件格式
     * 
     * 用于构建 Agent 的 LLM 上下文
     * 
     * @param sessionId 会话 ID
     * @param limit 返回事件数量上限
     * @returns Agent 可见的精简事件列表
     */
    async getAgentVisibleEvents(sessionId: string, limit: number): Promise<AgentVisibleEvent[]> {
        const events = await this.getRecentEvents(sessionId, limit);
        return events.map(toAgentVisibleEvent);
    }

    // ===== 裁剪操作 =====

    /**
     * 裁剪事件
     * 
     * @param sessionId 会话 ID
     * @param strategy 裁剪策略
     * @returns 被裁剪的事件数量
     */
    async pruneEvents(sessionId: string, strategy: PruneStrategy): Promise<number> {
        const events = await this.getStore().getBySession(sessionId);
        if (events.length === 0) {
            return 0;
        }

        let remaining: Event[];

        switch (strategy.type) {
            case 'byCount':
                remaining = events.slice(-strategy.keep);
                break;

            case 'byType':
                remaining = events.filter(e => strategy.keepTypes.includes(e.type));
                break;

            case 'beforeSequence':
                remaining = events.filter(e => e.sequence >= strategy.sequence);
                break;

            default:
                remaining = events;
        }

        await this.replaceSessionEvents(sessionId, remaining);
        return Math.max(0, events.length - remaining.length);
    }

    // ===== 辅助方法 =====

    /**
     * 自动裁剪（当事件数超过上限时）
     * 
     * 策略：保留所有 SUMMARY 和最近一半的其他事件
     */
    private async autoPrune(sessionId: string, maxEvents: number): Promise<void> {
        const events = await this.getStore().getBySession(sessionId);
        if (events.length <= maxEvents) {
            return;
        }

        const summaries = events.filter(e => e.type === EventType.SUMMARY);
        const others = events.filter(e => e.type !== EventType.SUMMARY);

        const keepCount = Math.floor(maxEvents / 2);
        const keptOthers = others.slice(-keepCount);

        const remaining = [...summaries, ...keptOthers]
            .sort((a, b) => a.sequence - b.sequence);

        await this.replaceSessionEvents(sessionId, remaining);

        import('../../services/world-engine-logger').then(({ isolationLogger }) => {
            isolationLogger.info({
                sessionId,
                before: events.length,
                after: remaining.length
            }, 'event_log_auto_pruned');
        });
    }

    private async replaceSessionEvents(sessionId: string, events: Event[]): Promise<void> {
        const store = this.getStore();
        await store.clear(sessionId);

        for (const event of events) {
            await store.append(event);
        }

        const lastSequence = events.length > 0
            ? events[events.length - 1].sequence
            : 0;
        await store.setSequence(sessionId, lastSequence);
    }

    /**
     * 验证 limit 参数
     */
    private validateLimit(limit: number): void {
        if (limit <= 0) {
            throw new Error('limit must be positive');
        }
        if (limit > MAX_LIMIT) {
            throw new Error(`limit cannot exceed ${MAX_LIMIT}`);
        }
    }

    // ===== 会话管理 =====

    /**
     * 获取会话事件数量
     */
    async getEventCount(sessionId: string): Promise<number> {
        return this.getStore().count(sessionId);
    }

    /**
     * 获取会话当前序号
     */
    async getCurrentSequence(sessionId: string): Promise<number> {
        const events = await this.getStore().getRecent(sessionId, 1);
        return events.length > 0 ? events[events.length - 1].sequence : 0;
    }

    /**
     * 清除会话数据
     */
    async clearSession(sessionId: string): Promise<void> {
        await this.getStore().clear(sessionId);
    }

    /**
     * 检查会话是否存在
     */
    async hasSession(sessionId: string): Promise<boolean> {
        const count = await this.getStore().count(sessionId);
        return count > 0;
    }
}

// ============================================
// 单例导出
// ============================================

export const eventLogService = new EventLogService();
