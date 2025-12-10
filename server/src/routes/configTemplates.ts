import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { encryptConfigApiKeys, decryptConfigApiKeys } from '../utils/encryption';

const router = Router();

// ==================== ADMIN ROUTES ====================

/**
 * GET /api/config-templates/admin/list
 * Admin lists all config templates
 */
router.get('/admin/list', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { template_type } = req.query;
        let query = `SELECT ct.*, u.username as created_by_username
             FROM config_templates ct
             LEFT JOIN users u ON ct.created_by = u.id`;
        const params: any[] = [];

        if (template_type) {
            query += ' WHERE ct.template_type = ?';
            params.push(template_type);
        }
        query += ' ORDER BY ct.created_at DESC';

        const [templates] = await pool.execute<RowDataPacket[]>(query, params);

        // Decrypt for admin view
        const decryptedTemplates = (templates as any[]).map(t => {
            let configData = t.config_data;
            if (typeof configData === 'string') {
                configData = JSON.parse(configData);
            }
            return {
                ...t,
                config_data: decryptConfigApiKeys(configData)
            };
        });

        res.json({ templates: decryptedTemplates });
    } catch (error: any) {
        console.error('List config templates error:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

/**
 * POST /api/config-templates/admin/create
 * Admin creates a config template
 */
router.post('/admin/create', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const adminId = (req as any).user.id;
        const {
            name, description, config_data, tier_required = 'free',
            allowed_models, token_limit = 0, is_active = true, template_type = 'participant'
        } = req.body;

        if (!name || !config_data) {
            res.status(400).json({ error: 'Name and config_data are required' });
            return;
        }

        // Encrypt API keys before storing (for participant type templates)
        const dataToStore = template_type === 'participant'
            ? encryptConfigApiKeys(Array.isArray(config_data) ? config_data : [config_data])
            : config_data;

        const [result] = await pool.execute<ResultSetHeader>(
            `INSERT INTO config_templates 
             (name, description, config_data, tier_required, allowed_models, token_limit, is_active, created_by, template_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, description || null, JSON.stringify(dataToStore), tier_required,
                allowed_models ? JSON.stringify(allowed_models) : null, token_limit, is_active, adminId, template_type]
        );

        res.json({ message: 'Template created', id: result.insertId });
    } catch (error: any) {
        console.error('Create config template error:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

/**
 * PUT /api/config-templates/admin/:id
 * Admin updates a config template
 */
router.put('/admin/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const {
            name, description, config_data, tier_required,
            allowed_models, token_limit, is_active
        } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (config_data !== undefined) {
            // Encrypt API keys before storing
            const encryptedConfig = encryptConfigApiKeys(Array.isArray(config_data) ? config_data : [config_data]);
            updates.push('config_data = ?');
            values.push(JSON.stringify(encryptedConfig));
        }
        if (tier_required !== undefined) { updates.push('tier_required = ?'); values.push(tier_required); }
        if (allowed_models !== undefined) {
            updates.push('allowed_models = ?');
            values.push(allowed_models ? JSON.stringify(allowed_models) : null);
        }
        if (token_limit !== undefined) { updates.push('token_limit = ?'); values.push(token_limit); }
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        values.push(id);

        await pool.execute(
            `UPDATE config_templates SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        res.json({ message: 'Template updated' });
    } catch (error: any) {
        console.error('Update config template error:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

/**
 * DELETE /api/config-templates/admin/:id
 * Admin deletes a config template
 */
router.delete('/admin/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await pool.execute('DELETE FROM config_templates WHERE id = ?', [id]);

        res.json({ message: 'Template deleted' });
    } catch (error: any) {
        console.error('Delete config template error:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

// ==================== MODEL TIERS ADMIN ====================

/**
 * GET /api/config-templates/admin/model-tiers
 * Admin lists all model tier rules
 */
router.get('/admin/model-tiers', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const [tiers] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM model_tiers ORDER BY tier, model_pattern'
        );

        res.json({ tiers });
    } catch (error: any) {
        console.error('List model tiers error:', error);
        res.status(500).json({ error: 'Failed to fetch model tiers' });
    }
});

/**
 * POST /api/config-templates/admin/model-tiers
 * Admin adds a model tier rule
 */
router.post('/admin/model-tiers', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { model_pattern, tier, description } = req.body;

        if (!model_pattern || !tier) {
            res.status(400).json({ error: 'model_pattern and tier are required' });
            return;
        }

        const [result] = await pool.execute<ResultSetHeader>(
            'INSERT INTO model_tiers (model_pattern, tier, description) VALUES (?, ?, ?)',
            [model_pattern, tier, description || null]
        );

        res.json({ message: 'Model tier rule added', id: result.insertId });
    } catch (error: any) {
        console.error('Create model tier error:', error);
        res.status(500).json({ error: 'Failed to create model tier' });
    }
});

/**
 * DELETE /api/config-templates/admin/model-tiers/:id
 * Admin deletes a model tier rule
 */
router.delete('/admin/model-tiers/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await pool.execute('DELETE FROM model_tiers WHERE id = ?', [id]);

        res.json({ message: 'Model tier rule deleted' });
    } catch (error: any) {
        console.error('Delete model tier error:', error);
        res.status(500).json({ error: 'Failed to delete model tier' });
    }
});

