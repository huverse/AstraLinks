/**
 * 场景类型定义
 * 
 * 场景定义讨论的规则、流程、角色模板
 */

export interface ScenarioConfig {
    /** 场景 ID */
    id: string;
    /** 场景名称 */
    name: string;
    /** 场景描述 */
    description: string;
    /** 场景类型 */
    type: ScenarioType;
    /** 推荐的 Agent 角色 */
    suggestedRoles: RoleTemplate[];
    /** 讨论规则 */
    rules: DiscussionRules;
    /** 主持人策略 */
    moderatorStrategy: ModeratorStrategy;
    /** 结束条件 */
    endConditions: EndCondition[];
}

export type ScenarioType =
    | 'debate'         // 辩论
    | 'review'         // 评审
    | 'brainstorm'     // 头脑风暴
    | 'academic'       // 学术研讨
    | 'interview'      // 访谈
    | 'custom';        // 自定义

export interface RoleTemplate {
    role: string;
    name: string;
    description: string;
    systemPromptTemplate: string;
    required: boolean;
    maxCount?: number;
}

export interface DiscussionRules {
    /** 发言顺序类型 */
    speakingOrder: 'round-robin' | 'free' | 'moderated' | 'priority';
    /** 单次发言最大 Token */
    maxTokensPerTurn?: number;
    /** 单次发言最大时间 (秒) */
    maxTimePerTurn?: number;
    /** 是否允许打断 */
    allowInterruption: boolean;
    /** 是否允许投票 */
    allowVoting: boolean;
    /** 最小发言轮次 */
    minRounds?: number;
    /** 最大发言轮次 */
    maxRounds?: number;
}

export type ModeratorStrategy =
    | 'passive'        // 被动 (仅记录)
    | 'time-keeper'    // 时间管理
    | 'facilitator'    // 引导者
    | 'arbitrator'     // 仲裁者
    | 'strict';        // 严格控制

export interface EndCondition {
    type: 'max-rounds' | 'max-time' | 'consensus' | 'moderator-decision' | 'vote';
    value?: number;
}
