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

// 场景类型（配置系统）
export {
    ScenarioSchema,
    AlignmentConfig,
    AlignmentType,
    Faction,
    FlowConfig,
    PhaseConfig,
    PhaseType,
    ModeratorPolicyConfig,
    InterventionLevel,
    RoleTemplate,
    ScenarioConfig,      // 向后兼容别名
    DiscussionRules,     // 向后兼容
} from './scenario.types';

// 主持人控制器类型
export {
    Phase,
    ModeratorAction,
    ModeratorState,
    ModeratorDecision,
    Intent,
    IntentUrgencyLevel,
    DiscussionHealth,
    PhaseTransition,
    OutlineItem,
    DiscussionOutline,
    ScoringDimension,
    JudgeConfig,
    JudgeScore,
    ScoringResult,
    INTERVENTION_LEVEL_DESCRIPTIONS,
} from './moderator.types';

// Agent 执行器类型
export {
    AgentPersona,
    SpeakingStyle,
    AgentPrivateContext,
    ShortTermMemory,
    MemoryEntry,
    AgentVisibleContext,
    AgentVisibleEventSlim,
    IntentOutput,
    SpeechOutput,
    LLMRequest,
    LLMResponse,
    DEFAULT_SHORT_TERM_MAX_ENTRIES,
    DEFAULT_SHORT_TERM_MAX_TOKENS,
    DEFAULT_RECENT_EVENTS_LIMIT,
    MAX_RECENT_EVENTS_LIMIT,
} from './agent-executor.types';

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
    OUTLINE_MAX_TOKENS,
    QUESTION_MAX_TOKENS,
    SUMMARY_MAX_TOKENS,
    OPENING_MAX_TOKENS,
    CLOSING_MAX_TOKENS,
} from './moderator-llm.types';
