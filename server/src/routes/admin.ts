import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware as authenticateToken, adminMiddleware as isAdmin } from '../middleware/auth';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

const router = Router();

// Apply authentication and admin check to all routes
router.use(authenticateToken, isAdmin);

// Helper: Get client IP address
function getClientIP(req: Request): string {
    // Check various headers for the real IP (when behind proxy/nginx)
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];

    let ip: string | undefined;

    if (forwardedFor) {
        // X-Forwarded-For can contain multiple IPs, take the first one
        ip = Array.isArray(forwardedFor)
            ? forwardedFor[0].split(',')[0].trim()
            : forwardedFor.split(',')[0].trim();
    } else if (realIP) {
        ip = Array.isArray(realIP) ? realIP[0] : realIP;
    } else {
        ip = req.ip || req.socket.remoteAddress;
    }

    // Normalize IPv6 loopback to localhost
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
        ip = '127.0.0.1 (localhost)';
    } else if (ip?.startsWith('::ffff:')) {
        // Convert IPv4-mapped IPv6 to IPv4
        ip = ip.substring(7);
    }

    return ip || 'unknown';
}

// Helper: Log admin actions
async function logAdminAction(
    adminId: number,
    actionType: string,
    targetType: string | null,
    targetId: number | null,
    details: any,
    ipAddress: string
) {
    await pool.execute(
        'INSERT INTO admin_logs (admin_id, action_type, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, actionType, targetType, targetId, JSON.stringify(details), ipAddress]
    );
}

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const [totalUsersResult] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM users'
        );
        const totalUsers = totalUsersResult[0]?.count || 0;

        const [todayUsersResult] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURDATE()'
        );
        const todayNewUsers = todayUsersResult[0]?.count || 0;

        const [totalCodesResult] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as total, SUM(is_used) as used FROM invitation_codes'
        );
        const invitationStats = totalCodesResult[0] || { total: 0, used: 0 };

        const [pendingReportsResult] = await pool.execute<RowDataPacket[]>(
            "SELECT COUNT(*) as count FROM reports WHERE status = 'pending'"
        );
        const pendingReports = pendingReportsResult[0]?.count || 0;

        const [activeBansResult] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM bans WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())'
        );
        const activeBans = activeBansResult[0]?.count || 0;

        res.json({
            totalUsers,
            todayNewUsers,
            invitationCodes: {
                total: invitationStats.total || 0,
                used: invitationStats.used || 0,
                usageRate: invitationStats.total > 0 ? ((invitationStats.used / invitationStats.total) * 100).toFixed(1) : '0.0'
            },
            pendingReports,
            activeBans
        });
    } catch (error: any) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

/**
 * GET /api/admin/users
 * List users with pagination and search
 */
