/**
 * Society World State Types
 * 
 * 生产化版本 - 常量从配置加载
 */

import { getSocietyConfig } from '../../../config/world-engine.config';
import { WorldState, WorldTime, PhaseConfig, Entity, Relationship } from '../interfaces';

// ============================================
// 加载配置
// ============================================

const CONFIG = getSocietyConfig();

// ============================================
// 社会角色类型
// ============================================

export type SocialRole = 'worker' | 'merchant' | 'leader' | 'helper' | 'neutral';

// ============================================
// Agent 社会状态
// ============================================

export interface AgentSocialState {
    agentId: string;
    name: string;
    role: SocialRole;
    resources: number;
    mood: number;
    relationships: Map<string, number>;
    isActive: boolean;
    zeroResourceTicks: number;
    lowMoodTicks: number;
    lastActionTick: number;
}

// ============================================
// 全局资源
// ============================================

export interface GlobalResources {
    communityPool: number;
    environmentPool: number;
    regenerationRate: number;
}

// ============================================
// 社会统计
// ============================================

export interface SocietyStatistics {
    totalInteractions: number;
    conflictCount: number;
    helpCount: number;
    exitedAgentCount: number;
    averageResources: number;
    averageMood: number;
    giniCoefficient: number;
}

// ============================================
// 社会世界状态
// ============================================

export interface SocietyWorldState extends WorldState {
    timeTick: number;
    agents: Map<string, AgentSocialState>;
    globalResources: GlobalResources;
    stabilityIndex: number;
    statistics: SocietyStatistics;
}

// ============================================
// Action 类型
// ============================================

export type SocietyActionType = 'work' | 'consume' | 'talk' | 'help' | 'conflict' | 'idle';

// ============================================
// Action 参数
// ============================================

export interface WorkParams {
    intensity: number; // 1-3
}

export interface ConsumeParams {
    amount: number;
}

export interface TalkParams {
    targetAgentId: string;
    talkType: 'friendly' | 'neutral' | 'hostile';
}

export interface HelpParams {
    targetAgentId: string;
    amount: number;
}

export interface ConflictParams {
    targetAgentId: string;
    intensity: number; // 1-3
}

// ============================================
// Society Event Types
// ============================================

export type SocietyEventType =
    | 'TICK_START'
    | 'TICK_END'
    | 'ACTION_ACCEPTED'
    | 'ACTION_REJECTED'
    | 'STATE_DELTA'
    | 'AGENT_EXIT'
    | 'SOCIETY_SUMMARY'
    | 'SHOCK_EVENT'
    | 'CONFLICT_ESCALATION';

// ============================================
// 常量 (从配置加载)
// ============================================

/** 初始资源 */
export const INITIAL_RESOURCES = CONFIG.initialResources;

/** 初始情绪 */
export const INITIAL_MOOD = CONFIG.initialMood;

/** 资源为0多少 tick 后退出 */
export const ZERO_RESOURCE_EXIT_THRESHOLD = CONFIG.zeroResourceExitThreshold;

/** 工作获得的资源 (按强度) */
export const WORK_REWARD = CONFIG.workReward;

/** 消耗对情绪的影响 */
export const CONSUME_MOOD_BOOST = CONFIG.consumeMoodBoost;

/** 资源不足对情绪的影响 */
export const CONSUME_FAIL_MOOD_PENALTY = CONFIG.consumeFailMoodPenalty;

/** 友好对话对关系的影响 */
export const TALK_FRIENDLY_RELATIONSHIP_BOOST = CONFIG.talkFriendlyRelationshipBoost;

/** 敌意对话对关系的影响 */
export const TALK_HOSTILE_RELATIONSHIP_PENALTY = CONFIG.talkHostileRelationshipPenalty;

/** 帮助对关系的影响 */
export const HELP_RELATIONSHIP_BOOST = CONFIG.helpRelationshipBoost;

/** 冲突对关系的影响 */
export const CONFLICT_RELATIONSHIP_PENALTY = CONFIG.conflictRelationshipPenalty;

/** 冲突资源损失 */
export const CONFLICT_RESOURCE_LOSS = CONFIG.conflictResourceLoss;

// ============================================
// 社会压力常量 (A-6 增强)
// ============================================

/** 工作收益递减开始 tick */
export const WORK_DIMINISHING_START_TICK = CONFIG.workDiminishingStartTick;

