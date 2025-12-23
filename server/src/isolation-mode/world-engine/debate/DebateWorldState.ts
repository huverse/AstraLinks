/**
 * Debate World State
 * 
 * 辩论世界的状态定义
 * 继承自通用 WorldState，添加辩论特有字段
 */

import { WorldState, WorldTime, PhaseState, Entity, Relationship, Resource } from '../interfaces';
import { PhaseType } from '../../core/types/scenario.types';

// ============================================
// 辩论世界状态
// ============================================

/**
 * 辩论世界状态
 */
export interface DebateWorldState extends WorldState {
    worldType: 'debate';

    /** 辩论特有状态 */
    debate: {
        /** 当前发言顺序 */
        speakingOrder: 'round-robin' | 'free' | 'moderated';
        /** 当前活跃发言者 */
        activeSpeaker: string | null;
        /** 上一个发言者 */
        lastSpeakerId: string | null;
        /** 连续发言计数 */
        consecutiveSpeaks: number;
        /** 空闲轮次 */
        idleRounds: number;
        /** 是否允许插话 */
        allowInterrupt: boolean;
        /** 干预级别 (0-3) */
        interventionLevel: number;
        /** 冷场阈值 */
        coldThreshold: number;
        /** 各 Agent 发言次数 */
        speakCounts: Map<string, number>;
        /** 轮询指针（round-robin 模式） */
        roundRobinIndex: number;
        /** Agent 列表（按注册顺序） */
        agentIds: string[];
    };

    /** 主题 */
    topic: string;
    /** 阵营设置 */
    alignment: {
        type: 'opposing' | 'free' | 'multi-faction';
        factions?: Array<{
            id: string;
            name: string;
            agentIds: string[];
        }>;
    };
}

/**
 * 辩论阶段状态（扩展）
 */
export interface DebatePhaseState extends PhaseState {
    /** 阶段类型（辩论特有） */
    phaseType: PhaseType;
    /** 是否强制总结 */
    forceSummary: boolean;
    /** 是否生成开场白 */
    generateOpening: boolean;
    /** 每次发言最大 token */
    maxTokensPerSpeech?: number;
}

// ============================================
// 辩论 Action 类型
// ============================================

/**
 * 辩论 Action 类型
 */
export type DebateActionType =
    | 'speak'       // 发言
    | 'interrupt'   // 插话
    | 'question'    // 提问
    | 'respond'     // 回应
    | 'pass'        // 跳过
    | 'vote';       // 投票

/**
 * 辩论发言参数
 */
export interface SpeakParams {
    /** 发言内容 */
    content?: string;
    /** 话题 */
    topic?: string;
    /** 目标 Agent（回应/提问时） */
    targetAgentId?: string;
    /** 语气 */
    tone?: 'calm' | 'assertive' | 'questioning' | 'conciliatory' | 'passionate';
}

/**
 * 辩论投票参数
 */
export interface VoteParams {
    /** 投票选项 */
    option: string;
    /** 投票理由 */
    reason?: string;
}

// ============================================
// 辩论事件类型
// ============================================

/**
 * 辩论事件类型
 */
export type DebateEventType =
    | 'speech'              // 发言
    | 'speech_rejected'     // 发言被拒绝
    | 'moderator_call'      // 主持人点名
    | 'moderator_question'  // 主持人提问
    | 'phase_summary'       // 阶段总结
    | 'phase_switch'        // 阶段切换
    | 'debate_start'        // 辩论开始
    | 'debate_end'          // 辩论结束
    | 'warning';            // 警告

// ============================================
// 工厂函数
// ============================================

/**
 * 创建初始辩论世界状态
 */
export function createInitialDebateWorldState(
    worldId: string,
    topic: string,
    agentIds: string[],
    firstPhase: DebatePhaseState,
    alignment: DebateWorldState['alignment'],
    interventionLevel: number,
    coldThreshold: number
): DebateWorldState {
    return {
        worldId,
        worldType: 'debate',
        currentTime: { tick: 0, round: 0, timeScale: 1 },
        currentPhase: firstPhase,
        entities: new Map(agentIds.map(id => [id, {
            id,
            type: 'agent' as const,
            name: id,
            attributes: new Map(),
            status: 'active' as const
        }])),
        relationships: [],
        resources: new Map(),
        globalVars: new Map(),
        ruleStates: new Map(),
        isTerminated: false,

        topic,
        alignment,
        debate: {
            speakingOrder: firstPhase.phaseRules.speakingOrder as any || 'free',
            activeSpeaker: null,
            lastSpeakerId: null,
            consecutiveSpeaks: 0,
            idleRounds: 0,
            allowInterrupt: firstPhase.phaseRules.allowInterrupt as boolean || false,
            interventionLevel,
            coldThreshold,
            speakCounts: new Map(agentIds.map(id => [id, 0])),
            roundRobinIndex: 0,
            agentIds
        }
    };
}
