/**
 * MCP 市场 API 路由
 * 
 * @module server/src/routes/mcp-marketplace
 * @description Smithery MCP 市场集成 API
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import * as smithery from '../services/smitheryService';

const router = Router();

// ============================================
// 公开 API (无需登录)
// ============================================

/**
 * 检查 Smithery API 健康状态
 * GET /api/mcp-marketplace/health
 */
router.get('/health', async (_req: Request, res: Response) => {
    try {
        const isHealthy = await smithery.checkApiHealth();
        res.json({
            success: true,
            healthy: isHealthy,
            proxyConfigured: !!process.env.SMITHERY_PROXY_URL,
            message: isHealthy
                ? 'Smithery API 可访问'
                : '无法连接 Smithery API，请检查网络或配置 SMITHERY_PROXY_URL'
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            healthy: false,
            message: '检查失败：' + error.message
        });
    }
});

/**
 * 搜索 Smithery MCP
 * GET /api/mcp-marketplace/search
 */
router.get('/search', async (req: Request, res: Response) => {
    try {
        const query = (req.query.q as string) || '';
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;

        const result = await smithery.searchServers(query, page, pageSize);

        res.json({
            success: true,
            data: result.servers,
            pagination: result.pagination,
        });
    } catch (error: any) {
        console.error('[MCP Marketplace] Search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取热门 MCP
 * GET /api/mcp-marketplace/popular
 */
router.get('/popular', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const servers = await smithery.getPopularServers(limit);

        res.json({
            success: true,
            data: servers,
        });
    } catch (error: any) {
        console.error('[MCP Marketplace] Popular error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取 MCP 详情
 * GET /api/mcp-marketplace/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const serverId = req.params.id;
        const server = await smithery.getServerDetails(serverId);

        if (!server) {
            res.status(404).json({ success: false, error: 'MCP not found' });
            return;
        }

        res.json({
            success: true,
            data: server,
        });
    } catch (error: any) {
        console.error('[MCP Marketplace] Get details error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 需要登录的 API
// ============================================

/**
 * 安装 MCP (Ultra 用户)
 * POST /api/mcp-marketplace/:id/install
 */
router.post('/:id/install', authMiddleware, async (req: Request, res: Response) => {
    try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;
        const serverId = req.params.id;

        if (!userId) {
            res.status(401).json({ success: false, error: '请先登录' });
            return;
        }

        // 检查用户权限 (Ultra 用户)
        const [userRows] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username, tier FROM users WHERE id = ?',
            [userId]
        );

        if (userRows.length === 0) {
            res.status(401).json({ success: false, error: '用户不存在' });
            return;
        }

        const user = userRows[0];
        // 如果没有 tier 字段，默认允许所有用户 (可以后续添加限制)
        const isUltra = user.tier === 'ultra' || user.tier === 'pro' || !user.tier;

        if (!isUltra) {
            res.status(403).json({
                success: false,
                error: '此功能仅对 Ultra 用户开放',
                upgrade: true
            });
            return;
        }

        // 获取 MCP 详情
        const server = await smithery.getServerDetails(serverId);
        if (!server) {
            res.status(404).json({ success: false, error: 'MCP 不存在' });
            return;
        }

        // 检查是否已安装
        const [existingRows] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM user_mcp_installs WHERE user_id = ? AND mcp_id = ?',
            [userId, serverId]
        );

        if (existingRows.length > 0) {
            res.status(400).json({ success: false, error: '已安装此 MCP' });
            return;
        }

        // 插入安装记录
        await pool.execute<ResultSetHeader>(
            `INSERT INTO user_mcp_installs (user_id, mcp_id, source, mcp_name, mcp_description, installed_at, enabled)
             VALUES (?, ?, 'marketplace', ?, ?, NOW(), TRUE)`,
            [userId, serverId, server.displayName, server.description || '']
        );

        // 同时在 mcp_registry 中创建记录 (如果不存在)
        try {
            await pool.execute(
                `INSERT IGNORE INTO mcp_registry 
                 (id, name, description, version, provider_type, status, tools, connection, permissions, metadata, source, marketplace_id, installed_by, created_at)
                 VALUES (?, ?, ?, '1.0.0', 'marketplace', 'HEALTHY', ?, '{}', '[]', '{}', 'MARKETPLACE', ?, ?, NOW())`,
                [
                    `marketplace-${serverId.replace(/[^a-zA-Z0-9-]/g, '-')}`,
                    server.displayName,
                    server.description || '',
                    JSON.stringify(server.tools || []),
                    serverId,
                    userId,
                ]
            );
        } catch (e) {
            // 忽略重复插入错误
        }

        res.json({
            success: true,
            message: 'MCP 安装成功',
            data: {
                mcpId: serverId,
                name: server.displayName,
            },
        });
    } catch (error: any) {
        console.error('[MCP Marketplace] Install error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 卸载 MCP
 * DELETE /api/mcp-marketplace/:id/uninstall
 */
router.delete('/:id/uninstall', authMiddleware, async (req: Request, res: Response) => {
    try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;
        const serverId = req.params.id;

        if (!userId) {
            res.status(401).json({ success: false, error: '请先登录' });
            return;
        }

        await pool.execute(
            'DELETE FROM user_mcp_installs WHERE user_id = ? AND mcp_id = ?',
            [userId, serverId]
        );

        res.json({
            success: true,
            message: 'MCP 已卸载',
        });
    } catch (error: any) {
        console.error('[MCP Marketplace] Uninstall error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取用户已安装的 MCP
 * GET /api/mcp-marketplace/installed
 */
router.get('/user/installed', authMiddleware, async (req: Request, res: Response) => {
    try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;

        if (!userId) {
            res.status(401).json({ success: false, error: '请先登录' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT mcp_id, mcp_name, mcp_description, source, installed_at, enabled
             FROM user_mcp_installs
             WHERE user_id = ?
             ORDER BY installed_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            data: rows,
        });
    } catch (error: any) {
        console.error('[MCP Marketplace] Get installed error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 切换 MCP 启用状态
 * PATCH /api/mcp-marketplace/:id/toggle
 */
router.patch('/:id/toggle', authMiddleware, async (req: Request, res: Response) => {
    try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;
        const serverId = req.params.id;
        const { enabled } = req.body;

        if (!userId) {
            res.status(401).json({ success: false, error: '请先登录' });
            return;
        }

        await pool.execute(
            'UPDATE user_mcp_installs SET enabled = ? WHERE user_id = ? AND mcp_id = ?',
            [enabled ? 1 : 0, userId, serverId]
        );

        res.json({
            success: true,
            message: enabled ? 'MCP 已启用' : 'MCP 已禁用',
        });
    } catch (error: any) {
        console.error('[MCP Marketplace] Toggle error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
