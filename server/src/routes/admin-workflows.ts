/**
 * 管理员工作流 API
 * 
 * @module server/src/routes/admin-workflows
 * @description 管理员工作流统计和管理
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { adminMiddleware } from '../middleware/auth';

const router = Router();

// 所有路由需要管理员权限
router.use(adminMiddleware);

/**
 * 获取所有工作流 (管理员)
 * GET /api/admin/workflows
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                w.id, w.name, w.workspace_id, w.created_at, w.updated_at,
                u.username as owner_name,
                (SELECT COUNT(*) FROM workflow_executions WHERE workflow_id = w.id) as executions,
                CASE WHEN w.is_deleted THEN 'disabled' ELSE 'active' END as status
            FROM workflows w
            LEFT JOIN workspaces ws ON w.workspace_id = ws.id
            LEFT JOIN users u ON ws.owner_id = u.id
            ORDER BY w.updated_at DESC
            LIMIT 100
        `);

        res.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('[Admin] Get workflows error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取工作流统计
 * GET /api/admin/workflows/stats
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [total] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM workflows WHERE is_deleted = FALSE'
        );

        const [todayExec] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM workflow_executions WHERE created_at >= ?',
            [today.toISOString()]
        );

        const [running] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM workflow_executions WHERE status = ?',
            ['running']
        );

        const [failed] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM workflow_executions WHERE status = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
            ['failed']
        );

        const [totalRecent] = await pool.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM workflow_executions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
        );

        const failureRate = (totalRecent as any)[0].count > 0
            ? ((failed as any)[0].count / (totalRecent as any)[0].count * 100).toFixed(1)
            : 0;

        res.json({
            success: true,
            data: {
                totalWorkflows: (total as any)[0].count,
                todayExecutions: (todayExec as any)[0].count,
                runningExecutions: (running as any)[0].count,
                failureRate: parseFloat(failureRate as string),
            }
        });
    } catch (error: any) {
        console.error('[Admin] Get workflow stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取执行队列
 * GET /api/admin/workflows/executions
 */
router.get('/executions', async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                e.id, e.status, e.progress, e.created_at as started_at,
                w.name as workflow_name
            FROM workflow_executions e
            LEFT JOIN workflows w ON e.workflow_id = w.id
            WHERE e.status IN ('queued', 'running')
            ORDER BY e.created_at DESC
            LIMIT 20
        `);

        res.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('[Admin] Get executions error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 更新工作流状态
 * PUT /api/admin/workflows/:id/status
 */
router.put('/:id/status', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const isDeleted = status === 'disabled';
        await pool.execute(
            'UPDATE workflows SET is_deleted = ? WHERE id = ?',
            [isDeleted, id]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Admin] Update workflow status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 删除工作流
 * DELETE /api/admin/workflows/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        await pool.execute('UPDATE workflows SET is_deleted = TRUE WHERE id = ?', [id]);

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Admin] Delete workflow error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
