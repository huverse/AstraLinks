/**
 * Future Letters - API Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { verifyTurnstileToken } from './auth';
import { pool } from '../config/database';
import type { RowDataPacket } from 'mysql2';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import * as letterService from '../services/future/letterService';
import * as deliveryService from '../services/future/deliveryService';
import * as uploadService from '../services/future/uploadService';
import * as aiService from '../services/future/aiService';
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

// 使用AuthenticatedRequest作为AuthRequest的别名，保持代码兼容性
type AuthRequest = AuthenticatedRequest;

/**
 * 认证中间件 - 先调用authMiddleware解析token，再检查用户是否存在
 */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
    authMiddleware(req as AuthRequest, res, (err?: unknown) => {
        if (err) {
            next(err);
            return;
        }
        const authReq = req as AuthRequest;
        if (!authReq.user?.id) {
            res.status(401).json({
                error: { code: 'UNAUTHORIZED', message: '请先登录' }
            });
            return;
        }
        next();
    });
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
 * 异步错误处理包装器
 */
function asyncHandler(
    fn: (req: AuthRequest, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        Promise.resolve(fn(req as AuthRequest, res)).catch(next);
    };
}

/**
 * 上传错误处理
 */
function handleUploadError(res: Response, error: unknown): void {
    if (error instanceof uploadService.UploadError) {
        res.status(error.status).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            }
        });
        return;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message }
    });
}

// ============================================
// User Routes - Letters CRUD
// ============================================

/**
 * GET /api/future/stats - 获取用户信件统计数据
 */
router.get('/stats', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const userEmail = req.user!.email || '';

    const stats = await letterService.getUserStats(userId, userEmail);
    res.json(stats);
}));

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
    const userEmail = req.user!.email || '';
    const normalizedEmail = userEmail.toLowerCase().trim();
    const letterId = req.params.id;

    // 先尝试作为发件人获取
    let letter = await letterService.getLetterDetail(letterId, userId);
    let isRecipient = false;

    // 如果作为发件人找不到，尝试作为收件人获取已投递的信件
    if (!letter && normalizedEmail) {
        letter = await letterService.getReceivedLetterDetail(letterId, normalizedEmail);
        isRecipient = !!letter;
    }

    if (!letter) {
        // 返回404而非403，避免枚举攻击
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: '信件不存在' }
        });
        return;
    }

    // 如果是已投递的信件且当前用户是收件人，自动标记为已读
    // 这包括：1)纯收件人 2)自己写给自己的情况
    if (letter.status === 'delivered' && letter.recipientEmailNormalized === normalizedEmail) {
        await letterService.markAsRead(letterId, normalizedEmail);
    }

    // 如果当前用户是发送者，且信件状态需要关注（被驳回/已送达/失败），自动标记为已查看
    if (letter.senderUserId === userId && ['rejected', 'delivered', 'failed'].includes(letter.status)) {
        await letterService.markSenderViewed(letterId, userId);
    }

    res.json(letter);
}));

/**
 * POST /api/future/letters/mark-all-read - 标记所有收到的信件为已读
 */
router.post('/letters/mark-all-read', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userEmail = req.user!.email;
    if (!userEmail) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '用户邮箱不存在' }
        });
        return;
    }

    const count = await letterService.markAllAsRead(userEmail);
    res.json({ success: true, count });
}));

/**
 * POST /api/future/letters/mark-all-sent-viewed - 标记所有已发送信件为已查看
 */
router.post('/letters/mark-all-sent-viewed', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const count = await letterService.markAllSenderViewed(userId);
    res.json({ success: true, count });
}));

/**
 * POST /api/future/letters/:id/unlock - 解锁加密信件
 */
router.post('/letters/:id/unlock', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;
    const { password } = req.body;

    if (!password) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '请输入密码' }
        });
        return;
    }

    try {
        // 获取信件详情
        const letter = await letterService.getLetterDetail(letterId, userId);

        if (!letter) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '信件不存在' }
            });
            return;
        }

        // 检查是否是加密信件
        if (!letter.isEncrypted) {
            // 非加密信件直接返回详情
            res.json(letter);
            return;
        }

        // 验证密码 (简单实现：直接比较，实际应使用加密验证)
        // TODO: 实现完整的加密验证逻辑
        // 目前简单实现：对于加密信件，暂时返回内容
        // 后续可以实现 KDF 验证和解密

        // 返回完整信件详情
        res.json(letter);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
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

/**
 * POST /api/future/letters/:id/withdraw - 撤回提交的信件 (pending_review -> draft)
 */
router.post('/letters/:id/withdraw', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;

    try {
        const letter = await letterService.withdrawLetter(letterId, userId);

        if (!letter) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '信件不存在' }
            });
            return;
        }

        res.json(letter);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('only withdraw pending_review')) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: '只能撤回待审核状态的信件' }
            });
            return;
        }

        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
}));

/**
 * POST /api/future/letters/:id/cancel - 取消排期信件 (approved/scheduled -> cancelled)
 */
router.post('/letters/:id/cancel', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;

    try {
        const letter = await letterService.cancelScheduledLetter(letterId, userId);

        if (!letter) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '信件不存在' }
            });
            return;
        }

        res.json(letter);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('Cannot cancel')) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: '只能取消尚未送达的已排期信件' }
            });
            return;
        }

        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
}));

