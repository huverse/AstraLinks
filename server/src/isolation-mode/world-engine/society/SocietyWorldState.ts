/**
 * Society World State
 * 
 * 全自治、多 Agent 社会演化仿真
 * 
 * 特点：
 * - 世界在无用户干预下持续运行
 * - Agent 行为不以"对话"为中心
 * - 时间由 Tick 驱动
 * - 社会状态可观察、可回放
 */

import { WorldState, WorldTime, PhaseState, Entity } from '../interfaces';

// ============================================
// 社会角色
// ============================================

/**
 * 社会角色
 */
export type SocialRole =
    | 'worker'      // 工人（生产效率高）
    | 'merchant'    // 商人（交易效率高）
    | 'leader'      // 领导（影响力高）
    | 'helper'      // 帮助者（助人效率高）
    | 'neutral';    // 普通人

// ============================================
// Agent 社会状态
// ============================================

/**
 * Agent 社会状态
 */
export interface AgentSocialState {
    /** Agent ID */
    agentId: string;
    /** 名称 */
    name: string;
    /** 角色 */
    role: SocialRole;
    /** 资源 */
    resources: number;
    /** 情绪 (-1.0 ~ 1.0) */
    mood: number;
    /** 关系图 (agentId -> relationship strength, -1.0 ~ 1.0) */
    relationships: Map<string, number>;
    /** 是否活跃/在社会中 */
    isActive: boolean;
    /** 连续资源为0的 tick 数 */
    zeroResourceTicks: number;
    /** 上一次行动的 tick */
    lastActionTick: number;
}

// ============================================
// 全局资源
// ============================================

/**
 * 全局资源
 */
export interface GlobalResources {
    /** 社区总资源 */
    communityPool: number;
    /** 环境资源（可采集） */
    environmentPool: number;
    /** 资源再生率 */
    regenerationRate: number;
}

// ============================================
// Society World State
// ============================================

/**
 * 社会世界状态
 */
export interface SocietyWorldState extends WorldState {
    worldType: 'social_sim';

    /** 当前 Tick */
    timeTick: number;

    /** Agent 社会状态 */
    agents: Map<string, AgentSocialState>;

    /** 全局资源 */
    globalResources: GlobalResources;

    /** 稳定性指数 (0.0 ~ 1.0) */
    stabilityIndex: number;

    /** 社会统计 */
    statistics: SocietyStatistics;
}

/**
 * 社会统计
 */
export interface SocietyStatistics {
    /** 总交互次数 */
    totalInteractions: number;
    /** 冲突次数 */
    conflictCount: number;
    /** 帮助次数 */
    helpCount: number;
    /** 退出的 Agent 数 */
    exitedAgentCount: number;
    /** 平均资源 */
    averageResources: number;
    /** 平均情绪 */
    averageMood: number;
    /** 基尼系数（资源不平等） */
    giniCoefficient: number;
}

// ============================================
// Society Action Types
// ============================================

/**
 * 社会 Action 类型
 */
export type SocietyActionType =
    | 'work'        // 增加资源
    | 'consume'     // 消耗资源
    | 'talk'        // 改变关系/情绪
    | 'help'        // 转移资源
    | 'conflict'    // 冲突
    | 'idle';       // 无行为

/**
 * Work 参数
 */
export interface WorkParams {
    /** 工作强度 (1-3) */
    intensity: number;
}

/**
 * Consume 参数
 */
export interface ConsumeParams {
    /** 消耗量 */
    amount: number;
}

/**
 * Talk 参数
 */
export interface TalkParams {
    /** 目标 Agent */
    targetAgentId: string;
    /** 对话类型 */
    talkType: 'friendly' | 'neutral' | 'hostile';
}

/**
 * Help 参数
 */
export interface HelpParams {
    /** 目标 Agent */
    targetAgentId: string;
    /** 转移的资源量 */
    amount: number;
}

/**
 * Conflict 参数
 */
export interface ConflictParams {
    /** 目标 Agent */
    targetAgentId: string;
    /** 冲突强度 (1-3) */
    intensity: number;
}

// ============================================
// Society Event Types
// ============================================

/**
 * 社会事件类型
 */
export type SocietyEventType =
    | 'TICK_START'
    | 'TICK_END'
    | 'ACTION_ACCEPTED'
    | 'ACTION_REJECTED'
    | 'STATE_DELTA'
    | 'AGENT_EXIT'
    | 'SOCIETY_SUMMARY';

// ============================================
// 常量
// ============================================

/** 初始资源 */
export const INITIAL_RESOURCES = 50;

/** 初始情绪 */
export const INITIAL_MOOD = 0.5;

/** 资源为0多少 tick 后退出 */
export const ZERO_RESOURCE_EXIT_THRESHOLD = 5;

/** 工作获得的资源 (按强度) */
export const WORK_REWARD = [5, 10, 15];

/** 消耗对情绪的影响 */
export const CONSUME_MOOD_BOOST = 0.1;

/** 资源不足对情绪的影响 */
export const CONSUME_FAIL_MOOD_PENALTY = -0.2;

/** 友好对话对关系的影响 */
export const TALK_FRIENDLY_RELATIONSHIP_BOOST = 0.1;

/** 敌意对话对关系的影响 */
export const TALK_HOSTILE_RELATIONSHIP_PENALTY = -0.15;

/** 帮助对关系的影响 */
export const HELP_RELATIONSHIP_BOOST = 0.2;

/** 冲突对关系的影响 */
export const CONFLICT_RELATIONSHIP_PENALTY = -0.3;

/** 冲突资源损失 */
export const CONFLICT_RESOURCE_LOSS = [5, 10, 15];

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
    // 创建 Agent 状态
    const agents = new Map<string, AgentSocialState>();

    for (const config of agentConfigs) {
        const relationships = new Map<string, number>();
        // 初始化与其他 Agent 的关系（中性）
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
            lastActionTick: 0
        });
    }

    // 创建实体
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
            phaseMaxRounds: -1, // 无限
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
