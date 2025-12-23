/**
 * Shared Event Log 事件类型定义
 * 
 * 这是整个多 Agent 讨论系统中唯一允许信息共享的通道。
 * 
 * 设计原则：
 * 1. Event 是"事实记录"，不是对话历史
 * 2. Event 必须是离散的、结构化的、可裁剪的
 * 3. Agent 永远只能看到 Event，不能看到其他 Agent 的私有上下文
 */

// ============================================
// EventType 枚举
// ============================================

/**
 * 事件类型枚举
 * 
 * | 类型    | 说明                          | 发起者         |
 * |---------|-------------------------------|----------------|
 * | INTENT  | Agent 表达发言意图            | Agent          |
 * | SPEECH  | 实际发言（经 Moderator 允许） | Agent          |
 * | SUMMARY | 主持人生成的阶段总结          | Moderator      |
 * | VOTE    | 投票 / 评分                   | Agent/System   |
 * | SYSTEM  | 系统事件（phase 切换等）      | System         |
 */
export enum EventType {
    /** Agent 表达发言意图（请求发言权） */
    INTENT = 'INTENT',
    /** 实际发言（经 Moderator 允许后的正式发言） */
    SPEECH = 'SPEECH',
    /** 主持人生成的阶段总结 */
    SUMMARY = 'SUMMARY',
    /** 投票 / 评分 */
    VOTE = 'VOTE',
    /** 系统事件（phase 切换、会话状态变更等） */
    SYSTEM = 'SYSTEM',
}

// ============================================
// 事件数据结构
// ============================================

/**
 * 事件发起者类型
 */
export type EventSpeaker = string | 'moderator' | 'system';

/**
 * 基础事件接口
 * 
 * 字段分类：
 * - [LLM] = 会被送进 LLM 上下文的字段
 * - [SYS] = 仅用于系统逻辑的字段
 */
export interface Event {
    // ===== 标识字段 [SYS] =====

    /** 
     * 事件唯一 ID (UUID)
     * [SYS] 用于事件去重、引用
     */
    readonly eventId: string;

    // ===== 核心字段 [LLM] =====

    /**
     * 事件类型
     * [LLM] Agent 需要知道这是什么类型的事件
     */
    readonly type: EventType;

    /**
     * 发言者/发起者
     * [LLM] Agent 需要知道谁说的
     * 值为 agent_id | "moderator" | "system"
     */
    readonly speaker: EventSpeaker;

    /**
     * 事件内容
     * [LLM] 实际的发言/总结/系统消息内容
     * - SPEECH/SUMMARY: string
     * - VOTE: { choice: string; reason?: string }
     * - SYSTEM: { action: string; details?: object }
     * - INTENT: { topic: string; priority?: number }
     */
    readonly content: string | EventContentPayload;

    // ===== 时间字段 [LLM + SYS] =====

    /**
     * 时间戳 (ISO8601 格式)
     * [LLM] Agent 可以理解时间顺序
     * [SYS] 用于排序、裁剪
     */
    readonly timestamp: string;

    // ===== 上下文字段 [SYS] =====

    /**
     * 会话 ID
     * [SYS] 用于多会话隔离
     */
    readonly sessionId: string;

    /**
     * 事件序号 (会话内单调递增)
     * [SYS] 用于排序、增量获取
     */
    readonly sequence: number;

    // ===== 元数据 [可选] =====

    /**
     * 可选元数据
     * [SYS] 用于扩展信息，如 phase、round 等
     */
    readonly meta?: EventMeta;
}

/**
 * 事件内容载荷类型
 */
export interface EventContentPayload {
    // INTENT 类型
    topic?: string;
    priority?: number;

    // VOTE 类型
    choice?: string;
    reason?: string;
    target?: string;
    score?: number;

    // SYSTEM 类型
    action?: string;
    details?: Record<string, unknown>;

    // SPEECH 类型
    message?: string;
    agentId?: string;
    agentName?: string;
    tokens?: number;

    // ROUND 类型
    round?: number;
}

/**
 * 事件元数据
 */
export interface EventMeta {
    /** 当前阶段 */
    phase?: string;
    /** 当前轮次 */
    round?: number;
    /** 回复/引用的事件 ID */
    replyTo?: string;
    /** Token 消耗 */
    tokens?: number;
    /** 其他扩展字段 */
    [key: string]: unknown;
}

// ============================================
// Agent 可见事件格式
// ============================================

/**
 * Agent 可见的事件格式（用于 LLM 上下文）
 * 
 * 这是 Event 的精简版本，只包含 LLM 需要的字段
 * 用于构建 Agent 的上下文窗口
 */
export interface AgentVisibleEvent {
    /** 事件类型 */
    type: EventType;
    /** 发言者 */
    speaker: EventSpeaker;
    /** 内容 (始终是字符串) */
    content: string;
    /** 时间戳 */
    timestamp: string;
}

/**
 * 将 Event 转换为 Agent 可见格式
 */
export function toAgentVisibleEvent(event: Event): AgentVisibleEvent {
    return {
        type: event.type,
        speaker: event.speaker,
        content: typeof event.content === 'string'
            ? event.content
            : JSON.stringify(event.content),
        timestamp: event.timestamp,
    };
}

// ============================================
// 裁剪策略
// ============================================

/**
 * 裁剪策略类型
 */
export type PruneStrategy =
    | { type: 'byCount'; keep: number }
    | { type: 'byType'; keepTypes: EventType[] }
    | { type: 'beforeSequence'; sequence: number };

// ============================================
// 兼容旧类型（保持向后兼容）
// ============================================

/** @deprecated 使用 Event 代替 */
export type DiscussionEvent = Event;

/** @deprecated 使用 EventType 代替 */
export type LegacyEventType =
    | 'session:start'
    | 'session:end'
    | 'agent:speak'
    | 'moderator:summary'
    | 'vote:cast';
