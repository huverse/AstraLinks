/**
 * World Engine REST API Routes (v1)
 * 
 * 生产化 API - 版本化、鉴权、速率限制
 * 
 * 端点:
 * - POST /sessions - 创建 Session
 * - GET /sessions - 列出所有 Sessions
 * - GET /sessions/:id - 获取 Session 状态
 * - POST /sessions/:id/step - 执行一步
 * - GET /sessions/:id/events - 获取事件历史
 * - DELETE /sessions/:id - 删除 Session
 * - GET /health - 健康检查 (公开)
 * - GET /metrics - 运行指标 (需鉴权)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
    worldEngineSessionManager,
    WorldEngineSessionConfig
} from '../isolation-mode/session/WorldEngineSessionManager';
import { Action } from '../isolation-mode/world-engine/interfaces';
import {
    requireWorldEngineAuth,
    worldEngineRateLimit,
    validateActionsInput
} from '../services/world-engine-auth';
import {
    apiLogger,
    logSessionCreated,
    logSessionDeleted,
    logApiError
} from '../services/world-engine-logger';
import {
    getWorldEngineMetrics,
    recordTick,
    recordError,
    recordEvents
} from '../services/world-engine-metrics';
import { worldEngineConfig } from '../config/world-engine.config';

const router = Router();

// ============================================
// 中间件
// ============================================

// 速率限制 (所有端点)
router.use(worldEngineRateLimit());

// ============================================
// 健康检查 (公开)
// ============================================

router.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        version: '1.0.0',
        env: worldEngineConfig.env,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// 以下端点需要鉴权
// ============================================

router.use(requireWorldEngineAuth);

// ============================================
// GET /metrics - 运行指标
// ============================================

router.get('/metrics', (req: Request, res: Response) => {
    try {
        const metrics = getWorldEngineMetrics();
        res.json(metrics);
    } catch (error: any) {
        recordError();
        logApiError('/metrics', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// POST /sessions - 创建 Session
// ============================================

router.post('/sessions', async (req: Request, res: Response) => {
    try {
        const { worldType, maxTicks, agents, problemStatement, hypotheses, goals } = req.body;

        if (!worldType) {
            return res.status(400).json({ error: 'worldType is required' });
        }

        if (!['game', 'logic', 'society'].includes(worldType)) {
            return res.status(400).json({
                error: 'Invalid worldType',
                allowed: ['game', 'logic', 'society']
            });
        }

        // 限制 maxTicks
        const safeMaxTicks = Math.min(maxTicks || 1000, 10000);

        const config: WorldEngineSessionConfig = {
            worldType,
            maxTicks: safeMaxTicks,
            agents,
            problemStatement,
            hypotheses,
            goals
        };

        const session = await worldEngineSessionManager.createSession(config);
        const worldState = worldEngineSessionManager.getWorldState(session.id);

        logSessionCreated(session.id, worldType);

        res.status(201).json({
            sessionId: session.id,
            worldType: session.worldType,
            status: session.status,
            tickCount: session.tickCount,
            createdAt: session.createdAt,
            worldState
        });

    } catch (error: any) {
        recordError();
        logApiError('/sessions', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET /sessions - 列出所有 Sessions
// ============================================

router.get('/sessions', (req: Request, res: Response) => {
    try {
        const sessions = worldEngineSessionManager.listSessions();
        res.json({ sessions, count: sessions.length });
    } catch (error: any) {
        recordError();
        logApiError('/sessions', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET /sessions/:id - 获取 Session 状态
// ============================================

router.get('/sessions/:id', (req: Request, res: Response) => {
    try {
        const session = worldEngineSessionManager.getSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const worldState = worldEngineSessionManager.getWorldState(session.id);

        res.json({
            sessionId: session.id,
            worldType: session.worldType,
            status: session.status,
            tickCount: session.tickCount,
            createdAt: session.createdAt,
            lastActivityAt: session.lastActivityAt,
            worldState
        });

    } catch (error: any) {
        recordError();
        logApiError(`/sessions/${req.params.id}`, error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// POST /sessions/:id/step - 执行一步
// ============================================

router.post('/sessions/:id/step', async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
        const session = worldEngineSessionManager.getSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.status === 'ended') {
            return res.status(400).json({
                error: 'Session ended',
                reason: session.engine.getTerminationReason()
            });
        }

        const { actions = [] } = req.body;

        // 验证 Actions
        const validation = validateActionsInput(actions);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Invalid actions',
                details: validation.errors
            });
        }

        // 构建完整 Action
        const fullActions: Action[] = actions.map((a: any) => ({
            actionId: a.actionId || uuidv4(),
            agentId: a.agentId || 'unknown',
            actionType: a.actionType || 'idle',
            params: a.params || {},
            confidence: a.confidence ?? 1.0,
            timestamp: a.timestamp || Date.now()
        }));

        const result = await worldEngineSessionManager.step(req.params.id, fullActions);

        recordTick();
        recordEvents(result.events.length);

        res.json({
            tickCount: session.tickCount,
            isTerminated: result.isTerminated,
            terminationReason: result.terminationReason,
            eventsCount: result.events.length,
            events: result.events,
            worldState: result.worldState,
            durationMs: Date.now() - startTime
        });

    } catch (error: any) {
        recordError();
        logApiError(`/sessions/${req.params.id}/step`, error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET /sessions/:id/events - 获取事件历史
// ============================================

router.get('/sessions/:id/events', (req: Request, res: Response) => {
    try {
        const session = worldEngineSessionManager.getSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const limit = Math.min(
            parseInt(req.query.limit as string) || 100,
            worldEngineConfig.session.eventLogMaxSize
        );
        const events = worldEngineSessionManager.getEvents(req.params.id, limit);

        res.json({ events, count: events.length });

    } catch (error: any) {
        recordError();
        logApiError(`/sessions/${req.params.id}/events`, error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DELETE /sessions/:id - 删除 Session
// ============================================

router.delete('/sessions/:id', (req: Request, res: Response) => {
    try {
        const deleted = worldEngineSessionManager.deleteSession(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Session not found' });
        }

        logSessionDeleted(req.params.id);

        res.json({ success: true, message: 'Session deleted' });

    } catch (error: any) {
        recordError();
        logApiError(`/sessions/${req.params.id}`, error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
