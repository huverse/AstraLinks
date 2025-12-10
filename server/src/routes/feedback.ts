import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /api/feedback
 * User submits feedback (authenticated)
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { content, category = 'other', priority = 'normal', attachments } = req.body;

        if (!content || content.trim().length === 0) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        // Create new thread or use existing
        const thread_id = uuidv4();

        const [result] = await pool.execute<ResultSetHeader>(
            `INSERT INTO feedback_messages (thread_id, user_id, content, category, priority, attachments) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [thread_id, userId, content, category, priority, attachments ? JSON.stringify(attachments) : null]
        );

        res.json({
            message: 'Feedback submitted successfully',
            thread_id,
            message_id: result.insertId
        });
    } catch (error: any) {
        console.error('Submit feedback error:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

/**
 * POST /api/feedback/thread/:threadId
 * User replies to existing thread
 */
router.post('/thread/:threadId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { threadId } = req.params;
        const { content, attachments } = req.body;

        if (!content || content.trim().length === 0) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        // Verify user owns this thread
        const [existing] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM feedback_messages WHERE thread_id = ? AND user_id = ? LIMIT 1',
            [threadId, userId]
        );

        if (existing.length === 0) {
            res.status(403).json({ error: 'Access denied to this thread' });
            return;
        }

        const [result] = await pool.execute<ResultSetHeader>(
            `INSERT INTO feedback_messages (thread_id, user_id, content, attachments, is_from_admin) 
             VALUES (?, ?, ?, ?, FALSE)`,
            [threadId, userId, content, attachments ? JSON.stringify(attachments) : null]
        );

        res.json({ message: 'Reply sent', message_id: result.insertId });
    } catch (error: any) {
        console.error('Reply to thread error:', error);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

/**
 * GET /api/feedback/threads
 * User gets their feedback threads
 */
router.get('/threads', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const [threads] = await pool.execute<RowDataPacket[]>(
            `SELECT 
                thread_id,
                MAX(created_at) as last_message_at,
                MIN(created_at) as first_message_at,
                COUNT(*) as message_count,
                SUM(CASE WHEN is_from_admin = TRUE AND is_read = FALSE THEN 1 ELSE 0 END) as unread_count,
                MAX(category) as category,
                MAX(priority) as priority
             FROM feedback_messages 
             WHERE user_id = ?
             GROUP BY thread_id
             ORDER BY last_message_at DESC`,
            [userId]
        );

        res.json({ threads });
    } catch (error: any) {
        console.error('Get threads error:', error);
        res.status(500).json({ error: 'Failed to fetch threads' });
    }
});

/**
 * GET /api/feedback/thread/:threadId
 * Get messages in a thread
 */
router.get('/thread/:threadId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { threadId } = req.params;

        // Get first message to verify ownership
        const [first] = await pool.execute<RowDataPacket[]>(
            'SELECT user_id FROM feedback_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 1',
            [threadId]
        );

        if (first.length === 0 || first[0].user_id !== userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        const [messages] = await pool.execute<RowDataPacket[]>(
            `SELECT fm.*, u.username as admin_username
             FROM feedback_messages fm
             LEFT JOIN users u ON fm.admin_id = u.id
             WHERE fm.thread_id = ?
             ORDER BY fm.created_at ASC`,
            [threadId]
        );

        // Mark admin messages as read
        await pool.execute(
            'UPDATE feedback_messages SET is_read = TRUE WHERE thread_id = ? AND is_from_admin = TRUE',
            [threadId]
        );

        res.json({ messages });
    } catch (error: any) {
        console.error('Get thread messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// ==================== ADMIN ROUTES ====================

/**
 * GET /api/feedback/admin/all
 * Admin gets all feedback threads
 */
router.get('/admin/all', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as string; // 'unread' | 'all'
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                fm.thread_id,
                fm.user_id,
                u.username,
                MAX(fm.created_at) as last_message_at,
                MIN(fm.created_at) as first_message_at,
                COUNT(*) as message_count,
                SUM(CASE WHEN fm.is_from_admin = FALSE AND fm.is_read = FALSE THEN 1 ELSE 0 END) as unread_from_user,
                MAX(fm.category) as category,
                MAX(fm.priority) as priority,
                (SELECT content FROM feedback_messages WHERE thread_id = fm.thread_id ORDER BY created_at DESC LIMIT 1) as last_message
            FROM feedback_messages fm
            LEFT JOIN users u ON fm.user_id = u.id
        `;

        if (status === 'unread') {
            query += ` WHERE EXISTS (
                SELECT 1 FROM feedback_messages fm2 
                WHERE fm2.thread_id = fm.thread_id AND fm2.is_from_admin = FALSE AND fm2.is_read = FALSE
            )`;
        }

        query += ` GROUP BY fm.thread_id, fm.user_id, u.username
                   ORDER BY last_message_at DESC
                   LIMIT ${limit} OFFSET ${offset}`;

        const [threads] = await pool.execute<RowDataPacket[]>(query);

        res.json({ threads });
    } catch (error: any) {
        console.error('Admin get threads error:', error);
        res.status(500).json({ error: 'Failed to fetch threads' });
    }
});

