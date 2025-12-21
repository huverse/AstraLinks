/**
 * 协作功能 API
 * 
 * @module server/routes/collaboration
 * @description 工作流协作者管理和评论系统
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// ============================================
// 类型定义
// ============================================

interface CollaboratorRow extends RowDataPacket {
    id: string;
    workflow_id: string;
    user_id: string;
    role: 'owner' | 'editor' | 'viewer';
    invited_by: string | null;
    invited_at: Date;
    accepted_at: Date | null;
    username?: string;
    email?: string;
    avatar?: string;
}

interface CommentRow extends RowDataPacket {
    id: string;
    workflow_id: string;
    node_id: string | null;
    user_id: string;
    content: string;
    position_x: number | null;
    position_y: number | null;
    resolved: boolean;
    parent_id: string | null;
    created_at: Date;
    updated_at: Date;
    username?: string;
    avatar?: string;
}

// ============================================
// 权限检查辅助函数
// ============================================

async function checkWorkflowAccess(
    workflowId: string,
    userId: string,
    requiredRole: 'viewer' | 'editor' | 'owner' = 'viewer'
): Promise<{ hasAccess: boolean; role: string | null; isOwner: boolean }> {
    // 先检查是否是工作流所有者
    const [workflows] = await pool.execute<RowDataPacket[]>(
        'SELECT owner_id FROM workflows WHERE id = ? AND is_deleted = FALSE',
        [workflowId]
    );

    if (workflows.length === 0) {
        return { hasAccess: false, role: null, isOwner: false };
    }

    // 使用 String() 确保类型一致比较
    const isOwner = String(workflows[0].owner_id) === String(userId);
    if (isOwner) {
        return { hasAccess: true, role: 'owner', isOwner: true };
    }

    // 检查协作者权限
    const [collaborators] = await pool.execute<CollaboratorRow[]>(
        'SELECT role FROM workflow_collaborators WHERE workflow_id = ? AND user_id = ? AND accepted_at IS NOT NULL',
        [workflowId, userId]
    );

    if (collaborators.length === 0) {
        return { hasAccess: false, role: null, isOwner: false };
    }

    const userRole = collaborators[0].role;
    const roleHierarchy = { viewer: 1, editor: 2, owner: 3 };
    const hasAccess = roleHierarchy[userRole] >= roleHierarchy[requiredRole];

    return { hasAccess, role: userRole, isOwner: false };
}

// ============================================
// 协作者管理 API
// ============================================

/**
 * GET /api/workflows/:id/collaborators
 * 获取工作流协作者列表
 */
