/**
 * Event-Log 模块导出
 * 
 * Shared Event Log 是多 Agent 讨论系统中唯一允许信息共享的通道
 */

// 事件日志服务
export { EventLogService, eventLogService } from './EventLogService';

// 事件总线（发布/订阅）
export { EventBus, eventBus } from './EventBus';

// 存储接口与实现 (P0: 支持多进程部署)
export type { IEventLogStore, AppendEventParams } from './IEventLogStore';
export { buildEvent } from './IEventLogStore';
export { MemoryEventLogStore } from './MemoryEventLogStore';
export { RedisEventLogStore, getEventLogStore, resetEventLogStore } from './RedisEventLogStore';

// 重导出类型
export type {
    Event,
    EventSpeaker,
    EventContentPayload,
    EventMeta,
    PruneStrategy,
    AgentVisibleEvent,
} from '../core/types/event.types';
export { EventType, toAgentVisibleEvent } from '../core/types/event.types';

