import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { encryptConfigApiKeys, decryptConfigApiKeys } from '../utils/encryption';

const router = Router();

// All config routes require authentication
router.use(authMiddleware);

/**
 * GET /api/configs
 * Get all configs for the authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const [configs] = await pool.execute<RowDataPacket[]>(
            `SELECT id, config_name, config_type, encrypted, created_at, updated_at 
             FROM user_configs WHERE user_id = ? ORDER BY updated_at DESC`,
            [userId]
        );

        res.json({ configs });
    } catch (error: any) {
        console.error('Get configs error:', error);
        res.status(500).json({ error: 'Failed to fetch configurations' });
    }
});

/**
 * GET /api/configs/:id
 * Download a specific config (decrypted for user's own configs)
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const [configs] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM user_configs WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (configs.length === 0) {
            res.status(404).json({ error: 'Configuration not found' });
            return;
        }

        const config = configs[0];
        // Decrypt API keys for user's own config
        let configData = config.config_data;
        if (typeof configData === 'string') {
            configData = JSON.parse(configData);
        }
        config.config_data = decryptConfigApiKeys(configData);

        res.json(config);
    } catch (error: any) {
        console.error('Get config error:', error);
        res.status(500).json({ error: 'Failed to fetch configuration' });
    }
});

/**
 * POST /api/configs/upload
 * Upload a new config or update existing (encrypts API keys)
 */
router.post('/upload', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { config_name, config_data, config_type = 'participant', encrypted = false } = req.body;

        if (!config_name || !config_data) {
            res.status(400).json({ error: 'config_name and config_data are required' });
            return;
        }

        // Encrypt API keys before storing (handles both arrays and flat objects)
        const encryptedConfig = encryptConfigApiKeys(config_data);

        // Check if config with same name exists
        const [existing] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM user_configs WHERE user_id = ? AND config_name = ?',
            [userId, config_name]
        );

        if (existing.length > 0) {
            // Update existing
            await pool.execute(
                'UPDATE user_configs SET config_data = ?, config_type = ?, encrypted = ? WHERE id = ?',
                [JSON.stringify(encryptedConfig), config_type, encrypted, existing[0].id]
            );
            res.json({ message: 'Configuration updated', id: existing[0].id });
        } else {
            // Insert new
            const [result] = await pool.execute<ResultSetHeader>(
                'INSERT INTO user_configs (user_id, config_name, config_data, config_type, encrypted) VALUES (?, ?, ?, ?, ?)',
                [userId, config_name, JSON.stringify(encryptedConfig), config_type, encrypted]
            );
            res.json({ message: 'Configuration saved', id: result.insertId });
        }
    } catch (error: any) {
        console.error('Upload config error:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

/**
 * DELETE /api/configs/:id
 * Delete a config
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const [result] = await pool.execute<ResultSetHeader>(
            'DELETE FROM user_configs WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Configuration not found' });
            return;
        }

        res.json({ message: 'Configuration deleted' });
    } catch (error: any) {
        console.error('Delete config error:', error);
        res.status(500).json({ error: 'Failed to delete configuration' });
    }
});

/**
 * POST /api/configs/:id/rename
 * Rename a config
 */
router.post('/:id/rename', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { new_name } = req.body;

        if (!new_name) {
            res.status(400).json({ error: 'new_name is required' });
            return;
        }

        const [result] = await pool.execute<ResultSetHeader>(
            'UPDATE user_configs SET config_name = ? WHERE id = ? AND user_id = ?',
            [new_name, id, userId]
        );

        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Configuration not found' });
            return;
        }

        res.json({ message: 'Configuration renamed' });
    } catch (error: any) {
        console.error('Rename config error:', error);
        res.status(500).json({ error: 'Failed to rename configuration' });
    }
});

export default router;
