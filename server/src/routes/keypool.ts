/**
 * KeyPool API Routes - 号池 API
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { keyPoolService } from '../keypool';

const router = Router();

/**
 * POST /api/keypool/contribute
 * 贡献密钥
 */
router.post('/contribute', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { apiKey, providerId, baseUrl, headers, modelsSupported, dailyQuota } = req.body;

        if (!apiKey || !providerId) {
            res.status(400).json({ error: '缺少必要参数: apiKey, providerId' });
            return;
        }

        const result = await keyPoolService.contributeKey(userId, {
            apiKey,
            providerId,
            baseUrl,
            headers,
            modelsSupported,
            dailyQuota
        });

        res.json({
            success: true,
            keyId: result.keyId,
            maskedKey: result.masked,
            message: '密钥已成功添加到号池'
        });
    } catch (error: any) {
        console.error('[KeyPool] Contribute error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/keypool/my-keys
 * 获取用户贡献的密钥
 */
router.get('/my-keys', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;

        const keys = await keyPoolService.getUserKeys(userId);

        res.json({
            success: true,
            keys: keys.map(k => ({
                id: k.id,
                providerId: k.providerId,
                maskedKey: k.maskedKey,
                status: k.status,
                modelsSupported: k.modelsSupported,
                dailyQuota: k.dailyQuota,
                totalContributed: k.totalContributed,
                totalCalls: k.totalCalls,
                successRate: k.successRate,
                riskScore: k.riskScore,
                lastUsedAt: k.lastUsedAt,
                createdAt: k.createdAt
            }))
        });
    } catch (error: any) {
        console.error('[KeyPool] My keys error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/keypool/withdraw/:keyId
 * 撤回密钥
 */
router.delete('/withdraw/:keyId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { keyId } = req.params;

        await keyPoolService.withdrawKey(keyId, userId);

        res.json({ success: true, message: '密钥已撤回' });
    } catch (error: any) {
        console.error('[KeyPool] Withdraw error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/keypool/leaderboard
 * 获取贡献榜
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;

        const leaderboard = await keyPoolService.getLeaderboard(limit);

        res.json({
            success: true,
            leaderboard
        });
    } catch (error: any) {
        console.error('[KeyPool] Leaderboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/keypool/validate
 * 验证密钥（不保存）
 */
router.post('/validate', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { apiKey, providerId } = req.body;

        if (!apiKey || !providerId) {
            res.status(400).json({ error: '缺少必要参数' });
            return;
        }

        const result = await keyPoolService.validateKey(apiKey, providerId);

        res.json(result);
    } catch (error: any) {
        console.error('[KeyPool] Validate error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/keypool/stats
 * 获取号池统计（管理员）
 */
router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
    try {
        // TODO: 添加管理员权限检查

        const { pool } = require('../config/database');
        const [stats] = await pool.execute(`
            SELECT
                COUNT(*) as totalKeys,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeKeys,
                SUM(total_contributed) as totalTokens,
                SUM(total_calls) as totalCalls,
                AVG(success_rate) as avgSuccessRate,
                COUNT(DISTINCT contributor_id) as contributors
            FROM key_pool_entries
        `);

        res.json({
            success: true,
            stats: stats[0]
        });
    } catch (error: any) {
        console.error('[KeyPool] Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== 管理员 API ====================
import { adminMiddleware } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

/**
 * GET /api/admin/keypool/entries
 * 获取所有密钥条目（管理员）
 */
router.get('/admin/entries', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(`
            SELECT
                k.id, k.contributor_id, k.provider_id, k.masked_key, k.status,
                k.models_supported, k.daily_quota, k.total_contributed, k.total_calls,
                k.success_rate, k.risk_score, k.last_used_at, k.created_at,
                u.username as contributor_username
            FROM key_pool_entries k
            LEFT JOIN users u ON k.contributor_id = u.id
            ORDER BY k.created_at DESC
        `);

        const entries = rows.map(row => ({
            id: row.id,
            contributorId: row.contributor_id,
            contributorUsername: row.contributor_username,
            providerId: row.provider_id,
            maskedKey: row.masked_key,
            status: row.status,
            modelsSupported: row.models_supported ? JSON.parse(row.models_supported) : [],
            dailyQuota: row.daily_quota,
            totalContributed: row.total_contributed,
            totalCalls: row.total_calls,
            successRate: row.success_rate,
            riskScore: row.risk_score,
            lastUsedAt: row.last_used_at,
            createdAt: row.created_at
        }));

        res.json({ success: true, entries });
    } catch (error: any) {
        console.error('[KeyPool Admin] List entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/admin/keypool/entries/:keyId/status
 * 更新密钥状态（管理员）
 */
router.patch('/admin/entries/:keyId/status', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { keyId } = req.params;
        const { status } = req.body;

        if (!['active', 'exhausted', 'invalid', 'banned', 'withdrawn'].includes(status)) {
            res.status(400).json({ error: '无效的状态值' });
            return;
        }

        await pool.execute(
            'UPDATE key_pool_entries SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, keyId]
        );

        res.json({ success: true, message: '状态已更新' });
    } catch (error: any) {
        console.error('[KeyPool Admin] Update status error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
