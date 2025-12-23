/**
 * Game World State
 * 
 * 回合制卡牌游戏的世界状态
 * 不使用任何辩论/语言逻辑
 */

import { WorldState, WorldTime, PhaseState, Entity, Relationship, Resource } from '../interfaces';

// ============================================
// 游戏世界状态
// ============================================

/**
 * 游戏 Agent 状态
 */
export interface GameAgentState {
    /** Agent ID */
    agentId: string;
    /** 生命值 */
    hp: number;
    /** 最大生命值 */
    maxHp: number;
    /** 手牌 */
    hand: CardType[];
    /** 是否存活 */
    isAlive: boolean;
}

/**
 * 卡牌类型
 */
export type CardType = 'attack' | 'heal' | 'shield' | 'draw';

/**
 * 游戏世界状态
 */
export interface GameWorldState extends WorldState {
    worldType: 'game';

    /** 游戏特有状态 */
    game: {
        /** 当前回合 Agent ID */
        currentTurnAgentId: string;
        /** 回合顺序 */
        turnOrder: string[];
        /** 回合索引 */
        turnIndex: number;
        /** 总回合数 */
        totalTurns: number;
        /** 最大回合数 */
        maxTurns: number;
        /** 游戏阶段 */
        gamePhase: 'playing' | 'ended';
        /** 胜者 */
        winnerId: string | null;
    };

    /** Agent 状态 */
    agents: Map<string, GameAgentState>;
}

// ============================================
// 游戏 Action 类型
// ============================================

/**
 * 游戏 Action 类型
 */
export type GameActionType = 'play_card' | 'pass';

/**
 * 出牌参数
 */
export interface PlayCardParams {
    /** 卡牌类型 */
    card: CardType;
    /** 目标 Agent（攻击时必须） */
    targetAgentId?: string;
}

/**
 * 游戏事件类型
 */
export type GameEventType =
    | 'game_start'
    | 'turn_start'
    | 'card_played'
    | 'damage_dealt'
    | 'heal_applied'
    | 'agent_died'
    | 'turn_end'
    | 'game_end'
    | 'action_rejected';

// ============================================
// 常量
// ============================================

/** 攻击伤害 */
export const ATTACK_DAMAGE = 20;

/** 治疗量 */
export const HEAL_AMOUNT = 15;

/** 初始手牌 */
export const DEFAULT_HAND: CardType[] = ['attack', 'attack', 'heal'];

/** 初始生命值 */
export const DEFAULT_HP = 100;

/** 最大回合数 */
export const DEFAULT_MAX_TURNS = 20;

// ============================================
// 工厂函数
// ============================================

/**
 * 创建初始游戏世界状态
 */
export function createInitialGameWorldState(
    worldId: string,
    agentIds: string[],
    maxTurns: number = DEFAULT_MAX_TURNS
): GameWorldState {
    // 创建 Agent 状态
    const agents = new Map<string, GameAgentState>();
    for (const agentId of agentIds) {
        agents.set(agentId, {
            agentId,
            hp: DEFAULT_HP,
            maxHp: DEFAULT_HP,
            hand: [...DEFAULT_HAND],
            isAlive: true
        });
    }

    // 创建实体
    const entities = new Map(agentIds.map(id => [id, {
        id,
        type: 'agent' as const,
        name: id,
        attributes: new Map(),
        status: 'active' as const
    }]));

    return {
        worldId,
        worldType: 'game',
        currentTime: { tick: 0, round: 0, timeScale: 1 },
        currentPhase: {
            phaseId: 'playing',
            phaseType: 'game',
            phaseRound: 0,
            phaseMaxRounds: maxTurns,
            startedAt: Date.now(),
            phaseRules: {}
        },
        entities,
        relationships: [],
        resources: new Map(),
        globalVars: new Map([['startedAt', Date.now()]]),
        ruleStates: new Map(),
        isTerminated: false,

        game: {
            currentTurnAgentId: agentIds[0],
            turnOrder: agentIds,
            turnIndex: 0,
            totalTurns: 0,
            maxTurns,
            gamePhase: 'playing',
            winnerId: null
        },

        agents
    };
}
