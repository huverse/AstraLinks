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

// 辩论适配器（向后兼容 - 旧版）
export {
    DebateWorldEngine as LegacyDebateWorldEngine,
    DebateRuleEngine as LegacyDebateRuleEngine,
    intentToAction,
    actionToIntent,
    scenarioToWorldConfig,
    createDebateWorldEngine as createLegacyDebateWorldEngine
} from './DebateWorldAdapter';

// 辩论世界引擎（新版）
export * from './debate';

// 游戏世界引擎
export * from './game';

// 逻辑推理世界引擎
export * from './logic';

// 社会仿真世界引擎
export * from './society';
