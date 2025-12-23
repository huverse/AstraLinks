/**
 * 讨论场景配置类型定义
 * 
 * 核心设计目标：
 * 1. 讨论"玩法"必须是配置问题
 * 2. 新增场景 ≠ 新写逻辑
 * 3. Moderator / Agent 的行为由配置约束
 * 
 * 配置维度：
 * 1. alignment - 阵营结构
 * 2. flow - 讨论流程（Phase 序列）
 * 3. moderator_policy - 主持人策略
 */

// ============================================
// 1️⃣ Alignment（阵营结构）
// ============================================

/**
 * 阵营类型
 */
export type AlignmentType =
    | 'opposing'       // 正反方（如辩论）
    | 'free'           // 无阵营（如头脑风暴）
    | 'multi-faction'; // 多阵营（如多方谈判）

/**
 * 阵营定义
 */
export interface Faction {
    /** 阵营 ID */
    id: string;
    /** 阵营名称 */
    name: string;
    /** 阵营描述 */
    description: string;
    /** 阵营颜色标识（用于 UI） */
    color?: string;
    /** 最小成员数 */
    minMembers?: number;
    /** 最大成员数 */
    maxMembers?: number;
}

/**
 * 阵营配置
 */
export interface AlignmentConfig {
    /** 阵营类型 */
    type: AlignmentType;
    /** 阵营列表（opposing/multi-faction 时必填） */
    factions?: Faction[];
    /** 是否允许中立/观察者 */
    allowNeutral?: boolean;
}

// ============================================
// 2️⃣ Flow（讨论流程）
// ============================================

/**
 * 预定义的 Phase 类型
 */
export type PhaseType =
    | 'opening'           // 开场
    | 'position_statement' // 立场陈述
    | 'free_discussion'   // 自由讨论
    | 'focused_conflict'  // 焦点对抗（针对特定议题）
    | 'cross_examination' // 交叉质询
    | 'rebuttal'          // 反驳
    | 'convergence'       // 收敛共识
    | 'summary'           // 总结
    | 'voting'            // 投票
    | 'closing'           // 闭幕
    | 'custom';           // 自定义

/**
 * Phase（讨论阶段）配置
 */
export interface PhaseConfig {
    /** Phase ID（唯一标识） */
    id: string;
    /** Phase 类型 */
    type: PhaseType;
    /** Phase 名称（显示用） */
    name: string;
    /** Phase 描述 */
    description: string;

    // === 流程控制 ===

    /** 最大轮次（达到后自动进入下一阶段） */
    maxRounds: number;
    /** 是否允许打断（false = 必须等发言者结束） */
    allowInterrupt: boolean;
    /** 发言顺序：轮流 | 自由 | 主持人指定 */
    speakingOrder: 'round-robin' | 'free' | 'moderated';

    // === 约束 ===

    /** 单次发言最大 token 数 */
    maxTokensPerSpeech?: number;
    /** 单次发言最大时间（秒） */
    maxTimePerSpeech?: number;
    /** 指定发言顺序（仅当 speakingOrder = 'round-robin'） */
    factionOrder?: string[];

    // === 阶段结束条件 ===

    /** 结束条件类型 */
    endCondition: 'max_rounds' | 'moderator_decision' | 'consensus' | 'timeout';
    /** 超时时间（秒，endCondition = 'timeout' 时生效） */
    timeout?: number;

    // === 自动行为 ===

    /** 阶段开始时是否生成开场白 */
    generateOpening?: boolean;
    /** 阶段结束时是否强制生成总结 */
    forceSummary?: boolean;
}

/**
 * 讨论流程配置
 */
export interface FlowConfig {
    /** 阶段列表（按执行顺序） */
    phases: PhaseConfig[];
    /** 是否允许跳过阶段 */
    allowSkipPhase?: boolean;
    /** 是否允许回退到上一阶段 */
    allowRollback?: boolean;
    /** 全局超时（秒） */
    globalTimeout?: number;
}

// ============================================
// 3️⃣ Moderator Policy（主持人策略）
// ============================================

/**
 * 干预级别
 * 0 = 不干预（纯观察）
 * 1 = 低度（仅在严重违规时干预）
 * 2 = 中度（引导讨论方向）
 * 3 = 高度（主导讨论节奏）
 */
export type InterventionLevel = 0 | 1 | 2 | 3;

