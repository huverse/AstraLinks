/**
 * 自定义错误类
 */

export class IsolationModeError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'IsolationModeError';
    }
}

export class AgentError extends IsolationModeError {
    constructor(message: string, agentId: string, details?: Record<string, unknown>) {
        super(message, 'AGENT_ERROR', { agentId, ...details });
        this.name = 'AgentError';
    }
}

export class SessionError extends IsolationModeError {
    constructor(message: string, sessionId: string, details?: Record<string, unknown>) {
        super(message, 'SESSION_ERROR', { sessionId, ...details });
        this.name = 'SessionError';
    }
}

export class ModeratorError extends IsolationModeError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'MODERATOR_ERROR', details);
        this.name = 'ModeratorError';
    }
}

export class LLMProviderError extends IsolationModeError {
    constructor(message: string, providerId: string, details?: Record<string, unknown>) {
        super(message, 'LLM_PROVIDER_ERROR', { providerId, ...details });
        this.name = 'LLMProviderError';
    }
}

export class ScenarioError extends IsolationModeError {
    constructor(message: string, scenarioId: string, details?: Record<string, unknown>) {
        super(message, 'SCENARIO_ERROR', { scenarioId, ...details });
        this.name = 'ScenarioError';
    }
}
