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

    // 基础查询条件(不含游标)
    const baseWhereClause = `
        WHERE fl.is_public = TRUE
            AND fl.deleted_at IS NULL
            AND fl.status = 'delivered'
            AND fl.delivered_at IS NOT NULL
    `;

    // 构建分页查询条件
    let whereClause = baseWhereClause;
    const params: (string | number)[] = [];

    // 游标分页
    if (cursor) {
        try {
            const cursorValue = Buffer.from(cursor, 'base64').toString('utf-8');
            whereClause += ' AND fl.delivered_at < ?';
            params.push(cursorValue);
        } catch {
            // 无效游标，忽略
        }
    }

    // 获取总数(使用基础条件,不受分页影响)
    const countSql = `SELECT COUNT(*) as total FROM future_letters fl ${baseWhereClause}`;
    const [countRows] = await pool.execute<RowDataPacket[]>(countSql, []);
    const total = countRows[0]?.total || 0;

    // 获取列表
    const listSql = `
        SELECT
            fl.id,
            fl.title,
            SUBSTRING(fl.content, 1, 240) as content_preview,
            fl.public_anonymous,
            fl.public_alias,
            fl.delivered_at,
            u.username as sender_username
        FROM future_letters fl
        LEFT JOIN users u ON fl.sender_user_id = u.id
        ${whereClause}
        ORDER BY fl.delivered_at DESC
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
        publishedAt: toIsoString(row.delivered_at),
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
            fl.delivered_at,
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
            AND fl.status = 'delivered'
            AND fl.delivered_at IS NOT NULL
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
        publishedAt: toIsoString(row.delivered_at),
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
