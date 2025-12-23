/**
 * World Engine Configuration
 * 
 * 生产化配置模块 - 所有参数从环境变量加载
 * 
 * 环境:
 * - development: 开发调试
 * - internal: 内部上线 (行为 = production)
 * - production: 对外正式上线
 */

// ============================================
// 类型定义
// ============================================

export type WorldEngineEnv = 'development' | 'internal' | 'production';

export interface SocietyRulesConfig {
    // 基础参数
    initialResources: number;
    initialMood: number;
    zeroResourceExitThreshold: number;
    workReward: [number, number, number];

    // 情绪/关系影响
    consumeMoodBoost: number;
    consumeFailMoodPenalty: number;
    talkFriendlyRelationshipBoost: number;
    talkHostileRelationshipPenalty: number;
    helpRelationshipBoost: number;
    conflictRelationshipPenalty: number;
    conflictResourceLoss: [number, number, number];

    // A-6 压力参数
    workDiminishingStartTick: number;
    workDiminishingRate: number;
    workMinEfficiency: number;
    consumeIndulgenceThreshold: number;
    consumeIndulgenceCostMultiplier: number;
    shockInterval: number;
    shockAgentCount: number;
    shockResourceLoss: [number, number];
    shockMoodLoss: [number, number];
    conflictEscalationThreshold: number;
    conflictEscalationProbability: number;
    lowMoodThreshold: number;
    lowMoodExitThreshold: number;
}

export interface SessionConfig {
    timeoutMs: number;
    maxSessionsPerUser: number;
    eventLogMaxSize: number;
    cleanupIntervalMs: number;
}

export interface SecurityConfig {
    internalToken: string;
    rateLimitPerMinute: number;
    rateLimitWindowMs: number;
}

export interface LLMConfig {
    enabled: boolean;
    provider?: string;
    model?: string;
    key?: string;
    baseUrl?: string;
    timeout?: number;
    maxTokensPerMinute?: number;
}

export interface WorldEngineConfig {
    env: WorldEngineEnv;
    society: SocietyRulesConfig;
    session: SessionConfig;
    security: SecurityConfig;
    llm: LLMConfig;
}

// ============================================
// 环境变量解析辅助函数
// ============================================

function getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvInt(key: string, defaultValue: number): number {
    return Math.floor(getEnvNumber(key, defaultValue));
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
}

function getEnvString(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
}

function getEnvArray<T>(key: string, defaultValue: T[], parser: (v: string) => T): T[] {
    const value = process.env[key];
    if (!value) return defaultValue;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(parser) : defaultValue;
    } catch {
        return defaultValue;
    }
}

// ============================================
// 配置加载
// ============================================

