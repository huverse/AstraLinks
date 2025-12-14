/**
 * 工作区配置中心 API
 * 
 * @module server/routes/workspace-config
 * @description 工作区独立配置管理 - AI配置、执行历史、文件管理
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authMiddleware } from '../middleware/auth';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 加密密钥 (生产环境从环境变量获取)
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || 'astralinks-config-key-2024';

// 简单加密解密 (用于 API Key 存储)
const encrypt = (text: string): string => {
    if (!text) return '';
    const cipher = crypto.createCipheriv('aes-256-cbc',
        crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32),
        Buffer.alloc(16, 0)
    );
    return cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
};

const decrypt = (encrypted: string): string => {
    if (!encrypted) return '';
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc',
            crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32),
            Buffer.alloc(16, 0)
        );
        return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
    } catch {
        return '';
    }
};

// 中间件
router.use(authMiddleware);

// ============================================
// 验证工作区所有权
// ============================================

const verifyOwnership = async (workspaceId: string, userId: number): Promise<boolean> => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM workspaces WHERE id = ? AND owner_id = ? AND is_deleted = FALSE`,
        [workspaceId, userId]
    );
    return rows.length > 0;
};

// ============================================
// 配置中心 - AI配置 (独立于主应用)
// ============================================

/**
 * 获取工作区 AI 配置
 * GET /api/workspace-config/:workspaceId/ai
 */
