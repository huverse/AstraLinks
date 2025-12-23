/**
 * World Engine Logger
 * 
 * 结构化日志模块 - 替代 console.log
 * 
 * 使用 pino 进行高性能 JSON 日志
 */

import pino from 'pino';
import { worldEngineConfig, isProductionLike } from '../config/world-engine.config';

// ============================================
// Logger 配置
// ============================================

const logLevel = process.env.WE_LOG_LEVEL || (isProductionLike ? 'info' : 'debug');

// ============================================
// 主 Logger
// ============================================

export const weLogger = pino({
    name: 'world-engine',
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,

    // 生产环境使用 JSON，开发环境使用 pretty
    ...(isProductionLike ? {} : {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }
    })
});

// ============================================
// 子 Logger
// ============================================

/** Session 管理日志 */
export const sessionLogger = weLogger.child({ module: 'session' });

/** RuleEngine 日志 */
export const ruleLogger = weLogger.child({ module: 'rule-engine' });

/** Scheduler 日志 */
export const schedulerLogger = weLogger.child({ module: 'scheduler' });

/** API 日志 */
export const apiLogger = weLogger.child({ module: 'api' });

/** WebSocket 日志 */
export const wsLogger = weLogger.child({ module: 'websocket' });

/** 应用通用日志 (启动/关闭) */
export const appLogger = weLogger.child({ module: 'app' });

/** 隔离模式日志 */
export const isolationLogger = weLogger.child({ module: 'isolation' });

// ============================================
// 日志辅助函数
// ============================================

/** 记录 Session 创建 */
export function logSessionCreated(sessionId: string, worldType: string): void {
    sessionLogger.info({ sessionId, worldType }, 'session_created');
}

/** 记录 Session 删除 */
export function logSessionDeleted(sessionId: string): void {
    sessionLogger.info({ sessionId }, 'session_deleted');
}

/** 记录 Tick 完成 */
export function logTickCompleted(
    sessionId: string,
    tick: number,
    activeAgents: number,
    durationMs: number
): void {
    sessionLogger.debug({ sessionId, tick, activeAgents, durationMs }, 'tick_completed');
}

/** 记录 Agent 退出 */
export function logAgentExit(
    sessionId: string,
    agentId: string,
    reason: string
): void {
    sessionLogger.info({ sessionId, agentId, reason }, 'agent_exit');
}

/** 记录 Shock 事件 */
export function logShockEvent(
    sessionId: string,
    tick: number,
    affectedAgents: string[]
): void {
    sessionLogger.info({ sessionId, tick, affectedAgents }, 'shock_event');
}

/** 记录 API 错误 */
export function logApiError(
    endpoint: string,
    error: Error,
    requestId?: string
): void {
    apiLogger.error({ endpoint, error: error.message, stack: error.stack, requestId }, 'api_error');
}

/** 记录 API 请求 */
export function logApiRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number
): void {
    apiLogger.info({ method, path, statusCode, durationMs }, 'api_request');
}

// ============================================
// 启动日志
// ============================================

export function logStartup(): void {
    weLogger.info({
        env: worldEngineConfig.env,
        logLevel,
        llmEnabled: worldEngineConfig.llm.enabled,
        sessionTimeout: worldEngineConfig.session.timeoutMs
    }, 'world_engine_startup');
}
