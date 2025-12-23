/**
 * World Engine 核心接口定义
 * 
 * World Engine 是系统内核，负责：
 * - 决定世界"允许发生什么"
 * - 推进时间 / 回合 / 状态
 * - 裁决多个 Agent 的 Action 冲突
 * - 将结果写入 Event Log
 * 
 * 特性：
 * - 确定性的（deterministic）
 * - 不依赖 LLM 推理
 * - 不生成内容（除非通过 Narrator）
 */

// ============================================
// Action 模型（通用抽象）
// ============================================

/**
 * 通用 Action 类型
 * 
 * 所有 Agent 行为都抽象为 Action
 */
export type ActionType =
    // === 讨论/辩论类 ===
    | 'speak'           // 发言
    | 'interrupt'       // 插话
    | 'question'        // 提问
    | 'respond'         // 回应
    | 'pass'            // 跳过
    | 'vote'            // 投票

    // === 游戏类 ===
    | 'move'            // 移动
    | 'attack'          // 攻击
    | 'defend'          // 防御
    | 'use_item'        // 使用物品
    | 'play_card'       // 出牌
    | 'trade'           // 交易

    // === 社会仿真类 ===
    | 'socialize'       // 社交
    | 'work'            // 工作
    | 'rest'            // 休息
    | 'learn'           // 学习

    // === 创作类 ===
    | 'generate_image'  // 生成图片
    | 'write_text'      // 写作
    | 'compose_music'   // 作曲

    // === 逻辑推理类 ===
    | 'derive'          // 推导
    | 'refute'          // 反驳
    | 'extend'          // 扩展
    | 'accept'          // 接受

    // === 通用 ===
    | 'custom';         // 自定义

/**
 * 通用 Action 接口
 */
export interface Action {
    /** Action 唯一 ID */
    readonly actionId: string;
    /** 发起 Action 的 Agent ID */
    readonly agentId: string;
    /** Action 类型 */
    readonly actionType: ActionType;
    /** Action 参数（类型安全由具体实现保证） */
    readonly params: Record<string, unknown>;
    /** 置信度 (0.0-1.0)，表示 Agent 对此行动的确定程度 */
    readonly confidence: number;
    /** 时间戳 */
    readonly timestamp: number;
    /** 目标（可选） */
    readonly target?: ActionTarget;
    /** 优先级 (1-10) */
    readonly priority?: number;
}

/**
 * Action 目标
 */
export interface ActionTarget {
    /** 目标类型 */
    type: 'agent' | 'location' | 'object' | 'zone' | 'topic';
    /** 目标 ID */
    id: string;
    /** 目标名称（可选） */
    name?: string;
}

/**
 * Action 结果
 */
export interface ActionResult {
    /** 原始 Action */
    action: Action;
    /** 是否成功 */
    success: boolean;
    /** 失败原因 */
    failureReason?: string;
    /** 产生的效果 */
    effects: WorldStateChange[];
    /** 生成的事件 */
    events: WorldEvent[];
}

// ============================================
// World State（世界状态）
// ============================================

/**
 * 世界状态
 * 
 * 只包含"世界事实"，不包含 Agent 私有记忆
 * 
 * World Engine:
 * - 只能读写 World State
 * - 不能读写 Agent Memory
 */
export interface WorldState {
    /** 世界 ID */
    readonly worldId: string;
    /** 世界类型 */
    readonly worldType: WorldType;
    /** 当前时间（模拟时间） */
    currentTime: WorldTime;
    /** 当前阶段/回合 */
    currentPhase: PhaseState;
    /** 实体注册表（Agent、物品、位置等） */
    entities: Map<string, Entity>;
    /** 关系图（Agent 之间的关系） */
    relationships: Relationship[];
    /** 资源状态 */
    resources: Map<string, Resource>;
    /** 全局变量 */
    globalVars: Map<string, unknown>;
    /** 规则状态（动态规则生效情况） */
    ruleStates: Map<string, boolean>;
    /** 是否终止 */
    isTerminated: boolean;
    /** 终止原因 */
    terminationReason?: string;
}

/**
 * 世界类型
 */