router.get('/:workspaceId/ai', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT model_configs FROM workspace_configs WHERE workspace_id = ?`,
            [workspaceId]
        );

        if (rows.length === 0) {
            // 返回默认配置
            res.json({
                configs: [],
                activeConfigId: null,
            });
            return;
        }

        const modelConfigs = typeof rows[0].model_configs === 'string'
            ? JSON.parse(rows[0].model_configs)
            : rows[0].model_configs;

        // 解密 API Keys (只返回遮罩版本)
        const safeConfigs = (modelConfigs || []).map((config: any) => ({
            ...config,
            apiKey: config.apiKey ? '••••••••' + decrypt(config.apiKey).slice(-4) : '',
            hasApiKey: !!config.apiKey,
        }));

        res.json({
            configs: safeConfigs,
            activeConfigId: modelConfigs?.find((c: any) => c.isActive)?.id || null,
        });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Get AI config error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 保存工作区 AI 配置
 * PUT /api/workspace-config/:workspaceId/ai
 */
router.put('/:workspaceId/ai', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { configs } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        // 获取现有配置以保留加密的 API Keys
        const [existingRows] = await pool.execute<RowDataPacket[]>(
            `SELECT model_configs FROM workspace_configs WHERE workspace_id = ?`,
            [workspaceId]
        );

        const existingConfigs: Record<string, any> = {};
        if (existingRows.length > 0 && existingRows[0].model_configs) {
            const parsed = typeof existingRows[0].model_configs === 'string'
                ? JSON.parse(existingRows[0].model_configs)
                : existingRows[0].model_configs;
            parsed.forEach((c: any) => {
                existingConfigs[c.id] = c;
            });
        }

        // 处理 API Keys
        const encryptedConfigs = configs.map((config: any) => {
            let apiKeyToStore = '';

            if (config.apiKey === '__PRESERVE__') {
                // 保留现有的加密 key
                apiKeyToStore = existingConfigs[config.id]?.apiKey || '';
            } else if (config.apiKey && !config.apiKey.startsWith('••••')) {
                // 新的 API Key，需要加密
                apiKeyToStore = encrypt(config.apiKey);
            } else if (config.apiKey?.startsWith('••••')) {
                // 遮罩的 key，保留现有加密的
                apiKeyToStore = existingConfigs[config.id]?.apiKey || '';
            }
            // 如果 apiKey 是空字符串或未定义，存储空字符串

            return {
                ...config,
                apiKey: apiKeyToStore,
            };
        });

        // 检查记录是否存在，然后 INSERT 或 UPDATE
        const [existingRecord] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM workspace_configs WHERE workspace_id = ?`,
            [workspaceId]
        );

        if (existingRecord.length === 0) {
            // 记录不存在，INSERT
            await pool.execute(
                `INSERT INTO workspace_configs (id, workspace_id, model_configs) VALUES (?, ?, ?)`,
                [uuidv4(), workspaceId, JSON.stringify(encryptedConfigs)]
            );
        } else {
            // 记录存在，UPDATE
            await pool.execute(
                `UPDATE workspace_configs SET model_configs = ? WHERE workspace_id = ?`,
                [JSON.stringify(encryptedConfigs), workspaceId]
            );
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Save AI config error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 添加 AI 配置
 * POST /api/workspace-config/:workspaceId/ai
 */
router.post('/:workspaceId/ai', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { name, provider, model, apiKey, baseUrl, temperature, maxTokens } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT model_configs FROM workspace_configs WHERE workspace_id = ?`,
            [workspaceId]
        );

        const existingConfigs = rows.length > 0 && rows[0].model_configs
            ? (typeof rows[0].model_configs === 'string' ? JSON.parse(rows[0].model_configs) : rows[0].model_configs)
            : [];

        const newConfig = {
            id: uuidv4(),
            name: name || `${provider} - ${model}`,
            provider: provider || 'openai',
            model: model || 'gpt-4o-mini',
            apiKey: apiKey ? encrypt(apiKey) : '',
            baseUrl: baseUrl || '',
            temperature: temperature ?? 0.7,
            maxTokens: maxTokens ?? 4096,
            isActive: existingConfigs.length === 0, // 第一个配置默认激活
            createdAt: Date.now(),
        };

        existingConfigs.push(newConfig);

        // 检查记录是否存在，然后 INSERT 或 UPDATE
        const [existingRecord] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM workspace_configs WHERE workspace_id = ?`,
            [workspaceId]
        );

        if (existingRecord.length === 0) {
            // 记录不存在，INSERT
            await pool.execute(
                `INSERT INTO workspace_configs (id, workspace_id, model_configs) VALUES (?, ?, ?)`,
                [uuidv4(), workspaceId, JSON.stringify(existingConfigs)]
            );
        } else {
            // 记录存在，UPDATE
            await pool.execute(
                `UPDATE workspace_configs SET model_configs = ? WHERE workspace_id = ?`,
                [JSON.stringify(existingConfigs), workspaceId]
            );
        }

        res.status(201).json({
            id: newConfig.id,
            name: newConfig.name,
            provider: newConfig.provider,
            model: newConfig.model,
            hasApiKey: !!apiKey,
        });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Add AI config error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除 AI 配置
 * DELETE /api/workspace-config/:workspaceId/ai/:configId
 */
router.delete('/:workspaceId/ai/:configId', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, configId } = req.params;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT model_configs FROM workspace_configs WHERE workspace_id = ?`,
            [workspaceId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '配置不存在' });
            return;
        }

        const configs = typeof rows[0].model_configs === 'string'
            ? JSON.parse(rows[0].model_configs)
            : rows[0].model_configs;

        const updatedConfigs = configs.filter((c: any) => c.id !== configId);

        await pool.execute(
            `UPDATE workspace_configs SET model_configs = ? WHERE workspace_id = ?`,
            [JSON.stringify(updatedConfigs), workspaceId]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Delete AI config error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 获取解密后的 API Key (用于工作流执行)
 * GET /api/workspace-config/:workspaceId/ai/:configId/key
 */
router.get('/:workspaceId/ai/:configId/key', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, configId } = req.params;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT model_configs FROM workspace_configs WHERE workspace_id = ?`,
            [workspaceId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '配置不存在' });
            return;
        }

        const configs = typeof rows[0].model_configs === 'string'
            ? JSON.parse(rows[0].model_configs)
            : rows[0].model_configs;

        const config = configs.find((c: any) => c.id === configId);

        if (!config) {
            res.status(404).json({ error: '配置不存在' });
            return;
        }

        res.json({
            apiKey: decrypt(config.apiKey),
            baseUrl: config.baseUrl,
            model: config.model,
            provider: config.provider,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
        });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Get API key error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 执行历史
// ============================================

/**
 * 获取工作区执行历史
 * GET /api/workspace-config/:workspaceId/executions
 */
