/**
 * Media API Routes - 多媒体管线 API
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { mediaPipeline } from '../media';

const router = Router();

// POST /api/media/jobs - 创建媒体任务
router.post('/jobs', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { pipelineType, inputAssetId, inputPrompt, providerId, model, params, workflowRunId } = req.body;

        if (!pipelineType) {
            res.status(400).json({ error: '缺少 pipelineType' });
            return;
        }

        const job = await mediaPipeline.createJob(userId, {
            pipelineType,
            inputAssetId,
            inputPrompt,
            providerId,
            model,
            params,
            workflowRunId
        });

        res.json({ success: true, job });
    } catch (error: any) {
        console.error('[Media] Create job error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/media/jobs - 获取用户任务列表
router.get('/jobs', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const limit = parseInt(req.query.limit as string) || 50;

        const jobs = await mediaPipeline.getUserJobs(userId, limit);
        res.json({ success: true, jobs });
    } catch (error: any) {
        console.error('[Media] List jobs error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/media/jobs/:jobId - 获取任务详情
router.get('/jobs/:jobId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const job = await mediaPipeline.getJob(jobId);

        if (!job) {
            res.status(404).json({ error: '任务不存在' });
            return;
        }

        res.json({ success: true, job });
    } catch (error: any) {
        console.error('[Media] Get job error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/media/jobs/:jobId/cancel - 取消任务
router.post('/jobs/:jobId/cancel', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { jobId } = req.params;

        await mediaPipeline.cancelJob(jobId, userId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Media] Cancel job error:', error);
        res.status(400).json({ error: error.message });
    }
});

// GET /api/media/assets - 获取用户资产列表
router.get('/assets', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const type = req.query.type as any;
        const limit = parseInt(req.query.limit as string) || 50;

        const assets = await mediaPipeline.getUserAssets(userId, type, limit);
        res.json({ success: true, assets });
    } catch (error: any) {
        console.error('[Media] List assets error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/media/assets/:assetId - 获取资产详情
router.get('/assets/:assetId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { assetId } = req.params;
        const asset = await mediaPipeline.getAsset(assetId);

        if (!asset) {
            res.status(404).json({ error: '资产不存在' });
            return;
        }

        res.json({ success: true, asset });
    } catch (error: any) {
        console.error('[Media] Get asset error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/media/assets - 创建资产 (上传后注册)
router.post('/assets', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { type, storageUrl, metadata, fileSize, thumbnailUrl } = req.body;

        if (!type || !storageUrl) {
            res.status(400).json({ error: '缺少必要参数' });
            return;
        }

        const asset = await mediaPipeline.createAsset(
            userId,
            type,
            storageUrl,
            metadata,
            fileSize,
            thumbnailUrl
        );

        res.json({ success: true, asset });
    } catch (error: any) {
        console.error('[Media] Create asset error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