export type WorldType =
    | 'debate'          // 辩论
    | 'game'            // 游戏
    | 'social_sim'      // 社会仿真
    | 'creative'        // 创作
    | 'research'        // 推理/研究
    | 'logic'           // 逻辑推理
    | 'custom';         // 自定义

/**
 * 世界时间
 */
export interface WorldTime {
    /** 当前 tick */
    tick: number;
    /** 回合数 */
    round: number;
    /** 模拟时间（可选） */
    simulatedTime?: Date;
    /** 时间流速 */
    timeScale: number;
}

/**
 * 阶段状态
 */
export interface PhaseState {
    /** 阶段 ID */
    phaseId: string;
    /** 阶段类型 */
    phaseType: string;
    /** 阶段内回合 */
    phaseRound: number;
    /** 阶段最大回合 */
    phaseMaxRounds: number;
    /** 阶段开始时间 */
    startedAt: number;
    /** 阶段规则 */
    phaseRules: Record<string, unknown>;
}

/**
 * 实体
 */
export interface Entity {
    /** 实体 ID */
    id: string;
    /** 实体类型 */
    type: 'agent' | 'object' | 'location' | 'zone';
    /** 实体名称 */
    name: string;
    /** 属性 */
    attributes: Map<string, unknown>;
    /** 位置（如果适用） */
    position?: Position;
    /** 状态 */
    status: 'active' | 'inactive' | 'destroyed';
}

/**
 * 位置
 */
export interface Position {
    x: number;
    y: number;
    z?: number;
    zoneId?: string;
}

/**
 * 关系
 */
export interface Relationship {
    /** 源实体 */
    fromId: string;
    /** 目标实体 */
    toId: string;
    /** 关系类型 */
    type: string;
    /** 关系强度 (-1.0 到 1.0) */
    strength: number;
    /** 关系属性 */
    attributes: Record<string, unknown>;
}

/**
 * 资源
 */
export interface Resource {
    /** 资源 ID */
    id: string;
    /** 资源类型 */
    type: string;
    /** 当前数量 */
    amount: number;
    /** 最大数量 */
    maxAmount?: number;
    /** 所有者 ID */
    ownerId?: string;
}

/**
 * 世界状态变化
 */
export interface WorldStateChange {
    /** 变化类型 */
    changeType: 'create' | 'update' | 'delete' | 'transfer';
    /** 实体类型 */
    entityType: string;
    /** 实体 ID */
    entityId: string;
    /** 字段路径 */
    fieldPath?: string;
    /** 旧值 */
    oldValue?: unknown;
    /** 新值 */
    newValue?: unknown;
}

/**
 * 世界事件
 */
export interface WorldEvent {
    /** 事件 ID */
    eventId: string;
    /** 事件类型 */
    eventType: string;
    /** 时间戳 */
    timestamp: number;
    /** 发起者 */
    source: string;
    /** 内容 */
    content: unknown;
    /** 元数据 */
    meta?: Record<string, unknown>;
}

// ============================================
// World Config（世界配置）
// ============================================

/**
 * 世界配置
 */
export interface WorldConfig {
    /** 世界 ID */
    worldId: string;
    /** 世界类型 */
    worldType: WorldType;
    /** 初始时间 */
    initialTime?: WorldTime;
    /** 阶段配置 */
    phases: PhaseConfig[];
    /** 规则配置 */
    rules: RuleConfig[];
    /** 初始实体 */
    initialEntities?: Entity[];
    /** 终止条件 */
    terminationConditions: TerminationCondition[];
    /** 扩展配置 */
    extensions?: Record<string, unknown>;
}

/**
 * 阶段配置（通用）
 */
export interface PhaseConfig {
    id: string;
    type: string;
    name: string;
    maxRounds: number;
    rules: Record<string, unknown>;
    endCondition: string;
}

/**
 * 规则配置
 */
export interface RuleConfig {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    priority: number;
    condition?: string;
    effect?: string;
}

/**
 * 终止条件
 */
export interface TerminationCondition {
    type: 'max_rounds' | 'timeout' | 'goal_reached' | 'consensus' | 'custom';
    params: Record<string, unknown>;
}

// ============================================
// 核心接口 - IWorldEngine
// ============================================

/**
 * 世界引擎接口
 * 
 * 系统内核，决定世界"允许发生什么"
 */
