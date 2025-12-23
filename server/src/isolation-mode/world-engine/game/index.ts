/**
 * Game World Engine 模块导出
 */

// 世界状态
export {
    GameWorldState,
    GameAgentState,
    CardType,
    GameActionType,
    PlayCardParams,
    GameEventType,
    ATTACK_DAMAGE,
    HEAL_AMOUNT,
    DEFAULT_HAND,
    DEFAULT_HP,
    DEFAULT_MAX_TURNS,
    createInitialGameWorldState
} from './GameWorldState';

// 子组件
export {
    GameRuleEngine,
    GameScheduler,
    GameArbiter
} from './GameComponents';

// 主引擎
export {
    GameWorldEngine,
    createGameWorldEngine
} from './GameWorldEngine';
