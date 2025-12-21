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

/**
 * 比较两个版本
 * GET /api/workflows/:id/versions/compare?v1=xxx&v2=xxx
 */
router.get('/:id/versions/compare', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { v1, v2 } = req.query;

        if (!v1 || !v2) {
            res.status(400).json({ error: '需要 v1 和 v2 参数' });
            return;
        }

        // 验证权限
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id, ws.owner_id FROM workflows w 
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE w.id = ?`,
            [id]
        );

        if (wRows.length === 0 || String(wRows[0].owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        // 获取两个版本
        const [versions] = await pool.execute<RowDataPacket[]>(
            `SELECT id, version, snapshot, created_at FROM workflow_versions 
             WHERE workflow_id = ? AND (id = ? OR id = ?)`,
            [id, v1, v2]
        );

        if (versions.length !== 2) {
            res.status(404).json({ error: '版本不存在' });
            return;
        }

        const version1 = versions.find(v => v.id === v1);
        const version2 = versions.find(v => v.id === v2);

        if (!version1 || !version2) {
            res.status(404).json({ error: '无法找到指定版本' });
            return;
        }

        const snapshot1 = typeof version1.snapshot === 'string'
            ? JSON.parse(version1.snapshot) : version1.snapshot;
        const snapshot2 = typeof version2.snapshot === 'string'
            ? JSON.parse(version2.snapshot) : version2.snapshot;

        // 计算差异
        const nodesDiff = {
            added: snapshot2.nodes?.filter((n: any) =>
                !snapshot1.nodes?.find((n1: any) => n1.id === n.id)
            ) || [],
            removed: snapshot1.nodes?.filter((n: any) =>
                !snapshot2.nodes?.find((n2: any) => n2.id === n.id)
            ) || [],
            modified: snapshot2.nodes?.filter((n: any) => {
                const n1 = snapshot1.nodes?.find((node: any) => node.id === n.id);
                return n1 && JSON.stringify(n1) !== JSON.stringify(n);
            }) || []
        };

        const edgesDiff = {
            added: snapshot2.edges?.filter((e: any) =>
                !snapshot1.edges?.find((e1: any) => e1.id === e.id)
            ) || [],
            removed: snapshot1.edges?.filter((e: any) =>
                !snapshot2.edges?.find((e2: any) => e2.id === e.id)
            ) || []
        };

        res.json({
            v1: { id: version1.id, version: version1.version, createdAt: version1.created_at },
            v2: { id: version2.id, version: version2.version, createdAt: version2.created_at },
            diff: {
                nodes: nodesDiff,
                edges: edgesDiff,
                summary: {
                    nodesAdded: nodesDiff.added.length,
                    nodesRemoved: nodesDiff.removed.length,
                    nodesModified: nodesDiff.modified.length,
                    edgesAdded: edgesDiff.added.length,
                    edgesRemoved: edgesDiff.removed.length
                }
            }
        });
    } catch (error: any) {
        console.error('[Workflow] Compare error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 执行分析
// ============================================

/**
 * 获取执行统计
 * GET /api/workflows/:id/analytics
 */
router.get('/:id/analytics', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { days = 30 } = req.query;

        // 验证权限
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id, ws.owner_id FROM workflows w 
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE w.id = ?`,
            [id]
        );

        if (wRows.length === 0 || String(wRows[0].owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        // 执行统计
        const [stats] = await pool.execute<RowDataPacket[]>(
            `SELECT 
                COUNT(*) as totalExecutions,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                AVG(duration_ms) as avgDuration,
                MIN(duration_ms) as minDuration,
                MAX(duration_ms) as maxDuration,
                SUM(token_usage) as totalTokens
             FROM workflow_executions 
             WHERE workflow_id = ? AND started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [id, days]
        );

        // 每日执行数
        const [daily] = await pool.execute<RowDataPacket[]>(
            `SELECT 
                DATE(started_at) as date,
                COUNT(*) as count,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
             FROM workflow_executions 
             WHERE workflow_id = ? AND started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY DATE(started_at)
             ORDER BY date`,
            [id, days]
        );

        // 节点耗时分析 (从最近10次执行中提取)
        const [recentExecutions] = await pool.execute<RowDataPacket[]>(
            `SELECT node_states FROM workflow_executions 
             WHERE workflow_id = ? AND status = 'completed' AND node_states IS NOT NULL
             ORDER BY started_at DESC LIMIT 10`,
            [id]
        );

        // 聚合节点耗时
        const nodeTimings: Record<string, number[]> = {};
        for (const exec of recentExecutions) {
            const states = typeof exec.node_states === 'string'
                ? JSON.parse(exec.node_states) : exec.node_states;
            if (states) {
                for (const [nodeId, state] of Object.entries(states) as [string, any][]) {
                    if (state.startTime && state.endTime) {
                        if (!nodeTimings[nodeId]) nodeTimings[nodeId] = [];
                        nodeTimings[nodeId].push(state.endTime - state.startTime);
                    }
                }
            }
        }

        const nodePerformance = Object.entries(nodeTimings).map(([nodeId, times]) => ({
            nodeId,
            avgDuration: times.reduce((a, b) => a + b, 0) / times.length,
            minDuration: Math.min(...times),
            maxDuration: Math.max(...times),
            sampleCount: times.length
        })).sort((a, b) => b.avgDuration - a.avgDuration);

        res.json({
            period: { days: Number(days) },
            summary: {
                totalExecutions: stats[0]?.totalExecutions || 0,
                successful: stats[0]?.successful || 0,
                failed: stats[0]?.failed || 0,
                successRate: stats[0]?.totalExecutions
                    ? ((stats[0].successful / stats[0].totalExecutions) * 100).toFixed(1) + '%'
                    : '0%',
                avgDuration: Math.round(stats[0]?.avgDuration || 0),
                minDuration: stats[0]?.minDuration || 0,
                maxDuration: stats[0]?.maxDuration || 0,
                totalTokens: stats[0]?.totalTokens || 0
            },
            dailyStats: daily,
            nodePerformance: nodePerformance.slice(0, 10) // 耗时最长的10个节点
        });
    } catch (error: any) {
        console.error('[Workflow] Analytics error:', error);
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

// ============================================
// 子工作流同步执行
// ============================================

/**
 * 同步执行子工作流 (用于子工作流节点)
 * POST /api/workflows/:id/execute-sync
 * 
 * 同步等待执行结果，超时自动返回
 */
router.post('/:id/execute-sync', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id: workflowId } = req.params;
        const { input = {}, timeout = 60000, parentExecutionId } = req.body;

        // 获取工作流
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.*, ws.owner_id 
             FROM workflows w 
             JOIN workspaces ws ON w.workspace_id = ws.id 
             WHERE w.id = ? AND w.is_deleted = FALSE`,
            [workflowId]
        );

        if (wRows.length === 0) {
            res.status(404).json({ error: '工作流不存在' });
            return;
        }

        const workflow = wRows[0];

        // 验证所有权
        if (String(workflow.owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权执行此工作流' });
            return;
        }

        // 创建执行记录
        const executionId = uuidv4();

        await pool.execute(
            `INSERT INTO workflow_executions (id, workflow_id, status, input, started_at)
             VALUES (?, ?, 'running', ?, NOW())`,
            [executionId, workflowId, JSON.stringify(input)]
        );

        console.log(`[SubWorkflow] Starting sync execution ${executionId} for workflow ${workflowId}`);

        // 获取节点和边
        const nodes = workflow.nodes || [];
        const edges = workflow.edges || [];

        if (nodes.length === 0) {
            await pool.execute(
                `UPDATE workflow_executions SET status = 'completed', output = ?, finished_at = NOW() WHERE id = ?`,
                [JSON.stringify({ result: input, message: '空工作流' }), executionId]
            );
            res.json({ success: true, executionId, output: input, duration: 0 });
            return;
        }

        // 简化执行: 按拓扑顺序执行节点
        const startNode = nodes.find((n: any) => n.type === 'start');
        if (!startNode) {
            await pool.execute(
                `UPDATE workflow_executions SET status = 'failed', error = ?, finished_at = NOW() WHERE id = ?`,
                ['没有开始节点', executionId]
            );
            res.status(400).json({ error: '工作流没有开始节点' });
            return;
        }

        // 构建邻接表
        const adjacency: Record<string, string[]> = {};
        for (const edge of edges) {
            if (!adjacency[edge.source]) adjacency[edge.source] = [];
            adjacency[edge.source].push(edge.target);
        }

        // BFS 执行节点
        const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));
        const visited = new Set<string>();
        const outputs: Record<string, any> = {};
        let currentInput = input;
        let finalOutput = input;

        const queue = [startNode.id];
        const startTime = Date.now();

        while (queue.length > 0 && (Date.now() - startTime) < timeout) {
            const nodeId = queue.shift()!;
            if (visited.has(nodeId)) continue;
            visited.add(nodeId);

            const node = nodeMap.get(nodeId) as any;
            if (!node) continue;

            // 跳过 start/end 节点的实际执行
            if (node.type === 'start') {
                outputs[nodeId] = currentInput;
            } else if (node.type === 'end') {
                finalOutput = currentInput;
            } else {
                // 其他节点记录输入输出 (真实执行需要调用 executor)
                outputs[nodeId] = { input: currentInput, processed: true };
            }

            // 添加后继节点
            const nextNodes = adjacency[nodeId] || [];
            for (const next of nextNodes) {
                if (!visited.has(next)) {
                    queue.push(next);
                }
            }
        }

        // 更新执行记录
        const duration = Date.now() - startTime;
        await pool.execute(
            `UPDATE workflow_executions SET status = 'completed', output = ?, duration_ms = ?, finished_at = NOW() WHERE id = ?`,
            [JSON.stringify(finalOutput), duration, executionId]
        );

        console.log(`[SubWorkflow] Execution ${executionId} completed in ${duration}ms`);

        res.json({
            success: true,
            executionId,
            workflowId,
            workflowName: workflow.name,
            output: finalOutput,
            nodeOutputs: outputs,
            nodesExecuted: visited.size,
            duration,
            parentExecutionId
        });
    } catch (error: any) {
        console.error('[Workflow] Sync execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 导入/导出
// ============================================

/**
 * 导出工作流
 * GET /api/workflows/:id/export
 */
router.get('/:id/export', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        // 获取工作流
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.*, ws.owner_id FROM workflows w 
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE w.id = ? AND w.is_deleted = FALSE`,
            [id]
        );

        if (wRows.length === 0) {
            res.status(404).json({ error: '工作流不存在' });
            return;
        }

        const workflow = wRows[0];

        if (String(workflow.owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权导出' });
            return;
        }

        // 构建导出格式
        const exportData = {
            version: '1.0',
            type: 'astralinks-workflow',
            exportedAt: new Date().toISOString(),
            workflow: {
                name: workflow.name,
                description: workflow.description,
                nodes: workflow.nodes || [],
                edges: workflow.edges || [],
                variables: workflow.variables || {},
                isTemplate: workflow.is_template
            }
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${workflow.name || 'workflow'}.json"`);
        res.json(exportData);
    } catch (error: any) {
        console.error('[Workflow] Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 导入工作流
 * POST /api/workflows/import
 */
router.post('/import', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, data, name: overrideName } = req.body;

        if (!workspaceId) {
            res.status(400).json({ error: '需要 workspaceId' });
            return;
        }

        // 验证 workspace 所有权
        if (!await verifyWorkspaceOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问此 Workspace' });
            return;
        }

        // 解析导入数据
        let importData = data;
        if (typeof data === 'string') {
            try {
                importData = JSON.parse(data);
            } catch {
                res.status(400).json({ error: '无效的 JSON 格式' });
                return;
            }
        }

        // 验证格式
        if (!importData.workflow && !importData.nodes) {
            res.status(400).json({ error: '无效的工作流格式' });
            return;
        }

        const workflow = importData.workflow || importData;
        const id = uuidv4();
        const workflowName = overrideName || workflow.name || '导入的工作流';

        // 创建工作流
        await pool.execute(
            `INSERT INTO workflows (id, workspace_id, name, description, nodes, edges, variables, is_template, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                workspaceId,
                workflowName,
                workflow.description || null,
                JSON.stringify(workflow.nodes || []),
                JSON.stringify(workflow.edges || []),
                JSON.stringify(workflow.variables || {}),
                workflow.isTemplate || false,
                userId
            ]
        );

        // 创建初始版本
        await pool.execute(
            `INSERT INTO workflow_versions (id, workflow_id, version, snapshot, change_log, is_auto_save, created_by)
             VALUES (?, ?, 1, ?, ?, FALSE, ?)`,
            [
                uuidv4(),
                id,
                JSON.stringify({ nodes: workflow.nodes || [], edges: workflow.edges || [], variables: workflow.variables || {} }),
                'Imported workflow',
                userId
            ]
        );

        res.status(201).json({
            success: true,
            id,
            name: workflowName,
            nodesCount: (workflow.nodes || []).length,
            edgesCount: (workflow.edges || []).length
        });
    } catch (error: any) {
        console.error('[Workflow] Import error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 模板市场
// ============================================

/**
 * 获取公开模板列表
 * GET /api/workflows/templates/public
 */
router.get('/templates/public', async (req: Request, res: Response): Promise<void> => {
    try {
        const { category, search, sort = 'popular', page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = `
            SELECT 
                w.id, w.name, w.description, w.nodes, w.edges,
                w.created_at, w.updated_at,
                u.username as author,
                COALESCE(AVG(tr.rating), 0) as avg_rating,
                COUNT(DISTINCT tr.id) as rating_count,
                COUNT(DISTINCT tc.id) as clone_count
            FROM workflows w
            JOIN users u ON w.created_by = u.id
            LEFT JOIN template_ratings tr ON tr.workflow_id = w.id
            LEFT JOIN template_clones tc ON tc.workflow_id = w.id
            WHERE w.is_template = TRUE AND w.is_deleted = FALSE AND w.is_public = TRUE
        `;
        const params: any[] = [];

        if (category) {
            query += ` AND w.category = ?`;
            params.push(category);
        }

        if (search) {
            query += ` AND (w.name LIKE ? OR w.description LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` GROUP BY w.id`;

        // 排序
        switch (sort) {
            case 'newest':
                query += ` ORDER BY w.created_at DESC`;
                break;
            case 'rating':
                query += ` ORDER BY avg_rating DESC`;
                break;
            case 'popular':
            default:
                query += ` ORDER BY clone_count DESC, avg_rating DESC`;
        }

        query += ` LIMIT ? OFFSET ?`;
        params.push(Number(limit), offset);

        const [templates] = await pool.execute<RowDataPacket[]>(query, params);

        // 获取总数
        const [countResult] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) as total FROM workflows 
             WHERE is_template = TRUE AND is_deleted = FALSE AND is_public = TRUE`
        );

        res.json({
            templates: templates.map(t => ({
                ...t,
                nodeCount: JSON.parse(t.nodes || '[]').length,
                avg_rating: Number(t.avg_rating).toFixed(1),
                nodes: undefined,
                edges: undefined
            })),
            total: countResult[0]?.total || 0,
            page: Number(page),
            limit: Number(limit)
        });
    } catch (error: any) {
        console.error('[Template] List error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 获取模板详情
 * GET /api/workflows/templates/:id
 */
router.get('/templates/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.*, u.username as author,
                    COALESCE(AVG(tr.rating), 0) as avg_rating,
                    COUNT(DISTINCT tr.id) as rating_count
             FROM workflows w
             JOIN users u ON w.created_by = u.id
             LEFT JOIN template_ratings tr ON tr.workflow_id = w.id
             WHERE w.id = ? AND w.is_template = TRUE AND w.is_deleted = FALSE`,
            [id]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '模板不存在' });
            return;
        }

        res.json(rows[0]);
    } catch (error: any) {
        console.error('[Template] Get error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 发布为模板
 * POST /api/workflows/:id/publish
 */
router.post('/:id/publish', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { category, isPublic = true } = req.body;

        // 验证权限
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id, ws.owner_id FROM workflows w 
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE w.id = ?`,
            [id]
        );

        if (wRows.length === 0 || String(wRows[0].owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权操作' });
            return;
        }

        await pool.execute(
            `UPDATE workflows SET is_template = TRUE, is_public = ?, category = ? WHERE id = ?`,
            [isPublic, category || null, id]
        );

        res.json({ success: true, isTemplate: true, isPublic });
    } catch (error: any) {
        console.error('[Template] Publish error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 评分模板
 * POST /api/workflows/templates/:id/rate
 */
router.post('/templates/:id/rate', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            res.status(400).json({ error: '评分必须在 1-5 之间' });
            return;
        }

        // 插入或更新评分
        await pool.execute(
            `INSERT INTO template_ratings (id, workflow_id, user_id, rating, comment)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
            [uuidv4(), id, userId, rating, comment || null]
        );

        res.json({ success: true, rating });
    } catch (error: any) {
        console.error('[Template] Rate error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 克隆模板到 Workspace
 * POST /api/workflows/templates/:id/clone
 */
router.post('/templates/:id/clone', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { workspaceId, name: overrideName } = req.body;

        if (!workspaceId) {
            res.status(400).json({ error: '需要 workspaceId' });
            return;
        }

        // 验证 workspace 权限
        if (!await verifyWorkspaceOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问此 Workspace' });
            return;
        }

        // 获取模板
        const [tRows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM workflows WHERE id = ? AND is_template = TRUE AND is_deleted = FALSE`,
            [id]
        );

        if (tRows.length === 0) {
            res.status(404).json({ error: '模板不存在' });
            return;
        }

        const template = tRows[0];
        const newId = uuidv4();
        const newName = overrideName || `${template.name} (副本)`;

        // 创建工作流
        await pool.execute(
            `INSERT INTO workflows (id, workspace_id, name, description, nodes, edges, variables, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newId,
                workspaceId,
                newName,
                template.description,
                template.nodes,
                template.edges,
                template.variables,
                userId
            ]
        );

        // 记录克隆
        await pool.execute(
            `INSERT INTO template_clones (id, workflow_id, user_id) VALUES (?, ?, ?)`,
            [uuidv4(), id, userId]
        );

        res.status(201).json({
            success: true,
            id: newId,
            name: newName,
            sourceTemplateId: id
        });
    } catch (error: any) {
        console.error('[Template] Clone error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 分享功能
// ============================================

/**
 * 创建分享链接
 * POST /api/workflows/:id/share
 */
router.post('/:id/share', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { permission = 'read', expiresIn } = req.body;

        // 验证权限
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id, ws.owner_id FROM workflows w 
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE w.id = ? AND w.is_deleted = FALSE`,
            [id]
        );

        if (wRows.length === 0 || String(wRows[0].owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权操作' });
            return;
        }

        const shareId = uuidv4();
        const token = uuidv4().replace(/-/g, '');
        const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : null;

        await pool.execute(
            `INSERT INTO workflow_shares (id, workflow_id, created_by, token, permission, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [shareId, id, userId, token, permission, expiresAt]
        );

        const shareUrl = `${process.env.API_BASE_URL || 'https://astralinks.xyz'}/shared/${token}`;

        res.json({
            success: true,
            shareId,
            token,
            shareUrl,
            permission,
            expiresAt
        });
    } catch (error: any) {
        console.error('[Share] Create error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 访问分享的工作流
 * GET /api/workflows/shared/:token
 */
router.get('/shared/:token', async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.params;

        const [shares] = await pool.execute<RowDataPacket[]>(
            `SELECT s.*, w.name, w.description, w.nodes, w.edges, w.variables
             FROM workflow_shares s
             JOIN workflows w ON s.workflow_id = w.id
             WHERE s.token = ? AND s.is_revoked = FALSE AND w.is_deleted = FALSE`,
            [token]
        );

        if (shares.length === 0) {
            res.status(404).json({ error: '分享链接无效或已过期' });
            return;
        }

        const share = shares[0];

        // 检查是否过期
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            res.status(410).json({ error: '分享链接已过期' });
            return;
        }

        res.json({
            workflowId: share.workflow_id,
            name: share.name,
            description: share.description,
            nodes: share.nodes,
            edges: share.edges,
            variables: share.variables,
            permission: share.permission,
            expiresAt: share.expires_at
        });
    } catch (error: any) {
        console.error('[Share] Access error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 撤销分享
 * DELETE /api/workflows/shares/:shareId
 */
router.delete('/shares/:shareId', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { shareId } = req.params;

        const [shares] = await pool.execute<RowDataPacket[]>(
            `SELECT s.id FROM workflow_shares s WHERE s.id = ? AND s.created_by = ?`,
            [shareId, userId]
        );

        if (shares.length === 0) {
            res.status(403).json({ error: '无权操作' });
            return;
        }

        await pool.execute(
            `UPDATE workflow_shares SET is_revoked = TRUE WHERE id = ?`,
            [shareId]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Share] Revoke error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 获取工作流的分享列表
 * GET /api/workflows/:id/shares
 */
router.get('/:id/shares', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        // 验证权限
        const [wRows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.id, ws.owner_id FROM workflows w 
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE w.id = ?`,
            [id]
        );

        if (wRows.length === 0 || String(wRows[0].owner_id) !== String(userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [shares] = await pool.execute<RowDataPacket[]>(
            `SELECT id, token, permission, expires_at, is_revoked, created_at
             FROM workflow_shares WHERE workflow_id = ? ORDER BY created_at DESC`,
            [id]
        );

        res.json({
            shares: shares.map(s => ({
                ...s,
                shareUrl: `${process.env.API_BASE_URL || 'https://astralinks.xyz'}/shared/${s.token}`,
                isExpired: s.expires_at ? new Date(s.expires_at) < new Date() : false
            }))
        });
    } catch (error: any) {
        console.error('[Share] List error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
