/**
 * Moderator 模块导出
 */

// 核心控制器
export { ModeratorControllerCore } from './ModeratorControllerCore';

// 旧版控制器（兼容）
export { ModeratorController, moderatorController } from './ModeratorController';

// LLM 接口
export { ModeratorLLM, moderatorLLM } from './ModeratorLLM';

// 规则引擎
export { RuleEngine, ruleEngine } from './RuleEngine';

// 重导出类型
export {
    Phase,
    ModeratorAction,
    ModeratorState,
    ModeratorDecision,
    Intent,
    DiscussionHealth,
    PhaseTransition,
} from '../core/types/moderator.types';
