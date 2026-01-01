/**
 * Future Letters - API Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { verifyTurnstileToken } from './auth';
import * as letterService from '../services/future/letterService';
import * as deliveryService from '../services/future/deliveryService';
import type {
    CreateLetterRequest,
    UpdateLetterRequest,
    LetterListQuery,
    ApiError,
    ErrorCodes,
} from '../services/future/types';

const router = Router();

// ============================================
// Middleware
// ============================================

interface AuthRequest extends Request {
    user?: { id: number; isAdmin?: boolean };
}

/**
 * 认证中间件
 */
function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user?.id) {
        res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: '请先登录' }
        });
        return;
    }
    next();
}

/**
 * 管理员中间件
 */
function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user?.isAdmin) {
        res.status(403).json({
            error: { code: 'FORBIDDEN', message: '需要管理员权限' }
        });
        return;
    }
    next();
}

/**
 * 错误处理包装器
 */
function asyncHandler(
    fn: (req: AuthRequest, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        Promise.resolve(fn(req as AuthRequest, res)).catch(next);
    };
}

// ============================================
// User Routes - Letters CRUD
// ============================================

/**
 * POST /api/future/letters - 创建信件
 */
router.post('/letters', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const data: CreateLetterRequest = req.body;

    // 基本验证
    if (!data.title?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '标题不能为空', details: { field: 'title' } }
        });
        return;
    }

    if (!data.content?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '内容不能为空', details: { field: 'content' } }
        });
        return;
    }

    if (!data.scheduledLocal) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '请选择送达时间', details: { field: 'scheduledLocal' } }
        });
        return;
    }

    // 检查送达时间是否在未来
    const scheduledDate = new Date(data.scheduledLocal);
    if (scheduledDate <= new Date()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '送达时间必须在未来', details: { field: 'scheduledLocal' } }
        });
        return;
    }

    // 检查最长预约天数
    const maxDays = parseInt(await letterService.getSetting('max_scheduled_days') || '3650', 10);
    const daysAhead = (scheduledDate.getTime() - Date.now()) / (1000 * 3600 * 24);
    if (daysAhead > maxDays) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: `送达时间不能超过${maxDays}天`, details: { field: 'scheduledLocal' } }
        });
        return;
    }

    // 他人信件需要邮箱
    if (data.recipientType === 'other' && !data.recipientEmail?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '收件人邮箱不能为空', details: { field: 'recipientEmail' } }
        });
        return;
    }

    try {
        const letter = await letterService.createLetter(userId, data);
        res.status(201).json(letter);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
}));

/**
 * GET /api/future/letters - 获取信件列表
 */
router.get('/letters', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const query: LetterListQuery = {
        type: req.query.type as 'sent' | 'received' | 'drafts' | undefined,
        status: req.query.status as any,
        cursor: req.query.cursor as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        sort: req.query.sort as 'created_at' | 'scheduled_at_utc' | undefined,
        order: req.query.order as 'asc' | 'desc' | undefined,
    };

    const result = await letterService.getLetterList(userId, query);
    res.json(result);
}));

/**
 * GET /api/future/letters/:id - 获取信件详情
 */
router.get('/letters/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;

    const letter = await letterService.getLetterDetail(letterId, userId);

    if (!letter) {
        // 返回404而非403，避免枚举攻击
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: '信件不存在' }
        });
        return;
    }

    res.json(letter);
}));

/**
 * PUT /api/future/letters/:id - 更新信件
 */
router.put('/letters/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;
    const data: UpdateLetterRequest = req.body;

    if (data.version === undefined) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '缺少版本号', details: { field: 'version' } }
        });
        return;
    }

    try {
        const letter = await letterService.updateLetter(letterId, userId, data);

        if (!letter) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '信件不存在' }
            });
            return;
        }

        res.json(letter);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('Conflict')) {
            res.status(409).json({
                error: { code: 'CONFLICT', message: '信件已被修改，请刷新后重试' }
            });
            return;
        }

        if (message.includes('only update draft')) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: '只能更新草稿状态的信件' }
            });
            return;
        }

        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
}));

/**
 * DELETE /api/future/letters/:id - 删除信件
 */
router.delete('/letters/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;

    try {
        const deleted = await letterService.deleteLetter(letterId, userId);

        if (!deleted) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '信件不存在' }
            });
            return;
        }

        res.status(204).send();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('only delete draft')) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: '只能删除草稿状态的信件' }
            });
            return;
        }

        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
}));

