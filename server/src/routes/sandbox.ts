/**
 * Sandbox API Routes - 代码沙箱 API
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { sandboxManager } from '../sandbox';
import { SandboxLanguage } from '../sandbox/types';

const router = Router();

/**
 * POST /api/sandbox/execute
 * 执行代码
 */
router.post('/execute', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { language, code, timeout, files } = req.body;

        if (!language || !code) {
            res.status(400).json({ error: '缺少必要参数: language, code' });
            return;
        }

        if (!['python', 'nodejs', 'javascript'].includes(language)) {
            res.status(400).json({ error: '不支持的语言类型' });
            return;
        }

        const lang: SandboxLanguage = language === 'javascript' ? 'nodejs' : language;

        const result = await sandboxManager.execute({
            language: lang,
            code,
            timeout,
            files
        });

        res.json(result);
    } catch (error: any) {
        console.error('[Sandbox] Execute error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/sandbox/session
 * 创建会话
 */
router.post('/session', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { language, resourceLimits, networkPolicy } = req.body;

        if (!language) {
            res.status(400).json({ error: '缺少语言参数' });
            return;
        }

        const session = await sandboxManager.createSession(userId, language, {
            resourceLimits,
            networkPolicy
        });

        res.json({
            success: true,
            session: {
                id: session.id,
                language: session.language,
                status: session.status,
                createdAt: session.createdAt
            }
        });
    } catch (error: any) {
        console.error('[Sandbox] Create session error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/sandbox/session/:sessionId/execute
 * 在会话中执行代码
 */
router.post('/session/:sessionId/execute', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { code, timeout, files } = req.body;

        if (!code) {
            res.status(400).json({ error: '缺少代码' });
            return;
        }

        const session = await sandboxManager.getSession(sessionId);
        if (!session) {
            res.status(404).json({ error: '会话不存在' });
            return;
        }

        const result = await sandboxManager.execute({
            sessionId,
            language: session.language,
            code,
            timeout,
            files
        });

        res.json(result);
    } catch (error: any) {
        console.error('[Sandbox] Session execute error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/sandbox/session/:sessionId
 * 停止并清理会话
 */
router.delete('/session/:sessionId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        await sandboxManager.cleanup(sessionId);

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Sandbox] Cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/sandbox/session/:sessionId
 * 获取会话信息
 */
router.get('/session/:sessionId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        const session = await sandboxManager.getSession(sessionId);
        if (!session) {
            res.status(404).json({ error: '会话不存在' });
            return;
        }

        res.json({ session });
    } catch (error: any) {
        console.error('[Sandbox] Get session error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/sandbox/session/:sessionId/artifacts
 * 获取会话产物
 */
router.get('/session/:sessionId/artifacts', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        const artifacts = await sandboxManager.getArtifacts(sessionId);

        res.json({ artifacts });
    } catch (error: any) {
        console.error('[Sandbox] Get artifacts error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
