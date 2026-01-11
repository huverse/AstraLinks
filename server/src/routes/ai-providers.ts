/**
 * AI Providers API Routes
 * 管理 AI Provider 配置
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

const router = Router();

interface AuthRequest extends Request {
    user?: { id: number; role?: string };
}

// GET /api/ai-providers - 获取所有激活的 Provider
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, type, base_url, default_models, capabilities,
                is_builtin, is_active, created_at
         FROM ai_providers
         WHERE is_active = TRUE
         ORDER BY is_builtin DESC, name ASC`
    );

    const providers = rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        baseUrl: row.base_url,
        defaultModels: row.default_models ? JSON.parse(row.default_models) : [],
        capabilities: row.capabilities ? JSON.parse(row.capabilities) : {},
        isBuiltin: row.is_builtin,
        isActive: row.is_active,
        createdAt: row.created_at
    }));

    res.json({ providers });
});

// GET /api/ai-providers/:id - 获取单个 Provider
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM ai_providers WHERE id = ?',
        [id]
    );

    if (rows.length === 0) {
        res.status(404).json({ error: 'Provider not found' });
        return;
    }

    const row = rows[0];
    res.json({
        provider: {
            id: row.id,
            name: row.name,
            type: row.type,
            baseUrl: row.base_url,
            defaultModels: row.default_models ? JSON.parse(row.default_models) : [],
            defaultHeaders: row.default_headers ? JSON.parse(row.default_headers) : null,
            capabilities: row.capabilities ? JSON.parse(row.capabilities) : {},
            isBuiltin: row.is_builtin,
            isActive: row.is_active,
            description: row.description,
            createdAt: row.created_at
        }
    });
});

// POST /api/ai-providers - 创建自定义 Provider (管理员)
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const { name, type, baseUrl, defaultModels, defaultHeaders, capabilities, description } = req.body;

    if (!name || !type || !baseUrl) {
        res.status(400).json({ error: 'Missing required fields: name, type, baseUrl' });
        return;
    }

    const id = crypto.randomUUID();

    await pool.execute(
        `INSERT INTO ai_providers
         (id, name, type, base_url, default_models, default_headers, capabilities, is_builtin, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, TRUE)`,
        [
            id,
            name,
            type,
            baseUrl,
            defaultModels ? JSON.stringify(defaultModels) : null,
            defaultHeaders ? JSON.stringify(defaultHeaders) : null,
            capabilities ? JSON.stringify(capabilities) : JSON.stringify({ text: true })
        ]
    );

    res.status(201).json({ id, message: 'Provider created' });
});

// PUT /api/ai-providers/:id - 更新 Provider (管理员)
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, baseUrl, defaultModels, defaultHeaders, capabilities, description, isActive } = req.body;

    // 检查是否存在
    const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT is_builtin FROM ai_providers WHERE id = ?',
        [id]
    );

    if (existing.length === 0) {
        res.status(404).json({ error: 'Provider not found' });
        return;
    }

    // 内置 Provider 只能更新部分字段
    const isBuiltin = existing[0].is_builtin;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
    }
    if (isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(isActive);
    }
    if (!isBuiltin) {
        if (baseUrl !== undefined) {
            updates.push('base_url = ?');
            values.push(baseUrl);
        }
        if (defaultModels !== undefined) {
            updates.push('default_models = ?');
            values.push(defaultModels ? JSON.stringify(defaultModels) : null);
        }
        if (defaultHeaders !== undefined) {
            updates.push('default_headers = ?');
            values.push(defaultHeaders ? JSON.stringify(defaultHeaders) : null);
        }
        if (capabilities !== undefined) {
            updates.push('capabilities = ?');
            values.push(JSON.stringify(capabilities));
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
    }

    if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    await pool.execute(
        `UPDATE ai_providers SET ${updates.join(', ')} WHERE id = ?`,
        values
    );

    res.json({ message: 'Provider updated' });
});

// DELETE /api/ai-providers/:id - 删除自定义 Provider (管理员)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // 检查是否内置
    const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT is_builtin FROM ai_providers WHERE id = ?',
        [id]
    );

    if (existing.length === 0) {
        res.status(404).json({ error: 'Provider not found' });
        return;
    }

    if (existing[0].is_builtin) {
        res.status(403).json({ error: 'Cannot delete builtin provider' });
        return;
    }

    // 检查是否有关联的凭证
    const [credentials] = await pool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) as count FROM ai_credentials WHERE provider_id = ?',
        [id]
    );

    if (credentials[0].count > 0) {
        res.status(400).json({ error: 'Cannot delete provider with associated credentials' });
        return;
    }

    await pool.execute('DELETE FROM ai_providers WHERE id = ?', [id]);
    res.json({ message: 'Provider deleted' });
});

// ==================== 管理员 API ====================

// GET /api/admin/ai-providers - 获取所有 Provider (管理员)
router.get('/admin/all', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, type, base_url, default_headers,
                capabilities, default_models, is_builtin, is_active, created_at, updated_at
         FROM ai_providers
         ORDER BY is_builtin DESC, name ASC`
    );

    const providers = rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        baseUrl: row.base_url,
        defaultHeaders: row.default_headers ? JSON.parse(row.default_headers) : null,
        capabilities: row.capabilities ? JSON.parse(row.capabilities) : {},
        defaultModels: row.default_models ? JSON.parse(row.default_models) : [],
        isBuiltin: row.is_builtin,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));

    res.json({ providers });
});

// PATCH /api/ai-providers/:id/toggle - 切换 Provider 状态
router.patch('/:id/toggle', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { isActive } = req.body;

    await pool.execute(
        'UPDATE ai_providers SET is_active = ?, updated_at = NOW() WHERE id = ?',
        [isActive, id]
    );

    res.json({ message: 'Provider status updated' });
});

export default router;
