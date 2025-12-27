/**
 * 隔离模式类型定义
 */

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
