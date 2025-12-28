/**
 * Society World Engine 模块导出
 */

// 世界状态
export type {
    SocietyWorldState,
    AgentSocialState,
    SocialRole,
    GlobalResources,
    SocietyStatistics,
    SocietyActionType,
    WorkParams,
    ConsumeParams,
    TalkParams,
    HelpParams,
    ConflictParams,
    SocietyEventType,
} from './SocietyWorldState';
export {
    INITIAL_RESOURCES,
    INITIAL_MOOD,
    ZERO_RESOURCE_EXIT_THRESHOLD,
    WORK_REWARD,
    createInitialSocietyWorldState,
    calculateGiniCoefficient
} from './SocietyWorldState';

// 子组件
export {
    SocietyRuleEngine,
    SocietyScheduler,
    SocietyArbiter
} from './SocietyComponents';

// 主引擎
export {
    SocietyWorldEngine,
    SocietyNarrator,
    createSocietyWorldEngine,
    createDefaultSociety
} from './SocietyWorldEngine';
