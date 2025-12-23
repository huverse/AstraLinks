/**
 * Logic World State
 * 
 * 严谨推理 / 多 Agent 科研协作 / 相互纠错
 * 
 * 世界目标：正确性（而非赢）
 * 推理：可验证、可反驳、可接续
 */

import { WorldState, WorldTime, PhaseState, Entity } from '../interfaces';

// ============================================
// 推理相关类型
// ============================================

/**
 * 命题/陈述
 */
export interface Proposition {
    /** 命题 ID */
    id: string;
    /** LaTeX 表达式 */
    latex: string;
    /** 可选的自然语言描述 */
    description?: string;
    /** 标签 */
    tags?: string[];
}

/**
 * 假设
 */
export interface Hypothesis extends Proposition {
    /** 假设类型 */
    type: 'axiom' | 'assumption' | 'given';
    /** 来源 */
    source: 'system' | string;  // 'system' 或 agentId
}

/**
 * 结论
 */
export interface Conclusion extends Proposition {
    /** 推导来源（使用的假设/结论 ID） */
    derivedFrom: string[];
    /** 推导规则 */
    rule: DerivationRule;
    /** 提出者 */
    proposedBy: string;
    /** 验证状态 */
    status: 'pending' | 'accepted' | 'rejected';
    /** 验证时间 */
    verifiedAt?: number;
    /** 验证者 */
    verifiedBy?: string;
    /** 拒绝原因（如果被拒绝） */
    rejectionReason?: string;
}

/**
 * 推导规则类型
 */
export type DerivationRule =
    | 'modus_ponens'     // A, A→B ⊢ B
    | 'modus_tollens'    // ¬B, A→B ⊢ ¬A
    | 'conjunction'      // A, B ⊢ A∧B
    | 'disjunction'      // A ⊢ A∨B
    | 'hypothetical'     // A→B, B→C ⊢ A→C
    | 'substitution'     // 代入
    | 'algebraic'        // 代数变换
    | 'definition'       // 定义展开
    | 'custom';          // 自定义规则

/**
 * 目标/待证
 */
export interface Goal extends Proposition {
    /** 目标状态 */
    status: 'open' | 'proved' | 'refuted';
    /** 如果已证明，证明的结论 ID */
    proofConclusionId?: string;
    /** 优先级 */
    priority: number;
}

/**
 * 反驳
 */
export interface Refutation {
    /** 反驳 ID */
    id: string;
    /** 被反驳的命题 ID */
    targetId: string;
    /** 反驳类型 */
    type: 'contradiction' | 'invalid_derivation' | 'missing_premise' | 'circular';
    /** 反驳理由（LaTeX） */
    reason: string;
    /** 提出者 */
    proposedBy: string;
    /** 状态 */
    status: 'pending' | 'accepted' | 'rejected';
}

// ============================================
// Problem State
// ============================================

/**
 * 问题状态
 */
export interface ProblemState {
    /** 问题 ID */
    problemId: string;
    /** 问题描述 */
    description: string;
    /** LaTeX 问题陈述 */
    statement: string;
    /** 假设集 */
    hypotheses: Map<string, Hypothesis>;
    /** 已接受的结论 */
    conclusions: Map<string, Conclusion>;
    /** 待处理的提案 */
    pendingProposals: Map<string, Conclusion>;
    /** 未解决目标 */
    goals: Map<string, Goal>;
    /** 反驳记录 */
    refutations: Map<string, Refutation>;
    /** 是否已解决 */
    isSolved: boolean;
}

// ============================================
// Logic World State
// ============================================

/**
 * 逻辑世界状态
 */
export interface LogicWorldState extends WorldState {
    worldType: 'logic';

    /** 问题状态 */
    problem: ProblemState;

    /** 研究员状态 */
    researchers: Map<string, ResearcherState>;

    /** 讨论状态 */
    discussion: {
        /** 当前回合 */
        currentRound: number;
        /** 最大回合 */
        maxRounds: number;
        /** 当前发言者（可选，自由讨论时为 null） */
        currentSpeaker: string | null;
        /** 讨论模式 */
        mode: 'free' | 'moderated';
    };
}

/**
 * 研究员状态
 */
