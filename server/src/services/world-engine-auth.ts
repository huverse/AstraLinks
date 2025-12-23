/**
 * World Engine Auth Middleware
 * 
 * Internal Token 鉴权 + 速率限制
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { getSecurityConfig, isProductionLike } from '../config/world-engine.config';
import { apiLogger } from './world-engine-logger';

// ============================================
// Internal Token 鉴权
// ============================================

/**
 * 验证 Internal Token
 * 
 * 头部: X-WE-Token
 * 
 * 在 development 环境下可选
 * 在 internal/production 环境下必须
 */
export function requireWorldEngineAuth(req: Request, res: Response, next: NextFunction): void {
    const config = getSecurityConfig();
    const token = req.headers['x-we-token'] as string | undefined;

    // development 环境下如果没有配置 token，跳过鉴权
    if (!isProductionLike && !config.internalToken) {
        return next();
    }

    // 验证 token
    if (!token) {
        apiLogger.warn({ path: req.path, ip: req.ip }, 'missing_auth_token');
        res.status(401).json({
            error: 'Unauthorized',
            message: 'X-WE-Token header required'
        });
        return;
    }

    if (token !== config.internalToken) {
        apiLogger.warn({ path: req.path, ip: req.ip }, 'invalid_auth_token');
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid token'
        });
        return;
    }

    next();
}

// ============================================
// 速率限制
// ============================================

/**
 * World Engine 速率限制
 * 
 * 默认: 60 请求/分钟
 */
export const worldEngineRateLimit = (): ReturnType<typeof rateLimit> => {
    const config = getSecurityConfig();

    return rateLimit({
        windowMs: config.rateLimitWindowMs,
        max: config.rateLimitPerMinute,
        message: {
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil(config.rateLimitWindowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, next, options) => {
            apiLogger.warn({
                path: req.path,
                ip: req.ip,
                limit: options.max
            }, 'rate_limit_exceeded');
            res.status(429).json(options.message);
        }
    });
};

// ============================================
// Action 验证
// ============================================

/** 允许的 ActionType */
const ALLOWED_ACTION_TYPES = new Set([
    'work', 'consume', 'talk', 'help', 'conflict', 'idle',
    // Game actions
    'play_card', 'pass',
    // Logic actions  
    'derive', 'refute', 'extend', 'accept'
]);

/** 验证 Action 结构 */
export interface ActionValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * 验证 Action 是否合法
 * 
 * 防止任意 Action 构造
 */
export function validateActionInput(action: unknown): ActionValidationResult {
    const errors: string[] = [];

    if (!action || typeof action !== 'object') {
        return { valid: false, errors: ['Action must be an object'] };
    }

    const a = action as Record<string, unknown>;

    // actionType 必须在白名单
    if (typeof a.actionType !== 'string' || !ALLOWED_ACTION_TYPES.has(a.actionType)) {
        errors.push(`Invalid actionType: ${a.actionType}`);
    }

    // agentId 必须是字符串
    if (a.agentId !== undefined && typeof a.agentId !== 'string') {
        errors.push('agentId must be a string');
    }

    // params 必须是对象
    if (a.params !== undefined && (typeof a.params !== 'object' || a.params === null)) {
        errors.push('params must be an object');
    }

    // confidence 必须在 [0, 1]
    if (a.confidence !== undefined) {
        const conf = a.confidence as number;
        if (typeof conf !== 'number' || conf < 0 || conf > 1) {
            errors.push('confidence must be a number between 0 and 1');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * 验证 Actions 数组
 */
export function validateActionsInput(actions: unknown): ActionValidationResult {
    if (!Array.isArray(actions)) {
        return { valid: false, errors: ['actions must be an array'] };
    }

    const allErrors: string[] = [];

    for (let i = 0; i < actions.length; i++) {
        const result = validateActionInput(actions[i]);
        if (!result.valid) {
            allErrors.push(...result.errors.map(e => `actions[${i}]: ${e}`));
        }
    }

    return { valid: allErrors.length === 0, errors: allErrors };
}
