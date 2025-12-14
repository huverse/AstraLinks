/**
 * Workspace API 路由
 * 
 * @module server/routes/workspaces
 * @description Workspace CRUD、配置、文件管理
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ============================================
// 类型定义
// ============================================

interface WorkspaceRow extends RowDataPacket {
    id: string;
    name: string;
    type: 'WORKFLOW' | 'PROJECT' | 'TASK' | 'SANDBOX';
    owner_id: string;
    isolation_config: any;
    description: string | null;
    tags: string[];
    icon: string | null;
    created_at: Date;
    updated_at: Date;
}

// ============================================
// 默认隔离配置
// ============================================

const DEFAULT_ISOLATION: Record<string, any> = {
    WORKFLOW: { contextIsolated: true, fileIsolated: true },
    PROJECT: { contextIsolated: false, fileIsolated: true },
    TASK: { contextIsolated: true, fileIsolated: false },
    SANDBOX: {
        contextIsolated: true,
        fileIsolated: true,
        resourceLimits: { maxTokens: 100000, maxExecutionTime: 300, maxConcurrentTasks: 1 }
    },
};

// ============================================
// 中间件
// ============================================

router.use(authMiddleware);

// ============================================
// Workspace CRUD
// ============================================

/**
 * 获取用户的所有 Workspace
 * GET /api/workspaces
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;

        const [rows] = await pool.execute<WorkspaceRow[]>(
            `SELECT id, name, type, owner_id, isolation_config, description, tags, icon, created_at, updated_at
       FROM workspaces 
       WHERE owner_id = ? AND is_deleted = FALSE 
       ORDER BY updated_at DESC`,
            [userId]
        );

        // 格式化响应
        const workspaces = rows.map((row: WorkspaceRow) => ({
            id: row.id,
            name: row.name,
            type: row.type,
            ownerId: row.owner_id,
            isolation: typeof row.isolation_config === 'string'
                ? JSON.parse(row.isolation_config)
                : row.isolation_config,
            description: row.description,
            tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
            icon: row.icon,
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: new Date(row.updated_at).getTime(),
        }));

        res.json({ workspaces });
    } catch (error: any) {
        console.error('[Workspace] List error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 获取单个 Workspace 详情
 * GET /api/workspaces/:id
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const [rows] = await pool.execute<WorkspaceRow[]>(
            `SELECT * FROM workspaces WHERE id = ? AND owner_id = ? AND is_deleted = FALSE`,
            [id, userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: 'Workspace 不存在' });
            return;
        }

        const row = rows[0];

        // 获取配置
        const [configRows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM workspace_configs WHERE workspace_id = ?`,
            [id]
        );

        // 获取工作流数量
        const [workflowCount] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) as count FROM workflows WHERE workspace_id = ? AND is_deleted = FALSE`,
            [id]
        );

        // 获取最近执行
        const [recentExecutions] = await pool.execute<RowDataPacket[]>(
            `SELECT id, status, progress, created_at FROM workflow_executions 
       WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 5`,
            [id]
        );

        res.json({
            id: row.id,
            name: row.name,
            type: row.type,
            ownerId: row.owner_id,
            isolation: typeof row.isolation_config === 'string'
                ? JSON.parse(row.isolation_config)
                : row.isolation_config,
            description: row.description,
            tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
            icon: row.icon,
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: new Date(row.updated_at).getTime(),
            config: configRows[0] || null,
            stats: {
                workflowCount: (workflowCount[0] as any).count,
                recentExecutions: recentExecutions,
            }
        });
    } catch (error: any) {
        console.error('[Workspace] Get error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 创建新 Workspace
 * POST /api/workspaces
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { name, type, description, tags, icon } = req.body;

        // 验证类型
        if (!['WORKFLOW', 'PROJECT', 'TASK', 'SANDBOX'].includes(type)) {
            res.status(400).json({ error: '无效的 Workspace 类型' });
            return;
        }

        const id = uuidv4();
        const isolation = DEFAULT_ISOLATION[type];

        // 创建 Workspace
        await pool.execute(
            `INSERT INTO workspaces (id, name, type, owner_id, isolation_config, description, tags, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name, type, userId, JSON.stringify(isolation), description || null, JSON.stringify(tags || []), icon || null]
        );

        // 创建默认配置
        await pool.execute(
            `INSERT INTO workspace_configs (id, workspace_id, model_configs, enabled_mcps, features)
       VALUES (?, ?, '[]', '[]', '{"promptOptimization": false, "autoSave": true, "versionHistory": true}')`,
            [uuidv4(), id]
        );

        res.status(201).json({
            id,
            name,
            type,
            ownerId: userId,
            isolation,
            description,
            tags: tags || [],
            icon,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    } catch (error: any) {
        console.error('[Workspace] Create error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 更新 Workspace
 * PUT /api/workspaces/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { name, description, tags, icon, isolation } = req.body;

        // 验证所有权
        const [rows] = await pool.execute<WorkspaceRow[]>(
            `SELECT id FROM workspaces WHERE id = ? AND owner_id = ? AND is_deleted = FALSE`,
            [id, userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: 'Workspace 不存在' });
            return;
        }

        // 构建更新语句
        const updates: string[] = [];
        const values: any[] = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }
        if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
        if (isolation !== undefined) { updates.push('isolation_config = ?'); values.push(JSON.stringify(isolation)); }

        if (updates.length > 0) {
            values.push(id);
            await pool.execute(
                `UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`,
                values
            );
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Workspace] Update error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除 Workspace (软删除)
 * DELETE /api/workspaces/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const [result] = await pool.execute<ResultSetHeader>(
            `UPDATE workspaces SET is_deleted = TRUE WHERE id = ? AND owner_id = ?`,
            [id, userId]
        );

        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Workspace 不存在' });
            return;
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Workspace] Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Workspace 配置
// ============================================

/**
 * 获取 Workspace 配置
 * GET /api/workspaces/:id/config
 */
