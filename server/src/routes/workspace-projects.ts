/**
 * 项目和任务管理 API
 * 
 * @module server/routes/workspace-projects
 * @description 工作区项目管理、任务追踪、沙箱执行 API
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authMiddleware } from '../middleware/auth';

const router = Router();

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
// 项目管理 API
// ============================================

/**
 * 获取工作区项目列表
 * GET /api/workspace-projects/:workspaceId/projects
 */
router.get('/:workspaceId/projects', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { status } = req.query;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        let query = `
            SELECT p.*, 
                   (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
                   (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as completed_task_count
            FROM projects p 
            WHERE p.workspace_id = ?
        `;
        const params: any[] = [workspaceId];

        if (status) {
            query += ` AND p.status = ?`;
            params.push(status);
        }

        query += ` ORDER BY p.created_at DESC`;

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        res.json({ projects: rows });
    } catch (error: any) {
        console.error('[Projects] GET error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 创建项目
 * POST /api/workspace-projects/:workspaceId/projects
 */
router.post('/:workspaceId/projects', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { name, description, status, start_date, due_date, color, icon, metadata } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        if (!name?.trim()) {
            res.status(400).json({ error: '项目名称不能为空' });
            return;
        }

        const id = uuidv4();

        await pool.execute(
            `INSERT INTO projects (id, workspace_id, name, description, status, start_date, due_date, color, icon, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, workspaceId, name.trim(), description || null, status || 'planning',
                start_date || null, due_date || null, color || '#8B5CF6', icon || '📁',
                metadata ? JSON.stringify(metadata) : null]
        );

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM projects WHERE id = ?`,
            [id]
        );

        res.status(201).json({ project: rows[0] });
    } catch (error: any) {
        console.error('[Projects] POST error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 更新项目
 * PUT /api/workspace-projects/:workspaceId/projects/:projectId
 */
router.put('/:workspaceId/projects/:projectId', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, projectId } = req.params;
        const { name, description, status, progress, start_date, due_date, color, icon, metadata } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (name !== undefined) { updates.push('name = ?'); params.push(name); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (status !== undefined) { updates.push('status = ?'); params.push(status); }
        if (progress !== undefined) { updates.push('progress = ?'); params.push(progress); }
        if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date); }
        if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }
        if (color !== undefined) { updates.push('color = ?'); params.push(color); }
        if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
        if (metadata !== undefined) { updates.push('metadata = ?'); params.push(JSON.stringify(metadata)); }

        if (updates.length === 0) {
            res.status(400).json({ error: '无更新内容' });
            return;
        }

        params.push(projectId, workspaceId);

        await pool.execute(
            `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND workspace_id = ?`,
            params
        );

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM projects WHERE id = ?`,
            [projectId]
        );

        res.json({ project: rows[0] });
    } catch (error: any) {
        console.error('[Projects] PUT error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除项目
 * DELETE /api/workspace-projects/:workspaceId/projects/:projectId
 */
router.delete('/:workspaceId/projects/:projectId', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, projectId } = req.params;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        await pool.execute(
            `DELETE FROM projects WHERE id = ? AND workspace_id = ?`,
            [projectId, workspaceId]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Projects] DELETE error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 任务追踪 API
// ============================================

/**
 * 获取工作区任务列表
 * GET /api/workspace-projects/:workspaceId/tasks
 */
router.get('/:workspaceId/tasks', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { status, priority, project_id } = req.query;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        let query = `
            SELECT t.*, p.name as project_name, p.color as project_color
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.workspace_id = ?
        `;
        const params: any[] = [workspaceId];

        if (status) {
            query += ` AND t.status = ?`;
            params.push(status);
        }
        if (priority) {
            query += ` AND t.priority = ?`;
            params.push(priority);
        }
        if (project_id) {
            query += ` AND t.project_id = ?`;
            params.push(project_id);
        }

        query += ` ORDER BY t.sort_order ASC, t.due_date ASC, t.created_at DESC`;

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        res.json({ tasks: rows });
    } catch (error: any) {
        console.error('[Tasks] GET error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 创建任务
 * POST /api/workspace-projects/:workspaceId/tasks
 */
router.post('/:workspaceId/tasks', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { title, description, project_id, status, priority, due_date, assignee, tags,
            trigger_workflow_id, on_complete_workflow_id, auto_create_rule } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        if (!title?.trim()) {
            res.status(400).json({ error: '任务标题不能为空' });
            return;
        }

        const id = uuidv4();

        // 获取最大排序值
        const [maxOrder] = await pool.execute<RowDataPacket[]>(
            `SELECT MAX(sort_order) as max_order FROM tasks WHERE workspace_id = ?`,
            [workspaceId]
        );
        const sortOrder = ((maxOrder[0] as any)?.max_order || 0) + 1;

        await pool.execute(
            `INSERT INTO tasks (id, workspace_id, project_id, title, description, status, priority, 
                               due_date, assignee, tags, trigger_workflow_id, on_complete_workflow_id, 
                               auto_create_rule, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, workspaceId, project_id || null, title.trim(), description || null,
                status || 'todo', priority || 'medium', due_date || null, assignee || null,
                tags ? JSON.stringify(tags) : null, trigger_workflow_id || null,
                on_complete_workflow_id || null, auto_create_rule ? JSON.stringify(auto_create_rule) : null,
                sortOrder]
        );

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT t.*, p.name as project_name, p.color as project_color
             FROM tasks t
             LEFT JOIN projects p ON t.project_id = p.id
             WHERE t.id = ?`,
            [id]
        );

        res.status(201).json({ task: rows[0] });
    } catch (error: any) {
        console.error('[Tasks] POST error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 更新任务
 * PUT /api/workspace-projects/:workspaceId/tasks/:taskId
 */
router.put('/:workspaceId/tasks/:taskId', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, taskId } = req.params;
        const { title, description, project_id, status, priority, due_date, assignee, tags,
            trigger_workflow_id, on_complete_workflow_id, sort_order } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (title !== undefined) { updates.push('title = ?'); params.push(title); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (project_id !== undefined) { updates.push('project_id = ?'); params.push(project_id); }
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
            // 如果完成，记录完成时间
            if (status === 'done') {
                updates.push('completed_at = NOW()');
            } else {
                updates.push('completed_at = NULL');
            }
        }
        if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
        if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }
        if (assignee !== undefined) { updates.push('assignee = ?'); params.push(assignee); }
        if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
        if (trigger_workflow_id !== undefined) { updates.push('trigger_workflow_id = ?'); params.push(trigger_workflow_id); }
        if (on_complete_workflow_id !== undefined) { updates.push('on_complete_workflow_id = ?'); params.push(on_complete_workflow_id); }
        if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }

        if (updates.length === 0) {
            res.status(400).json({ error: '无更新内容' });
            return;
        }

        params.push(taskId, workspaceId);

        await pool.execute(
            `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND workspace_id = ?`,
            params
        );

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT t.*, p.name as project_name, p.color as project_color
             FROM tasks t
             LEFT JOIN projects p ON t.project_id = p.id
             WHERE t.id = ?`,
            [taskId]
        );

        res.json({ task: rows[0] });
    } catch (error: any) {
        console.error('[Tasks] PUT error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除任务
 * DELETE /api/workspace-projects/:workspaceId/tasks/:taskId
 */
router.delete('/:workspaceId/tasks/:taskId', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, taskId } = req.params;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        await pool.execute(
            `DELETE FROM tasks WHERE id = ? AND workspace_id = ?`,
            [taskId, workspaceId]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Tasks] DELETE error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 批量更新任务排序
 * PUT /api/workspace-projects/:workspaceId/tasks/reorder
 */
router.put('/:workspaceId/tasks/reorder', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { taskOrders } = req.body; // [{id, sort_order}]

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        if (!Array.isArray(taskOrders)) {
            res.status(400).json({ error: 'taskOrders must be an array' });
            return;
        }

        for (const { id, sort_order } of taskOrders) {
            await pool.execute(
                `UPDATE tasks SET sort_order = ? WHERE id = ? AND workspace_id = ?`,
                [sort_order, id, workspaceId]
            );
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Tasks] Reorder error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 沙箱执行 API
// ============================================

/**
 * 执行沙箱代码
 * POST /api/workspace-projects/:workspaceId/sandbox/execute
 */
router.post('/:workspaceId/sandbox/execute', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { code, language = 'javascript', input, name } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        if (!code?.trim()) {
            res.status(400).json({ error: '代码不能为空' });
            return;
        }

        const startTime = Date.now();
        let output = '';
        let error = '';
        let status: 'success' | 'error' | 'timeout' = 'success';

        // 执行代码
        if (language === 'javascript') {
            try {
                const logs: string[] = [];
                const sandbox = {
                    console: {
                        log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
                        error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' ')),
                        warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => String(a)).join(' ')),
                    },
                    Math, Date, JSON, Array, Object, String, Number, Boolean,
                    parseInt, parseFloat, isNaN, isFinite,
                    input: input || null,
                };

                const wrappedCode = `
                    "use strict";
                    return (async function() {
                        ${code}
                    })();
                `;

                const fn = new Function(...Object.keys(sandbox), wrappedCode);

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Execution timeout')), 10000);
                });

                const result = await Promise.race([
                    fn(...Object.values(sandbox)),
                    timeoutPromise
                ]);

                output = logs.join('\n');
                if (result !== undefined) {
                    output += (output ? '\n' : '') + '→ ' + JSON.stringify(result);
                }
            } catch (e: any) {
                error = e.message;
                status = e.message.includes('timeout') ? 'timeout' : 'error';
            }
        } else {
            error = `Language "${language}" is not supported in browser. Use workflow for Python.`;
            status = 'error';
        }

        const executionTime = Date.now() - startTime;

        // 保存执行记录
        const id = uuidv4();
        await pool.execute(
            `INSERT INTO sandbox_executions (id, workspace_id, name, language, code, input, output, error, execution_time_ms, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, workspaceId, name || null, language, code,
                input ? JSON.stringify(input) : null, output, error || null, executionTime, status]
        );

        res.json({
            id,
            success: status === 'success',
            output,
            error: error || undefined,
            executionTime,
            status,
        });
    } catch (error: any) {
        console.error('[Sandbox] Execute error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 获取沙箱执行历史
 * GET /api/workspace-projects/:workspaceId/sandbox/history
 */
router.get('/:workspaceId/sandbox/history', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM sandbox_executions 
             WHERE workspace_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [workspaceId, limit]
        );

        res.json({ executions: rows });
    } catch (error: any) {
        console.error('[Sandbox] History error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 保存代码片段
 * POST /api/workspace-projects/:workspaceId/sandbox/snippets
 */
router.post('/:workspaceId/sandbox/snippets', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;
        const { name, description, language, code, is_template } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        if (!name?.trim() || !code?.trim()) {
            res.status(400).json({ error: '名称和代码不能为空' });
            return;
        }

        const id = uuidv4();

        await pool.execute(
            `INSERT INTO sandbox_snippets (id, workspace_id, name, description, language, code, is_template)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, workspaceId, name.trim(), description || null, language || 'javascript',
                code, is_template || false]
        );

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM sandbox_snippets WHERE id = ?`,
            [id]
        );

        res.status(201).json({ snippet: rows[0] });
    } catch (error: any) {
        console.error('[Sandbox] Save snippet error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 获取代码片段列表
 * GET /api/workspace-projects/:workspaceId/sandbox/snippets
 */
router.get('/:workspaceId/sandbox/snippets', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId } = req.params;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM sandbox_snippets 
             WHERE workspace_id = ? 
             ORDER BY created_at DESC`,
            [workspaceId]
        );

        res.json({ snippets: rows });
    } catch (error: any) {
        console.error('[Sandbox] Get snippets error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除代码片段
 * DELETE /api/workspace-projects/:workspaceId/sandbox/snippets/:snippetId
 */
router.delete('/:workspaceId/sandbox/snippets/:snippetId', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { workspaceId, snippetId } = req.params;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        await pool.execute(
            `DELETE FROM sandbox_snippets WHERE id = ? AND workspace_id = ?`,
            [snippetId, workspaceId]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Sandbox] Delete snippet error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