/**
 * PATCH /api/future/letters/:id/public - 切换信件公开状态
 */
router.patch('/letters/:id/public', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;
    const { isPublic } = req.body;

    if (typeof isPublic !== 'boolean') {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '请提供有效的 isPublic 参数' }
        });
        return;
    }

    try {
        const letter = await letterService.togglePublicStatus(letterId, userId, isPublic);

        if (!letter) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '信件不存在' }
            });
            return;
        }

        res.json(letter);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('Cannot')) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message }
            });
            return;
        }

        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
}));

/**
 * DELETE /api/future/received/:id - 删除收到的信件 (软删除，仅从收件人视角)
 */
router.delete('/received/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;

    try {
        const deleted = await letterService.deleteReceivedLetter(letterId, userId);

        if (!deleted) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '信件不存在或您不是收件人' }
            });
            return;
        }

        res.status(204).send();
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
// User Routes - Music
// ============================================

/**
 * GET /api/future/music/parse - 解析网易云音乐歌曲信息
 * 使用网易云音乐公开API获取歌曲信息
 */
router.get('/music/parse', asyncHandler(async (req: AuthRequest, res: Response) => {
    const songId = req.query.id as string;

    if (!songId || !/^\d+$/.test(songId)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的歌曲ID' }
        });
        return;
    }

    try {
        // 使用网易云音乐公开API获取歌曲详情
        // 注意：这是公开API，可能有频率限制
        const apiUrl = `https://music.163.com/api/song/detail?ids=[${songId}]`;
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://music.163.com/',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch song info');
        }

        const data = await response.json() as { songs?: Array<{ name: string; artists?: Array<{ name: string }>; album?: { name: string; picUrl: string }; duration?: number }> };
        const song = data.songs?.[0];

        if (!song) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '歌曲不存在' }
            });
            return;
        }

        res.json({
            id: songId,
            name: song.name,
            artist: song.artists?.map((a: { name: string }) => a.name).join(' / ') || '未知艺术家',
            album: song.album?.name,
            coverUrl: song.album?.picUrl,
            duration: song.duration,
        });
    } catch (error) {
        // 解析失败时返回基本信息，让前端仍可使用
        console.warn('Failed to parse music info:', error);
        res.json({
            id: songId,
            name: `歌曲 ${songId}`,
            artist: '未知',
        });
    }
}));

// ============================================
// User Routes - Physical Letters (实体信)
// ============================================

import type {
    PhysicalOptionItem,
    PhysicalOptionsResponse,
    PhysicalOrderRequest,
    PhysicalOrderResponse,
    PricingResponse,
    PhysicalOrderListResponse,
} from '../services/future/types';

/**
 * 解析物理选项 JSON 字符串
 */
function parsePhysicalOptions(raw: string | null): PhysicalOptionItem[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item: unknown) =>
                item &&
                typeof (item as Record<string, unknown>).value === 'string' &&
                typeof (item as Record<string, unknown>).label === 'string'
            )
            .map((item: Record<string, unknown>) => ({
                value: String(item.value),
                label: String(item.label),
                price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
            }));
    } catch {
        return [];
    }
}

/**
 * 获取选项价格
 */
function getOptionPrice(options: PhysicalOptionItem[], value?: string): number {
    if (!value) return 0;
    const match = options.find((item) => item.value === value);
    return match && Number.isFinite(match.price) ? match.price! : 0;
}

/**
 * 加载纸张和信封选项
 */
async function loadPhysicalOptions(): Promise<PhysicalOptionsResponse> {
    const [paperTypesRaw, envelopeTypesRaw] = await Promise.all([
        letterService.getSetting('paper_types'),
        letterService.getSetting('envelope_types'),
    ]);
    return {
        paperTypes: parsePhysicalOptions(paperTypesRaw),
        envelopeTypes: parsePhysicalOptions(envelopeTypesRaw),
    };
}

/**
 * 检查实体信功能是否启用
 */
async function requirePhysicalEnabled(res: Response): Promise<boolean> {
    const enabled = await letterService.getSetting('physical_letter_enabled');
    if (enabled !== 'true') {
        res.status(403).json({
            error: { code: 'FEATURE_DISABLED', message: '实体信功能暂未开放' }
        });
        return false;
    }
    return true;
}

/**
 * 映射数据库行到响应对象
 */
function mapPhysicalOrderRow(row: RowDataPacket): PhysicalOrderResponse {
    return {
        id: row.id,
        letterId: row.letter_id,
        recipientName: row.recipient_name || undefined,
        postalCode: row.postal_code || undefined,
        country: row.country || 'CN',
        paperType: row.paper_type || undefined,
        envelopeType: row.envelope_type || undefined,
        orderStatus: row.order_status || 'pending',
        shippingStatus: row.shipping_status || 'pending',
        shippingFee: row.shipping_fee ? parseFloat(row.shipping_fee) : undefined,
        paid: Boolean(row.paid),
        trackingNumber: row.tracking_number || undefined,
        carrier: row.carrier || undefined,
        adminNote: row.admin_note || undefined,
        createdAt: row.created_at?.toISOString() || '',
        updatedAt: row.updated_at?.toISOString() || '',
    };
}

/**
 * GET /api/future/physical/options - 获取纸张/信封选项
 */
