/**
 * 管理员 MCP 注册 API
 * 
 * @module server/src/routes/admin-mcp
 * @description MCP 注册中心管理 API
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { adminMiddleware } from '../middleware/auth';

const router = Router();

// 所有路由需要管理员权限
router.use(adminMiddleware);

// 内置 MCP 列表
const BUILTIN_MCPS = [
    { id: 'mcp-web-search', name: 'Web Search', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', tool_count: 1, usage_count: 0, created_at: '' },
    { id: 'mcp-file-system', name: 'File System', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', tool_count: 3, usage_count: 0, created_at: '' },
    { id: 'mcp-code-exec', name: 'Code Executor', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', tool_count: 1, usage_count: 0, created_at: '' },
    { id: 'mcp-http', name: 'HTTP Client', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', tool_count: 1, usage_count: 0, created_at: '' },
];

/**
 * 获取所有 MCP
 * GET /api/admin/mcp-registry
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        // 尝试从数据库获取用户上传的 MCP
        let userMCPs: any[] = [];
        try {
            const [rows] = await pool.execute<RowDataPacket[]>(`
                SELECT 
                    id, name, version, 'USER_UPLOADED' as source, status,
                    tool_count, usage_count, owner, created_at
                FROM mcp_registry
                ORDER BY created_at DESC
            `);
            userMCPs = rows;
        } catch (e) {
            // 表可能不存在，忽略
        }

        // 合并内置和用户 MCP
        const allMCPs = [...BUILTIN_MCPS, ...userMCPs];

        res.json({ success: true, data: allMCPs });
    } catch (error: any) {
        console.error('[Admin] Get MCP registry error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 审核通过 MCP
 * POST /api/admin/mcp-registry/:id/approve
 */
router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        await pool.execute(
            'UPDATE mcp_registry SET status = ? WHERE id = ?',
            ['HEALTHY', id]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Admin] Approve MCP error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 拒绝 MCP
 * POST /api/admin/mcp-registry/:id/reject
 */
router.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        await pool.execute('DELETE FROM mcp_registry WHERE id = ?', [id]);

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Admin] Reject MCP error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 删除 MCP
 * DELETE /api/admin/mcp-registry/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // 不能删除内置 MCP
        if (BUILTIN_MCPS.some(m => m.id === id)) {
            res.status(400).json({ success: false, error: '无法删除内置 MCP' });
            return;
        }

        await pool.execute('DELETE FROM mcp_registry WHERE id = ?', [id]);

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Admin] Delete MCP error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
