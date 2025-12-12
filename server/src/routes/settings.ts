import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { RowDataPacket } from 'mysql2';

const router = Router();

// ==================== PUBLIC ROUTES (NO AUTH) ====================

/**
 * GET /api/settings/public/terms
 * Get terms of service (public, no auth needed)
 */
router.get('/public/terms', async (req: Request, res: Response) => {
    try {
        const [settings] = await pool.execute<RowDataPacket[]>(
            `SELECT setting_value FROM site_settings WHERE setting_key = 'user_agreement'`
        );

        if (settings.length === 0 || !settings[0].setting_value) {
            res.json({ content: '暂无用户协议内容。' });
            return;
        }

        res.json({ content: settings[0].setting_value });
    } catch (error: any) {
        console.error('Get terms error:', error);
        res.status(500).json({ error: 'Failed to fetch terms' });
    }
});

/**
 * GET /api/settings/public/privacy
 * Get privacy policy (public, no auth needed)
 */
router.get('/public/privacy', async (req: Request, res: Response) => {
    try {
        const [settings] = await pool.execute<RowDataPacket[]>(
            `SELECT setting_value FROM site_settings WHERE setting_key = 'privacy_policy'`
        );

        if (settings.length === 0 || !settings[0].setting_value) {
            res.json({ content: '暂无隐私政策内容。' });
            return;
        }

        res.json({ content: settings[0].setting_value });
    } catch (error: any) {
        console.error('Get privacy error:', error);
        res.status(500).json({ error: 'Failed to fetch privacy policy' });
    }
});

// ==================== ADMIN ROUTES (REQUIRES AUTH) ====================
// Apply admin middleware to remaining routes
router.use(authMiddleware, adminMiddleware);

/**
 * GET /api/settings/:key
 * Get a site setting
 */
router.get('/:key', async (req: Request, res: Response) => {
    try {
        const { key } = req.params;

        const [settings] = await pool.execute<RowDataPacket[]>(
            `SELECT ss.*, u.username as updated_by_username 
             FROM site_settings ss 
             LEFT JOIN users u ON ss.updated_by = u.id
             WHERE ss.setting_key = ?`,
            [key]
        );

        if (settings.length === 0) {
            // Return default empty setting
            res.json({ setting: { setting_key: key, setting_value: '', updated_at: null } });
            return;
        }

        res.json({ setting: settings[0] });
    } catch (error: any) {
        console.error('Get setting error:', error);
        res.status(500).json({ error: 'Failed to fetch setting' });
    }
});

/**
 * PUT /api/settings/:key
 * Update a site setting (upsert)
 */
router.put('/:key', async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        const adminId = (req as any).user.id;

        if (value === undefined) {
            res.status(400).json({ error: 'Value is required' });
            return;
        }

        // Upsert the setting
        await pool.execute(
            `INSERT INTO site_settings (setting_key, setting_value, updated_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = ?, updated_by = ?`,
            [key, value, adminId, value, adminId]
        );

        res.json({ message: 'Setting updated' });
    } catch (error: any) {
        console.error('Update setting error:', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

/**
 * GET /api/settings
 * Get all site settings
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const [settings] = await pool.execute<RowDataPacket[]>(
            `SELECT ss.*, u.username as updated_by_username 
             FROM site_settings ss 
             LEFT JOIN users u ON ss.updated_by = u.id`
        );

        res.json({ settings });
    } catch (error: any) {
        console.error('Get all settings error:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

export default router;