router.get('/physical/options', requireAuth, asyncHandler(async (_req: AuthRequest, res: Response) => {
    if (!await requirePhysicalEnabled(res)) return;
    const options = await loadPhysicalOptions();
    res.json(options);
}));

/**
 * GET /api/future/physical/pricing - 计算费用
 */
router.get('/physical/pricing', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!await requirePhysicalEnabled(res)) return;

    const paperType = req.query.paperType as string | undefined;
    const envelopeType = req.query.envelopeType as string | undefined;

    const options = await loadPhysicalOptions();

    // 验证选项有效性
    if (paperType && !options.paperTypes.some((item) => item.value === paperType)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的纸张类型', details: { field: 'paperType' } }
        });
        return;
    }
    if (envelopeType && !options.envelopeTypes.some((item) => item.value === envelopeType)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的信封类型', details: { field: 'envelopeType' } }
        });
        return;
    }

    const baseFeeSetting = await letterService.getSetting('physical_letter_base_fee');
    const baseFee = parseFloat(baseFeeSetting || '15') || 15;
    const paperFee = getOptionPrice(options.paperTypes, paperType);
    const envelopeFee = getOptionPrice(options.envelopeTypes, envelopeType);
    const totalFee = baseFee + paperFee + envelopeFee;

    const response: PricingResponse = {
        baseFee,
        paperFee,
        envelopeFee,
        totalFee,
        currency: 'CNY',
    };
    res.json(response);
}));

/**
 * POST /api/future/physical/orders - 创建实体信订单
 */
router.post('/physical/orders', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!await requirePhysicalEnabled(res)) return;

    const userId = req.user!.id;
    const data: PhysicalOrderRequest = req.body;

    // 验证必填字段
    if (!data.letterId?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '缺少信件ID', details: { field: 'letterId' } }
        });
        return;
    }
    if (!data.recipientName?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '收件人姓名必填', details: { field: 'recipientName' } }
        });
        return;
    }
    if (!data.recipientAddress?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '收件地址必填', details: { field: 'recipientAddress' } }
        });
        return;
    }
    if (!data.paperType?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '纸张类型必选', details: { field: 'paperType' } }
        });
        return;
    }
    if (!data.envelopeType?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '信封类型必选', details: { field: 'envelopeType' } }
        });
        return;
    }

    // 验证信件存在且属于当前用户
    const [letters] = await pool.execute<RowDataPacket[]>(
        `SELECT id, letter_type FROM future_letters
         WHERE id = ? AND sender_user_id = ? AND deleted_at IS NULL`,
        [data.letterId, userId]
    );
    if (letters.length === 0) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: '信件不存在' }
        });
        return;
    }
    if (letters[0].letter_type !== 'physical') {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '此信件不是实体信类型' }
        });
        return;
    }

    // 检查是否已有订单
    const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM future_letter_physical WHERE letter_id = ?',
        [data.letterId]
    );
    if (existing.length > 0) {
        res.status(409).json({
            error: { code: 'CONFLICT', message: '该信件已有实体信订单' }
        });
        return;
    }

    // 验证选项并计算费用
    const options = await loadPhysicalOptions();
    if (!options.paperTypes.some((item) => item.value === data.paperType)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的纸张类型', details: { field: 'paperType' } }
        });
        return;
    }
    if (!options.envelopeTypes.some((item) => item.value === data.envelopeType)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的信封类型', details: { field: 'envelopeType' } }
        });
        return;
    }

    const baseFeeSetting = await letterService.getSetting('physical_letter_base_fee');
    const baseFee = parseFloat(baseFeeSetting || '15') || 15;
    const paperFee = getOptionPrice(options.paperTypes, data.paperType);
    const envelopeFee = getOptionPrice(options.envelopeTypes, data.envelopeType);
    const totalFee = baseFee + paperFee + envelopeFee;

    // 创建订单
    await pool.execute(
        `INSERT INTO future_letter_physical
         (letter_id, recipient_name, recipient_address_encrypted, recipient_phone_encrypted,
          postal_code, country, paper_type, envelope_type, order_status, shipping_status,
          shipping_fee, paid, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, FALSE, NOW(), NOW())`,
        [
            data.letterId,
            data.recipientName.trim(),
            data.recipientAddress.trim(),  // TODO: 实际应加密
            data.recipientPhone?.trim() || null,
            data.postalCode?.trim() || null,
            data.country?.trim() || 'CN',
            data.paperType,
            data.envelopeType,
            totalFee,
        ]
    );

    // 返回创建的订单
    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM future_letter_physical WHERE letter_id = ?',
        [data.letterId]
    );
    res.status(201).json(mapPhysicalOrderRow(rows[0]));
}));

/**
 * GET /api/future/physical/orders - 获取订单列表
 */
