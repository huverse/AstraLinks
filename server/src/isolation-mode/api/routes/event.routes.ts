/**
 * Event API 路由
 */

import { Router, Request, Response } from 'express';
import { eventLogService, EventType } from '../../event-log';

const router = Router();

/**
 * GET /api/isolation/events/:sessionId
 * 获取会话的事件
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { limit = '20', type } = req.query;

        const limitNum = Math.min(parseInt(limit as string) || 20, 100);

        let events;
        if (type && Object.values(EventType).includes(type as EventType)) {
            events = eventLogService.getEventsByType(sessionId, type as EventType, limitNum);
        } else {
            events = eventLogService.getRecentEvents(sessionId, limitNum);
        }

        res.json({ success: true, data: events });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/isolation/events/:sessionId/latest
 * 获取会话的最新事件
 */
router.get('/:sessionId/latest', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { count = '10' } = req.query;

        const limitNum = Math.min(parseInt(count as string) || 10, 100);
        const events = eventLogService.getRecentEvents(sessionId, limitNum);

        res.json({ success: true, data: events });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/isolation/events/:sessionId/after/:sequence
 * 获取某序号之后的事件 (增量获取)
 */
router.get('/:sessionId/after/:sequence', async (req: Request, res: Response) => {
    try {
        const { sessionId, sequence } = req.params;
        const { limit = '20' } = req.query;

        const limitNum = Math.min(parseInt(limit as string) || 20, 100);
        const events = eventLogService.getEventsAfterSequence(
            sessionId,
            parseInt(sequence),
            limitNum
        );

        res.json({ success: true, data: events });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/isolation/events/:sessionId/agent-view
 * 获取 Agent 可见的事件格式 (用于 LLM)
 */
router.get('/:sessionId/agent-view', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { limit = '15' } = req.query;

        const limitNum = Math.min(parseInt(limit as string) || 15, 50);
        const events = eventLogService.getAgentVisibleEvents(sessionId, limitNum);

        res.json({ success: true, data: events });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