router.get('/:id/config', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        // 验证所有权
        const [workspaces] = await pool.execute<WorkspaceRow[]>(
            `SELECT id FROM workspaces WHERE id = ? AND owner_id = ? AND is_deleted = FALSE`,
            [id, userId]
        );

        if (workspaces.length === 0) {
            res.status(404).json({ error: 'Workspace 不存在' });
            return;
        }

        const [configs] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM workspace_configs WHERE workspace_id = ?`,
            [id]
        );

        if (configs.length === 0) {
            res.json({
                workspaceId: id,
                modelConfigs: [],
                enabledMCPs: [],
                features: { promptOptimization: false, autoSave: true, versionHistory: true }
            });
            return;
        }

        const config = configs[0];
        res.json({
            id: config.id,
            workspaceId: config.workspace_id,
            modelConfigs: typeof config.model_configs === 'string'
                ? JSON.parse(config.model_configs) : config.model_configs,
            defaultModelId: config.default_model_id,
            enabledMCPs: typeof config.enabled_mcps === 'string'
                ? JSON.parse(config.enabled_mcps) : config.enabled_mcps,
            features: typeof config.features === 'string'
                ? JSON.parse(config.features) : config.features,
            updatedAt: new Date(config.updated_at).getTime(),
        });
    } catch (error: any) {
        console.error('[Workspace] Get config error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 更新 Workspace 配置
 * PUT /api/workspaces/:id/config
 */
router.put('/:id/config', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { modelConfigs, defaultModelId, enabledMCPs, features } = req.body;

        // 验证所有权
        const [workspaces] = await pool.execute<WorkspaceRow[]>(
            `SELECT id FROM workspaces WHERE id = ? AND owner_id = ? AND is_deleted = FALSE`,
            [id, userId]
        );

        if (workspaces.length === 0) {
            res.status(404).json({ error: 'Workspace 不存在' });
            return;
        }

        // 检查配置记录是否存在
        const [existingConfig] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM workspace_configs WHERE workspace_id = ?`,
            [id]
        );

        if (existingConfig.length === 0) {
            // 记录不存在，INSERT
            await pool.execute(
                `INSERT INTO workspace_configs (id, workspace_id, model_configs, default_model_id, enabled_mcps, features)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    uuidv4(),
                    id,
                    JSON.stringify(modelConfigs || []),
                    defaultModelId || null,
                    JSON.stringify(enabledMCPs || []),
                    JSON.stringify(features || { promptOptimization: false, autoSave: true, versionHistory: true })
                ]
            );
        } else {
            // 记录存在，UPDATE
            await pool.execute(
                `UPDATE workspace_configs 
                 SET enabled_mcps = ?, features = ?
                 WHERE workspace_id = ?`,
                [
                    JSON.stringify(enabledMCPs || []),
                    JSON.stringify(features || { promptOptimization: false, autoSave: true, versionHistory: true }),
                    id
                ]
            );
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Workspace] Update config error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 切换活动 Workspace
// ============================================

/**
 * 设置用户当前活动的 Workspace
 * POST /api/workspaces/:id/activate
 */
router.post('/:id/activate', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        // 验证 Workspace 存在且属于用户
        const [workspaces] = await pool.execute<WorkspaceRow[]>(
            `SELECT id FROM workspaces WHERE id = ? AND owner_id = ? AND is_deleted = FALSE`,
            [id, userId]
        );

        if (workspaces.length === 0) {
            res.status(404).json({ error: 'Workspace 不存在' });
            return;
        }

        // 更新用户的活动 Workspace
        await pool.execute(
            `UPDATE users SET active_workspace_id = ? WHERE id = ?`,
            [id, userId]
        );

        res.json({ success: true, activeWorkspaceId: id });
    } catch (error: any) {
        console.error('[Workspace] Activate error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