router.get('/physical/orders', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!await requirePhysicalEnabled(res)) return;

    const userId = req.user!.id;
    const status = req.query.status as string | undefined;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE l.sender_user_id = ? AND l.deleted_at IS NULL';
    const params: (string | number)[] = [userId];

    if (status) {
        whereClause += ' AND p.order_status = ?';
        params.push(status);
    }

    // 获取总数
    const [[{ total }]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as total
         FROM future_letter_physical p
         JOIN future_letters l ON p.letter_id = l.id
         ${whereClause}`,
        params
    );

    // 获取订单列表
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT p.*
         FROM future_letter_physical p
         JOIN future_letters l ON p.letter_id = l.id
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const response: PhysicalOrderListResponse = {
        orders: rows.map(mapPhysicalOrderRow),
        total: Number(total),
        page,
        totalPages: Math.ceil(Number(total) / limit),
    };
    res.json(response);
}));

/**
 * GET /api/future/physical/orders/:letterId - 获取单个订单详情
 */
router.get('/physical/orders/:letterId', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!await requirePhysicalEnabled(res)) return;

    const userId = req.user!.id;
    const { letterId } = req.params;

    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT p.*
         FROM future_letter_physical p
         JOIN future_letters l ON p.letter_id = l.id
         WHERE p.letter_id = ? AND l.sender_user_id = ? AND l.deleted_at IS NULL`,
        [letterId, userId]
    );

    if (rows.length === 0) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: '订单不存在' }
        });
        return;
    }

    res.json(mapPhysicalOrderRow(rows[0]));
}));

// ============================================
// User Routes - AI 辅助写作
// ============================================

/**
 * POST /api/future/ai/compose - AI 辅助写信
 * 使用用户配置中心的 LLM 配置，或系统默认配置
 */
router.post('/ai/compose', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { content, assistType, context } = req.body;

    // 检查 AI 功能是否启用
    const aiEnabled = await letterService.getSetting('ai_writing_enabled');
    if (aiEnabled === 'false') {
        res.status(403).json({
            error: { code: 'AI_DISABLED', message: 'AI 辅助写作功能暂未开放' }
        });
        return;
    }

    // 验证
    if (!content?.trim()) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '内容不能为空', details: { field: 'content' } }
        });
        return;
    }

    const validTypes = ['improve', 'expand', 'simplify', 'emotional'];
    if (!assistType || !validTypes.includes(assistType)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的辅助类型', details: { field: 'assistType', validTypes } }
        });
        return;
    }

    try {
        const result = await aiService.composeWritingAssist(userId, {
            content,
            assistType,
            context,
        });
        res.json(result);
    } catch (error: unknown) {
        if (error instanceof aiService.WritingAssistError) {
            const statusMap: Record<string, number> = {
                'NO_CONFIG': 400,
                'INVALID_CONFIG': 400,
                'EMPTY_RESPONSE': 400,
                'MODEL_UNAVAILABLE': 503,
                'LLM_ERROR': 500,
                'NO_MODEL': 400,
            };
            res.status(statusMap[error.code] || 500).json({
                error: {
                    code: error.code,
                    message: error.message,
                    // 不暴露 details，避免泄露敏感信息
                }
            });
            return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message }
        });
    }
}));

// ============================================
// User Routes - Attachments
// ============================================

/**
 * POST /api/future/letters/:id/attachments - 上传附件
 */
router.post('/letters/:id/attachments', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;

    try {
        const attachment = await uploadService.uploadAttachment(letterId, userId, req.body);
        res.status(201).json(attachment);
    } catch (error: unknown) {
        handleUploadError(res, error);
    }
}));

/**
 * GET /api/future/letters/:id/attachments - 获取信件附件列表
 */
router.get('/letters/:id/attachments', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;

    const attachments = await uploadService.getAttachmentsForLetter(letterId, userId);
    res.json(attachments);
}));

/**
 * DELETE /api/future/letters/:id/attachments/:attachmentId - 删除附件
 */
router.delete('/letters/:id/attachments/:attachmentId', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const letterId = req.params.id;
    const attachmentId = parseInt(req.params.attachmentId, 10);

    if (isNaN(attachmentId)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的附件ID' }
        });
        return;
    }

    try {
        const deleted = await uploadService.deleteAttachment(letterId, attachmentId, userId);

        if (!deleted) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '附件不存在' }
            });
            return;
        }

        res.status(204).send();
    } catch (error: unknown) {
        handleUploadError(res, error);
    }
}));

/**
 * GET /api/future/attachments/* - 获取附件文件
 */
router.get('/attachments/*', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    // 从URL中提取storageKey (去掉 /attachments/ 前缀)
    const storageKey = req.params[0];

    if (!storageKey) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的附件路径' }
        });
        return;
    }

    try {
        const fileInfo = await uploadService.getAttachmentForDownload(storageKey, userId);

        if (!fileInfo) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: '附件不存在或无权访问' }
            });
            return;
        }

        // 设置响应头
        res.setHeader('Content-Type', fileInfo.mimeType);
        res.setHeader('Cache-Control', 'private, max-age=3600');

        if (fileInfo.downloadName) {
            // 支持中文文件名
            const encodedName = encodeURIComponent(fileInfo.downloadName);
            res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);
        }

        // 发送文件
        res.sendFile(fileInfo.filePath);
    } catch (error: unknown) {
        handleUploadError(res, error);
    }
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
// User Routes - Settings
// ============================================

/**
 * GET /api/future/user-settings - 获取用户设置
 */
