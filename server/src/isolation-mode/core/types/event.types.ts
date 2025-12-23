/**
 * 事件类型定义
 * 
 * Shared Event Log 是所有 Agent 间的唯一共享通道
 */

export type EventType =
    | 'session:start'      // 会话开始
    | 'session:end'        // 会话结束
    | 'session:pause'      // 会话暂停
    | 'session:resume'     // 会话恢复
    | 'agent:join'         // Agent 加入
    | 'agent:leave'        // Agent 离开
    | 'agent:speak'        // Agent 发言
    | 'agent:react'        // Agent 反应 (表情/简短回应)
    | 'moderator:announce' // 主持人公告
    | 'moderator:direct'   // 主持人指定发言
    | 'moderator:summary'  // 主持人总结
    | 'vote:start'         // 投票开始
    | 'vote:cast'          // 投票
    | 'vote:end'           // 投票结束
    | 'verdict:announce';  // 裁决公布

export interface BaseEvent {
    /** 事件唯一 ID */
    id: string;
    /** 事件类型 */
    type: EventType;
    /** 会话 ID */
    sessionId: string;
    /** 发起者 ID (Agent ID 或 'moderator' 或 'system') */
    sourceId: string;
    /** 时间戳 */
    timestamp: number;
    /** 事件序号 (在会话内递增) */
    sequence: number;
}

export interface SpeakEvent extends BaseEvent {
    type: 'agent:speak';
    payload: {
        content: string;
        replyTo?: string;  // 回复的事件 ID
        tokens?: number;
    };
}

export interface ModeratorAnnounceEvent extends BaseEvent {
    type: 'moderator:announce';
    payload: {
        message: string;
        importance: 'info' | 'warning' | 'critical';
    };
}

export interface ModeratorDirectEvent extends BaseEvent {
    type: 'moderator:direct';
    payload: {
        targetAgentId: string;
        instruction: string;
    };
}

export interface ModeratorSummaryEvent extends BaseEvent {
    type: 'moderator:summary';
    payload: {
        summary: string;
        keyPoints: string[];
    };
}

export interface VoteEvent extends BaseEvent {
    type: 'vote:cast';
    payload: {
        voterId: string;
        choice: string;
        reason?: string;
    };
}

export interface VerdictEvent extends BaseEvent {
    type: 'verdict:announce';
    payload: {
        result: string;
        reasoning: string;
        scores?: Record<string, number>;
    };
}

export type DiscussionEvent =
    | SpeakEvent
    | ModeratorAnnounceEvent
    | ModeratorDirectEvent
    | ModeratorSummaryEvent
    | VoteEvent
    | VerdictEvent
    | BaseEvent;
