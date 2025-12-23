/**
 * World Engine 模块导出
 */

// 核心接口
export * from './interfaces';

// 基础实现
export {
    BaseWorldEngine,
    DefaultScheduler,
    DefaultArbiter,
    DefaultRuleEngine
} from './BaseWorldEngine';

// 辩论适配器（向后兼容）
export {
    DebateWorldEngine,
    DebateRuleEngine,
    intentToAction,
    actionToIntent,
    scenarioToWorldConfig,
    createDebateWorldEngine
} from './DebateWorldAdapter';
