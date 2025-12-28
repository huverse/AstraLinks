/**
 * Debate World Engine 模块导出
 */

// 世界状态
export type {
    DebateWorldState,
    DebatePhaseState,
    DebateActionType,
    SpeakParams,
    VoteParams,
    DebateEventType,
} from './DebateWorldState';
export { createInitialDebateWorldState } from './DebateWorldState';

// 子组件
export {
    DebateRuleEngine,
    DebateScheduler,
    DebateArbiter
} from './DebateComponents';

// 主引擎
export {
    DebateWorldEngine,
    DebateNarrator,
    createDebateWorldEngineFromScenario
} from './DebateWorldEngine';