/**
 * GET /api/feedback/admin/thread/:threadId
 * Admin views a thread
 */
router.get('/admin/thread/:threadId', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { threadId } = req.params;

        const [messages] = await pool.execute<RowDataPacket[]>(
            `SELECT fm.*, u.username as user_username, a.username as admin_username
             FROM feedback_messages fm
             LEFT JOIN users u ON fm.user_id = u.id
             LEFT JOIN users a ON fm.admin_id = a.id
             WHERE fm.thread_id = ?
             ORDER BY fm.created_at ASC`,
            [threadId]
        );

        // Mark user messages as read
        await pool.execute(
            'UPDATE feedback_messages SET is_read = TRUE WHERE thread_id = ? AND is_from_admin = FALSE',
            [threadId]
        );

        res.json({ messages });
    } catch (error: any) {
        console.error('Admin get thread error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * POST /api/feedback/admin/thread/:threadId/reply
 * Admin replies to a thread
 */
router.post('/admin/thread/:threadId/reply', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const adminId = (req as any).user.id;
        const { threadId } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        // Get original user
        const [thread] = await pool.execute<RowDataPacket[]>(
            'SELECT user_id FROM feedback_messages WHERE thread_id = ? LIMIT 1',
            [threadId]
        );

        if (thread.length === 0) {
            res.status(404).json({ error: 'Thread not found' });
            return;
        }

        const [result] = await pool.execute<ResultSetHeader>(
            `INSERT INTO feedback_messages (thread_id, user_id, admin_id, content, is_from_admin) 
             VALUES (?, ?, ?, ?, TRUE)`,
            [threadId, thread[0].user_id, adminId, content]
        );

        res.json({ message: 'Reply sent', message_id: result.insertId });
    } catch (error: any) {
        console.error('Admin reply error:', error);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

/**
 * GET /api/feedback/admin/stats
 * Get feedback statistics
 */
router.get('/admin/stats', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const [totalThreads] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(DISTINCT thread_id) as count FROM feedback_messages'
        );

        const [unreadCount] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM feedback_messages WHERE is_from_admin = FALSE AND is_read = FALSE'
        );

        const [categoryStats] = await pool.execute<RowDataPacket[]>(
            `SELECT category, COUNT(DISTINCT thread_id) as count 
             FROM feedback_messages GROUP BY category`
        );

        const [priorityStats] = await pool.execute<RowDataPacket[]>(
            `SELECT priority, COUNT(DISTINCT thread_id) as count 
             FROM feedback_messages GROUP BY priority`
        );

        res.json({
            totalThreads: totalThreads[0]?.count || 0,
            unreadMessages: unreadCount[0]?.count || 0,
            byCategory: categoryStats,
            byPriority: priorityStats
        });
    } catch (error: any) {
        console.error('Feedback stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

/**
 * DELETE /api/feedback/admin/thread/:threadId
 * Admin deletes an entire thread
 */
router.delete('/admin/thread/:threadId', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { threadId } = req.params;

        const [result] = await pool.execute<ResultSetHeader>(
            'DELETE FROM feedback_messages WHERE thread_id = ?',
            [threadId]
        );

        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Thread not found' });
            return;
        }

        res.json({ message: 'Thread deleted successfully', deleted: result.affectedRows });
    } catch (error: any) {
        console.error('Delete thread error:', error);
        res.status(500).json({ error: 'Failed to delete thread' });
    }
});

export default router;