/**
 * 主持人策略配置
 */
export interface ModeratorPolicyConfig {
    /** 干预级别 (0-3) */
    interventionLevel: InterventionLevel;

    // === 冷场处理 ===

    /** 冷场阈值（连续多少秒无发言视为冷场） */
    coldThreshold: number;
    /** 最大空闲轮次（超过则主持人主动干预） */
    maxIdleRounds: number;

    // === 总结策略 ===

    /** 是否每个阶段结束时强制生成总结 */
    forceSummaryEachPhase: boolean;
    /** 总结最大 token 数 */
    summaryMaxTokens?: number;

    // === 公平性 ===

    /** 是否允许主持人表达倾向性（false = 必须中立） */
    biasAllowed: boolean;
    /** 发言均衡检查（检测某人发言过多） */
    balanceCheck?: {
        enabled: boolean;
        /** 单人发言占比超过此值时警告 */
        maxSpeakRatio: number;
    };

    // === 内容控制 ===

    /** 是否启用敏感词过滤 */
    contentFilter?: boolean;
    /** 是否检测跑题 */
    offTopicDetection?: boolean;
}

// ============================================
// 完整场景配置
// ============================================

/**
 * 场景角色模板
 */
export interface RoleTemplate {
    /** 角色 ID */
    id: string;
    /** 角色名称 */
    name: string;
    /** 角色描述 */
    description: string;
    /** 所属阵营（如果有） */
    factionId?: string;
    /** 系统提示词模板 */
    systemPromptTemplate: string;
    /** 是否必需 */
    required: boolean;
    /** 最大数量 */
    maxCount: number;
}

/**
 * 完整场景配置 Schema
 * 
 * 这是 YAML 文件解析后的 TypeScript 类型
 */
export interface ScenarioSchema {
    // === 基础信息 ===

    /** 场景 ID（唯一标识） */
    id: string;
    /** 场景名称 */
    name: string;
    /** 场景描述 */
    description: string;
    /** 版本号 */
    version: string;
    /** 作者 */
    author?: string;

    // === 三个核心维度 ===

    /** 阵营结构配置 */
    alignment: AlignmentConfig;
    /** 讨论流程配置 */
    flow: FlowConfig;
    /** 主持人策略配置 */
    moderatorPolicy: ModeratorPolicyConfig;

    // === 角色配置 ===

    /** 建议的角色列表 */
    suggestedRoles: RoleTemplate[];

    // === 元数据 ===

    /** 标签 */
    tags?: string[];
    /** 适用场景说明 */
    useCases?: string[];
}

// ============================================
// 配置影响说明
// ============================================

/**
 * 配置影响映射表
 *
 * | 配置字段                    | 影响模块               | 影响行为                           |
 * |-----------------------------|------------------------|------------------------------------|
 * | alignment.type              | Agent Controller       | 阵营分配、发言约束                 |
 * | alignment.factions          | UI + Agent             | 显示阵营标识、角色分配             |
 * | flow.phases                 | Moderator Controller   | 阶段切换逻辑                       |
 * | flow.phases[].maxRounds     | Moderator Controller   | 阶段结束判断                       |
 * | flow.phases[].allowInterrupt| Agent Controller       | 是否可以打断他人发言               |
 * | flow.phases[].speakingOrder | Moderator Controller   | 选择下一个发言者的逻辑             |
 * | moderatorPolicy.interventionLevel | Moderator LLM    | 干预频率和力度                     |
 * | moderatorPolicy.coldThreshold | Moderator Controller | 冷场检测触发时机                   |
 * | moderatorPolicy.forceSummaryEachPhase | Moderator LLM | 是否自动生成阶段总结           |
 * | moderatorPolicy.biasAllowed | Moderator LLM          | 总结/干预内容的中立性约束          |
 */

// ============================================
// 向后兼容类型别名
// ============================================

/**
 * @deprecated 使用 ScenarioSchema 代替
 */
export type ScenarioConfig = ScenarioSchema;

/**
 * 讨论规则（从 ScenarioSchema 中提取）
 */
export interface DiscussionRules {
    speakingOrder: 'round-robin' | 'free' | 'moderated';
    maxTokensPerTurn: number;
    maxTimePerTurn: number;
    allowInterruption: boolean;
    allowVoting: boolean;
    minRounds: number;
    maxRounds: number;
}

// All types are exported at their definition above
