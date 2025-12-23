/**
 * 核心类型导出
 */

// Agent 类型
export * from './agent.types';

// 事件类型（Shared Event Log 核心）
export {
    Event,
    EventType,
    EventSpeaker,
    EventContentPayload,
    EventMeta,
    PruneStrategy,
    AgentVisibleEvent,
    toAgentVisibleEvent,
    DiscussionEvent, // 兼容旧类型
} from './event.types';

// 会话类型
export * from './session.types';

// 场景类型
export * from './scenario.types';