/** 工作收益递减率 (每 tick 减少的百分比) */
export const WORK_DIMINISHING_RATE = CONFIG.workDiminishingRate;

/** 工作收益最低比例 */
export const WORK_MIN_EFFICIENCY = CONFIG.workMinEfficiency;

/** 消耗成本增加阈值 (mood 高于此值时增加成本) */
export const CONSUME_INDULGENCE_THRESHOLD = CONFIG.consumeIndulgenceThreshold;

/** 消耗成本增加率 */
export const CONSUME_INDULGENCE_COST_MULTIPLIER = CONFIG.consumeIndulgenceCostMultiplier;

/** 随机冲击间隔 (ticks) */
export const SHOCK_INTERVAL = CONFIG.shockInterval;

/** 随机冲击影响人数 */
export const SHOCK_AGENT_COUNT = CONFIG.shockAgentCount;

/** 随机冲击资源损失范围 */
export const SHOCK_RESOURCE_LOSS = CONFIG.shockResourceLoss;

/** 随机冲击情绪损失范围 */
export const SHOCK_MOOD_LOSS = CONFIG.shockMoodLoss;

/** 冲突升级关系阈值 */
export const CONFLICT_ESCALATION_THRESHOLD = CONFIG.conflictEscalationThreshold;

/** 冲突升级概率 (当 talk hostile 且关系低于阈值时) */
export const CONFLICT_ESCALATION_PROBABILITY = CONFIG.conflictEscalationProbability;

/** 低情绪阈值 (低于此值开始计数) */
export const LOW_MOOD_THRESHOLD = CONFIG.lowMoodThreshold;

/** 低情绪退出阈值 (持续 tick 数) */
export const LOW_MOOD_EXIT_THRESHOLD = CONFIG.lowMoodExitThreshold;

// ============================================
// 工厂函数
// ============================================

/**
 * 创建初始社会世界状态
 */
export function createInitialSocietyWorldState(
    worldId: string,
    agentConfigs: { id: string; name: string; role: SocialRole }[]
): SocietyWorldState {
    const agents = new Map<string, AgentSocialState>();

    for (const config of agentConfigs) {
        const relationships = new Map<string, number>();
        for (const other of agentConfigs) {
            if (other.id !== config.id) {
                relationships.set(other.id, 0.0);
            }
        }

        agents.set(config.id, {
            agentId: config.id,
            name: config.name,
            role: config.role,
            resources: INITIAL_RESOURCES,
            mood: INITIAL_MOOD,
            relationships,
            isActive: true,
            zeroResourceTicks: 0,
            lowMoodTicks: 0,
            lastActionTick: 0
        });
    }

    const entities = new Map(agentConfigs.map(c => [c.id, {
        id: c.id,
        type: 'agent' as const,
        name: c.name,
        attributes: new Map([['role', c.role]]),
        status: 'active' as const
    }]));

    return {
        worldId,
        worldType: 'social_sim',
        currentTime: { tick: 0, round: 0, timeScale: 1 },
        currentPhase: {
            phaseId: 'simulation',
            phaseType: 'society',
            phaseRound: 0,
            phaseMaxRounds: -1,
            startedAt: Date.now(),
            phaseRules: {}
        },
        entities,
        relationships: [],
        resources: new Map(),
        globalVars: new Map([['startedAt', Date.now()]]),
        ruleStates: new Map(),
        isTerminated: false,

        timeTick: 0,
        agents,
        globalResources: {
            communityPool: 100,
            environmentPool: 500,
            regenerationRate: 10
        },
        stabilityIndex: 1.0,
        statistics: {
            totalInteractions: 0,
            conflictCount: 0,
            helpCount: 0,
            exitedAgentCount: 0,
            averageResources: INITIAL_RESOURCES,
            averageMood: INITIAL_MOOD,
            giniCoefficient: 0.0
        }
    };
}

/**
 * 计算基尼系数
 */
export function calculateGiniCoefficient(resources: number[]): number {
    const n = resources.length;
    if (n === 0) return 0;

    const sorted = [...resources].sort((a, b) => a - b);
    let sum = 0;
    let weightedSum = 0;

    for (let i = 0; i < n; i++) {
        sum += sorted[i];
        weightedSum += (i + 1) * sorted[i];
    }

    if (sum === 0) return 0;
    return (2 * weightedSum) / (n * sum) - (n + 1) / n;
}
