/**
 * Agents 模块导出
 */

// 核心执行器
export { AgentExecutor, AgentExecutorService } from './AgentExecutorCore';

// 旧版（兼容）
export { AgentFactory, agentFactory } from './AgentFactory';
export { AgentExecutor as LegacyAgentExecutor } from './AgentExecutor';
export { AgentContext } from './AgentContext';

// 预设
export * from './presets';

// 重导出类型
export type {
    AgentPersona,
    SpeakingStyle,
    AgentPrivateContext,
    ShortTermMemory,
    AgentVisibleContext,
    IntentOutput,
    SpeechOutput,
} from '../core/types/agent-executor.types';
