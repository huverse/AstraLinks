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

export const DEFAULT_SCENARIOS: Scenario[] = [
    { id: 'debate', name: '辩论', description: '正反双方围绕主题辩论', type: 'debate' },
    { id: 'brainstorm', name: '头脑风暴', description: '自由发散思维，产生创意', type: 'brainstorm' },
    { id: 'review', name: '项目评审', description: '多角度评估项目方案', type: 'review' },
    { id: 'academic', name: '学术研讨', description: '深入探讨学术问题', type: 'academic' },
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
