import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

// Generate 12-character split invitation code
const generateSplitCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// ==================================================================================
// USER ENDPOINTS
// ==================================================================================

/**
 * GET /api/split-invitation/enabled
 * Check if split invitation system is enabled
 */
router.get('/enabled', async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT setting_value FROM site_settings WHERE setting_key = ?',
            ['split_invitation_enabled']
        );
        const enabled = rows[0]?.setting_value === 'true';
        res.json({ enabled });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/split-invitation/my-codes
 * Get current user's split invitation codes
 */
router.get('/my-codes', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        // Get user's tree info
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT split_tree_id, split_codes_generated FROM users WHERE id = ?',
            [userId]
        );

        if (!users[0]?.split_tree_id) {
            res.json({ codes: [], canGenerate: false, message: '您不属于分裂邀请系统' });
            return;
        }

        // Get code limit from settings
        const [settings] = await pool.execute<RowDataPacket[]>(
            'SELECT setting_value FROM site_settings WHERE setting_key = ?',
            ['split_invitation_code_limit']
        );
        const limit = parseInt(settings[0]?.setting_value || '2');

        // Get codes created by this user
        const [codes] = await pool.execute<RowDataPacket[]>(
            `SELECT code, is_used, used_at, 
             (SELECT username FROM users WHERE id = used_by_user_id) as used_by_username
             FROM split_invitation_codes 
             WHERE creator_user_id = ? 
             ORDER BY created_at DESC`,
            [userId]
        );

        res.json({
            codes,
            generated: users[0].split_codes_generated,
            limit,
            canGenerate: users[0].split_codes_generated < limit,
            treeId: users[0].split_tree_id
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/split-invitation/generate
 * Generate a new split invitation code
 */
router.post('/generate', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        // Check if system is enabled
        const [enabledSetting] = await pool.execute<RowDataPacket[]>(
            'SELECT setting_value FROM site_settings WHERE setting_key = ?',
            ['split_invitation_enabled']
        );
        if (enabledSetting[0]?.setting_value !== 'true') {
            res.status(400).json({ error: '分裂邀请系统未启用' });
            return;
        }

        // Get user info
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT split_tree_id, split_codes_generated FROM users WHERE id = ?',
            [userId]
        );

        if (!users[0]?.split_tree_id) {
            res.status(400).json({ error: '您不属于分裂邀请系统' });
            return;
        }

        // Check tree banned status
        const [trees] = await pool.execute<RowDataPacket[]>(
            'SELECT is_banned FROM split_invitation_trees WHERE id = ?',
            [users[0].split_tree_id]
        );
        if (trees[0]?.is_banned) {
            res.status(403).json({ error: '您所在的邀请树已被封禁' });
            return;
        }

        // Get code limit
        const [settings] = await pool.execute<RowDataPacket[]>(
            'SELECT setting_value FROM site_settings WHERE setting_key = ?',
            ['split_invitation_code_limit']
        );
        const limit = parseInt(settings[0]?.setting_value || '2');

        if (users[0].split_codes_generated >= limit) {
            res.status(400).json({ error: `您已达到邀请码生成上限 (${limit} 个)` });
            return;
        }

        // Generate unique code
        let code = generateSplitCode();
        let attempts = 0;
        let codeIsUnique = false;
        while (attempts < 10) {
            const [existing] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM split_invitation_codes WHERE code = ?',
                [code]
            );
            if (!existing.length) {
                codeIsUnique = true;
                break;
            }
            code = generateSplitCode();
            attempts++;
        }

        // Final check - if we couldn't generate a unique code after 10 attempts
        if (!codeIsUnique) {
            res.status(500).json({ error: '生成邀请码失败，请稍后重试' });
            return;
        }

        // Insert code
        await pool.execute(
            'INSERT INTO split_invitation_codes (code, tree_id, creator_user_id) VALUES (?, ?, ?)',
            [code, users[0].split_tree_id, userId]
        );

        // Update user's generated count
        await pool.execute(
            'UPDATE users SET split_codes_generated = split_codes_generated + 1 WHERE id = ?',
            [userId]
        );

        res.json({
            code,
            message: '邀请码生成成功',
            remaining: limit - users[0].split_codes_generated - 1
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/split-invitation/validate/:code
 * Validate a split invitation code
 */
router.post('/validate/:code', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;

        const [codes] = await pool.execute<RowDataPacket[]>(
            `SELECT c.*, t.is_banned as tree_banned
             FROM split_invitation_codes c
             JOIN split_invitation_trees t ON c.tree_id = t.id
             WHERE c.code = ?`,
            [code]
        );

        if (!codes.length) {
            res.json({ valid: false, message: '邀请码不存在' });
            return;
        }

        if (codes[0].is_used) {
            res.json({ valid: false, message: '邀请码已被使用' });
            return;
        }

        if (codes[0].tree_banned) {
            res.json({ valid: false, message: '该邀请码所属邀请树已被封禁' });
            return;
        }

        res.json({ valid: true, treeId: codes[0].tree_id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/split-invitation/my-tree
 * Get current user's invitation tree (who they invited, up to 3 levels)
 */
router.get('/my-tree', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        // Get user's tree info first
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT split_tree_id FROM users WHERE id = ?',
            [userId]
        );

        if (!users[0]?.split_tree_id) {
            res.json({ tree: null, message: '您不属于分裂邀请系统' });
            return;
        }

        // Build tree recursively (up to 3 levels)
        const buildTree = async (parentId: number, depth: number): Promise<any[]> => {
            if (depth > 3) return [];

            // Find users invited by this parent
            const [invitees] = await pool.execute<RowDataPacket[]>(`
                SELECT u.id, u.username, u.created_at,
                       (SELECT COUNT(*) FROM split_invitation_codes WHERE creator_user_id = u.id AND is_used = TRUE) as invited_count,
                       (SELECT MAX(created_at) FROM messages WHERE user_id = u.id) as last_active
                FROM users u
                JOIN split_invitation_codes sic ON u.split_code_used = sic.code
                WHERE sic.creator_user_id = ?
                ORDER BY u.created_at ASC
            `, [parentId]);

            const children = [];
            for (const invitee of invitees) {
                const subChildren = await buildTree(invitee.id, depth + 1);
                children.push({
                    userId: invitee.id,
                    username: invitee.username,
                    createdAt: invitee.created_at,
                    lastActive: invitee.last_active,
                    invitedCount: invitee.invited_count,
                    children: subChildren
                });
            }
            return children;
        };

        // Get current user info
        const [currentUser] = await pool.execute<RowDataPacket[]>(`
            SELECT id, username, created_at,
                   (SELECT COUNT(*) FROM split_invitation_codes WHERE creator_user_id = ? AND is_used = TRUE) as invited_count
            FROM users WHERE id = ?
        `, [userId, userId]);

        const tree = {
            userId: currentUser[0].id,
            username: currentUser[0].username,
            createdAt: currentUser[0].created_at,
            invitedCount: currentUser[0].invited_count,
            isCurrentUser: true,
            children: await buildTree(userId, 1)
        };

        // Calculate total descendants
        const countDescendants = (node: any): number => {
            let count = node.children?.length || 0;
            for (const child of (node.children || [])) {
                count += countDescendants(child);
            }
            return count;
        };

        res.json({
            tree,
            totalDescendants: countDescendants(tree),
            treeId: users[0].split_tree_id
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ==================================================================================
// ADMIN ENDPOINTS
// ==================================================================================

/**
 * GET /api/split-invitation/admin/stats
 * Get split invitation system statistics
 */
router.get('/admin/stats', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const [enabledSetting] = await pool.execute<RowDataPacket[]>(
            'SELECT setting_value FROM site_settings WHERE setting_key = ?',
            ['split_invitation_enabled']
        );

        const [treeCount] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM split_invitation_trees'
        );

        const [codeCount] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as total, SUM(is_used) as used FROM split_invitation_codes'
        );

        const [userCount] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM users WHERE split_tree_id IS NOT NULL'
        );

        const [bannedTreeCount] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM split_invitation_trees WHERE is_banned = TRUE'
        );

        const [codeLimitSetting] = await pool.execute<RowDataPacket[]>(
            'SELECT setting_value FROM site_settings WHERE setting_key = ?',
            ['split_invitation_code_limit']
        );

        res.json({
            enabled: enabledSetting[0]?.setting_value === 'true',
            totalTrees: treeCount[0].count,
            bannedTrees: bannedTreeCount[0].count,
            totalCodes: codeCount[0].total || 0,
            usedCodes: codeCount[0].used || 0,
            usersInSystem: userCount[0].count,
            codeLimit: parseInt(codeLimitSetting[0]?.setting_value || '2')
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/split-invitation/admin/trees
 * Get all invitation trees
 */
router.get('/admin/trees', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const [trees] = await pool.execute<RowDataPacket[]>(`
            SELECT t.*, 
                   u.username as created_by_username,
                   (SELECT COUNT(*) FROM users WHERE split_tree_id = t.id) as user_count,
                   (SELECT COUNT(*) FROM split_invitation_codes WHERE tree_id = t.id) as code_count,
                   (SELECT COUNT(*) FROM split_invitation_codes WHERE tree_id = t.id AND is_used = TRUE) as used_code_count
            FROM split_invitation_trees t
            LEFT JOIN users u ON t.created_by_admin_id = u.id
            ORDER BY t.created_at DESC
        `);

        res.json(trees);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/split-invitation/admin/tree/:treeId
 * Get tree details with all users
 */
router.get('/admin/tree/:treeId', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { treeId } = req.params;

        // Get tree info
        const [trees] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM split_invitation_trees WHERE id = ?',
            [treeId]
        );

        if (!trees.length) {
            res.status(404).json({ error: '邀请树不存在' });
            return;
        }

        // Get all users in tree
        const [users] = await pool.execute<RowDataPacket[]>(`
            SELECT u.id, u.username, u.email, u.created_at, u.is_admin,
                   u.split_code_used, u.split_codes_generated,
                   (SELECT username FROM users WHERE id = 
                    (SELECT creator_user_id FROM split_invitation_codes WHERE code = u.split_code_used)
                   ) as invited_by
            FROM users u
            WHERE u.split_tree_id = ?
            ORDER BY u.created_at ASC
        `, [treeId]);

        // Get all codes in tree
        const [codes] = await pool.execute<RowDataPacket[]>(`
            SELECT c.*, 
                   creator.username as creator_username,
                   used_by.username as used_by_username
            FROM split_invitation_codes c
            LEFT JOIN users creator ON c.creator_user_id = creator.id
            LEFT JOIN users used_by ON c.used_by_user_id = used_by.id
            WHERE c.tree_id = ?
            ORDER BY c.created_at ASC
        `, [treeId]);

        res.json({
            tree: trees[0],
            users,
            codes
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/split-invitation/admin/full-tree/:treeId
 * Get full hierarchical tree structure for visualization
 */
router.get('/admin/full-tree/:treeId', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { treeId } = req.params;

        // Get tree info
        const [trees] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM split_invitation_trees WHERE id = ?',
            [treeId]
        );

        if (!trees.length) {
            res.status(404).json({ error: '邀请树不存在' });
            return;
        }

        // Get root code creator (or null if admin-created)
        const [rootCode] = await pool.execute<RowDataPacket[]>(
            'SELECT c.*, u.username as used_by_username FROM split_invitation_codes c LEFT JOIN users u ON c.used_by_user_id = u.id WHERE c.id = ?',
            [trees[0].root_code_id]
        );

        // Build hierarchical tree structure
        interface TreeNode {
            userId: number;
            username: string;
            createdAt: string;
            lastActive: string | null;
            invitedCount: number;
            codeUsed: string | null;
            children: TreeNode[];
        }

        const buildFullTree = async (parentId: number | null, depth: number = 0): Promise<TreeNode[]> => {
            // For root level (no parent), find users who used root codes (creator_user_id IS NULL)
            let query: string;
            let params: any[];

            if (parentId === null) {
                // Root level - find users who used codes with no creator (admin-created root codes)
                query = `
                    SELECT u.id, u.username, u.created_at, u.split_code_used,
                           (SELECT COUNT(*) FROM split_invitation_codes WHERE creator_user_id = u.id AND is_used = TRUE) as invited_count,
                           (SELECT MAX(created_at) FROM messages WHERE user_id = u.id) as last_active
                    FROM users u
                    JOIN split_invitation_codes sic ON u.split_code_used = sic.code
                    WHERE sic.tree_id = ? AND sic.creator_user_id IS NULL
                    ORDER BY u.created_at ASC
                `;
                params = [treeId];
            } else {
                // Normal level - find users invited by parent
                query = `
                    SELECT u.id, u.username, u.created_at, u.split_code_used,
                           (SELECT COUNT(*) FROM split_invitation_codes WHERE creator_user_id = u.id AND is_used = TRUE) as invited_count,
                           (SELECT MAX(created_at) FROM messages WHERE user_id = u.id) as last_active
                    FROM users u
                    JOIN split_invitation_codes sic ON u.split_code_used = sic.code
                    WHERE sic.creator_user_id = ?
                    ORDER BY u.created_at ASC
                `;
                params = [parentId];
            }

            const [invitees] = await pool.execute<RowDataPacket[]>(query, params);

            const children: TreeNode[] = [];
            for (const invitee of invitees) {
                const subChildren = await buildFullTree(invitee.id, depth + 1);
                children.push({
                    userId: invitee.id,
                    username: invitee.username,
                    createdAt: invitee.created_at,
                    lastActive: invitee.last_active,
                    invitedCount: invitee.invited_count,
                    codeUsed: invitee.split_code_used,
                    children: subChildren
                });
            }
            return children;
        };

        // Start building from root
        const rootNodes = await buildFullTree(null);

        // Calculate statistics
        const countAll = (nodes: TreeNode[]): { total: number; maxDepth: number } => {
            let total = nodes.length;
            let maxDepth = nodes.length > 0 ? 1 : 0;
            for (const node of nodes) {
                const sub = countAll(node.children);
                total += sub.total;
                maxDepth = Math.max(maxDepth, sub.maxDepth + 1);
            }
            return { total, maxDepth };
        };

        const stats = countAll(rootNodes);

        res.json({
            treeInfo: trees[0],
            rootCode: rootCode[0] || null,
            tree: rootNodes,
            stats: {
                totalUsers: stats.total,
                maxDepth: stats.maxDepth,
                isBanned: trees[0].is_banned
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/split-invitation/admin/create-root
 * Create a new root invitation code (with 10-day cooldown)
 */
router.post('/admin/create-root', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const adminId = (req as any).user.id;

        // Check cooldown (10 days)
        const [cooldowns] = await pool.execute<RowDataPacket[]>(
            'SELECT last_root_code_created_at FROM admin_split_cooldowns WHERE admin_id = ?',
            [adminId]
        );

        if (cooldowns.length) {
            const lastCreated = new Date(cooldowns[0].last_root_code_created_at);
            const daysSinceCreation = (Date.now() - lastCreated.getTime()) / (1000 * 60 * 60 * 24);

            if (daysSinceCreation < 10) {
                const remainingDays = Math.ceil(10 - daysSinceCreation);
                res.status(400).json({
                    error: `冷却中，还需等待 ${remainingDays} 天`,
                    cooldownRemaining: remainingDays
                });
                return;
            }
        }

        // Create new tree
        const treeId = uuidv4();
        await pool.execute(
            'INSERT INTO split_invitation_trees (id, created_by_admin_id) VALUES (?, ?)',
            [treeId, adminId]
        );

        // Generate root code
        let code = generateSplitCode();
        let attempts = 0;
        let codeIsUnique = false;
        while (attempts < 10) {
            const [existing] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM split_invitation_codes WHERE code = ?',
                [code]
            );
            if (!existing.length) {
                codeIsUnique = true;
                break;
            }
            code = generateSplitCode();
            attempts++;
        }

        // Final check - if we couldn't generate a unique code after 10 attempts
        if (!codeIsUnique) {
            // Rollback tree creation
            await pool.execute('DELETE FROM split_invitation_trees WHERE id = ?', [treeId]);
            res.status(500).json({ error: '生成邀请码失败，请稍后重试' });
            return;
        }

        // Insert root code (no creator_user_id since it's admin-created)
        const [result] = await pool.execute<ResultSetHeader>(
            'INSERT INTO split_invitation_codes (code, tree_id, creator_user_id) VALUES (?, ?, NULL)',
            [code, treeId]
        );

        // Update tree with root code id
        await pool.execute(
            'UPDATE split_invitation_trees SET root_code_id = ? WHERE id = ?',
            [result.insertId, treeId]
        );

        // Update/Insert cooldown
        await pool.execute(
            'INSERT INTO admin_split_cooldowns (admin_id, last_root_code_created_at) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE last_root_code_created_at = NOW()',
            [adminId]
        );

        res.json({
            code,
            treeId,
            message: '根邀请码创建成功',
            nextAvailable: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/split-invitation/admin/ban-tree/:treeId
 * Ban entire invitation tree (collective punishment)
 */
router.post('/admin/ban-tree/:treeId', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { treeId } = req.params;
        const { reason, duration_days, trigger_user_id } = req.body;
        const adminId = (req as any).user.id;

        // Get tree
        const [trees] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM split_invitation_trees WHERE id = ?',
            [treeId]
        );

        if (!trees.length) {
            res.status(404).json({ error: '邀请树不存在' });
            return;
        }

        // Mark tree as banned
        await pool.execute(
            'UPDATE split_invitation_trees SET is_banned = TRUE, banned_reason = ?, banned_at = NOW() WHERE id = ?',
            [reason || '违规封禁', treeId]
        );

        // Get all non-admin users in tree
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM users WHERE split_tree_id = ? AND is_admin = FALSE',
            [treeId]
        );

        const expiresAt = duration_days
            ? new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000)
            : null;
        const banType = duration_days ? 'temporary' : 'permanent';

        // Ban all users
        let bannedCount = 0;
        for (const user of users) {
            const isTriggerer = user.id === trigger_user_id;
            const banReason = isTriggerer ? reason : '连带封禁';

            await pool.execute(
                `INSERT INTO bans (user_id, reason, banned_by_admin_id, ban_type, expires_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [user.id, banReason, adminId, banType, expiresAt]
            );
            bannedCount++;
        }

        res.json({
            message: `已封禁邀请树，共影响 ${bannedCount} 名用户`,
            bannedUsers: bannedCount
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/split-invitation/admin/unban-tree/:treeId
 * Unban entire invitation tree
 */
router.post('/admin/unban-tree/:treeId', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { treeId } = req.params;
        const adminId = (req as any).user.id;

        // Unmark tree
        await pool.execute(
            'UPDATE split_invitation_trees SET is_banned = FALSE, banned_reason = NULL, banned_at = NULL WHERE id = ?',
            [treeId]
        );

        // Lift all bans for users in tree
        const [result] = await pool.execute<ResultSetHeader>(`
            UPDATE bans b
            JOIN users u ON b.user_id = u.id
            SET b.is_active = FALSE, b.lifted_at = NOW(), b.lifted_by_admin_id = ?
            WHERE u.split_tree_id = ? AND b.is_active = TRUE
        `, [adminId, treeId]);

        res.json({
            message: `已解封邀请树，共解封 ${result.affectedRows} 个封禁记录`,
            unbannedCount: result.affectedRows
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/split-invitation/admin/unban-user/:userId
 * Unban single user (but tree remains banned)
 */
router.post('/admin/unban-user/:userId', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const adminId = (req as any).user.id;

        await pool.execute(`
            UPDATE bans 
            SET is_active = FALSE, lifted_at = NOW(), lifted_by_admin_id = ?
            WHERE user_id = ? AND is_active = TRUE
        `, [adminId, userId]);

        res.json({ message: '用户封禁已解除' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/split-invitation/admin/toggle
 * Enable/disable split invitation system
 */
router.put('/admin/toggle', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { enabled } = req.body;

        await pool.execute(
            'UPDATE site_settings SET setting_value = ? WHERE setting_key = ?',
            [enabled ? 'true' : 'false', 'split_invitation_enabled']
        );

        res.json({ enabled, message: enabled ? '分裂邀请系统已启用' : '分裂邀请系统已禁用' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/split-invitation/admin/settings
 * Update split invitation settings
 */
router.put('/admin/settings', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { code_limit } = req.body;

        if (code_limit !== undefined) {
            await pool.execute(
                'UPDATE site_settings SET setting_value = ? WHERE setting_key = ?',
                [String(code_limit), 'split_invitation_code_limit']
            );
        }

        res.json({ message: '设置已更新' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/split-invitation/admin/cooldown
 * Get admin's cooldown status
 */
router.get('/admin/cooldown', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const adminId = (req as any).user.id;

        const [cooldowns] = await pool.execute<RowDataPacket[]>(
            'SELECT last_root_code_created_at FROM admin_split_cooldowns WHERE admin_id = ?',
            [adminId]
        );

        if (!cooldowns.length) {
            res.json({ canCreate: true, remainingDays: 0 });
            return;
        }

        const lastCreated = new Date(cooldowns[0].last_root_code_created_at);
        const daysSinceCreation = (Date.now() - lastCreated.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceCreation >= 10) {
            res.json({ canCreate: true, remainingDays: 0 });
        } else {
            res.json({
                canCreate: false,
                remainingDays: Math.ceil(10 - daysSinceCreation),
                lastCreated: cooldowns[0].last_root_code_created_at
            });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
