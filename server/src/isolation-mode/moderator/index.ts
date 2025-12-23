/**
 * Moderator 模块导出
 */

// 核心控制器
export { ModeratorControllerCore } from './ModeratorControllerCore';

// LLM 服务（语言表达层）
export { ModeratorLLMService, getModeratorLLMService } from './ModeratorLLMService';

// 旧版控制器（兼容）
export { ModeratorController, moderatorController } from './ModeratorController';

// 旧版 LLM 接口（兼容）
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

// Moderator LLM 类型
export {
    OutlineInput,
    OutlineOutput,
    QuestionInput,
    QuestionOutput,
    SummaryInput,
    SummaryOutput,
    OpeningInput,
    OpeningOutput,
    ClosingInput,
    ClosingOutput,
} from '../core/types/moderator-llm.types';
