import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

const router = Router();

// ==================== ADMIN ROUTES ====================

/**
 * GET /api/announcements/admin/list
 * Admin lists all announcements
 */
router.get('/admin/list', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const [announcements] = await pool.execute<RowDataPacket[]>(
            `SELECT a.*, u.username as created_by_username
             FROM announcements a
             LEFT JOIN users u ON a.created_by = u.id
             ORDER BY a.created_at DESC`
        );

        res.json({ announcements });
    } catch (error: any) {
        console.error('List announcements error:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

/**
 * POST /api/announcements/admin/create
 * Admin creates an announcement
 */
router.post('/admin/create', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const adminId = (req as any).user.id;
        const {
            title, content, content_type = 'markdown',
            display_type = 'global', priority = 'normal',
            is_active = true, start_time, end_time, target_user_ids
        } = req.body;

        if (!title || !content) {
            res.status(400).json({ error: 'Title and content are required' });
            return;
        }

        const [result] = await pool.execute<ResultSetHeader>(
            `INSERT INTO announcements 
             (title, content, content_type, display_type, priority, is_active, start_time, end_time, target_user_ids, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, content, content_type, display_type, priority, is_active,
                start_time || null, end_time || null,
                target_user_ids ? JSON.stringify(target_user_ids) : null, adminId]
        );

        res.json({ message: 'Announcement created', id: result.insertId });
    } catch (error: any) {
        console.error('Create announcement error:', error);
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

/**
 * PUT /api/announcements/admin/:id
 * Admin updates an announcement
 */
router.put('/admin/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const {
            title, content, content_type, display_type, priority,
            is_active, start_time, end_time, target_user_ids
        } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (content !== undefined) { updates.push('content = ?'); values.push(content); }
        if (content_type !== undefined) { updates.push('content_type = ?'); values.push(content_type); }
        if (display_type !== undefined) { updates.push('display_type = ?'); values.push(display_type); }
        if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
        if (start_time !== undefined) { updates.push('start_time = ?'); values.push(start_time || null); }
        if (end_time !== undefined) { updates.push('end_time = ?'); values.push(end_time || null); }
        if (target_user_ids !== undefined) {
            updates.push('target_user_ids = ?');
            values.push(target_user_ids ? JSON.stringify(target_user_ids) : null);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        values.push(id);

        await pool.execute(
            `UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        res.json({ message: 'Announcement updated' });
    } catch (error: any) {
        console.error('Update announcement error:', error);
        res.status(500).json({ error: 'Failed to update announcement' });
    }
});

/**
 * DELETE /api/announcements/admin/:id
 * Admin deletes an announcement
 */
router.delete('/admin/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await pool.execute('DELETE FROM announcements WHERE id = ?', [id]);

        res.json({ message: 'Announcement deleted' });
    } catch (error: any) {
        console.error('Delete announcement error:', error);
        res.status(500).json({ error: 'Failed to delete announcement' });
    }
});

// ==================== PUBLIC ROUTES ====================

/**
 * GET /api/announcements/active
 * Get active announcements for current user
 */
router.get('/active', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const displayType = req.query.type as string || 'global'; // global, login, register

        // Use UTC_TIMESTAMP for timezone-independent comparison
        let query = `
            SELECT a.* FROM announcements a
            WHERE a.is_active = TRUE
            AND (a.start_time IS NULL OR a.start_time <= NOW())
            AND (a.end_time IS NULL OR a.end_time > NOW())
            AND (
                a.display_type = ? 
                OR a.display_type = 'global'
                OR (a.display_type = 'targeted' AND JSON_CONTAINS(a.target_user_ids, CAST(? AS JSON)))
            )
        `;

        // Exclude already read announcements if user is logged in
        if (userId) {
            query += ` AND NOT EXISTS (
                SELECT 1 FROM user_announcement_reads uar 
                WHERE uar.announcement_id = a.id AND uar.user_id = ?
            )`;
        }

        query += ` ORDER BY 
            CASE a.priority 
                WHEN 'critical' THEN 1
                WHEN 'urgent' THEN 1 
                WHEN 'high' THEN 2 
                WHEN 'normal' THEN 3 
                WHEN 'low' THEN 4 
            END,
            a.created_at DESC`;

        const params = userId ? [displayType, userId, userId] : [displayType, null];
        const [announcements] = await pool.execute<RowDataPacket[]>(query, params);

        // Debug log
        console.log(`[Announcements] Active query for user ${userId}, type: ${displayType}, found: ${(announcements as any[]).length} announcements`);

        res.json({ announcements });
    } catch (error: any) {
        console.error('Get active announcements error:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

/**
 * POST /api/announcements/:id/read
 * Mark announcement as read
 */
router.post('/:id/read', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        await pool.execute(
            `INSERT IGNORE INTO user_announcement_reads (user_id, announcement_id) VALUES (?, ?)`,
            [userId, id]
        );

        res.json({ message: 'Marked as read' });
    } catch (error: any) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

/**
 * GET /api/announcements/public
 * Get announcements without auth (for register page)
 */
router.get('/public', async (req: Request, res: Response) => {
    try {
        const displayType = req.query.type as string || 'register';

        const [announcements] = await pool.execute<RowDataPacket[]>(
            `SELECT id, title, content, content_type, priority FROM announcements
             WHERE is_active = TRUE
             AND display_type = ?
             AND (start_time IS NULL OR start_time <= NOW())
             AND (end_time IS NULL OR end_time > NOW())
             ORDER BY priority DESC, created_at DESC
             LIMIT 5`,
            [displayType]
        );

        res.json({ announcements });
    } catch (error: any) {
        console.error('Get public announcements error:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

export default router;