router.get('/users', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const search = req.query.search as string || '';
        const offset = (page - 1) * limit;

        let query = 'SELECT u.*, GROUP_CONCAT(b.id) as active_ban_ids FROM users u LEFT JOIN bans b ON u.id = b.user_id AND b.is_active = TRUE AND (b.expires_at IS NULL OR b.expires_at > NOW())';
        const params: any[] = [];

        if (search) {
            query += ' WHERE (u.username LIKE ? OR u.email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const [users] = await pool.execute<RowDataPacket[]>(query, params);

        // Count total
        let countQuery = 'SELECT COUNT(*) as total FROM users';
        let countParams: any[] = [];
        if (search) {
            countQuery += ' WHERE username LIKE ? OR email LIKE ?';
            countParams = [`%${search}%`, `%${search}%`];
        }
        const [countResult] = await pool.execute<RowDataPacket[]>(countQuery, countParams);
        const total = countResult[0]?.total || 0;

        res.json({
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        console.error('List users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * GET /api/admin/users/:id
 * Get user details
 */
router.get('/users/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );

        if (users.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Get bans
        const [bans] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM bans WHERE user_id = ? ORDER BY created_at DESC',
            [id]
        );

        // Get reports as reporter
        const [reportsAsReporter] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM reports WHERE reporter_user_id = ? ORDER BY created_at DESC LIMIT 10',
            [id]
        );

        // Get reports as reported
        const [reportsAsReported] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM reports WHERE reported_user_id = ? ORDER BY created_at DESC LIMIT 10',
            [id]
        );

        res.json({
            user: users[0],
            bans,
            reportsAsReporter,
            reportsAsReported
        });
    } catch (error: any) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

/**
 * PATCH /api/admin/users/:id
 * Update user
 */
router.patch('/users/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { is_admin, email } = req.body;
        const adminId = (req as any).user.id;

        const updates: string[] = [];
        const params: any[] = [];

        if (typeof is_admin === 'boolean') {
            updates.push('is_admin = ?');
            params.push(is_admin);
        }
        if (email) {
            updates.push('email = ?');
            params.push(email);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No valid fields to update' });
            return;
        }

        params.push(id);

        await pool.execute(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            params
        );

        await logAdminAction(adminId, 'UPDATE_USER', 'user', parseInt(id), req.body, getClientIP(req));

        res.json({ message: 'User updated successfully' });
    } catch (error: any) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * PUT /api/admin/users/:id/tier
 * Update user tier with required reason
 */
router.put('/users/:id/tier', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { new_tier, reason } = req.body;
        const adminId = (req as any).user.id;

        // Validate inputs
        if (!new_tier || !['free', 'pro', 'ultra'].includes(new_tier)) {
            res.status(400).json({ error: '无效的等级' });
            return;
        }
        if (!reason || reason.trim().length < 5) {
            res.status(400).json({ error: '请提供至少5个字符的变更理由' });
            return;
        }

        // Get current user tier
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT username, user_tier FROM users WHERE id = ?',
            [id]
        );

        if (users.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        const oldTier = users[0].user_tier || 'free';
        const username = users[0].username;

        if (oldTier === new_tier) {
            res.status(400).json({ error: '新等级与当前等级相同' });
            return;
        }

        // Update user tier
        await pool.execute(
            'UPDATE users SET user_tier = ? WHERE id = ?',
            [new_tier, id]
        );

        // Log the tier change
        await pool.execute(
            'INSERT INTO user_tier_changes (user_id, admin_id, old_tier, new_tier, reason) VALUES (?, ?, ?, ?, ?)',
            [id, adminId, oldTier, new_tier, reason.trim()]
        );

        // Log admin action
        await logAdminAction(adminId, 'CHANGE_USER_TIER', 'user', parseInt(id), {
            username,
            old_tier: oldTier,
            new_tier,
            reason: reason.trim()
        }, getClientIP(req));

        res.json({
            message: `用户 ${username} 的等级已从 ${oldTier} 变更为 ${new_tier}`,
            old_tier: oldTier,
            new_tier
        });
    } catch (error: any) {
        console.error('Change user tier error:', error);
        res.status(500).json({ error: 'Failed to change user tier' });
    }
});

/**
 * GET /api/admin/users/:id/tier-history
 * Get user's tier change history
 */
router.get('/users/:id/tier-history', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const [history] = await pool.execute<RowDataPacket[]>(
            `SELECT tc.*, u.username as admin_username
             FROM user_tier_changes tc
             LEFT JOIN users u ON tc.admin_id = u.id
             WHERE tc.user_id = ?
             ORDER BY tc.created_at DESC`,
            [id]
        );

        res.json(history);
    } catch (error: any) {
        console.error('Get tier history error:', error);
        res.status(500).json({ error: 'Failed to fetch tier history' });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user (with undo support)
 */
router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const adminId = (req as any).user.id;
        const undoWindow = 60; // 60 seconds to undo

        if (parseInt(id) === adminId) {
            res.status(400).json({ error: 'Cannot delete your own account' });
            return;
        }

        // Get user data before deletion for potential restore
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );

        if (users.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const userData = users[0];

        // Delete the user
        await pool.execute('DELETE FROM users WHERE id = ?', [id]);

        // Create pending operation for undo
        const undoExpiry = new Date();
        undoExpiry.setSeconds(undoExpiry.getSeconds() + undoWindow);

        await pool.execute(
            `INSERT INTO pending_operations (admin_id, operation_type, target_type, target_id, target_data, expires_at)
             VALUES (?, 'DELETE_USER', 'user', ?, ?, ?)`,
            [adminId, parseInt(id), JSON.stringify(userData), undoExpiry]
        );

        await logAdminAction(adminId, 'DELETE_USER', 'user', parseInt(id), { username: userData.username }, getClientIP(req));

        res.json({
            message: 'User deleted successfully',
            undoAvailableFor: undoWindow + ' seconds'
        });
    } catch (error: any) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * GET /api/admin/invitation-codes
 * List invitation codes
 */
router.get('/invitation-codes', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const filter = req.query.filter as string; // 'used' | 'unused' | 'all'
        const offset = (page - 1) * limit;

        let query = 'SELECT ic.*, u.username as used_by_username FROM invitation_codes ic LEFT JOIN users u ON ic.used_by_user_id = u.id';
        const params: any[] = [];

        if (filter === 'used') {
            query += ' WHERE ic.is_used = TRUE';
        } else if (filter === 'unused') {
            query += ' WHERE ic.is_used = FALSE';
        }

        query += ` ORDER BY ic.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const [codes] = await pool.execute<RowDataPacket[]>(query, params);

        res.json({ codes });
    } catch (error: any) {
        console.error('List codes error:', error);
        res.status(500).json({ error: 'Failed to fetch invitation codes' });
    }
});

/**
 * POST /api/admin/invitation-codes/generate
 * Generate invitation codes
 */
router.post('/invitation-codes/generate', async (req: Request, res: Response) => {
    try {
        const { count = 10 } = req.body;
        const adminId = (req as any).user.id;

        if (count < 1 || count > 100) {
            res.status(400).json({ error: 'Count must be between 1 and 100' });
            return;
        }

        const codes: string[] = [];
        for (let i = 0; i < count; i++) {
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            codes.push(code);
        }

        const values = codes.map(code => [code]);
        await pool.query('INSERT INTO invitation_codes (code) VALUES ?', [values]);

        await logAdminAction(adminId, 'GENERATE_CODES', 'invitation_codes', null, { count, codes }, getClientIP(req));

        res.json({ message: `${count} invitation codes generated`, codes });
    } catch (error: any) {
        console.error('Generate codes error:', error);
        res.status(500).json({ error: 'Failed to generate codes' });
    }
});

/**
 * DELETE /api/admin/invitation-codes/:id
 * Delete invitation code (with undo support)
 */
router.delete('/invitation-codes/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const adminId = (req as any).user.id;
        const undoWindow = 30; // 30 seconds to undo

        // Get code data before deletion
        const [codes] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM invitation_codes WHERE id = ?',
            [id]
        );

        if (codes.length === 0) {
            res.status(404).json({ error: 'Invitation code not found' });
            return;
        }

        const codeData = codes[0];

        await pool.execute('DELETE FROM invitation_codes WHERE id = ?', [id]);

        // Create pending operation for undo
        const undoExpiry = new Date();
        undoExpiry.setSeconds(undoExpiry.getSeconds() + undoWindow);

        await pool.execute(
            `INSERT INTO pending_operations (admin_id, operation_type, target_type, target_id, target_data, expires_at)
             VALUES (?, 'DELETE_CODE', 'invitation_code', ?, ?, ?)`,
            [adminId, parseInt(id), JSON.stringify(codeData), undoExpiry]
        );

        await logAdminAction(adminId, 'DELETE_CODE', 'invitation_code', parseInt(id), { code: codeData.code }, getClientIP(req));

        res.json({
            message: 'Invitation code deleted',
            undoAvailableFor: undoWindow + ' seconds'
        });
    } catch (error: any) {
        console.error('Delete code error:', error);
        res.status(500).json({ error: 'Failed to delete code' });
    }
});

/**
 * GET /api/admin/reports
 * List reports
 */
router.get('/reports', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as string; // 'pending' | 'reviewing' | 'resolved' | 'dismissed'
        const offset = (page - 1) * limit;

        let query = `
      SELECT r.*, 
        reporter.username as reporter_username,
        reported.username as reported_username,
        admin.username as resolved_by_username
      FROM reports r
      LEFT JOIN users reporter ON r.reporter_user_id = reporter.id
      LEFT JOIN users reported ON r.reported_user_id = reported.id
      LEFT JOIN users admin ON r.resolved_by_admin_id = admin.id
    `;
        const params: any[] = [];

        if (status) {
            query += ' WHERE r.status = ?';
            params.push(status);
        }

        query += ` ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const [reports] = await pool.execute<RowDataPacket[]>(query, params);

        res.json({ reports });
    } catch (error: any) {
        console.error('List reports error:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

/**
 * GET /api/admin/reports/:id
 * Get report details
 */
router.get('/reports/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const [reports] = await pool.execute<RowDataPacket[]>(
            `SELECT r.*, 
        reporter.username as reporter_username, reporter.email as reporter_email,
        reported.username as reported_username, reported.email as reported_email,
        admin.username as resolved_by_username
      FROM reports r
      LEFT JOIN users reporter ON r.reporter_user_id = reporter.id
      LEFT JOIN users reported ON r.reported_user_id = reported.id
      LEFT JOIN users admin ON r.resolved_by_admin_id = admin.id
      WHERE r.id = ?`,
            [id]
        );

        if (reports.length === 0) {
            res.status(404).json({ error: 'Report not found' });
            return;
        }

        res.json(reports[0]);
    } catch (error: any) {
        console.error('Get report error:', error);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

/**
 * PATCH /api/admin/reports/:id/status
 * Update report status
 */
router.patch('/reports/:id/status', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, admin_notes } = req.body;
        const adminId = (req as any).user.id;

        if (!['pending', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
            res.status(400).json({ error: 'Invalid status' });
            return;
        }

        const isResolved = status === 'resolved' || status === 'dismissed';

        await pool.execute(
            `UPDATE reports SET status = ?, admin_notes = ?, resolved_by_admin_id = ?, resolved_at = ? WHERE id = ?`,
            [status, admin_notes || null, isResolved ? adminId : null, isResolved ? new Date() : null, id]
        );

        await logAdminAction(adminId, 'UPDATE_REPORT_STATUS', 'report', parseInt(id), { status, admin_notes }, getClientIP(req));

        res.json({ message: 'Report status updated' });
    } catch (error: any) {
        console.error('Update report status error:', error);
        res.status(500).json({ error: 'Failed to update report status' });
    }
});

/**
 * GET /api/admin/bans
 * List bans
 */
router.get('/bans', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const active = req.query.active === 'true';
        const offset = (page - 1) * limit;

        let query = `
      SELECT b.*, 
        u.username as user_username,
        admin.username as banned_by_username,
        lifter.username as lifted_by_username
      FROM bans b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN users admin ON b.banned_by_admin_id = admin.id
      LEFT JOIN users lifter ON b.lifted_by_admin_id = lifter.id
    `;
        const params: any[] = [];

        if (active) {
            query += ' WHERE b.is_active = TRUE AND (b.expires_at IS NULL OR b.expires_at > NOW())';
        }

        query += ` ORDER BY b.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const [bans] = await pool.execute<RowDataPacket[]>(query, params);

        res.json({ bans });
    } catch (error: any) {
        console.error('List bans error:', error);
        res.status(500).json({ error: 'Failed to fetch bans' });
    }
});

/**
 * POST /api/admin/bans
 * Create ban
 */
router.post('/bans', async (req: Request, res: Response) => {
    try {
        const { user_id, reason, ban_type, duration_days } = req.body;
        const adminId = (req as any).user.id;

        if (!user_id || !reason || !ban_type) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        if (!['temporary', 'permanent'].includes(ban_type)) {
            res.status(400).json({ error: 'Invalid ban type' });
            return;
        }

        let expires_at = null;
        if (ban_type === 'temporary' && duration_days) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + parseInt(duration_days));
            expires_at = expiryDate;
        }

        const [result] = await pool.execute<ResultSetHeader>(
            'INSERT INTO bans (user_id, reason, banned_by_admin_id, ban_type, expires_at) VALUES (?, ?, ?, ?, ?)',
            [user_id, reason, adminId, ban_type, expires_at]
        );

        await logAdminAction(adminId, 'CREATE_BAN', 'ban', result.insertId, { user_id, reason, ban_type, duration_days }, getClientIP(req));

        res.json({ message: 'Ban created successfully', banId: result.insertId });
    } catch (error: any) {
        console.error('Create ban error:', error);
        res.status(500).json({ error: 'Failed to create ban' });
    }
});

/**
 * PATCH /api/admin/bans/:id/lift
 * Lift ban
 */
router.patch('/bans/:id/lift', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const adminId = (req as any).user.id;

        await pool.execute(
            'UPDATE bans SET is_active = FALSE, lifted_at = NOW(), lifted_by_admin_id = ? WHERE id = ?',
            [adminId, id]
        );

        await logAdminAction(adminId, 'LIFT_BAN', 'ban', parseInt(id), {}, getClientIP(req));

        res.json({ message: 'Ban lifted successfully' });
    } catch (error: any) {
        console.error('Lift ban error:', error);
        res.status(500).json({ error: 'Failed to lift ban' });
    }
});

/**
 * DELETE /api/admin/bans/:id
 * Delete ban record
 */
router.delete('/bans/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const adminId = (req as any).user.id;

        await pool.execute('DELETE FROM bans WHERE id = ?', [id]);

        await logAdminAction(adminId, 'DELETE_BAN', 'ban', parseInt(id), {}, getClientIP(req));

        res.json({ message: 'Ban record deleted' });
    } catch (error: any) {
        console.error('Delete ban error:', error);
        res.status(500).json({ error: 'Failed to delete ban' });
    }
});

/**
 * GET /api/admin/logs
 * List admin logs
 */
router.get('/logs', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;

        const [logs] = await pool.execute<RowDataPacket[]>(
            `SELECT al.*, u.username as admin_username
      FROM admin_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`
        );

        res.json({ logs });
    } catch (error: any) {
        console.error('List logs error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// ==================== PENDING OPERATIONS (UNDO) ====================

/**
 * GET /api/admin/pending-operations
 * List pending operations that can be cancelled
 */
router.get('/pending-operations', async (req: Request, res: Response) => {
    try {
        const [operations] = await pool.execute<RowDataPacket[]>(
            `SELECT po.*, u.username as admin_username 
             FROM pending_operations po 
             LEFT JOIN users u ON po.admin_id = u.id 
             WHERE po.executed = FALSE AND po.cancelled = FALSE AND po.expires_at > NOW()
             ORDER BY po.created_at DESC`
        );

        res.json({ operations });
    } catch (error: any) {
        console.error('List pending operations error:', error);
        res.status(500).json({ error: 'Failed to fetch pending operations' });
    }
});

/**
 * POST /api/admin/pending-operations/:id/cancel
 * Cancel a pending operation (undo)
 */
router.post('/pending-operations/:id/cancel', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const adminId = (req as any).user.id;

        // Get operation details
        const [ops] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM pending_operations WHERE id = ? AND executed = FALSE AND cancelled = FALSE',
            [id]
        );

        if (ops.length === 0) {
            res.status(404).json({ error: 'Operation not found or already processed' });
            return;
        }

        const operation = ops[0];

        // Mark as cancelled
        await pool.execute(
            'UPDATE pending_operations SET cancelled = TRUE WHERE id = ?',
            [id]
        );

        // Reverse the operation based on type
        if (operation.operation_type === 'CREATE_BAN') {
            // Delete the ban that was created
            await pool.execute('DELETE FROM bans WHERE id = ?', [operation.target_id]);
        } else if (operation.operation_type === 'DELETE_USER') {
            // Restore user from target_data
            const userData = typeof operation.target_data === 'string'
                ? JSON.parse(operation.target_data)
                : operation.target_data;

            await pool.execute(
                `INSERT INTO users (id, username, email, password_hash, is_admin, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userData.id, userData.username, userData.email, userData.password_hash, userData.is_admin, userData.created_at]
            );
        } else if (operation.operation_type === 'DELETE_CODE') {
            // Restore invitation code from target_data
            const codeData = typeof operation.target_data === 'string'
                ? JSON.parse(operation.target_data)
                : operation.target_data;

            // Helper to format date for MySQL
            const formatDate = (d: any) => {
                if (!d) return null;
                const date = new Date(d);
                return date.toISOString().slice(0, 19).replace('T', ' ');
            };

            await pool.execute(
                `INSERT INTO invitation_codes (id, code, is_used, used_by_user_id, used_device_fingerprint, created_at, used_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [codeData.id, codeData.code, codeData.is_used || false, codeData.used_by_user_id || null,
                codeData.used_device_fingerprint || null, formatDate(codeData.created_at), formatDate(codeData.used_at)]
            );
        }

        await logAdminAction(adminId, 'UNDO_OPERATION', 'pending_operation', parseInt(id),
            { original_type: operation.operation_type, target_id: operation.target_id }, getClientIP(req));

        res.json({ message: 'Operation cancelled successfully' });
    } catch (error: any) {
        console.error('Cancel operation error:', error);
        res.status(500).json({ error: 'Failed to cancel operation' });
    }
});

/**
 * Modified ban creation to support undo
 */
router.post('/bans/with-undo', async (req: Request, res: Response) => {
    try {
        const { user_id, reason, ban_type, duration_days, undo_window = 30 } = req.body;
        const adminId = (req as any).user.id;

        if (!user_id || !reason || !ban_type) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        if (!['temporary', 'permanent'].includes(ban_type)) {
            res.status(400).json({ error: 'Invalid ban type' });
            return;
        }

        let expires_at = null;
        if (ban_type === 'temporary' && duration_days) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + duration_days);
            expires_at = expiryDate;
        }

        // Create the ban
        const [result] = await pool.execute<ResultSetHeader>(
            'INSERT INTO bans (user_id, reason, banned_by_admin_id, ban_type, expires_at) VALUES (?, ?, ?, ?, ?)',
            [user_id, reason, adminId, ban_type, expires_at]
        );

        // Create pending operation for undo
        const undoExpiry = new Date();
        undoExpiry.setSeconds(undoExpiry.getSeconds() + undo_window);

        await pool.execute(
            `INSERT INTO pending_operations (admin_id, operation_type, target_type, target_id, target_data, expires_at)
             VALUES (?, 'CREATE_BAN', 'ban', ?, ?, ?)`,
            [adminId, result.insertId, JSON.stringify({ user_id, reason, ban_type, duration_days }), undoExpiry]
        );

        await logAdminAction(adminId, 'CREATE_BAN', 'ban', result.insertId,
            { user_id, reason, ban_type, duration_days }, getClientIP(req));

        res.json({
            message: 'Ban created successfully',
            banId: result.insertId,
            undoAvailableFor: undo_window + ' seconds'
        });
    } catch (error: any) {
        console.error('Create ban with undo error:', error);
        res.status(500).json({ error: 'Failed to create ban' });
    }
});

export default router;
