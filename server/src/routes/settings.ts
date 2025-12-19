import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { RowDataPacket } from 'mysql2';

const router = Router();

// ==================== CACHING ====================
interface CacheEntry {
    value: string;
    timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): string | null {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.value;
    }
    return null;
}

function setCache(key: string, value: string): void {
    cache.set(key, { value, timestamp: Date.now() });
}

export function clearSettingsCache(): void {
    cache.clear();
    console.log('[Settings] Cache cleared');
}

// ==================== PUBLIC ROUTES (NO AUTH) ====================

/**
 * GET /api/settings/public/terms
 * Get terms of service (public, no auth needed, cached)
 */
router.get('/public/terms', async (req: Request, res: Response) => {
    try {
        // Check cache first
        const cached = getCached('user_agreement');
        if (cached !== null) {
            res.json({ content: cached, cached: true });
            return;
        }

        const [settings] = await pool.execute<RowDataPacket[]>(
            `SELECT setting_value FROM site_settings WHERE setting_key = 'user_agreement'`
        );

        const content = settings.length > 0 && settings[0].setting_value
            ? settings[0].setting_value
            : '暂无用户协议内容。';

        setCache('user_agreement', content);
        res.json({ content });
    } catch (error: any) {
        console.error('Get terms error:', error);
        res.status(500).json({ error: 'Failed to fetch terms' });
    }
});

/**
 * GET /api/settings/public/privacy
 * Get privacy policy (public, no auth needed, cached)
 */
router.get('/public/privacy', async (req: Request, res: Response) => {
    try {
        // Check cache first
        const cached = getCached('privacy_policy');
        if (cached !== null) {
            res.json({ content: cached, cached: true });
            return;
        }

        const [settings] = await pool.execute<RowDataPacket[]>(
            `SELECT setting_value FROM site_settings WHERE setting_key = 'privacy_policy'`
        );

        const content = settings.length > 0 && settings[0].setting_value
            ? settings[0].setting_value
            : '暂无隐私政策内容。';

        setCache('privacy_policy', content);
        res.json({ content });
    } catch (error: any) {
        console.error('Get privacy error:', error);
        res.status(500).json({ error: 'Failed to fetch privacy policy' });
    }
});

/**
 * GET /api/settings/public/turnstile
 * Get Turnstile settings (public, no auth needed, cached)
 */
router.get('/public/turnstile', async (req: Request, res: Response) => {
    try {
        // Check cache first
        const cachedSiteEnabled = getCached('turnstile_site_enabled');
        const cachedLoginEnabled = getCached('turnstile_login_enabled');
        const cachedSiteKey = getCached('turnstile_site_key');
        const cachedExpiryHours = getCached('turnstile_expiry_hours');

        if (cachedSiteEnabled !== null && cachedLoginEnabled !== null && cachedSiteKey !== null && cachedExpiryHours !== null) {
            res.json({
                siteEnabled: cachedSiteEnabled === 'true',
                loginEnabled: cachedLoginEnabled === 'true',
                siteKey: cachedSiteKey,
                expiryHours: cachedExpiryHours !== null ? parseInt(cachedExpiryHours) : 24,
                cached: true
            });
            return;
        }

        const [settings] = await pool.execute<RowDataPacket[]>(
            `SELECT setting_key, setting_value FROM site_settings 
             WHERE setting_key IN ('turnstile_site_enabled', 'turnstile_login_enabled', 'turnstile_site_key', 'turnstile_expiry_hours')`
        );

        const settingsMap: Record<string, string> = {};
        settings.forEach(s => { settingsMap[s.setting_key] = s.setting_value; });

        const siteEnabled = settingsMap['turnstile_site_enabled'] === 'true';
        const loginEnabled = settingsMap['turnstile_login_enabled'] === 'true';
        const siteKey = settingsMap['turnstile_site_key'] || '0x4AAAAAACHmC6NQQ8IJpFD8';
        const expiryHours = settingsMap['turnstile_expiry_hours'] !== undefined
            ? parseInt(settingsMap['turnstile_expiry_hours'])
            : 24;

        // Cache the values
        setCache('turnstile_site_enabled', String(siteEnabled));
        setCache('turnstile_login_enabled', String(loginEnabled));
        setCache('turnstile_site_key', siteKey);
        setCache('turnstile_expiry_hours', String(expiryHours));

        res.json({ siteEnabled, loginEnabled, siteKey, expiryHours });
    } catch (error: any) {
        console.error('Get Turnstile settings error:', error);
        res.status(500).json({ error: 'Failed to fetch Turnstile settings' });
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

        // Clear cache for this key
        cache.delete(key);
        console.log(`[Settings] Cache cleared for key: ${key}`);

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