router.get('/user-settings', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const [[settings]] = await pool.execute<RowDataPacket[]>(
        `SELECT default_email, notify_on_delivery, timezone, theme, dark_mode
         FROM future_user_settings WHERE user_id = ?`,
        [userId]
    );

    if (!settings) {
        res.json({
            defaultEmail: req.user!.email || '',
            notifyOnDelivery: true,
            timezone: 'Asia/Shanghai',
            theme: 'purple',
            darkMode: false,
        });
        return;
    }

    res.json({
        defaultEmail: settings.default_email || req.user!.email || '',
        notifyOnDelivery: settings.notify_on_delivery ?? true,
        timezone: settings.timezone || 'Asia/Shanghai',
        theme: settings.theme || 'purple',
        darkMode: settings.dark_mode ?? false,
    });
}));

/**
 * PUT /api/future/user-settings - 更新用户设置
 */
router.put('/user-settings', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { defaultEmail, notifyOnDelivery, timezone, theme, darkMode } = req.body;

    // Validate theme
    const validThemes = ['purple', 'starry', 'ocean', 'cloud'];
    if (theme && !validThemes.includes(theme)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的主题' }
        });
        return;
    }

    await pool.execute(
        `INSERT INTO future_user_settings (user_id, default_email, notify_on_delivery, timezone, theme, dark_mode)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         default_email = VALUES(default_email),
         notify_on_delivery = VALUES(notify_on_delivery),
         timezone = VALUES(timezone),
         theme = VALUES(theme),
         dark_mode = VALUES(dark_mode),
         updated_at = NOW()`,
        [
            userId,
            defaultEmail || null,
            notifyOnDelivery ?? true,
            timezone || 'Asia/Shanghai',
            theme || 'purple',
            darkMode ?? false,
        ]
    );

    res.json({ success: true });
}));

/**
 * DELETE /api/future/user-data - 删除用户所有时光信数据
 */
router.delete('/user-data', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Delete attachments
        await connection.execute(
            'DELETE FROM future_letter_attachments WHERE letter_id IN (SELECT id FROM future_letters WHERE sender_user_id = ?)',
            [userId]
        );

        // Delete events
        await connection.execute(
            'DELETE FROM future_letter_events WHERE letter_id IN (SELECT id FROM future_letters WHERE sender_user_id = ?)',
            [userId]
        );

        // Delete queue entries
        await connection.execute(
            'DELETE FROM future_letter_queue WHERE letter_id IN (SELECT id FROM future_letters WHERE sender_user_id = ?)',
            [userId]
        );

        // Delete letters
        await connection.execute('DELETE FROM future_letters WHERE sender_user_id = ?', [userId]);

        // Delete settings
        await connection.execute('DELETE FROM future_user_settings WHERE user_id = ?', [userId]);

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}));

// ============================================
// Public Routes - Open Letter Wall (公开信墙)
// No authentication required for reading
// ============================================

const PUBLIC_LETTER_DEFAULT_LIMIT = 20;
const PUBLIC_LETTER_MAX_LIMIT = 50;

/**
 * 获取公开显示名称
 * @param isAnonymous 是否匿名
 * @param alias 自定义别名
 * @param username 用户名（作为非匿名用户的备选）
 */
function getPublicDisplayName(isAnonymous: boolean, alias: string | null, username?: string | null): string {
    if (isAnonymous) {
        return '匿名用户';
    }
    if (alias?.trim()) {
        return alias.trim();
    }
    if (username?.trim()) {
        return username.trim();
    }
    return '时光信用户';
}

/**
 * 转换为ISO时间字符串
 */
function toIsoString(value: Date | string | null): string {
    if (!value) return '';
    if (value instanceof Date) {
        return value.toISOString();
    }
    return new Date(value).toISOString();
}

/**
 * 脱敏邮箱地址: test@example.com → t***@example.com
 */
function maskEmail(email: string): string {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    if (local.length <= 1) return `*@${domain}`;
    return `${local[0]}***@${domain}`;
}

/**
 * 脱敏姓名: 张三 → 张* / 王小明 → 王*明
 */
function maskName(name: string): string {
    if (!name) return '';
    const len = name.length;
    if (len <= 1) return '*';
    if (len === 2) return `${name[0]}*`;
    return `${name[0]}${'*'.repeat(len - 2)}${name[len - 1]}`;
}

/**
 * GET /api/future/public/letters - 获取公开信列表 (无需登录)
 */