// ==================== PUBLIC ROUTES ====================

/**
 * GET /api/config-templates/available
 * Get templates available for current user's tier
 */
router.get('/available', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        // Get user tier
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT user_tier FROM users WHERE id = ?',
            [userId]
        );
        const userTier = users[0]?.user_tier || 'free';

        // Tier hierarchy
        const tierLevel: Record<string, number> = { free: 1, pro: 2, ultra: 3 };
        const userLevel = tierLevel[userTier];

        // Get all active templates
        const [templates] = await pool.execute<RowDataPacket[]>(
            `SELECT id, name, description, tier_required, token_limit, download_count, created_at
             FROM config_templates WHERE is_active = TRUE ORDER BY created_at DESC`
        );

        // Mark which templates are accessible
        const result = (templates as any[]).map(t => ({
            ...t,
            accessible: tierLevel[t.tier_required] <= userLevel,
            config_data: undefined // Don't expose config data in list
        }));

        res.json({ templates: result, userTier });
    } catch (error: any) {
        console.error('Get available templates error:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

/**
 * POST /api/config-templates/:id/download
 * Download a specific template (increments counter)
 */
router.post('/:id/download', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        // Get user tier
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT user_tier FROM users WHERE id = ?',
            [userId]
        );
        const userTier = users[0]?.user_tier || 'free';

        // Get template
        const [templates] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM config_templates WHERE id = ? AND is_active = TRUE',
            [id]
        );

        if (templates.length === 0) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }

        const template = templates[0];

        // Check tier access
        const tierLevel: Record<string, number> = { free: 1, pro: 2, ultra: 3 };
        if (tierLevel[template.tier_required] > tierLevel[userTier]) {
            res.status(403).json({
                error: 'Upgrade required',
                requiredTier: template.tier_required,
                currentTier: userTier
            });
            return;
        }

        // Increment download count
        await pool.execute(
            'UPDATE config_templates SET download_count = download_count + 1 WHERE id = ?',
            [id]
        );

        // Parse and decrypt config data
        let configData = template.config_data;
        if (typeof configData === 'string') {
            configData = JSON.parse(configData);
        }
        // Decrypt API keys for user to use
        configData = decryptConfigApiKeys(configData);

        res.json({
            template: {
                id: template.id,
                name: template.name,
                description: template.description,
                config_data: configData
            }
        });
    } catch (error: any) {
        console.error('Download template error:', error);
        res.status(500).json({ error: 'Failed to download template' });
    }
});

/**
 * POST /api/config-templates/validate-import
 * Validate a config for tier restrictions (for user-to-user imports)
 */
router.post('/validate-import', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { config_data } = req.body;

        if (!config_data) {
            res.status(400).json({ error: 'config_data is required' });
            return;
        }

        // Get user tier
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT user_tier FROM users WHERE id = ?',
            [userId]
        );
        const userTier = users[0]?.user_tier || 'free';
        const tierLevel: Record<string, number> = { free: 1, pro: 2, ultra: 3 };
        const userLevel = tierLevel[userTier];

        // Get model tier rules
        const [tierRules] = await pool.execute<RowDataPacket[]>(
            'SELECT model_pattern, tier FROM model_tiers'
        );

        // Parse config
        let participants = config_data;
        if (typeof participants === 'string') {
            participants = JSON.parse(participants);
        }

        // Check each participant's model
        const validParticipants: any[] = [];
        const restrictedParticipants: any[] = [];

        for (const p of participants) {
            const modelName = p.config?.modelName || '';
            let modelTier = 'free';

            // Find matching tier rule
            for (const rule of tierRules as any[]) {
                const pattern = rule.model_pattern.replace(/\*/g, '.*');
                if (new RegExp(`^${pattern}$`, 'i').test(modelName)) {
                    modelTier = rule.tier;
                    break;
                }
            }

            if (tierLevel[modelTier] <= userLevel) {
                validParticipants.push(p);
            } else {
                restrictedParticipants.push({
                    ...p,
                    restrictedReason: `模型 ${modelName} 需要 ${modelTier.toUpperCase()} 等级`
                });
            }
        }

        res.json({
            userTier,
            valid: validParticipants,
            restricted: restrictedParticipants,
            hasRestrictions: restrictedParticipants.length > 0
        });
    } catch (error: any) {
        console.error('Validate import error:', error);
        res.status(500).json({ error: 'Failed to validate config' });
    }
});

/**
 * GET /api/config-templates/user-tier
 * Get current user's tier and token usage
 */
router.get('/user-tier', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT user_tier, monthly_token_usage, token_reset_date FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const user = users[0];
        const tierLimits: Record<string, number> = {
            free: 100000,
            pro: 1000000,
            ultra: -1 // unlimited
        };

        res.json({
            tier: user.user_tier,
            monthlyTokenUsage: user.monthly_token_usage || 0,
            tokenLimit: tierLimits[user.user_tier],
            resetDate: user.token_reset_date
        });
    } catch (error: any) {
        console.error('Get user tier error:', error);
        res.status(500).json({ error: 'Failed to get user tier' });
    }
});

export default router;
