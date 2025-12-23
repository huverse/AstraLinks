/**
 * Agent Executor 类型定义
 * 
 * Agent Executor 是系统中：
 * - 唯一直接调用 LLM 的地方
 * - 负责"生成观点 / 发言内容 / 发言意图"
 * - 但不负责任何秩序或规则判断
 * 
 * 工程定位：
 * - 每个 Agent 是一个独立实例
 * - 每个 Agent 只管理自己的私有上下文
 * - Agent 不知道"全局发生了什么"
 * - Agent 不能决定自己是否真的发言
 */

import { PhaseType } from './scenario.types';

// ============================================
// AgentPersona（人格定义）
// ============================================

/**
 * Agent 说话风格
 */
export type SpeakingStyle =
    | 'concise'      // 简洁
    | 'elaborate'    // 详尽
    | 'aggressive'   // 激进
    | 'diplomatic'   // 外交式
    | 'analytical'   // 分析型
    | 'emotional';   // 情感型

/**
 * Agent 人格定义
 */
export interface AgentPersona {
    /** Agent 唯一 ID */
    agentId: string;
    /** Agent 名称 */
    name: string;
    /** 角色描述（一句话） */
    role: string;
    /** 详细人格描述 */
    personaDescription: string;
    /** 立场（来自 alignment，可选） */
    stance?: {
        factionId: string;
        position: string;
    };
    /** 说话风格 */
    speakingStyle: SpeakingStyle;
    /** 背景知识领域 */
    expertise?: string[];
    /** 个性特征关键词 */
    traits?: string[];
}

// ============================================
// AgentContext（私有上下文）
// ============================================

/**
 * Agent 私有上下文
 * 
 * 只有该 Agent 自己可见，永远不会泄露给其他 Agent
 */
export interface AgentPrivateContext {
    /** 短期记忆（已裁剪） */
    shortTermMemory: ShortTermMemory;
    /** 长期记忆（占位，暂不实现） */
    longTermMemory?: LongTermMemory;
    /** 当前目标（随 phase 变化） */
    currentGoal: string;
    /** 内部思考（不公开） */
    internalThoughts?: string[];
}

/**
 * 短期记忆
 */
export interface ShortTermMemory {
    /** 记忆条目 */
    entries: MemoryEntry[];
    /** 最大条目数 */
    maxEntries: number;
    /** 当前 token 估算 */
    estimatedTokens: number;
    /** 最大 token 数 */
    maxTokens: number;
}

/**
 * 记忆条目
 */
export interface MemoryEntry {
    /** 内容 */
    content: string;
    /** 时间戳 */
    timestamp: number;
    /** 重要性 (0-1) */
    importance: number;
    /** 类型 */
    type: 'observation' | 'thought' | 'action' | 'feedback';
}

/**
 * 长期记忆（占位）
 */
export interface LongTermMemory {
    /** 关键事件摘要 */
    keySummaries: string[];
    /** 学习到的模式 */
    learnedPatterns: string[];
}

// ============================================
// Agent 可见上下文（严格限制）
// ============================================

/**
 * Agent 每次调用 LLM 时可见的上下文
 * 
 * ⚠️ 永远不允许：
 * - 全量历史
 * - 其他 Agent 私有信息
 * - Moderator 的内部状态
 */
export interface AgentVisibleContext {
    /** 当前 Phase 信息 */
    phase: {
        type: PhaseType;
        name: string;
        description: string;
        round: number;
        maxRounds: number;
    };
    /** 最近 N 条公共事件（N 必须显式指定） */
    recentEvents: AgentVisibleEventSlim[];
    /** 当前 Phase Summary（如果有） */
    phaseSummary?: string;
    /** 讨论主题 */
    topic: string;
    /** 是否被点名（CALL_AGENT） */
    isCalledToSpeak: boolean;
    /** 点名原因 */
    callReason?: string;
}

/**
 * Agent 可见的事件精简结构
 */
export interface AgentVisibleEventSlim {
    /** 事件类型 */
    type: string;
    /** 发言者 */
    speaker: string;
    /** 内容 */
    content: string;
    /** 时间（相对，如 "2分钟前"） */
    relativeTime: string;
}

// ============================================
// Agent 输出规范
// ============================================

/**
 * 发言意图输出
 * 
 * 用于"我想不想说话"，不是"我说什么"
 */
export interface IntentOutput {
    type: 'INTENT';
    /** 意图类型 */
    intent: 'speak' | 'interrupt' | 'question' | 'respond' | 'pass';
    /** 紧急程度 (1-5, 整数) */
    urgency: number;
    /** 目标 Agent ID（如果是回应）或话题 */
    target?: string;
    /** 想讨论的话题/方向 */
    topic?: string;
    /** 意图原因（内部，不公开） */
    reasoning?: string;
}

/**
 * 实际发言输出
 * 
 * 只有在 Moderator Controller 允许后才会被调用
 */
export interface SpeechOutput {
    type: 'SPEECH';
    /** 发言内容（自然语言） */
    content: string;
    /** 语气 */
    tone: 'calm' | 'assertive' | 'questioning' | 'conciliatory' | 'passionate';
    /** 引用的事件/观点（可选） */
    references?: string[];
}

// ============================================
// LLM 请求/响应
// ============================================

/**
 * LLM 请求参数
 */
export interface LLMRequest {
    /** 系统提示词 */
    systemPrompt: string;
    /** 用户消息（当前任务） */
    userMessage: string;
    /** 温度 */
    temperature: number;
    /** 最大 token 数 */
    maxTokens: number;
    /** JSON schema 约束（可选） */
    jsonSchema?: object;
}

/**
 * LLM 响应
 */
export interface LLMResponse<T> {
    /** 解析后的结果 */
    result: T;
    /** 原始文本 */
    rawText: string;
    /** 使用的 token 数 */
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// ============================================
// 常量
// ============================================

/** 短期记忆默认最大条目数 */
export const DEFAULT_SHORT_TERM_MAX_ENTRIES = 10;

/** 短期记忆默认最大 token 数 */
export const DEFAULT_SHORT_TERM_MAX_TOKENS = 2000;

/** 最近事件默认数量 */
export const DEFAULT_RECENT_EVENTS_LIMIT = 10;

/** 最近事件最大数量（硬限制） */
export const MAX_RECENT_EVENTS_LIMIT = 20;