export interface IWorldEngine {
    /** 引擎名称 */
    readonly name: string;

    /**
     * 初始化世界
     */
    initialize(config: WorldConfig): Promise<void>;

    /**
     * 执行一个 tick
     * 
     * 收集所有 Agent 的 Action，裁决冲突，应用效果
     */
    step(agentActions: Action[]): Promise<ActionResult[]>;

    /**
     * 获取当前世界状态
     */
    getWorldState(): WorldState;

    /**
     * 检查世界是否终止
     */
    isTerminated(): boolean;

    /**
     * 获取终止原因
     */
    getTerminationReason(): string | undefined;

    /**
     * 注册实体
     */
    registerEntity(entity: Entity): void;

    /**
     * 注销实体
     */
    unregisterEntity(entityId: string): void;

    /**
     * 获取历史事件
     */
    getEvents(limit: number): WorldEvent[];

    /**
     * 重置世界
     */
    reset(): Promise<void>;
}

// ============================================
// 核心接口 - IRuleEngine
// ============================================

/**
 * 规则引擎接口
 * 
 * 验证和应用规则
 */
export interface IRuleEngine {
    /**
     * 验证 Action 是否合法
     */
    validateAction(action: Action, worldState: WorldState): ValidationResult;

    /**
     * 应用 Action 到世界状态
     */
    applyAction(action: Action, worldState: WorldState): ActionResult;

    /**
     * 强制执行约束（如资源上限、边界检查）
     */
    enforceConstraints(worldState: WorldState): WorldStateChange[];

    /**
     * 注册规则
     */
    registerRule(rule: Rule): void;

    /**
     * 获取所有活跃规则
     */
    getActiveRules(): Rule[];
}

/**
 * 验证结果
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * 规则
 */
export interface Rule {
    id: string;
    name: string;
    priority: number;
    condition: (action: Action, state: WorldState) => boolean;
    validate?: (action: Action, state: WorldState) => ValidationResult;
    apply?: (action: Action, state: WorldState) => WorldStateChange[];
}

// ============================================
// 核心接口 - IScheduler
// ============================================

/**
 * 调度器接口
 * 
 * 管理时间和阶段推进
 */
export interface IScheduler {
    /**
     * 推进到下一个 tick
     */
    nextTick(): WorldTime;

    /**
     * 获取当前时间
     */
    currentTime(): WorldTime;

    /**
     * 检查是否应该推进阶段
     */
    shouldAdvancePhase(worldState: WorldState): boolean;

    /**
     * 获取下一个阶段
     */
    getNextPhase(currentPhaseId: string): PhaseConfig | null;

    /**
     * 检查是否应该终止
     */
    shouldTerminate(worldState: WorldState): boolean;

    /**
     * 设置时间流速
     */
    setTimeScale(scale: number): void;
}

// ============================================
// 核心接口 - IArbiter
// ============================================

/**
 * 仲裁器接口
 * 
 * 解决 Action 冲突
 */
export interface IArbiter {
    /**
     * 解决冲突的 Actions
     * 
     * 当多个 Action 冲突时，决定哪些可以执行
     */
    resolveConflicts(actions: Action[], worldState: WorldState): Action[];

    /**
     * 按优先级排序 Actions
     */
    prioritizeActions(actions: Action[]): Action[];

    /**
     * 检查两个 Action 是否冲突
     */
    checkConflict(action1: Action, action2: Action, worldState: WorldState): boolean;
}

// ============================================
// 核心接口 - INarrator（可选，LLM）
// ============================================

/**
 * 叙述者接口
 * 
 * 唯一可以调用 LLM 生成内容的组件
 */
export interface INarrator {
    /**
     * 生成阶段/回合总结
     */
    generateSummary(worldState: WorldState, recentEvents: WorldEvent[]): Promise<string>;

    /**
     * 叙述单个事件
     */
    narrateEvent(event: WorldEvent): Promise<string>;

    /**
     * 生成开场白
     */
    generateOpening(worldState: WorldState): Promise<string>;

    /**
     * 生成结束语
     */
    generateClosing(worldState: WorldState): Promise<string>;

    /**
     * 生成引导问题
     */
    generateQuestion(worldState: WorldState, context: Record<string, unknown>): Promise<string>;
}