function loadConfig(): WorldEngineConfig {
    const env = getEnvString('NODE_ENV', 'development') as WorldEngineEnv;

    // 验证环境
    if (!['development', 'internal', 'production'].includes(env)) {
        console.warn(`[WorldEngine] Invalid NODE_ENV: ${env}, defaulting to development`);
    }

    return {
        env,

        society: {
            // 基础参数
            initialResources: getEnvInt('WE_INITIAL_RESOURCES', 50),
            initialMood: getEnvNumber('WE_INITIAL_MOOD', 0.5),
            zeroResourceExitThreshold: getEnvInt('WE_ZERO_RESOURCE_EXIT_THRESHOLD', 5),
            workReward: getEnvArray('WE_WORK_REWARD', [5, 10, 15], Number) as [number, number, number],

            // 情绪/关系影响
            consumeMoodBoost: getEnvNumber('WE_CONSUME_MOOD_BOOST', 0.1),
            consumeFailMoodPenalty: getEnvNumber('WE_CONSUME_FAIL_MOOD_PENALTY', -0.2),
            talkFriendlyRelationshipBoost: getEnvNumber('WE_TALK_FRIENDLY_BOOST', 0.1),
            talkHostileRelationshipPenalty: getEnvNumber('WE_TALK_HOSTILE_PENALTY', -0.15),
            helpRelationshipBoost: getEnvNumber('WE_HELP_BOOST', 0.2),
            conflictRelationshipPenalty: getEnvNumber('WE_CONFLICT_PENALTY', -0.3),
            conflictResourceLoss: getEnvArray('WE_CONFLICT_LOSS', [5, 10, 15], Number) as [number, number, number],

            // A-6 压力参数
            workDiminishingStartTick: getEnvInt('WE_WORK_DIMINISHING_START', 30),
            workDiminishingRate: getEnvNumber('WE_WORK_DIMINISHING_RATE', 0.01),
            workMinEfficiency: getEnvNumber('WE_WORK_MIN_EFFICIENCY', 0.3),
            consumeIndulgenceThreshold: getEnvNumber('WE_CONSUME_INDULGENCE_THRESHOLD', 0.7),
            consumeIndulgenceCostMultiplier: getEnvNumber('WE_CONSUME_INDULGENCE_MULTIPLIER', 1.5),
            shockInterval: getEnvInt('WE_SHOCK_INTERVAL', 15),
            shockAgentCount: getEnvInt('WE_SHOCK_AGENT_COUNT', 2),
            shockResourceLoss: getEnvArray('WE_SHOCK_RESOURCE_LOSS', [5, 15], Number) as [number, number],
            shockMoodLoss: getEnvArray('WE_SHOCK_MOOD_LOSS', [0.1, 0.3], Number) as [number, number],
            conflictEscalationThreshold: getEnvNumber('WE_CONFLICT_ESCALATION_THRESHOLD', -0.4),
            conflictEscalationProbability: getEnvNumber('WE_CONFLICT_ESCALATION_PROB', 0.3),
            lowMoodThreshold: getEnvNumber('WE_LOW_MOOD_THRESHOLD', -0.5),
            lowMoodExitThreshold: getEnvInt('WE_LOW_MOOD_EXIT_THRESHOLD', 8)
        },

        session: {
            timeoutMs: getEnvInt('WE_SESSION_TIMEOUT_MS', 30 * 60 * 1000),
            maxSessionsPerUser: getEnvInt('WE_MAX_SESSIONS_PER_USER', 5),
            eventLogMaxSize: getEnvInt('WE_EVENT_LOG_MAX_SIZE', 1000),
            cleanupIntervalMs: getEnvInt('WE_CLEANUP_INTERVAL_MS', 5 * 60 * 1000)
        },

        security: {
            internalToken: getEnvString('WE_INTERNAL_TOKEN', ''),
            rateLimitPerMinute: getEnvInt('WE_RATE_LIMIT_PER_MINUTE', 60),
            rateLimitWindowMs: getEnvInt('WE_RATE_LIMIT_WINDOW_MS', 60 * 1000)
        },

        llm: {
            enabled: getEnvBool('WE_LLM_ENABLED', false),
            provider: process.env.WE_LLM_PROVIDER,
            model: process.env.WE_LLM_MODEL,
            key: process.env.WE_LLM_KEY,
            baseUrl: process.env.WE_LLM_BASE_URL,
            timeout: getEnvInt('WE_LLM_TIMEOUT', 30000),
            maxTokensPerMinute: getEnvInt('WE_LLM_MAX_TOKENS_PER_MINUTE', 10000)
        }
    };
}

// ============================================
// 导出
// ============================================

/** World Engine 配置 (单例) */
export const worldEngineConfig = loadConfig();

/** 是否为生产环境 (internal 或 production) */
export const isProductionLike =
    worldEngineConfig.env === 'internal' ||
    worldEngineConfig.env === 'production';

/** 获取 Society 规则配置 */
export function getSocietyConfig(): SocietyRulesConfig {
    return worldEngineConfig.society;
}

/** 获取 Session 配置 */
export function getSessionConfig(): SessionConfig {
    return worldEngineConfig.session;
}

/** 获取安全配置 */
export function getSecurityConfig(): SecurityConfig {
    return worldEngineConfig.security;
}

/** 验证配置完整性 (用于启动检查) */
export function validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (isProductionLike && !worldEngineConfig.security.internalToken) {
        errors.push('WE_INTERNAL_TOKEN required in internal/production environment');
    }

    if (worldEngineConfig.society.initialResources <= 0) {
        errors.push('WE_INITIAL_RESOURCES must be positive');
    }

    if (worldEngineConfig.session.timeoutMs < 60000) {
        errors.push('WE_SESSION_TIMEOUT_MS must be at least 60000 (1 minute)');
    }

    // P1: LLM 配置验证
    if (worldEngineConfig.llm.enabled) {
        if (!worldEngineConfig.llm.key) {
            errors.push('WE_LLM_KEY required when WE_LLM_ENABLED=true');
        }
        if (!worldEngineConfig.llm.provider) {
            errors.push('WE_LLM_PROVIDER recommended when WE_LLM_ENABLED=true');
        }
    }

    return { valid: errors.length === 0, errors };
}