router.get('/public/letters', asyncHandler(async (req: AuthRequest, res: Response) => {
    // 检查功能是否启用
    const wallEnabled = await letterService.getSetting('open_letter_wall_enabled');
    if (wallEnabled === 'false') {
        res.status(403).json({
            error: { code: 'FEATURE_DISABLED', message: '公开信墙功能未启用' }
        });
        return;
    }

    // 分页参数
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : PUBLIC_LETTER_DEFAULT_LIMIT;
    const safeLimit = Number.isFinite(rawLimit) ? rawLimit : PUBLIC_LETTER_DEFAULT_LIMIT;
    const limit = Math.min(Math.max(safeLimit, 1), PUBLIC_LETTER_MAX_LIMIT);
    const cursor = req.query.cursor as string | undefined;

    // 基础查询条件(不含游标) - 公开信发送后即显示，不等待送达
    // 排除草稿、已取消、被驳回、待审核状态的信件
    const baseWhereClause = `
        WHERE fl.is_public = TRUE
            AND fl.deleted_at IS NULL
            AND fl.status NOT IN ('draft', 'cancelled', 'rejected', 'pending_review')
    `;

    // 构建分页查询条件
    let whereClause = baseWhereClause;
    const params: (string | number)[] = [];

    // 游标分页 - 使用 created_at 代替 delivered_at
    if (cursor) {
        try {
            const cursorValue = Buffer.from(cursor, 'base64').toString('utf-8');
            whereClause += ' AND fl.created_at < ?';
            params.push(cursorValue);
        } catch {
            // 无效游标，忽略
        }
    }

    // 获取总数(使用基础条件,不受分页影响)
    const countSql = `SELECT COUNT(*) as total FROM future_letters fl ${baseWhereClause}`;
    const [countRows] = await pool.execute<RowDataPacket[]>(countSql, []);
    const total = countRows[0]?.total || 0;

    // 获取列表 - 按创建时间排序
    const listSql = `
        SELECT
            fl.id,
            fl.title,
            SUBSTRING(fl.content, 1, 240) as content_preview,
            fl.public_anonymous,
            fl.public_alias,
            fl.created_at,
            u.username as sender_username
        FROM future_letters fl
        LEFT JOIN users u ON fl.sender_user_id = u.id
        ${whereClause}
        ORDER BY fl.created_at DESC
        LIMIT ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(listSql, [...params, limit + 1]);

    // 构建响应
    const hasMore = rows.length > limit;
    const letters = rows.slice(0, limit).map((row) => ({
        id: row.id,
        title: row.title || '无题',
        contentPreview: row.content_preview ? String(row.content_preview) : '',
        displayName: getPublicDisplayName(Boolean(row.public_anonymous), row.public_alias, row.sender_username),
        publishedAt: toIsoString(row.created_at),
    }));

    let nextCursor: string | undefined;
    if (hasMore && letters.length > 0 && letters[letters.length - 1].publishedAt) {
        nextCursor = Buffer.from(letters[letters.length - 1].publishedAt).toString('base64');
    }

    res.json({ letters, nextCursor, total });
}));

/**
 * GET /api/future/public/letters/:id - 获取公开信详情 (无需登录)
 */
router.get('/public/letters/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    // 检查功能是否启用
    const wallEnabled = await letterService.getSetting('open_letter_wall_enabled');
    if (wallEnabled === 'false') {
        res.status(403).json({
            error: { code: 'FEATURE_DISABLED', message: '公开信墙功能未启用' }
        });
        return;
    }

    const letterId = req.params.id;

    const query = `
        SELECT
            fl.id,
            fl.title,
            fl.content,
            fl.content_html_sanitized,
            fl.public_anonymous,
            fl.public_alias,
            fl.created_at,
            fl.music_id,
            fl.music_name,
            fl.music_artist,
            fl.music_cover_url,
            u.username as sender_username
        FROM future_letters fl
        LEFT JOIN users u ON fl.sender_user_id = u.id
        WHERE fl.id = ?
            AND fl.is_public = TRUE
            AND fl.deleted_at IS NULL
            AND fl.status NOT IN ('draft', 'cancelled', 'rejected', 'pending_review')
        LIMIT 1
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [letterId]);

    if (rows.length === 0) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: '公开信不存在' }
        });
        return;
    }

    const row = rows[0];
    res.json({
        id: row.id,
        title: row.title || '无题',
        content: row.content,
        contentHtmlSanitized: row.content_html_sanitized || undefined,
        displayName: getPublicDisplayName(Boolean(row.public_anonymous), row.public_alias, row.sender_username),
        publishedAt: toIsoString(row.created_at),
        music: row.music_id ? {
            id: row.music_id,
            name: row.music_name,
            artist: row.music_artist,
            coverUrl: row.music_cover_url,
        } : undefined,
    });
}));

// ============================================
// Admin Routes
// ============================================

/**
 * GET /api/future/admin/letters - 获取所有信件(管理员)
 */
router.get('/admin/letters', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE fl.deleted_at IS NULL';
    const params: any[] = [];

    if (status && status !== 'all') {
        whereClause += ' AND fl.status = ?';
        params.push(status);
    }

    const [[{ total }]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM future_letters fl ${whereClause}`,
        params
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT
            fl.id, fl.title, fl.content, fl.status, fl.recipient_type,
            fl.recipient_email, fl.scheduled_local, fl.scheduled_at_utc, fl.scheduled_tz,
            fl.delivered_at, fl.created_at, fl.is_public, fl.review_note,
            fl.rejected_reason, fl.reviewed_at, fl.submitted_at,
            u.username as sender_username, u.email as sender_email
         FROM future_letters fl
         LEFT JOIN users u ON fl.sender_user_id = u.id
         ${whereClause}
         ORDER BY fl.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    res.json({
        letters: rows,
        total,
        page,
        totalPages: Math.ceil(Number(total) / limit)
    });
}));

/**
 * GET /api/future/admin/letters/pending-review - 获取待审核信件
 */
router.get('/admin/letters/pending-review', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT
            fl.id, fl.title, fl.content, fl.status, fl.recipient_type,
            fl.recipient_email, fl.scheduled_local, fl.scheduled_at_utc, fl.scheduled_tz,
            fl.created_at, fl.is_public, fl.submitted_at,
            u.username as sender_username, u.email as sender_email
         FROM future_letters fl
         LEFT JOIN users u ON fl.sender_user_id = u.id
         WHERE fl.status = 'pending_review' AND fl.deleted_at IS NULL
         ORDER BY fl.submitted_at ASC`
    );

    res.json({ letters: rows, total: rows.length });
}));

