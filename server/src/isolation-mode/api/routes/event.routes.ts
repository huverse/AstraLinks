/**
 * Event API 路由
 */

import { Router, Request, Response } from 'express';
import { eventLog } from '../../event-log';

const router = Router();

/**
 * GET /api/isolation/events/:sessionId
 * 获取会话的所有事件
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { offset = '0', limit = '50', type } = req.query;

        const events = type
            ? await eventLog.getEventsByType(sessionId, (type as string).split(',') as any)
            : (await eventLog.getEventsPaginated(sessionId, parseInt(offset as string), parseInt(limit as string))).events;

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

        const events = await eventLog.getLatestEvents(sessionId, parseInt(count as string));

        res.json({ success: true, data: events });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/isolation/events/:sessionId/after/:sequence
 * 获取某序号之后的事件 (长轮询)
 */
router.get('/:sessionId/after/:sequence', async (req: Request, res: Response) => {
    try {
        const { sessionId, sequence } = req.params;

        const events = await eventLog.getEventsAfter(sessionId, parseInt(sequence));

        res.json({ success: true, data: events });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
