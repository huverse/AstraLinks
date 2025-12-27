/**
 * 隔离模式类型定义
 */

export interface Agent {
    id: string;
    name: string;
    role: string;
    status: 'idle' | 'thinking' | 'speaking';
    speakCount: number;
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