/**
 * POST /api/future/letters/:id/submit - 提交审核
 */
router.post('/letters/:id/submit', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;
    const { turnstileToken } = req.body;

    // 人机验证
    if (turnstileToken) {
        const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
        const result = await verifyTurnstileToken(turnstileToken, clientIP);
        if (!result.success) {
            res.status(400).json({
                error: { code: 'TURNSTILE_FAILED', message: result.error || '人机验证失败，请重试' }
            });
            return;
        }
    }

    try {
        const letter = await letterService.submitForReview(letterId, userId);

        if (!letter) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '信件不存在' }
            });
            return;
        }

        // 如果状态变为scheduled，调度投递任务
        if (letter.status === 'scheduled') {
            await deliveryService.scheduleLetterDelivery(letterId, letter.scheduledAtUtc);
        }

        res.json(letter);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
}));

// ============================================
// User Routes - Templates
// ============================================

/**
 * GET /api/future/templates - 获取信纸模板列表
 */
router.get('/templates', asyncHandler(async (_req: AuthRequest, res: Response) => {
    const templates = await letterService.getTemplates();
    res.json(templates);
}));

// ============================================
// User Routes - Received Letters
// ============================================

/**
 * GET /api/future/received - 获取收到的信件
 */
router.get('/received', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const query: LetterListQuery = {
        type: 'received',
        cursor: req.query.cursor as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await letterService.getLetterList(userId, query);
    res.json(result);
}));

// ============================================
// Admin Routes
// ============================================

/**
 * GET /api/future/admin/letters - 获取所有信件(管理员)
 */
router.get('/admin/letters', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    // TODO: 实现管理员信件列表
    res.json({ letters: [], total: 0 });
}));

/**
 * GET /api/future/admin/letters/pending-review - 获取待审核信件
 */
router.get('/admin/letters/pending-review', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    // TODO: 实现待审核列表
    res.json({ letters: [], total: 0 });
}));

/**
 * POST /api/future/admin/letters/:id/approve - 审核通过
 */
router.post('/admin/letters/:id/approve', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const letterId = req.params.id;
    const { note } = req.body;
    const adminId = req.user!.id;

    // TODO: 实现审核通过逻辑
    res.json({ success: true });
}));

/**
 * POST /api/future/admin/letters/:id/reject - 审核拒绝
 */
router.post('/admin/letters/:id/reject', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const letterId = req.params.id;
    const { reason } = req.body;
    const adminId = req.user!.id;

    if (!reason?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '请填写拒绝原因', details: { field: 'reason' } }
        });
        return;
    }

    // TODO: 实现审核拒绝逻辑
    res.json({ success: true });
}));

/**
 * GET /api/future/admin/settings - 获取设置
 */
router.get('/admin/settings', requireAuth, requireAdmin, asyncHandler(async (_req: AuthRequest, res: Response) => {
    const settings = await letterService.getSettings();
    res.json(settings);
}));

/**
 * PUT /api/future/admin/settings - 更新设置
 */
router.put('/admin/settings', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的设置数据' }
        });
        return;
    }

    for (const [key, value] of Object.entries(settings)) {
        await letterService.updateSetting(key, String(value));
    }

    res.json({ success: true });
}));

/**
 * GET /api/future/admin/stats - 获取统计数据
 */
router.get('/admin/stats', requireAuth, requireAdmin, asyncHandler(async (_req: AuthRequest, res: Response) => {
    // TODO: 实现统计查询
    res.json({
        totalLetters: 0,
        pendingReview: 0,
        scheduledToday: 0,
        deliveredThisMonth: 0,
        failedThisMonth: 0,
        topTemplates: [],
    });
}));

// ============================================
// Webhook Routes
// ============================================

/**
 * POST /api/future/webhook/resend - Resend Webhook
 */
router.post('/webhook/resend', asyncHandler(async (req: AuthRequest, res: Response) => {
    const signature = req.headers['resend-signature'] as string;
    const payload = req.body;

    try {
        await deliveryService.handleResendWebhook(payload, signature);
        res.status(200).json({ received: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Resend webhook error:', message);
        res.status(400).json({ error: message });
    }
}));

export default router;
