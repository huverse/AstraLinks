import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { RowDataPacket } from 'mysql2';

const router = Router();

/**
 * GET /api/profile
 * Get current user's profile
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const [users] = await pool.execute<RowDataPacket[]>(`
            SELECT id, username, email, phone, avatar_url, user_tier, is_admin,
                   qq_openid, device_fingerprint, created_at, last_login,
                   split_tree_id, split_codes_generated, monthly_token_usage, token_limit
            FROM users WHERE id = ?
        `, [userId]);

        if (!users.length) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        const user = users[0];

        // Get tier info
        const tierInfo = {
            free: { name: 'Free', color: '#a0a0a0', features: ['基础功能', '有限模型访问'] },
            pro: { name: 'Pro', color: '#8b5cf6', features: ['高级模型', '更多token配额', '优先支持'] },
            ultra: { name: 'Ultra', color: '#f59e0b', features: ['所有模型', '无限制', 'VIP支持', 'MCP链接'] }
        };

        res.json({
            ...user,
            tierInfo: tierInfo[user.user_tier as keyof typeof tierInfo] || tierInfo.free,
            hasQQ: !!user.qq_openid,
            hasPhone: !!user.phone
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/profile
 * Update user profile (limited fields)
 */
router.patch('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { username, email, avatar_url } = req.body;

        // Validate username if provided
        if (username !== undefined) {
            if (username.length < 3 || username.length > 30) {
                res.status(400).json({ error: '用户名长度必须在3-30字符之间' });
                return;
            }

            // Check if username is taken
            const [existing] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE username = ? AND id != ?',
                [username, userId]
            );
            if (existing.length) {
                res.status(400).json({ error: '用户名已被使用' });
                return;
            }
        }

        // Validate email if provided
        if (email !== undefined) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email && !emailRegex.test(email)) {
                res.status(400).json({ error: '邮箱格式不正确' });
                return;
            }

            // Check if email is taken
            if (email) {
                const [existing] = await pool.execute<RowDataPacket[]>(
                    'SELECT id FROM users WHERE email = ? AND id != ?',
                    [email, userId]
                );
                if (existing.length) {
                    res.status(400).json({ error: '邮箱已被使用' });
                    return;
                }
            }
        }

        // Build update query
        const updates: string[] = [];
        const values: any[] = [];

        if (username !== undefined) {
            updates.push('username = ?');
            values.push(username);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            values.push(email || null);
        }
        if (avatar_url !== undefined) {
            updates.push('avatar_url = ?');
            values.push(avatar_url || null);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: '没有需要更新的字段' });
            return;
        }

        values.push(userId);
        await pool.execute(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        res.json({ message: '个人信息已更新' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/profile/tier-benefits
 * Get tier benefits information
 */
router.get('/tier-benefits', async (req: Request, res: Response) => {
    try {
        const tiers = {
            free: {
                name: 'Free',
                price: 0,
                color: '#a0a0a0',
                features: [
                    '基础AI模型访问',
                    'gemini-2.0-flash, gpt-4o-mini 等',
                    '每月基础Token配额',
                    '社区支持'
                ]
            },
            pro: {
                name: 'Pro',
                price: 29,
                color: '#8b5cf6',
                features: [
                    '所有Free功能',
                    '高级AI模型 (GPT-4o, Claude 3.5 等)',
                    '每月更多Token配额',
                    '优先客服支持',
                    '云端配置同步'
                ]
            },
            ultra: {
                name: 'Ultra',
                price: 99,
                color: '#f59e0b',
                features: [
                    '所有Pro功能',
                    '顶级AI模型 (o1, o3, Claude Opus 等)',
                    '无限Token配额',
                    'VIP专属支持',
                    'MCP服务器链接',
                    '提前体验新功能'
                ]
            }
        };

        res.json(tiers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/profile/bind-phone (placeholder)
 * Reserved for phone binding
 */
router.post('/bind-phone', authMiddleware, async (req: Request, res: Response) => {
    res.status(501).json({ error: '该功能即将推出' });
});

/**
 * POST /api/profile/bind-qq (placeholder)
 * Reserved for QQ binding
 */
router.post('/bind-qq', authMiddleware, async (req: Request, res: Response) => {
    res.status(501).json({ error: '该功能即将推出' });
});

/**
 * POST /api/profile/upgrade (placeholder)
 * Reserved for tier upgrade
 */
router.post('/upgrade', authMiddleware, async (req: Request, res: Response) => {
    res.status(501).json({ error: '升级功能即将推出' });
});

/**
 * GET /api/profile/mcp-link (placeholder)
 * Reserved for MCP server link
 */
router.get('/mcp-link', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        // Check if user is Ultra tier
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT user_tier FROM users WHERE id = ?',
            [userId]
        );

        if (users[0]?.user_tier !== 'ultra') {
            res.status(403).json({ error: 'MCP链接仅对Ultra用户开放' });
            return;
        }

        // Placeholder response
        res.json({
            available: false,
            message: 'MCP链接功能即将推出',
            placeholder: 'mcp://astralinks.xyz/user/{user_id}'
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
