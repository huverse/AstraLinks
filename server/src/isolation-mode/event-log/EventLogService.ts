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

// ============================================
// 常量
// ============================================

/** 默认读取限制 */
const DEFAULT_LIMIT = 20;

/** 最大读取限制（硬性上限） */
const MAX_LIMIT = 100;

/** 单个会话最大事件数（超过则自动裁剪） */
const MAX_EVENTS_PER_SESSION = 500;

// ============================================
// EventLogService 实现
// ============================================

/**
 * 事件日志服务（内存实现）
 * 
 * 线程安全注意事项：
 * - Node.js 单线程，无需加锁
 * - 如需多进程部署，请替换为 Redis 实现
 */
export class EventLogService {
    /** 会话 -> 事件列表 */
    private store: Map<string, Event[]> = new Map();

    /** 会话 -> 序号计数器 */
    private sequenceCounters: Map<string, number> = new Map();

    // ===== 写入操作 =====

    /**
     * 追加事件
     * 
     * @param params 事件参数（不含 eventId、sequence、timestamp）
     * @returns 创建的完整事件
     */
    appendEvent(params: {
        sessionId: string;
        type: EventType;
        speaker: EventSpeaker;
        content: string | EventContentPayload;
        meta?: EventMeta;
    }): Event {
        const { sessionId, type, speaker, content, meta } = params;

        // 获取或创建会话存储
        if (!this.store.has(sessionId)) {
            this.store.set(sessionId, []);
            this.sequenceCounters.set(sessionId, 0);
        }

        // 生成事件
        const sequence = (this.sequenceCounters.get(sessionId) || 0) + 1;
        this.sequenceCounters.set(sessionId, sequence);

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

        // 追加事件
        const events = this.store.get(sessionId)!;
        events.push(event);

        // 自动裁剪检查
        if (events.length > MAX_EVENTS_PER_SESSION) {
            this.autoPrune(sessionId);
        }

        return event;
    }

    // ===== 读取操作 =====

    /**
     * 获取最近的事件
     * 
     * ⚠️ 必须显式指定 limit，防止 token 爆炸
     * 
     * @param sessionId 会话 ID
     * @param limit 返回事件数量上限（必填，最大 100）
     * @returns 最近的事件列表（按时间正序）
     */
    getRecentEvents(sessionId: string, limit: number): Event[] {
        this.validateLimit(limit);

        const events = this.store.get(sessionId);
        if (!events || events.length === 0) {
            return [];
        }

        // 取最后 N 条，保持时间正序
        const start = Math.max(0, events.length - limit);
        return events.slice(start);
    }

    /**
     * 获取指定类型的事件
     * 
     * @param sessionId 会话 ID
     * @param type 事件类型
     * @param limit 返回事件数量上限（默认 20，最大 100）
     * @returns 匹配类型的事件列表（按时间正序）
     */
    getEventsByType(sessionId: string, type: EventType, limit: number = DEFAULT_LIMIT): Event[] {
        this.validateLimit(limit);

        const events = this.store.get(sessionId);
        if (!events) {
            return [];
        }

        // 过滤 + 取最后 N 条
        const filtered = events.filter(e => e.type === type);
        const start = Math.max(0, filtered.length - limit);
        return filtered.slice(start);
    }

    /**
     * 获取某序号之后的事件（增量获取）
     * 
     * @param sessionId 会话 ID
     * @param afterSequence 起始序号（不包含）
     * @param limit 返回事件数量上限（默认 20，最大 100）
     * @returns 序号大于 afterSequence 的事件
     */
    getEventsAfterSequence(
        sessionId: string,
        afterSequence: number,
        limit: number = DEFAULT_LIMIT
    ): Event[] {
        this.validateLimit(limit);

        const events = this.store.get(sessionId);
        if (!events) {
            return [];
        }

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
    getAgentVisibleEvents(sessionId: string, limit: number): AgentVisibleEvent[] {
        const events = this.getRecentEvents(sessionId, limit);
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
    pruneEvents(sessionId: string, strategy: PruneStrategy): number {
        const events = this.store.get(sessionId);
        if (!events || events.length === 0) {
            return 0;
        }

        const originalLength = events.length;
        let remaining: Event[];

        switch (strategy.type) {
            case 'byCount':
                // 保留最近 N 条
                remaining = events.slice(-strategy.keep);
                break;

            case 'byType':
                // 只保留指定类型的事件
                remaining = events.filter(e => strategy.keepTypes.includes(e.type));
                break;

            case 'beforeSequence':
                // 删除指定序号之前的事件
                remaining = events.filter(e => e.sequence >= strategy.sequence);
                break;

            default:
                remaining = events;
        }

        this.store.set(sessionId, remaining);
        return originalLength - remaining.length;
    }

    // ===== 辅助方法 =====

    /**
     * 自动裁剪（当事件数超过上限时）
     * 
     * 策略：保留所有 SUMMARY 和最近一半的其他事件
     */
    private autoPrune(sessionId: string): void {
        const events = this.store.get(sessionId);
        if (!events) return;

        // 分离 SUMMARY 事件和其他事件
        const summaries = events.filter(e => e.type === EventType.SUMMARY);
        const others = events.filter(e => e.type !== EventType.SUMMARY);

        // 保留最近一半的其他事件
        const keepCount = Math.floor(MAX_EVENTS_PER_SESSION / 2);
        const keptOthers = others.slice(-keepCount);

        // 合并并按序号排序
        const remaining = [...summaries, ...keptOthers]
            .sort((a, b) => a.sequence - b.sequence);

        this.store.set(sessionId, remaining);

        // 使用结构化日志
        import('../../services/world-engine-logger').then(({ isolationLogger }) => {
            isolationLogger.info({
                sessionId,
                before: events.length,
                after: remaining.length
            }, 'event_log_auto_pruned');
        });
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
    getEventCount(sessionId: string): number {
        return this.store.get(sessionId)?.length || 0;
    }

    /**
     * 获取会话当前序号
     */
    getCurrentSequence(sessionId: string): number {
        return this.sequenceCounters.get(sessionId) || 0;
    }

    /**
     * 清除会话数据
     */
    clearSession(sessionId: string): void {
        this.store.delete(sessionId);
        this.sequenceCounters.delete(sessionId);
    }

    /**
     * 检查会话是否存在
     */
    hasSession(sessionId: string): boolean {
        return this.store.has(sessionId);
    }
}

// ============================================
// 单例导出
// ============================================

export const eventLogService = new EventLogService();