export interface ResearcherState {
    agentId: string;
    name: string;
    /** 专业领域 */
    expertise: string[];
    /** 贡献的结论 ID */
    contributions: string[];
    /** 成功反驳数 */
    successfulRefutations: number;
    /** 被拒绝的提案数 */
    rejectedProposals: number;
}

// ============================================
// Logic Action Types
// ============================================

/**
 * 逻辑 Action 类型
 */
export type LogicActionType =
    | 'derive'    // 提出新推导
    | 'refute'    // 指出错误/矛盾
    | 'extend'    // 基于已有结论推进
    | 'accept'    // 接受某一结论
    | 'pass';     // 跳过

/**
 * 推导参数
 */
export interface DeriveParams {
    /** 结论（LaTeX） */
    conclusion: string;
    /** 使用的前提 ID */
    premises: string[];
    /** 推导规则 */
    rule: DerivationRule;
    /** 自然语言解释（可选） */
    explanation?: string;
}

/**
 * 反驳参数
 */
export interface RefuteParams {
    /** 被反驳的命题 ID */
    targetId: string;
    /** 反驳类型 */
    type: Refutation['type'];
    /** 反驳理由（LaTeX） */
    reason: string;
}

/**
 * 扩展参数
 */
export interface ExtendParams {
    /** 基于的结论 ID */
    baseConclusionId: string;
    /** 新结论（LaTeX） */
    extension: string;
    /** 推导规则 */
    rule: DerivationRule;
}

/**
 * 接受参数
 */
export interface AcceptParams {
    /** 要接受的提案 ID */
    proposalId: string;
    /** 验证说明 */
    verificationNote?: string;
}

// ============================================
// Logic Event Types
// ============================================

/**
 * 逻辑事件类型
 */
export type LogicEventType =
    | 'PROPOSAL'        // 提出推导
    | 'ACCEPTED'        // 结论被接受
    | 'REJECTED'        // 结论被拒绝
    | 'CONTRADICTION'   // 发现矛盾
    | 'GOAL_PROVED'     // 目标被证明
    | 'REFUTATION'      // 反驳提出
    | 'ROUND_END';      // 回合结束

// ============================================
// 工厂函数
// ============================================

/**
 * 创建初始逻辑世界状态
 */
export function createInitialLogicWorldState(
    worldId: string,
    problemId: string,
    problemStatement: string,
    hypotheses: Hypothesis[],
    goals: Goal[],
    researcherIds: string[],
    maxRounds: number = 50
): LogicWorldState {
    // 创建假设 Map
    const hypothesesMap = new Map<string, Hypothesis>();
    for (const h of hypotheses) {
        hypothesesMap.set(h.id, h);
    }

    // 创建目标 Map
    const goalsMap = new Map<string, Goal>();
    for (const g of goals) {
        goalsMap.set(g.id, g);
    }

    // 创建研究员状态
    const researchers = new Map<string, ResearcherState>();
    for (const id of researcherIds) {
        researchers.set(id, {
            agentId: id,
            name: id,
            expertise: [],
            contributions: [],
            successfulRefutations: 0,
            rejectedProposals: 0
        });
    }

    // 创建实体
    const entities = new Map(researcherIds.map(id => [id, {
        id,
        type: 'agent' as const,
        name: id,
        attributes: new Map(),
        status: 'active' as const
    }]));

    return {
        worldId,
        worldType: 'logic',
        currentTime: { tick: 0, round: 0, timeScale: 1 },
        currentPhase: {
            phaseId: 'research',
            phaseType: 'logic',
            phaseRound: 0,
            phaseMaxRounds: maxRounds,
            startedAt: Date.now(),
            phaseRules: {}
        },
        entities,
        relationships: [],
        resources: new Map(),
        globalVars: new Map([['startedAt', Date.now()]]),
        ruleStates: new Map(),
        isTerminated: false,

        problem: {
            problemId,
            description: problemStatement,
            statement: problemStatement,
            hypotheses: hypothesesMap,
            conclusions: new Map(),
            pendingProposals: new Map(),
            goals: goalsMap,
            refutations: new Map(),
            isSolved: false
        },

        researchers,

        discussion: {
            currentRound: 0,
            maxRounds,
            currentSpeaker: null,
            mode: 'free'
        }
    };
}
