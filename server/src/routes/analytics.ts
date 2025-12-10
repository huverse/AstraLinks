import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

const router = Router();

/**
 * POST /api/analytics/track
 * Track user behavior event (public - works with or without auth)
 */
router.post('/track', async (req: Request, res: Response) => {
    try {
        const { event_type, event_data, page_path, session_id } = req.body;
        const userId = (req as any).user?.id || null;
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const userAgent = req.headers['user-agent'] || '';

        if (!event_type) {
            res.status(400).json({ error: 'event_type is required' });
            return;
        }

        await pool.execute(
            `INSERT INTO user_analytics (user_id, session_id, event_type, event_data, page_path, ip_address, user_agent) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, session_id, event_type, event_data ? JSON.stringify(event_data) : null, page_path, ipAddress, userAgent]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('Track event error:', error);
        res.status(500).json({ error: 'Failed to track event' });
    }
});

// ==================== ADMIN ANALYTICS ROUTES ====================

/**
 * GET /api/analytics/admin/summary
 * Get analytics summary for dashboard
 */
router.get('/admin/summary', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 7;

        // Total events
        const [totalEvents] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) as count FROM user_analytics WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );

        // Unique users
        const [uniqueUsers] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) as count 
             FROM user_analytics WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );

        // Events by type
        const [eventsByType] = await pool.execute<RowDataPacket[]>(
            `SELECT event_type, COUNT(*) as count 
             FROM user_analytics 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY event_type 
             ORDER BY count DESC 
             LIMIT 10`,
            [days]
        );

        // Daily active users trend
        const [dailyTrend] = await pool.execute<RowDataPacket[]>(
            `SELECT DATE(created_at) as date, COUNT(DISTINCT COALESCE(user_id, session_id)) as users, COUNT(*) as events
             FROM user_analytics 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY DATE(created_at)
             ORDER BY date ASC`,
            [days]
        );

        // Popular pages
        const [popularPages] = await pool.execute<RowDataPacket[]>(
            `SELECT page_path, COUNT(*) as views 
             FROM user_analytics 
             WHERE page_path IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY page_path 
             ORDER BY views DESC 
             LIMIT 10`,
            [days]
        );

        // Hourly distribution
        const [hourlyDistribution] = await pool.execute<RowDataPacket[]>(
            `SELECT HOUR(created_at) as hour, COUNT(*) as count 
             FROM user_analytics 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY HOUR(created_at) 
             ORDER BY hour`,
            [days]
        );

        res.json({
            period: `${days} days`,
            totalEvents: totalEvents[0]?.count || 0,
            uniqueUsers: uniqueUsers[0]?.count || 0,
            eventsByType,
            dailyTrend,
            popularPages,
            hourlyDistribution
        });
    } catch (error: any) {
        console.error('Analytics summary error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

/**
 * GET /api/analytics/admin/users/:userId
 * Get specific user's behavior data
 */
router.get('/admin/users/:userId', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;

        const [events] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM user_analytics 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [userId, limit]
        );

        const [summary] = await pool.execute<RowDataPacket[]>(
            `SELECT 
                COUNT(*) as total_events,
                MIN(created_at) as first_seen,
                MAX(created_at) as last_seen,
                COUNT(DISTINCT DATE(created_at)) as active_days
             FROM user_analytics WHERE user_id = ?`,
            [userId]
        );

        res.json({
            events,
            summary: summary[0]
        });
    } catch (error: any) {
        console.error('User analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch user analytics' });
    }
});

/**
 * GET /api/analytics/admin/export
 * Export analytics data
 */
router.get('/admin/export', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 30;
        const format = req.query.format as string || 'json';

        const [data] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM user_analytics 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY created_at DESC`,
            [days]
        );

        if (format === 'csv') {
            const headers = 'id,user_id,session_id,event_type,event_data,page_path,ip_address,created_at\n';
            const rows = data.map((row: any) =>
                `${row.id},${row.user_id || ''},${row.session_id || ''},${row.event_type},"${JSON.stringify(row.event_data || {})}",${row.page_path || ''},${row.ip_address || ''},${row.created_at}`
            ).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=analytics-${days}days.csv`);
            res.send(headers + rows);
        } else {
            res.json({ data, period: `${days} days`, count: data.length });
        }
    } catch (error: any) {
        console.error('Export analytics error:', error);
        res.status(500).json({ error: 'Failed to export analytics' });
    }
});

/**
 * GET /api/analytics/admin/realtime
 * Get real-time activity (last 5 minutes)
 */
router.get('/admin/realtime', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const [activeUsers] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) as count 
             FROM user_analytics WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
        );

        const [recentEvents] = await pool.execute<RowDataPacket[]>(
            `SELECT ua.*, u.username 
             FROM user_analytics ua
             LEFT JOIN users u ON ua.user_id = u.id
             WHERE ua.created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
             ORDER BY ua.created_at DESC 
             LIMIT 20`
        );

        res.json({
            activeUsers: activeUsers[0]?.count || 0,
            recentEvents
        });
    } catch (error: any) {
        console.error('Realtime analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch realtime data' });
    }
});

export default router;
