/**
 * 隔离模式类型定义
 */

/**
 * 自定义 LLM 配置
 * 允许用户直接输入 API 参数
 */
export interface CustomLlmConfig {
    provider: string;
    apiKey: string;
    baseUrl: string;
    modelName: string;
    temperature?: number;
}

/**
 * Agent LLM 配置
 * 允许每个 Agent 使用不同的模型
 */
export interface AgentLlmConfig {
    /** 使用会话级配置 (默认) */
    useSessionConfig?: boolean;
    /** Galaxyous 配置中心的配置 ID */
    galaxyousConfigId?: string;
    /** 配置来源标识 */
    configSource?: 'session' | 'custom' | 'galaxyous';
    /** 自定义 LLM 配置 (当 configSource = 'custom' 时) */
    customConfig?: CustomLlmConfig;
}

export interface Agent {
    id: string;
    name: string;
    role: string;
    status: 'idle' | 'thinking' | 'speaking';
    speakCount: number;
    /** 系统提示词 */
    systemPrompt?: string;
    /** 人格描述 */
    personality?: string;
    /** 立场 */
    stance?: 'for' | 'against' | 'neutral';
    /** Agent 独立 LLM 配置 */
    agentLlmConfig?: AgentLlmConfig;
    /** 发言长度限制 (maxTokens)，默认 1024 */
    maxTokens?: number;
    /** 总发言时长(ms) */
    totalSpeakTime?: number;
}

export interface DiscussionEvent {
    id: string;
    type: string;
    sourceId: string;
    timestamp: number;
    sequence: number;
    payload?: {
        content?: string;
        message?: string;
        [key: string]: unknown;
    };
}

export interface Session {
    id: string;
    title: string;
    topic: string;
    status: 'pending' | 'active' | 'paused' | 'completed';
    currentRound: number;
    agents: Agent[];
    events: DiscussionEvent[];
    /** 创建时间 */
    createdAt?: string;
    /** 开始时间 */
    startedAt?: string;
    /** 讨论总结 */
    summary?: string;
    /** 评分结果 */
    scoringResult?: ScoringResult;
}

export interface Scenario {
    id: string;
    name: string;
    description: string;
    type: string;
}

export interface ScenarioConfig extends Scenario {
    /** 图标名称 */
    icon: string;
    /** 主题色 */
    color: string;
    /** 推荐人数 */
    recommendedAgents?: string;
}

export const DEFAULT_SCENARIOS: ScenarioConfig[] = [
    {
        id: 'debate',
        name: '正式辩论赛',
        description: '标准辩论赛场景，正反双方就议题展开辩论',
        type: 'debate',
        icon: '⚔️',
        color: 'red',
        recommendedAgents: '4-6人'
    },
    {
        id: 'tavern',
        name: 'AI酒馆',
        description: '各路LLM齐聚一堂，以模型独有风格谈天说地',
        type: 'tavern',
        icon: '🍺',
        color: 'amber',
        recommendedAgents: '3-5人'
    },
    {
        id: 'talkshow',
        name: '电视脱口秀',
        description: '电视谈话节目，嘉宾就热点话题各抒己见',
        type: 'talkshow',
        icon: '📺',
        color: 'blue',
        recommendedAgents: '3-4人'
    },
    {
        id: 'review',
        name: '项目讨论会',
        description: '项目团队针对方案进行讨论和决策',
        type: 'review',
        icon: '📋',
        color: 'green',
        recommendedAgents: '4-6人'
    },
    {
        id: 'showdown',
        name: '名嘴对决',
        description: '知名评论员/专家就热点议题展开激烈交锋',
        type: 'showdown',
        icon: '🎤',
        color: 'purple',
        recommendedAgents: '2-4人'
    },
    {
        id: 'academic',
        name: '学术研讨会',
        description: '学者专家就学术议题进行深度探讨',
        type: 'academic',
        icon: '🎓',
        color: 'cyan',
        recommendedAgents: '3-5人'
    },
];

// ============================================
// 评委系统类型
// ============================================

/** 评分维度 */
export interface ScoringDimension {
    id: string;
    name: string;
    description: string;
    weight: number;
    maxScore: number;
}

/** 单个评委对单个Agent的评分 */
export interface JudgeScore {
    judgeId: string;
    agentId: string;
    dimensionScores: Record<string, number>;
    totalScore: number;
    comment: string;
    scoredAt: number;
}

/** 评分结果 */
export interface ScoringResult {
    sessionId: string;
    dimensions: ScoringDimension[];
    judgeScores: JudgeScore[];
    aggregatedScores: Record<string, number>;
    ranking: Array<{ agentId: string; rank: number; score: number }>;
    finalComment: string;
    generatedAt: number;
}

// ============================================
// 意图系统类型
// ============================================

/** 意图紧急程度 */
export type IntentUrgency = 'low' | 'medium' | 'high' | 'critical' | 'interrupt';

/** 发言意图 */
export interface SpeakIntent {
    id: string;
    agentId: string;
    urgency: IntentUrgency;
    reason?: string;
    submittedAt: number;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
}

// ============================================
// 统计类型
// ============================================

/** 会话统计 */
export interface SessionStats {
    totalSpeechCount: number;
    totalDuration: number;
    roundCount: number;
    agentStats: Record<string, AgentStats>;
}

/** Agent统计 */
export interface AgentStats {
    speechCount: number;
    totalDuration: number;
    avgDuration: number;
    lastSpeakTime?: number;
}

// ============================================
// 观点追踪类型
// ============================================

/** 立场记录 */
export interface StanceRecord {
    agentId: string;
    round: number;
    stance: 'for' | 'against' | 'neutral';
    confidence: number;
    timestamp: number;
}

// ============================================
// 讨论模板类型
// ============================================

/** 讨论模板 */
export interface DiscussionTemplate {
    id: string;
    name: string;
    description: string;
    scenarioId: string;
    agents: Omit<Agent, 'status' | 'speakCount'>[];
    maxRounds?: number;
    roundTimeLimit?: number;
    tierRequired?: 'free' | 'pro' | 'ultra';
    downloadCount?: number;
    isActive?: boolean;
}

// ============================================
// 导出格式类型
// ============================================

export type ExportFormat = 'markdown' | 'json' | 'pdf' | 'word';

// ============================================
// P3配置页面新增类型
// ============================================

/** 阵营划分模式 */
export type CampMode = 'versus' | 'free';

/** 辩论流程 */
export type DebateFlow = 'formal' | 'free';

/** 讨论目标 */
export type DiscussionGoal = 'open' | 'clash' | 'converge';

/** 讨论配置 */
export interface DiscussionConfig {
    /** 正方立场描述 */
    proStance: string;
    /** 反方立场描述 */
    conStance: string;
    /** 议题详细描述 */
    topicDescription: string;
    /** 阵营划分 */
    campMode: CampMode;
    /** 辩论流程 */
    debateFlow: DebateFlow;
    /** 讨论目标 */
    discussionGoal: DiscussionGoal;
    /** 每轮最少发言条数 */
    minSpeechesPerRound: number;
    /** 每轮最多发言条数 */
    maxSpeechesPerRound: number;
    /** 最少轮次 */
    minRounds: number;
    /** 最多轮次 */
    maxRounds: number;
    /** 主持人模型配置 */
    moderatorModel?: string;
    /** 评委类型 */
    judgeType?: 'none' | 'single' | 'panel';
}