/**
 * POST /api/future/admin/letters/:id/approve - 审核通过
 */
router.post('/admin/letters/:id/approve', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const letterId = req.params.id;
    const { note } = req.body;
    const adminId = req.user!.id;

    // 检查信件是否存在且状态正确
    const [[letter]] = await pool.execute<RowDataPacket[]>(
        'SELECT id, status FROM future_letters WHERE id = ? AND deleted_at IS NULL',
        [letterId]
    );

    if (!letter) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: '信件不存在' } });
        return;
    }

    if (letter.status !== 'pending_review') {
        res.status(400).json({ error: { code: 'INVALID_STATUS', message: '信件状态不允许审核' } });
        return;
    }

    // 获取信件的投递时间
    const [[letterDetails]] = await pool.execute<RowDataPacket[]>(
        'SELECT scheduled_at_utc FROM future_letters WHERE id = ?',
        [letterId]
    );

    // 更新信件状态为scheduled（准备投递）
    await pool.execute(
        `UPDATE future_letters SET
            status = 'scheduled',
            reviewed_at = NOW(),
            reviewer_user_id = ?,
            review_note = ?
         WHERE id = ?`,
        [adminId, note || null, letterId]
    );

    // 调度投递任务
    if (letterDetails?.scheduled_at_utc) {
        await deliveryService.scheduleLetterDelivery(letterId, new Date(letterDetails.scheduled_at_utc));
        console.log(`[FutureLetter] Scheduled delivery for letter ${letterId}`);
    }

    res.json({ success: true, message: '信件已审核通过并排期投递' });
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

    // 检查信件是否存在且状态正确
    const [[letter]] = await pool.execute<RowDataPacket[]>(
        'SELECT id, status FROM future_letters WHERE id = ? AND deleted_at IS NULL',
        [letterId]
    );

    if (!letter) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: '信件不存在' } });
        return;
    }

    if (letter.status !== 'pending_review') {
        res.status(400).json({ error: { code: 'INVALID_STATUS', message: '信件状态不允许审核' } });
        return;
    }

    // 更新信件状态为rejected
    await pool.execute(
        `UPDATE future_letters SET
            status = 'rejected',
            reviewed_at = NOW(),
            reviewer_user_id = ?,
            rejected_reason = ?
         WHERE id = ?`,
        [adminId, reason, letterId]
    );

    res.json({ success: true, message: '信件已拒绝' });
}));

/**
 * DELETE /api/future/admin/letters/:id - 管理员删除信件(软删除)
 */
router.delete('/admin/letters/:id', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const letterId = req.params.id;

    // 检查信件是否存在
    const [[letter]] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM future_letters WHERE id = ? AND deleted_at IS NULL',
        [letterId]
    );

    if (!letter) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: '信件不存在' } });
        return;
    }

    // 软删除信件
    await pool.execute(
        'UPDATE future_letters SET deleted_at = NOW() WHERE id = ?',
        [letterId]
    );

    res.json({ success: true, message: '信件已删除' });
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
    // 总信件数
    const [[{ totalLetters }]] = await pool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) as totalLetters FROM future_letters WHERE deleted_at IS NULL'
    );

    // 待审核数
    const [[{ pendingReview }]] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as pendingReview FROM future_letters WHERE status = 'pending_review' AND deleted_at IS NULL"
    );

    // 今日排期数
    const [[{ scheduledToday }]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as scheduledToday FROM future_letters
         WHERE DATE(scheduled_at_utc) = CURDATE() AND status = 'approved' AND deleted_at IS NULL`
    );

    // 本月已投递数
    const [[{ deliveredThisMonth }]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as deliveredThisMonth FROM future_letters
         WHERE status = 'delivered' AND MONTH(delivered_at) = MONTH(NOW()) AND YEAR(delivered_at) = YEAR(NOW()) AND deleted_at IS NULL`
    );

    // 本月失败数
    const [[{ failedThisMonth }]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as failedThisMonth FROM future_letters
         WHERE status = 'failed' AND MONTH(updated_at) = MONTH(NOW()) AND YEAR(updated_at) = YEAR(NOW()) AND deleted_at IS NULL`
    );

    res.json({
        totalLetters: Number(totalLetters),
        pendingReview: Number(pendingReview),
        scheduledToday: Number(scheduledToday),
        deliveredThisMonth: Number(deliveredThisMonth),
        failedThisMonth: Number(failedThisMonth),
    });
}));

// ============================================
// Admin Routes - Physical Orders (实体信订单管理)
// ============================================

/**
 * GET /api/future/admin/physical/orders - 获取所有实体信订单(管理员)
 */
router.get('/admin/physical/orders', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    const shippingStatus = req.query.shippingStatus as string | undefined;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE l.deleted_at IS NULL';
    const params: (string | number)[] = [];

    if (status) {
        whereClause += ' AND p.order_status = ?';
        params.push(status);
    }
    if (shippingStatus) {
        whereClause += ' AND p.shipping_status = ?';
        params.push(shippingStatus);
    }

    // 获取总数
    const [[{ total }]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as total
         FROM future_letter_physical p
         JOIN future_letters l ON p.letter_id = l.id
         ${whereClause}`,
        params
    );

    // 获取订单列表（含信件和用户信息）
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT p.*, l.title as letter_title, l.sender_user_id,
                u.username as sender_username, u.email as sender_email
         FROM future_letter_physical p
         JOIN future_letters l ON p.letter_id = l.id
         LEFT JOIN users u ON l.sender_user_id = u.id
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const orders = rows.map((row) => ({
        id: row.id,
        letterId: row.letter_id,
        letterTitle: row.letter_title,
        senderUsername: row.sender_username,
        senderEmail: row.sender_email,
        recipientName: row.recipient_name || undefined,
        postalCode: row.postal_code || undefined,
        country: row.country || 'CN',
        paperType: row.paper_type || undefined,
        envelopeType: row.envelope_type || undefined,
        orderStatus: row.order_status || 'pending',
        shippingStatus: row.shipping_status || 'pending',
        shippingFee: row.shipping_fee ? parseFloat(row.shipping_fee) : undefined,
        paid: Boolean(row.paid),
        trackingNumber: row.tracking_number || undefined,
        carrier: row.carrier || undefined,
        adminNote: row.admin_note || undefined,
        createdAt: row.created_at?.toISOString() || '',
        updatedAt: row.updated_at?.toISOString() || '',
    }));

    res.json({
        orders,
        total: Number(total),
        page,
        totalPages: Math.ceil(Number(total) / limit),
    });
}));

