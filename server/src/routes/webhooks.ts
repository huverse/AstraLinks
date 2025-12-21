/**
 * Webhook 触发器路由
 * 
 * @module server/routes/webhooks
 * @description Webhook 触发器管理和触发执行
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authMiddleware } from '../middleware/auth';
import { addWorkflowJob } from '../services/workflowQueue';

const router = Router();

// ============================================
// 公开路由 - Webhook 触发 (无需认证)
// ============================================

/**
 * Webhook 触发入口
 * POST /api/webhooks/:token/trigger
 * 
 * 任何人都可以通过 token 触发工作流
 */
router.post('/:token/trigger', async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.params;
        const input = req.body;

        // 查找触发器
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT t.*, w.workspace_id, ws.owner_id 
             FROM workflow_triggers t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE t.webhook_token = ? AND t.is_active = TRUE AND t.type = 'webhook'`,
            [token]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: 'Webhook not found or inactive' });
            return;
        }

        const trigger = rows[0];
        const historyId = uuidv4();

        // 创建触发历史记录
        await pool.execute(
            `INSERT INTO trigger_history (id, trigger_id, workflow_id, status, input)
             VALUES (?, ?, ?, 'pending', ?)`,
            [historyId, trigger.id, trigger.workflow_id, JSON.stringify(input)]
        );

        // 更新触发器统计
        await pool.execute(
            `UPDATE workflow_triggers SET trigger_count = trigger_count + 1, last_triggered_at = NOW() WHERE id = ?`,
            [trigger.id]
        );

        // 添加到执行队列
        try {
            const job = await addWorkflowJob({
                workflowId: trigger.workflow_id,
                userId: trigger.owner_id,
                input,
                triggerId: trigger.id,
                triggerHistoryId: historyId
            });

            // 更新历史记录
            await pool.execute(
                `UPDATE trigger_history SET status = 'running', execution_id = ? WHERE id = ?`,
                [job.id, historyId]
            );

            res.status(202).json({
                success: true,
                message: 'Workflow triggered',
                executionId: job.id,
                historyId
            });
        } catch (queueError: any) {
            // 队列添加失败，更新历史记录
            await pool.execute(
                `UPDATE trigger_history SET status = 'failed', error = ? WHERE id = ?`,
                [queueError.message, historyId]
            );

            res.status(500).json({
                success: false,
                error: 'Failed to queue workflow execution',
                details: queueError.message
            });
        }
    } catch (error: any) {
        console.error('[Webhook] Trigger error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 受保护路由 - 触发器管理
// ============================================

router.use(authMiddleware);

/**
 * 获取工作流的所有触发器
 * GET /api/webhooks/triggers?workflowId=xxx
 */
router.get('/triggers', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workflowId } = req.query;

        if (!workflowId) {
            res.status(400).json({ error: '缺少 workflowId' });
            return;
        }

        // 验证工作流所有权
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id FROM workflows w
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE w.id = ? AND ws.owner_id = ?`,
            [workflowId, userId]
        );

        if (wRows.length === 0) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [triggers] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM workflow_triggers WHERE workflow_id = ? ORDER BY created_at DESC`,
            [workflowId]
        );

        res.json({ triggers });
    } catch (error: any) {
        console.error('[Webhook] Get triggers error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 创建触发器
 * POST /api/webhooks/triggers
 */
router.post('/triggers', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workflowId, type, name, config, cronExpression, timezone } = req.body;

        if (!workflowId || !type) {
            res.status(400).json({ error: '缺少必要参数' });
            return;
        }

        // 验证工作流所有权
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id FROM workflows w
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE w.id = ? AND ws.owner_id = ?`,
            [workflowId, userId]
        );

        if (wRows.length === 0) {
            res.status(403).json({ error: '无权操作' });
            return;
        }

        const id = uuidv4();
        let webhookToken = null;

        // Webhook 类型生成唯一 token
        if (type === 'webhook') {
            webhookToken = crypto.randomBytes(32).toString('hex');
        }

        await pool.execute(
            `INSERT INTO workflow_triggers (id, workflow_id, type, name, config, webhook_token, cron_expression, timezone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                workflowId,
                type,
                name || `${type} trigger`,
                config ? JSON.stringify(config) : null,
                webhookToken,
                cronExpression || null,
                timezone || 'Asia/Shanghai'
            ]
        );

        // 构建 Webhook URL
        const API_BASE = process.env.API_BASE_URL || 'https://astralinks.xyz';
        const webhookUrl = webhookToken ? `${API_BASE}/api/webhooks/${webhookToken}/trigger` : null;

        res.status(201).json({
            id,
            workflowId,
            type,
            name: name || `${type} trigger`,
            webhookToken,
            webhookUrl,
            cronExpression,
            isActive: true
        });
    } catch (error: any) {
        console.error('[Webhook] Create trigger error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 更新触发器状态
 * PUT /api/webhooks/triggers/:id
 */
router.put('/triggers/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { isActive, name, config, cronExpression } = req.body;

        // 验证所有权
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT t.id FROM workflow_triggers t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE t.id = ? AND ws.owner_id = ?`,
            [id, userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '触发器不存在或无权操作' });
            return;
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (isActive !== undefined) { updates.push('is_active = ?'); values.push(isActive); }
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(config)); }
        if (cronExpression !== undefined) { updates.push('cron_expression = ?'); values.push(cronExpression); }

        if (updates.length > 0) {
            values.push(id);
            await pool.execute(
                `UPDATE workflow_triggers SET ${updates.join(', ')} WHERE id = ?`,
                values
            );
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Webhook] Update trigger error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除触发器
 * DELETE /api/webhooks/triggers/:id
 */
router.delete('/triggers/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        // 验证所有权
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT t.id FROM workflow_triggers t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE t.id = ? AND ws.owner_id = ?`,
            [id, userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '触发器不存在或无权操作' });
            return;
        }

        await pool.execute(`DELETE FROM workflow_triggers WHERE id = ?`, [id]);

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Webhook] Delete trigger error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 获取触发历史
 * GET /api/webhooks/triggers/:id/history
 */
router.get('/triggers/:id/history', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const limit = parseInt(req.query.limit as string) || 20;

        // 验证所有权
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT t.id FROM workflow_triggers t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE t.id = ? AND ws.owner_id = ?`,
            [id, userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '触发器不存在或无权操作' });
            return;
        }

        const [history] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM trigger_history WHERE trigger_id = ? ORDER BY triggered_at DESC LIMIT ?`,
            [id, limit]
        );

        res.json({ history });
    } catch (error: any) {
        console.error('[Webhook] Get history error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
