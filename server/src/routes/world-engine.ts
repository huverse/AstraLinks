/**
 * World Engine REST API Routes
 * 
 * REST API endpoints for World Engine:
 * - POST /sessions - 创建 Session
 * - GET /sessions - 列出所有 Sessions
 * - GET /sessions/:id - 获取 Session 状态
 * - POST /sessions/:id/step - 执行一步
 * - GET /sessions/:id/events - 获取事件历史
 * - DELETE /sessions/:id - 删除 Session
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
    worldEngineSessionManager,
    WorldEngineSessionConfig
} from '../isolation-mode/session/WorldEngineSessionManager';
import { Action } from '../isolation-mode/world-engine/interfaces';

const router = Router();

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
            return res.status(400).json({ error: 'Invalid worldType. Must be game, logic, or society' });
        }

        const config: WorldEngineSessionConfig = {
            worldType,
            maxTicks,
            agents,
            problemStatement,
            hypotheses,
            goals
        };

        const session = await worldEngineSessionManager.createSession(config);
        const worldState = worldEngineSessionManager.getWorldState(session.id);

        res.status(201).json({
            sessionId: session.id,
            worldType: session.worldType,
            status: session.status,
            tickCount: session.tickCount,
            createdAt: session.createdAt,
            worldState
        });

    } catch (error: any) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET /sessions - 列出所有 Sessions
// ============================================
router.get('/sessions', (req: Request, res: Response) => {
    try {
        const sessions = worldEngineSessionManager.listSessions();
        res.json({ sessions });
    } catch (error: any) {
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
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// POST /sessions/:id/step - 执行一步
// ============================================
router.post('/sessions/:id/step', async (req: Request, res: Response) => {
    try {
        const session = worldEngineSessionManager.getSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const { actions = [] } = req.body;

        // 补全 Action 字段
        const fullActions: Action[] = actions.map((a: any) => ({
            actionId: a.actionId || uuidv4(),
            agentId: a.agentId || 'unknown',
            actionType: a.actionType || 'idle',
            params: a.params || {},
            confidence: a.confidence ?? 1.0,
            timestamp: a.timestamp || Date.now()
        }));

        const result = await worldEngineSessionManager.step(req.params.id, fullActions);

        res.json({
            tickCount: session.tickCount,
            isTerminated: result.isTerminated,
            terminationReason: result.terminationReason,
            eventsCount: result.events.length,
            events: result.events,
            worldState: result.worldState
        });

    } catch (error: any) {
        console.error('Error executing step:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET /sessions/:id/events - 获取事件历史
// ============================================
router.get('/sessions/:id/events', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const events = worldEngineSessionManager.getEvents(req.params.id, limit);

        res.json({ events, count: events.length });

    } catch (error: any) {
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

        res.json({ success: true, message: 'Session deleted' });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// POST /sessions/:id/auto-run - 自动运行 N ticks
// ============================================
router.post('/sessions/:id/auto-run', async (req: Request, res: Response) => {
    try {
        const session = worldEngineSessionManager.getSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const { ticks = 10 } = req.body;
        const allEvents: any[] = [];

        for (let i = 0; i < ticks && !session.engine.isTerminated(); i++) {
            // 生成随机 Actions
            const actions = generateRandomActions(session);
            const result = await worldEngineSessionManager.step(session.id, actions);
            allEvents.push(...result.events);
        }

        const worldState = worldEngineSessionManager.getWorldState(session.id);

        res.json({
            ticksExecuted: allEvents.length > 0 ? session.tickCount : 0,
            isTerminated: session.engine.isTerminated(),
            terminationReason: session.engine.getTerminationReason(),
            eventsCount: allEvents.length,
            worldState
        });

    } catch (error: any) {
        console.error('Error in auto-run:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 辅助函数
// ============================================

function generateRandomActions(session: any): Action[] {
    const engine = session.engine;

    if (session.worldType === 'society') {
        const activeAgents = engine.getActiveAgents?.() || [];
        return activeAgents.map((agent: any) => generateRandomSocietyAction(agent.agentId));
    }

    if (session.worldType === 'game') {
        const currentAgent = engine.getCurrentTurnAgent?.() || 'A';
        const aliveAgents = engine.getAliveAgents?.() || [];
        const targetAgent = aliveAgents.find((a: string) => a !== currentAgent);

        return [{
            actionId: uuidv4(),
            agentId: currentAgent,
            actionType: 'play_card',
            params: { card: 'attack', targetAgentId: targetAgent },
            confidence: 1.0,
            timestamp: Date.now()
        }];
    }

    return [];
}

function generateRandomSocietyAction(agentId: string): Action {
    const actionTypes = ['work', 'consume', 'talk', 'help', 'idle'] as const;
    const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];

    let params: Record<string, unknown> = {};

    switch (actionType) {
        case 'work':
            params = { intensity: Math.floor(Math.random() * 3) + 1 };
            break;
        case 'consume':
            params = { amount: Math.floor(Math.random() * 10) + 5 };
            break;
        case 'talk':
            params = {
                targetAgentId: `agent-${Math.floor(Math.random() * 5) + 1}`,
                talkType: ['friendly', 'neutral', 'hostile'][Math.floor(Math.random() * 3)]
            };
            break;
        case 'help':
            params = {
                targetAgentId: `agent-${Math.floor(Math.random() * 5) + 1}`,
                amount: Math.floor(Math.random() * 10) + 1
            };
            break;
    }

    return {
        actionId: uuidv4(),
        agentId,
        actionType,
        params,
        confidence: 1.0,
        timestamp: Date.now()
    };
}

export default router;
