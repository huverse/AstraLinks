/**
 * Moderator LLM 类型定义
 * 
 * Moderator LLM 是主持人的"语言表达层"。
 * 
 * 职责：
 * ✅ 生成讨论大纲（Outline）
 * ✅ 生成引导性问题
 * ✅ 生成阶段总结 / 最终总结
 * 
 * 不可做：
 * ❌ 判断谁该说话
 * ❌ 判断 phase 是否切换
 * ❌ 判断是否冷场
 * ❌ 决定是否结束讨论
 * 
 * 调用关系：
 * Moderator Controller → Moderator LLM → Event Log
 */

import { PhaseType } from './scenario.types';

// ============================================
// 输入类型（结构化，非自然语言堆叠）
// ============================================

/**
 * 大纲生成输入
 */
export interface OutlineInput {
    /** 讨论议题 */
    topic: string;
    /** 阵营类型 */
    alignmentType: 'opposing' | 'free' | 'multi-faction';
    /** 阵营列表（如果有） */
    factions?: Array<{
        id: string;
        name: string;
        position: string;
    }>;
    /** 阶段列表 */
    phases: Array<{
        id: string;
        name: string;
        type: PhaseType;
        description: string;
    }>;
    /** 预计总时长（分钟） */
    estimatedDurationMinutes?: number;
}

/**
 * 引导问题生成输入
 */
export interface QuestionInput {
    /** 讨论议题 */
    topic: string;
    /** 当前阶段 */
    currentPhase: {
        id: string;
        name: string;
        type: PhaseType;
        round: number;
        maxRounds: number;
    };
    /** 已识别的分歧点（摘要形式） */
    divergencePoints: string[];
    /** 最近发言摘要（精简，非全文） */
    recentSpeechSummaries: Array<{
        speaker: string;
        summary: string;
    }>;
    /** 点名目标（可选） */
    targetAgent?: {
        id: string;
        name: string;
    };
}

/**
 * 阶段总结生成输入
 */
export interface SummaryInput {
    /** 讨论议题 */
    topic: string;
    /** 当前阶段 */
    phase: {
        id: string;
        name: string;
        type: PhaseType;
    };
    /** 精简后的事件（已裁剪、已脱敏） */
    condensedEvents: Array<{
        speaker: string;
        keyPoint: string;
    }>;
    /** 已识别的共识点 */
    consensusPoints: string[];
    /** 已识别的分歧点 */
    divergencePoints: string[];
    /** 总结类型 */
    summaryType: 'phase_end' | 'mid_phase' | 'final';
}

/**
 * 开场白生成输入
 */
export interface OpeningInput {
    /** 讨论议题 */
    topic: string;
    /** 阵营类型 */
    alignmentType: 'opposing' | 'free' | 'multi-faction';
    /** 参与者列表 */
    participants: Array<{
        id: string;
        name: string;
        role: string;
        factionName?: string;
    }>;
    /** 第一个阶段 */
    firstPhase: {
        name: string;
        description: string;
    };
}

/**
 * 结束语生成输入
 */
export interface ClosingInput {
    /** 讨论议题 */
    topic: string;
    /** 各阶段总结（精简） */
    phaseSummaries: Array<{
        phaseName: string;
        summary: string;
    }>;
    /** 最终共识 */
    finalConsensus: string[];
    /** 未解决分歧 */
    unresolvedDivergences: string[];
    /** 讨论时长（分钟） */
    durationMinutes: number;
}

// ============================================
// 输出类型
// ============================================

/**
 * 大纲输出
 */
export interface OutlineOutput {
    /** 讨论标题 */
    title: string;
    /** 分阶段要点 */
    phaseOutlines: Array<{
        phaseId: string;
        phaseName: string;
        keyPoints: string[];
        suggestedQuestions: string[];
    }>;
    /** 主持人注意事项 */
    moderatorNotes: string[];
}

/**
 * 引导问题输出
 */
export interface QuestionOutput {
    /** 问题文本 */
    question: string;
    /** 问题类型 */
    questionType: 'open' | 'directed' | 'clarification' | 'challenge';
    /** 点名对象（可选） */
    targetName?: string;
}

/**
 * 总结输出
 */
export interface SummaryOutput {
    /** 总结文本（可直接写入 Event Log） */
    summaryText: string;
    /** 共识要点 */
    consensusHighlights: string[];
    /** 分歧要点 */
    divergenceHighlights: string[];
    /** 下一步建议（如果有） */
    nextStepsSuggestion?: string;
}

/**
 * 开场白输出
 */
export interface OpeningOutput {
    /** 开场白文本 */
    openingText: string;
}

/**
 * 结束语输出
 */
export interface ClosingOutput {
    /** 结束语文本 */
    closingText: string;
    /** 最终结论 */
    finalConclusion: string;
}

// ============================================
// 常量
// ============================================

/** 大纲最大 token */
export const OUTLINE_MAX_TOKENS = 500;

/** 问题最大 token */
export const QUESTION_MAX_TOKENS = 100;

/** 总结最大 token */
export const SUMMARY_MAX_TOKENS = 300;

/** 开场白最大 token */
export const OPENING_MAX_TOKENS = 200;

/** 结束语最大 token */
export const CLOSING_MAX_TOKENS = 300;