router.get('/:workspaceId/executions', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
                we.id, we.workflow_id, we.status, we.progress, 
                we.context, we.error, we.created_at, we.updated_at,
                w.name as workflow_name, w.node_count
             FROM workflow_executions we
             LEFT JOIN workflows w ON we.workflow_id = w.id
             WHERE we.workspace_id = ?
             ORDER BY we.created_at DESC
             LIMIT ? OFFSET ?`,
            [workspaceId, Number(limit), Number(offset)]
        );

        // 获取总数
        const [countRows] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) as total FROM workflow_executions WHERE workspace_id = ?`,
            [workspaceId]
        );

        const executions = rows.map(row => {
            const ctx = typeof row.context === 'string' ? JSON.parse(row.context) : row.context;
            return {
                id: row.id,
                workflowId: row.workflow_id,
                workflowName: row.workflow_name || '未知工作流',
                status: row.status,
                startTime: row.created_at,
                endTime: row.updated_at,
                duration: row.updated_at && row.created_at
                    ? new Date(row.updated_at).getTime() - new Date(row.created_at).getTime()
                    : null,
                totalTokens: ctx?.totalTokens || 0,
                nodeCount: row.node_count || 0,
                completedNodes: Math.floor((row.progress || 0) * (row.node_count || 1) / 100),
                error: row.error,
                logs: ctx?.logs?.slice(-10) || [],
            };
        });

        res.json({
            executions,
            total: (countRows[0] as any).total,
            hasMore: Number(offset) + rows.length < (countRows[0] as any).total,
        });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Get executions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 文件管理
// ============================================

// 工作区文件存储目录
const getWorkspaceDir = (workspaceId: string): string => {
    const baseDir = process.env.WORKSPACE_FILES_DIR || path.join(process.cwd(), 'workspace-files');
    return path.join(baseDir, workspaceId);
};

/**
 * 获取工作区文件列表
 * GET /api/workspace-config/:workspaceId/files
 */
router.get('/:workspaceId/files', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { path: subPath = '' } = req.query;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const wsDir = getWorkspaceDir(workspaceId);
        const targetDir = path.join(wsDir, String(subPath));

        // 确保目录存在
        if (!fs.existsSync(wsDir)) {
            fs.mkdirSync(wsDir, { recursive: true });
        }

        if (!fs.existsSync(targetDir)) {
            res.json({ files: [] });
            return;
        }

        const items = fs.readdirSync(targetDir, { withFileTypes: true });

        const files = items.map(item => {
            const fullPath = path.join(targetDir, item.name);
            const stats = fs.statSync(fullPath);
            const relativePath = path.join(String(subPath), item.name);

            return {
                id: Buffer.from(relativePath).toString('base64'),
                name: item.name,
                type: item.isDirectory() ? 'folder' : 'file',
                path: '/' + relativePath.replace(/\\/g, '/'),
                size: item.isFile() ? stats.size : undefined,
                mimeType: item.isFile() ? getMimeType(item.name) : undefined,
                createdAt: stats.birthtime.toISOString(),
                updatedAt: stats.mtime.toISOString(),
            };
        });

        res.json({ files });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Get files error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 上传文件
 * POST /api/workspace-config/:workspaceId/files
 */
router.post('/:workspaceId/files', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { path: targetPath = '/', content, name, isDirectory } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const wsDir = getWorkspaceDir(workspaceId);
        const fullPath = path.join(wsDir, String(targetPath), name);

        // 确保父目录存在
        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        if (isDirectory) {
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            // 如果 content 是 base64 编码
            const data = content.startsWith('data:')
                ? Buffer.from(content.split(',')[1], 'base64')
                : content;
            fs.writeFileSync(fullPath, data);
        }

        res.status(201).json({
            success: true,
            path: path.join(String(targetPath), name).replace(/\\/g, '/'),
        });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Upload file error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除文件或文件夹
 * DELETE /api/workspace-config/:workspaceId/files
 */
router.delete('/:workspaceId/files', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { path: targetPath } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const wsDir = getWorkspaceDir(workspaceId);
        const fullPath = path.join(wsDir, String(targetPath));

        // 安全检查：确保路径在工作区内
        if (!fullPath.startsWith(wsDir)) {
            res.status(400).json({ error: '无效路径' });
            return;
        }

        if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                fs.rmSync(fullPath, { recursive: true });
            } else {
                fs.unlinkSync(fullPath);
            }
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[WorkspaceConfig] Delete file error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 辅助函数
// ============================================

function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.json': 'application/json',
        '.js': 'text/javascript',
        '.ts': 'text/typescript',
        '.md': 'text/markdown',
        '.txt': 'text/plain',
        '.html': 'text/html',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

export default router;
