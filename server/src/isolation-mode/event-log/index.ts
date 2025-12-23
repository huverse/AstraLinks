/**
 * Event-Log 模块导出
 * 
 * Shared Event Log 是多 Agent 讨论系统中唯一允许信息共享的通道
 */

// 事件日志服务
export { EventLogService, eventLogService } from './EventLogService';

// 事件总线（发布/订阅）
export { EventBus, eventBus } from './EventBus';

// 重导出类型
export {
    Event,
    EventType,
    EventSpeaker,
    EventContentPayload,
    EventMeta,
    PruneStrategy,
    AgentVisibleEvent,
    toAgentVisibleEvent,
} from '../core/types/event.types';
