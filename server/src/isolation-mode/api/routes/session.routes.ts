/**
 * 会话 API 路由
 */

import { Router, Request, Response } from 'express';
import { sessionManager } from '../../session';

const router = Router();

/**
 * GET /api/isolation/sessions
 * 获取用户的所有会话
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id || 'anonymous';
        const sessions = sessionManager.listByUser(userId);
        res.json({ success: true, data: sessions });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/isolation/sessions
 * 创建新会话
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id || 'anonymous';
        const { title, topic, scenario, agents, maxRounds, roundTimeLimit, llmConfig } = req.body;

        const session = await sessionManager.create({
            title,
            topic,
            scenario,
            agents,
            createdBy: userId,
            maxRounds,
            roundTimeLimit,
            llmConfig, // 加密的用户 AI 配置 (从 Galaxyous 配置中心同步)
        });

        res.json({ success: true, data: session });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/isolation/sessions/:id
 * 获取会话详情
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const config = sessionManager.get(id);
        const state = sessionManager.getState(id);

        if (!config) {
            res.status(404).json({ success: false, error: 'Session not found' });
            return;
        }

        res.json({
            success: true,
            data: {
                config,
                state,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/isolation/sessions/:id/start
 * 开始会话
 */
router.post('/:id/start', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await sessionManager.start(id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/isolation/sessions/:id/end
 * 结束会话
 */
router.post('/:id/end', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        await sessionManager.end(id, reason);
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/isolation/sessions/:id
 * 删除会话
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await sessionManager.delete(id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