/**
 * PUT /api/future/admin/physical/orders/:id - 更新实体信订单(管理员)
 */
router.put('/admin/physical/orders/:id', requireAuth, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的订单ID' }
        });
        return;
    }

    const { orderStatus, shippingStatus, trackingNumber, carrier, adminNote } = req.body;

    // 检查订单是否存在
    const [[order]] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM future_letter_physical WHERE id = ?',
        [orderId]
    );

    if (!order) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: '订单不存在' }
        });
        return;
    }

    // 验证状态值
    const validOrderStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    const validShippingStatuses = ['pending', 'printing', 'shipped', 'in_transit', 'delivered', 'returned'];

    if (orderStatus && !validOrderStatuses.includes(orderStatus)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的订单状态', details: { field: 'orderStatus', valid: validOrderStatuses } }
        });
        return;
    }
    if (shippingStatus && !validShippingStatuses.includes(shippingStatus)) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '无效的物流状态', details: { field: 'shippingStatus', valid: validShippingStatuses } }
        });
        return;
    }

    // 构建更新语句
    const updates: string[] = [];
    const updateParams: (string | null)[] = [];

    if (orderStatus !== undefined) {
        updates.push('order_status = ?');
        updateParams.push(orderStatus);
    }
    if (shippingStatus !== undefined) {
        updates.push('shipping_status = ?');
        updateParams.push(shippingStatus);
        // 如果设置为shipped，记录发货时间
        if (shippingStatus === 'shipped') {
            updates.push('shipped_at = NOW()');
        }
        // 如果设置为delivered，记录送达时间
        if (shippingStatus === 'delivered') {
            updates.push('delivered_at = NOW()');
        }
    }
    if (trackingNumber !== undefined) {
        updates.push('tracking_number = ?');
        updateParams.push(trackingNumber || null);
    }
    if (carrier !== undefined) {
        updates.push('carrier = ?');
        updateParams.push(carrier || null);
    }
    if (adminNote !== undefined) {
        updates.push('admin_note = ?');
        updateParams.push(adminNote || null);
    }

    if (updates.length === 0) {
        res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: '没有要更新的字段' }
        });
        return;
    }

    updates.push('updated_at = NOW()');

    await pool.execute(
        `UPDATE future_letter_physical SET ${updates.join(', ')} WHERE id = ?`,
        [...updateParams, orderId]
    );

    // 返回更新后的订单
    const [[updatedOrder]] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM future_letter_physical WHERE id = ?',
        [orderId]
    );

    res.json(mapPhysicalOrderRow(updatedOrder));
}));

/**
 * GET /api/future/admin/physical/stats - 获取实体信统计(管理员)
 */
router.get('/admin/physical/stats', requireAuth, requireAdmin, asyncHandler(async (_req: AuthRequest, res: Response) => {
    // 总订单数
    const [[{ totalOrders }]] = await pool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) as totalOrders FROM future_letter_physical'
    );

    // 待处理订单
    const [[{ pendingOrders }]] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as pendingOrders FROM future_letter_physical WHERE order_status = 'pending'"
    );

    // 处理中订单
    const [[{ processingOrders }]] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as processingOrders FROM future_letter_physical WHERE order_status = 'processing'"
    );

    // 已完成订单
    const [[{ completedOrders }]] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as completedOrders FROM future_letter_physical WHERE order_status = 'completed'"
    );

    // 本月订单数
    const [[{ ordersThisMonth }]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as ordersThisMonth FROM future_letter_physical
         WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())`
    );

    // 本月收入
    const [[{ revenueThisMonth }]] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(shipping_fee), 0) as revenueThisMonth FROM future_letter_physical
         WHERE order_status = 'completed' AND MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())`
    );

    res.json({
        totalOrders: Number(totalOrders),
        pendingOrders: Number(pendingOrders),
        processingOrders: Number(processingOrders),
        completedOrders: Number(completedOrders),
        ordersThisMonth: Number(ordersThisMonth),
        revenueThisMonth: parseFloat(revenueThisMonth) || 0,
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
