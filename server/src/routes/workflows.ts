/**
 * Workflow API 路由
 * 
 * @module server/routes/workflows
 * @description 工作流 CRUD、版本管理、执行
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================
// 中间件
// ============================================

router.use(authMiddleware);

// ============================================
// 辅助函数
// ============================================

/**
 * 验证用户对 Workspace 的所有权
 */
async function verifyWorkspaceOwnership(workspaceId: string, userId: string): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM workspaces WHERE id = ? AND owner_id = ? AND is_deleted = FALSE`,
        [workspaceId, userId]
    );
    return rows.length > 0;
}

// ============================================
// Workflow CRUD
// ============================================

/**
 * 获取 Workspace 中的所有工作流
 * GET /api/workflows?workspaceId=xxx
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.query;

        if (!workspaceId) {
            res.status(400).json({ error: '需要 workspaceId 参数' });
            return;
        }

        // 验证所有权
        if (!await verifyWorkspaceOwnership(workspaceId as string, userId)) {
            res.status(403).json({ error: '无权访问此 Workspace' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id, name, description, version, is_template, created_at, updated_at
       FROM workflows 
       WHERE workspace_id = ? AND is_deleted = FALSE 
       ORDER BY updated_at DESC`,
            [workspaceId]
        );

        res.json({ workflows: rows });
    } catch (error: any) {
        console.error('[Workflow] List error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 获取单个工作流详情
 * GET /api/workflows/:id
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.*, ws.owner_id 
       FROM workflows w 
       JOIN workspaces ws ON w.workspace_id = ws.id
       WHERE w.id = ? AND w.is_deleted = FALSE`,
            [id]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '工作流不存在' });
            return;
        }

        const workflow = rows[0];

        // 验证所有权 (类型安全比较)
        if (String(workflow.owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权访问此工作流' });
            return;
        }

        res.json({
            id: workflow.id,
            workspaceId: workflow.workspace_id,
            name: workflow.name,
            description: workflow.description,
            version: workflow.version,
            nodes: typeof workflow.nodes === 'string' ? JSON.parse(workflow.nodes) : workflow.nodes,
            edges: typeof workflow.edges === 'string' ? JSON.parse(workflow.edges) : workflow.edges,
            variables: typeof workflow.variables === 'string' ? JSON.parse(workflow.variables) : workflow.variables,
            isTemplate: workflow.is_template,
            createdBy: workflow.created_by,
            createdAt: new Date(workflow.created_at).getTime(),
            updatedAt: new Date(workflow.updated_at).getTime(),
        });
    } catch (error: any) {
        console.error('[Workflow] Get error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 创建新工作流
 * POST /api/workflows
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, name, description, nodes, edges, variables, isTemplate } = req.body;

        // 验证所有权
        if (!await verifyWorkspaceOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权在此 Workspace 创建工作流' });
            return;
        }

        const id = uuidv4();

        await pool.execute(
            `INSERT INTO workflows (id, workspace_id, name, description, nodes, edges, variables, is_template, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                workspaceId,
                name,
                description || null,
                JSON.stringify(nodes || []),
                JSON.stringify(edges || []),
                JSON.stringify(variables || {}),
                isTemplate || false,
                userId
            ]
        );

        // 创建初始版本
        await pool.execute(
            `INSERT INTO workflow_versions (id, workflow_id, version, snapshot, is_auto_save, created_by)
       VALUES (?, ?, 1, ?, FALSE, ?)`,
            [
                uuidv4(),
                id,
                JSON.stringify({ nodes: nodes || [], edges: edges || [], variables: variables || {} }),
                userId
            ]
        );

        res.status(201).json({
            id,
            workspaceId,
            name,
            description,
            version: 1,
            nodes: nodes || [],
            edges: edges || [],
            variables: variables || {},
            isTemplate: isTemplate || false,
            createdBy: userId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    } catch (error: any) {
        console.error('[Workflow] Create error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 更新工作流
 * PUT /api/workflows/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { name, description, nodes, edges, variables, createVersion } = req.body;

        // 获取工作流并验证权限
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.*, ws.owner_id 
       FROM workflows w 
       JOIN workspaces ws ON w.workspace_id = ws.id
       WHERE w.id = ? AND w.is_deleted = FALSE`,
            [id]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '工作流不存在' });
            return;
        }

        // 类型安全的比较 (owner_id 可能是字符串, userId 可能是数字)
        if (String(rows[0].owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权修改此工作流' });
            return;
        }

        const currentVersion = rows[0].version;
        let newVersion = currentVersion;

        // 如果需要创建新版本
        if (createVersion && (nodes || edges)) {
            newVersion = currentVersion + 1;

            await pool.execute(
                `INSERT INTO workflow_versions (id, workflow_id, version, snapshot, change_log, is_auto_save, created_by)
         VALUES (?, ?, ?, ?, ?, FALSE, ?)`,
                [
                    uuidv4(),
                    id,
                    newVersion,
                    JSON.stringify({
                        nodes: nodes || JSON.parse(rows[0].nodes),
                        edges: edges || JSON.parse(rows[0].edges),
                        variables: variables || JSON.parse(rows[0].variables)
                    }),
                    req.body.changeLog || null,
                    userId
                ]
            );
        }

        // 构建更新
        const updates: string[] = [];
        const values: any[] = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (nodes !== undefined) { updates.push('nodes = ?'); values.push(JSON.stringify(nodes)); }
        if (edges !== undefined) { updates.push('edges = ?'); values.push(JSON.stringify(edges)); }
        if (variables !== undefined) { updates.push('variables = ?'); values.push(JSON.stringify(variables)); }
        if (createVersion) { updates.push('version = ?'); values.push(newVersion); }

        if (updates.length > 0) {
            values.push(id);
            console.log('[Workflow] Updating workflow:', id, 'fields:', updates, 'nodes count:', nodes?.length);
            await pool.execute(
                `UPDATE workflows SET ${updates.join(', ')} WHERE id = ?`,
                values
            );
            console.log('[Workflow] Update successful for:', id);
        }

        res.json({ success: true, version: newVersion });
    } catch (error: any) {
        console.error('[Workflow] Update error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除工作流 (支持软删除和永久删除)
 * DELETE /api/workflows/:id
 * Query: permanent=true 为永久删除，否则为软删除
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const permanent = req.query.permanent === 'true';

        // 验证权限
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id, ws.owner_id 
       FROM workflows w 
       JOIN workspaces ws ON w.workspace_id = ws.id
       WHERE w.id = ? AND w.is_deleted = FALSE`,
            [id]
        );

        if (rows.length === 0 || String(rows[0].owner_id) !== String(userId)) {
            res.status(404).json({ error: '工作流不存在或无权删除' });
            return;
        }

        if (permanent) {
            // 永久删除 - 先删除相关记录
            await pool.execute(`DELETE FROM workflow_versions WHERE workflow_id = ?`, [id]);
            await pool.execute(`DELETE FROM workflow_executions WHERE workflow_id = ?`, [id]);
            await pool.execute(`DELETE FROM workflows WHERE id = ?`, [id]);
        } else {
            // 软删除
            await pool.execute(
                `UPDATE workflows SET is_deleted = TRUE WHERE id = ?`,
                [id]
            );
        }

        res.json({ success: true, permanent });
    } catch (error: any) {
        console.error('[Workflow] Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 版本管理
// ============================================

/**
 * 获取工作流版本列表
 * GET /api/workflows/:id/versions
 */
router.get('/:id/versions', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        // 验证权限
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id, ws.owner_id 
       FROM workflows w 
       JOIN workspaces ws ON w.workspace_id = ws.id
       WHERE w.id = ?`,
            [id]
        );

        if (wRows.length === 0 || wRows[0].owner_id !== userId) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [versions] = await pool.execute<RowDataPacket[]>(
            `SELECT id, version, change_log, is_auto_save, created_by, created_at
       FROM workflow_versions 
       WHERE workflow_id = ? 
       ORDER BY version DESC`,
            [id]
        );

        res.json({ versions });
    } catch (error: any) {
        console.error('[Workflow] Versions error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 回滚到指定版本
 * POST /api/workflows/:id/versions/:versionId/restore
 */
router.post('/:id/versions/:versionId/restore', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id, versionId } = req.params;

        // 验证权限
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id, w.version, ws.owner_id 
       FROM workflows w 
       JOIN workspaces ws ON w.workspace_id = ws.id
       WHERE w.id = ?`,
            [id]
        );

        if (wRows.length === 0 || wRows[0].owner_id !== userId) {
            res.status(403).json({ error: '无权操作' });
            return;
        }

        // 获取目标版本
        const [vRows] = await pool.execute<RowDataPacket[]>(
            `SELECT snapshot FROM workflow_versions WHERE id = ? AND workflow_id = ?`,
            [versionId, id]
        );

        if (vRows.length === 0) {
            res.status(404).json({ error: '版本不存在' });
            return;
        }

        const snapshot = typeof vRows[0].snapshot === 'string'
            ? JSON.parse(vRows[0].snapshot) : vRows[0].snapshot;

        const newVersion = wRows[0].version + 1;

        // 创建新版本记录
        await pool.execute(
            `INSERT INTO workflow_versions (id, workflow_id, version, snapshot, change_log, is_auto_save, created_by)
       VALUES (?, ?, ?, ?, ?, FALSE, ?)`,
            [uuidv4(), id, newVersion, JSON.stringify(snapshot), `Restored from version ${versionId}`, userId]
        );

        // 更新工作流
        await pool.execute(
            `UPDATE workflows SET nodes = ?, edges = ?, variables = ?, version = ? WHERE id = ?`,
            [JSON.stringify(snapshot.nodes), JSON.stringify(snapshot.edges), JSON.stringify(snapshot.variables), newVersion, id]
        );

        res.json({ success: true, version: newVersion });
    } catch (error: any) {
        console.error('[Workflow] Restore error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 节点调试 - 单节点测试执行
// ============================================

/**
 * 测试执行单个节点
 * POST /api/workflows/:id/nodes/:nodeId/test
 * Body: { input: any, variables?: object }
 */
router.post('/:id/nodes/:nodeId/test', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id, nodeId } = req.params;
        const { input, variables = {}, mockOutputs = {} } = req.body;

        // 获取工作流并验证权限
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.*, ws.owner_id 
       FROM workflows w 
       JOIN workspaces ws ON w.workspace_id = ws.id
       WHERE w.id = ? AND w.is_deleted = FALSE`,
            [id]
        );

        if (rows.length === 0 || String(rows[0].owner_id) !== String(userId)) {
            res.status(404).json({ error: '工作流不存在或无权访问' });
            return;
        }

        const workflow = rows[0];
        const nodes = typeof workflow.nodes === 'string' ? JSON.parse(workflow.nodes) : workflow.nodes;

        // 找到目标节点
        const targetNode = nodes.find((n: any) => n.id === nodeId);
        if (!targetNode) {
            res.status(404).json({ error: '节点不存在' });
            return;
        }

        const startTime = Date.now();
        const logs: Array<{ timestamp: number; level: string; message: string }> = [];

        // 创建模拟执行上下文
        const mockContext = {
            workflowId: id,
            executionId: `test-${Date.now()}`,
            variables: { ...variables, workspaceId: workflow.workspace_id },
            nodeStates: {} as Record<string, any>,
            logs,
            startTime,
        };

        // 填充 mock 节点输出 (用于变量引用)
        for (const [mockNodeId, mockOutput] of Object.entries(mockOutputs)) {
            mockContext.nodeStates[mockNodeId] = {
                status: 'completed',
                output: mockOutput
            };
        }

        logs.push({
            timestamp: Date.now(),
            level: 'info',
            message: `开始测试节点: ${targetNode.data?.label || nodeId} (${targetNode.type})`
        });

        try {
            // 动态导入执行器 (兼容 ESM/CJS)
            let nodeExecutors: Record<string, any>;
            try {
                // 尝试直接导入编译后的模块
                nodeExecutors = require('../../core/workflow/executors').nodeExecutors;
            } catch {
                // 如果失败，返回模拟结果
                logs.push({
                    timestamp: Date.now(),
                    level: 'warn',
                    message: '执行器模块未编译，返回模拟结果'
                });

                res.json({
                    success: true,
                    nodeId,
                    nodeType: targetNode.type,
                    input,
                    output: { _mock: true, message: '服务端执行器未就绪，请在前端测试' },
                    logs,
                    duration: Date.now() - startTime
                });
                return;
            }

            const executor = nodeExecutors[targetNode.type];
            if (!executor) {
                throw new Error(`不支持的节点类型: ${targetNode.type}`);
            }

            // 执行节点
            const output = await executor(targetNode, input, mockContext);

            logs.push({
                timestamp: Date.now(),
                level: 'info',
                message: `节点执行完成`
            });

            res.json({
                success: true,
                nodeId,
                nodeType: targetNode.type,
                input,
                output,
                logs,
                duration: Date.now() - startTime,
                tokenUsage: mockContext.nodeStates[nodeId]?.tokenUsage
            });
        } catch (execError: any) {
            logs.push({
                timestamp: Date.now(),
                level: 'error',
                message: execError.message
            });

            res.json({
                success: false,
                nodeId,
                nodeType: targetNode.type,
                input,
                error: execError.message,
                logs,
                duration: Date.now() - startTime
            });
        }
    } catch (error: any) {
        console.error('[Workflow] Node test error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