router.get('/:workflowId/collaborators', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId } = req.params;

        console.log('[Collaboration] GET collaborators for workflow:', workflowId, 'user:', userId);

        const access = await checkWorkflowAccess(workflowId, userId, 'viewer');
        if (!access.hasAccess) {
            console.log('[Collaboration] Access denied for user:', userId);
            res.status(403).json({ error: '无权访问此工作流' });
            return;
        }

        const [rows] = await pool.execute<CollaboratorRow[]>(
            `SELECT c.*, u.username, u.email, u.avatar
             FROM workflow_collaborators c
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.workflow_id = ?
             ORDER BY c.invited_at DESC`,
            [workflowId]
        );

        // 添加所有者信息
        const [owner] = await pool.execute<RowDataPacket[]>(
            `SELECT w.owner_id, u.username, u.email, u.avatar
             FROM workflows w
             LEFT JOIN users u ON w.owner_id = u.id
             WHERE w.id = ?`,
            [workflowId]
        );

        const collaborators = rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            username: row.username,
            email: row.email,
            avatar: row.avatar,
            role: row.role,
            invitedAt: row.invited_at,
            acceptedAt: row.accepted_at,
        }));

        res.json({
            owner: owner.length ? {
                userId: owner[0].owner_id,
                username: owner[0].username,
                email: owner[0].email,
                avatar: owner[0].avatar,
                role: 'owner',
            } : null,
            collaborators,
        });
    } catch (error: any) {
        console.error('[Collaboration] Get collaborators error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/workflows/:id/collaborators
 * 邀请协作者 (只有 owner 可以邀请)
 */
router.post('/:workflowId/collaborators', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId } = req.params;
        const { email, role = 'viewer' } = req.body;

        const access = await checkWorkflowAccess(workflowId, userId, 'owner');
        if (!access.hasAccess) {
            res.status(403).json({ error: '只有工作流所有者可以邀请协作者' });
            return;
        }

        // 通过邮箱查找用户
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            res.status(404).json({ error: '未找到该用户，请确认邮箱地址' });
            return;
        }

        const invitedUserId = users[0].id;

        // 检查是否已邀请
        const [existing] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM workflow_collaborators WHERE workflow_id = ? AND user_id = ?',
            [workflowId, invitedUserId]
        );

        if (existing.length > 0) {
            res.status(400).json({ error: '该用户已是协作者' });
            return;
        }

        // 创建邀请 (自动接受)
        const id = uuidv4();
        await pool.execute(
            `INSERT INTO workflow_collaborators (id, workflow_id, user_id, role, invited_by, accepted_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [id, workflowId, invitedUserId, role, userId]
        );

        res.status(201).json({
            id,
            userId: invitedUserId,
            role,
            message: '协作者添加成功',
        });
    } catch (error: any) {
        console.error('[Collaboration] Invite error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/workflows/:id/collaborators/:userId/role
 * 更改协作者角色
 */
router.patch('/:workflowId/collaborators/:targetUserId/role', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId, targetUserId } = req.params;
        const { role } = req.body;

        if (!['viewer', 'editor'].includes(role)) {
            res.status(400).json({ error: '无效的角色' });
            return;
        }

        const access = await checkWorkflowAccess(workflowId, userId, 'owner');
        if (!access.hasAccess) {
            res.status(403).json({ error: '只有工作流所有者可以更改角色' });
            return;
        }

        await pool.execute(
            'UPDATE workflow_collaborators SET role = ? WHERE workflow_id = ? AND user_id = ?',
            [role, workflowId, targetUserId]
        );

        res.json({ success: true, message: '角色已更新' });
    } catch (error: any) {
        console.error('[Collaboration] Update role error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/workflows/:id/collaborators/:userId
 * 移除协作者
 */
router.delete('/:workflowId/collaborators/:targetUserId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId, targetUserId } = req.params;

        const access = await checkWorkflowAccess(workflowId, userId, 'owner');
        // 允许协作者自己退出
        if (!access.hasAccess && userId !== targetUserId) {
            res.status(403).json({ error: '无权移除协作者' });
            return;
        }

        await pool.execute(
            'DELETE FROM workflow_collaborators WHERE workflow_id = ? AND user_id = ?',
            [workflowId, targetUserId]
        );

        res.json({ success: true, message: '协作者已移除' });
    } catch (error: any) {
        console.error('[Collaboration] Remove collaborator error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 评论系统 API
// ============================================

/**
 * GET /api/workflows/:id/comments
 * 获取工作流评论列表
 */
router.get('/:workflowId/comments', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId } = req.params;
        const { nodeId, resolved } = req.query;

        console.log('[Collaboration] GET comments for workflow:', workflowId, 'user:', userId);

        const access = await checkWorkflowAccess(workflowId, userId, 'viewer');
        if (!access.hasAccess) {
            console.log('[Collaboration] Comment access denied for user:', userId);
            res.status(403).json({ error: '无权访问此工作流' });
            return;
        }

        let query = `
            SELECT c.*, u.username, u.avatar
            FROM workflow_comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.workflow_id = ?
        `;
        const params: any[] = [workflowId];

        if (nodeId) {
            query += ' AND c.node_id = ?';
            params.push(nodeId);
        }

        if (resolved !== undefined) {
            query += ' AND c.resolved = ?';
            params.push(resolved === 'true');
        }

        query += ' ORDER BY c.created_at DESC';

        const [rows] = await pool.execute<CommentRow[]>(query, params);

        const comments = rows.map(row => ({
            id: row.id,
            nodeId: row.node_id,
            userId: row.user_id,
            username: row.username,
            avatar: row.avatar,
            content: row.content,
            position: row.position_x !== null ? { x: row.position_x, y: row.position_y } : null,
            resolved: row.resolved,
            parentId: row.parent_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));

        res.json({ comments });
    } catch (error: any) {
        console.error('[Collaboration] Get comments error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/workflows/:id/comments
 * 添加评论
 */
router.post('/:workflowId/comments', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId } = req.params;
        const { nodeId, content, position, parentId } = req.body;

        if (!content?.trim()) {
            res.status(400).json({ error: '评论内容不能为空' });
            return;
        }

        const access = await checkWorkflowAccess(workflowId, userId, 'viewer');
        if (!access.hasAccess) {
            res.status(403).json({ error: '无权访问此工作流' });
            return;
        }

        const id = uuidv4();
        await pool.execute(
            `INSERT INTO workflow_comments (id, workflow_id, node_id, user_id, content, position_x, position_y, parent_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, workflowId, nodeId || null, userId, content.trim(),
                position?.x || null, position?.y || null, parentId || null]
        );

        // 获取用户信息
        const [user] = await pool.execute<RowDataPacket[]>(
            'SELECT username, avatar FROM users WHERE id = ?',
            [userId]
        );

        res.status(201).json({
            id,
            nodeId,
            userId,
            username: user[0]?.username,
            avatar: user[0]?.avatar,
            content: content.trim(),
            position: position || null,
            resolved: false,
            parentId: parentId || null,
            createdAt: new Date(),
        });
    } catch (error: any) {
        console.error('[Collaboration] Create comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/workflows/:id/comments/:commentId
 * 编辑评论 (只有作者可以编辑)
 */
router.put('/:workflowId/comments/:commentId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId, commentId } = req.params;
        const { content } = req.body;

        // 检查评论是否属于当前用户
        const [comments] = await pool.execute<CommentRow[]>(
            'SELECT user_id FROM workflow_comments WHERE id = ? AND workflow_id = ?',
            [commentId, workflowId]
        );

        if (comments.length === 0) {
            res.status(404).json({ error: '评论不存在' });
            return;
        }

        if (comments[0].user_id !== userId) {
            res.status(403).json({ error: '只能编辑自己的评论' });
            return;
        }

        await pool.execute(
            'UPDATE workflow_comments SET content = ? WHERE id = ?',
            [content.trim(), commentId]
        );

        res.json({ success: true, message: '评论已更新' });
    } catch (error: any) {
        console.error('[Collaboration] Update comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/workflows/:id/comments/:commentId
 * 删除评论
 */
router.delete('/:workflowId/comments/:commentId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId, commentId } = req.params;

        const [comments] = await pool.execute<CommentRow[]>(
            'SELECT user_id FROM workflow_comments WHERE id = ? AND workflow_id = ?',
            [commentId, workflowId]
        );

        if (comments.length === 0) {
            res.status(404).json({ error: '评论不存在' });
            return;
        }

        // 作者或 owner 可以删除
        const access = await checkWorkflowAccess(workflowId, userId, 'owner');
        if (comments[0].user_id !== userId && !access.isOwner) {
            res.status(403).json({ error: '无权删除此评论' });
            return;
        }

        await pool.execute(
            'DELETE FROM workflow_comments WHERE id = ?',
            [commentId]
        );

        res.json({ success: true, message: '评论已删除' });
    } catch (error: any) {
        console.error('[Collaboration] Delete comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/workflows/:id/comments/:commentId/resolve
 * 标记评论已解决
 */
router.patch('/:workflowId/comments/:commentId/resolve', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId, commentId } = req.params;
        const { resolved = true } = req.body;

        const access = await checkWorkflowAccess(workflowId, userId, 'editor');
        if (!access.hasAccess) {
            res.status(403).json({ error: '无权执行此操作' });
            return;
        }

        await pool.execute(
            'UPDATE workflow_comments SET resolved = ? WHERE id = ? AND workflow_id = ?',
            [resolved, commentId, workflowId]
        );

        res.json({ success: true, resolved });
    } catch (error: any) {
        console.error('[Collaboration] Resolve comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/workflows/:id/access
 * 检查当前用户对工作流的访问权限
 */
router.get('/:workflowId/access', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { workflowId } = req.params;

        const access = await checkWorkflowAccess(workflowId, userId, 'viewer');

        res.json({
            hasAccess: access.hasAccess,
            role: access.role,
            isOwner: access.isOwner,
            canEdit: access.role === 'editor' || access.role === 'owner',
            canDelete: access.isOwner,
            canManageCollaborators: access.isOwner,
        });
    } catch (error: any) {
        console.error('[Collaboration] Check access error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
