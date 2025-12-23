/**
 * Moderator Controller 类型定义
 * 
 * Moderator Controller 是系统级控制组件，不是普通 Agent，也不是 LLM Prompt。
 * 
 * 职责：
 * - 决定"现在是谁可以说话"
 * - 决定"是否要打断 / 点名 / 拉偏架"
 * - 决定"是否该总结 / 切换阶段 / 结束讨论"
 * 
 * 特性：
 * - 确定性的（deterministic）
 * - 可测试的
 * - 不依赖 LLM 的推理能力
 */

import { InterventionLevel, PhaseType } from './scenario.types';

// ============================================
// Phase 枚举（运行时状态）
// ============================================

/**
 * 讨论阶段枚举
 * 
 * 注意：这是 Moderator 内部状态机的阶段，
 * 与 ScenarioSchema 中的 PhaseConfig 不同
 */
export enum Phase {
    /** 未开始 */
    NOT_STARTED = 'NOT_STARTED',
    /** 开场 */
    OPENING = 'OPENING',
    /** 自由讨论 */
    FREE_DISCUSSION = 'FREE_DISCUSSION',
    /** 焦点对抗 */
    FOCUSED_CONFLICT = 'FOCUSED_CONFLICT',
    /** 收敛共识 */
    CONVERGENCE = 'CONVERGENCE',
    /** 闭幕 */
    CLOSING = 'CLOSING',
    /** 已结束 */
    ENDED = 'ENDED',
}

// ============================================
// ModeratorAction 枚举
// ============================================

/**
 * 主持人可执行的动作
 */
export enum ModeratorAction {
    /** 允许发言（批准 Agent 的 INTENT） */
    ALLOW_SPEECH = 'ALLOW_SPEECH',
    /** 拒绝发言（驳回 Agent 的 INTENT） */
    REJECT_SPEECH = 'REJECT_SPEECH',
    /** 提出问题（主持人主动引导） */
    PROMPT_QUESTION = 'PROMPT_QUESTION',
    /** 点名发言（指定某 Agent 发言） */
    CALL_AGENT = 'CALL_AGENT',
    /** 强制总结（生成阶段总结） */
    FORCE_SUMMARY = 'FORCE_SUMMARY',
    /** 切换阶段 */
    SWITCH_PHASE = 'SWITCH_PHASE',
    /** 结束讨论 */
    END_DISCUSSION = 'END_DISCUSSION',
    /** 等待（无操作） */
    WAIT = 'WAIT',
    /** 警告（发言过多/违规） */
    WARN_AGENT = 'WARN_AGENT',
}

// ============================================
// Intent（发言意图）
// ============================================

/**
 * Agent 发言意图
 */
export interface Intent {
    /** 提交意图的 Agent ID */
    agentId: string;
    /** 意图类型 */
    type: 'speak' | 'interrupt' | 'question' | 'respond';
    /** 主题/方向（可选） */
    topic?: string;
    /** 紧急程度 (1-5) */
    urgency: number;
    /** 目标 Agent（如果是回应） */
    targetAgentId?: string;
    /** 提交时间戳 */
    timestamp: number;
}

// ============================================
// ModeratorState 接口
// ============================================

/**
 * 主持人状态
 * 
 * 这是 Moderator Controller 的内部状态，
 * 用于决策时的上下文信息。
 */
export interface ModeratorState {
    // === 阶段状态 ===

    /** 当前阶段 ID（对应 ScenarioSchema.flow.phases[].id） */
    currentPhaseId: string;
    /** 当前阶段类型 */
    currentPhaseType: PhaseType;
    /** 当前阶段内的轮次 */
    phaseRound: number;
    /** 总轮次（跨阶段累计） */
    totalRounds: number;

    // === 发言状态 ===

    /** 上一个发言者 Agent ID */
    lastSpeakerId: string | null;
    /** 连续发言计数（同一 Agent） */
    consecutiveSpeaks: number;
    /** 空闲轮次（无有效发言） */
    idleRounds: number;
    /** 待处理的发言意图队列 */
    pendingIntents: Intent[];

    // === 策略配置 ===

    /** 干预级别 (0-3) */
    interventionLevel: InterventionLevel;
    /** 当前阶段最大轮次 */
    phaseMaxRounds: number;
    /** 是否允许打断 */
    allowInterrupt: boolean;
    /** 发言顺序 */
    speakingOrder: 'round-robin' | 'free' | 'moderated';
    /** 冷场阈值（轮次） */
    coldThreshold: number;

    // === 统计信息 ===

    /** 各 Agent 发言次数 */
    speakCounts: Map<string, number>;
    /** Agent 列表（按注册顺序） */
    agentIds: string[];
    /** 轮询指针（round-robin 模式） */
    roundRobinIndex: number;

    // === 时间信息 ===

    /** 阶段开始时间 */
    phaseStartedAt: number;
    /** 上次发言时间 */
    lastSpeakAt: number | null;
}

// ============================================
// ModeratorDecision 接口
// ============================================

/**
 * 主持人决策结果
 */
export interface ModeratorDecision {
    /** 执行的动作 */
    action: ModeratorAction;
    /** 目标 Agent ID（ALLOW_SPEECH/CALL_AGENT/WARN_AGENT 时） */
    targetAgentId?: string;
    /** 下一个阶段 ID（SWITCH_PHASE 时） */
    nextPhaseId?: string;
    /** 原因说明（REJECT_SPEECH/WARN_AGENT 时） */
    reason?: string;
    /** 需要 LLM 生成的内容类型（PROMPT_QUESTION/FORCE_SUMMARY 时） */
    llmRequestType?: 'question' | 'summary' | 'opening' | 'closing';
    /** 附加数据 */
    metadata?: Record<string, unknown>;
}

// ============================================
// 辅助类型
// ============================================

/**
 * 阶段切换事件
 */
export interface PhaseTransition {
    fromPhaseId: string | null;
    toPhaseId: string;
    reason: 'max_rounds' | 'moderator_decision' | 'consensus' | 'timeout' | 'manual';
    timestamp: number;
}

/**
 * 冷场/过热检测结果
 */
export interface DiscussionHealth {
    /** 是否冷场 */
    isCold: boolean;
    /** 是否过热（某人发言过多） */
    isOverheated: boolean;
    /** 过热的 Agent ID */
    overheatedAgentId?: string;
    /** 冷场持续轮次 */
    coldRounds: number;
    /** 发言失衡程度 (0-1) */
    imbalanceScore: number;
}
