/**
 * Preview API Routes - 网页预览圈选 API
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

const router = Router();

interface PreviewSession {
    id: string;
    userId: number;
    workflowRunId: string | null;
    sandboxSessionId: string | null;
    previewUrl: string;
    snapshotUrl: string | null;
    status: 'active' | 'closed';
    createdAt: Date;
    closedAt: Date | null;
}

interface Annotation {
    id: string;
    sessionId: string;
    annotationType: 'rectangle' | 'freehand' | 'point';
    bboxJson: { x: number; y: number; width: number; height: number } | null;
    pathData: string | null;
    domSelector: string | null;
    domXpath: string | null;
    sourceFile: string | null;
    sourceLines: { start: number; end: number } | null;
    screenshotUrl: string | null;
    quoteText: string | null;
    referencedIn: string | null;
    createdAt: Date;
}

// POST /api/preview/sessions - 创建预览会话
router.post('/sessions', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { previewUrl, workflowRunId, sandboxSessionId } = req.body;

        if (!previewUrl) {
            res.status(400).json({ error: '缺少 previewUrl' });
            return;
        }

        const sessionId = crypto.randomUUID();

        await pool.execute(
            `INSERT INTO preview_sessions (id, user_id, workflow_run_id, sandbox_session_id, preview_url, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
            [sessionId, userId, workflowRunId, sandboxSessionId, previewUrl]
        );

        res.json({
            success: true,
            session: {
                id: sessionId,
                userId,
                previewUrl,
                workflowRunId,
                sandboxSessionId,
                status: 'active',
                createdAt: new Date()
            }
        });
    } catch (error: any) {
        console.error('[Preview] Create session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/preview/sessions/:sessionId - 获取会话详情
router.get('/sessions/:sessionId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { sessionId } = req.params;

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM preview_sessions WHERE id = ? AND user_id = ?`,
            [sessionId, userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '会话不存在' });
            return;
        }

        const session = rows[0];

        // 获取标注列表
        const [annotations] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM preview_annotations WHERE session_id = ? ORDER BY created_at ASC`,
            [sessionId]
        );

        res.json({
            success: true,
            session: {
                id: session.id,
                userId: session.user_id,
                previewUrl: session.preview_url,
                workflowRunId: session.workflow_run_id,
                sandboxSessionId: session.sandbox_session_id,
                snapshotUrl: session.snapshot_url,
                status: session.status,
                createdAt: session.created_at,
                closedAt: session.closed_at
            },
            annotations: annotations.map(a => ({
                id: a.id,
                sessionId: a.session_id,
                annotationType: a.annotation_type,
                bbox: a.bbox_json ? JSON.parse(a.bbox_json) : null,
                pathData: a.path_data,
                domSelector: a.dom_selector,
                domXpath: a.dom_xpath,
                sourceFile: a.source_file,
                sourceLines: a.source_lines ? JSON.parse(a.source_lines) : null,
                screenshotUrl: a.screenshot_url,
                quoteText: a.quote_text,
                referencedIn: a.referenced_in,
                createdAt: a.created_at
            }))
        });
    } catch (error: any) {
        console.error('[Preview] Get session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/preview/sessions/:sessionId/close - 关闭会话
router.patch('/sessions/:sessionId/close', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { sessionId } = req.params;

        const [result] = await pool.execute<ResultSetHeader>(
            `UPDATE preview_sessions SET status = 'closed', closed_at = NOW() WHERE id = ? AND user_id = ?`,
            [sessionId, userId]
        );

        if (result.affectedRows === 0) {
            res.status(404).json({ error: '会话不存在' });
            return;
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Preview] Close session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/preview/sessions/:sessionId/snapshot - 保存快照
router.post('/sessions/:sessionId/snapshot', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { sessionId } = req.params;
        const { snapshotUrl } = req.body;

        if (!snapshotUrl) {
            res.status(400).json({ error: '缺少 snapshotUrl' });
            return;
        }

        const [result] = await pool.execute<ResultSetHeader>(
            `UPDATE preview_sessions SET snapshot_url = ? WHERE id = ? AND user_id = ?`,
            [snapshotUrl, sessionId, userId]
        );

        if (result.affectedRows === 0) {
            res.status(404).json({ error: '会话不存在' });
            return;
        }

        res.json({ success: true, snapshotUrl });
    } catch (error: any) {
        console.error('[Preview] Save snapshot error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/preview/annotations - 创建标注
router.post('/annotations', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const {
            sessionId,
            annotationType,
            bbox,
            pathData,
            domSelector,
            domXpath,
            sourceFile,
            sourceLines,
            screenshotUrl,
            quoteText
        } = req.body;

        if (!sessionId || !annotationType) {
            res.status(400).json({ error: '缺少必要参数' });
            return;
        }

        // 验证会话属于当前用户
        const [sessions] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM preview_sessions WHERE id = ? AND user_id = ?`,
            [sessionId, userId]
        );

        if (sessions.length === 0) {
            res.status(404).json({ error: '会话不存在' });
            return;
        }

        const annotationId = crypto.randomUUID();

        await pool.execute(
            `INSERT INTO preview_annotations
             (id, session_id, annotation_type, bbox_json, path_data, dom_selector, dom_xpath,
              source_file, source_lines, screenshot_url, quote_text, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                annotationId,
                sessionId,
                annotationType,
                bbox ? JSON.stringify(bbox) : null,
                pathData,
                domSelector,
                domXpath,
                sourceFile,
                sourceLines ? JSON.stringify(sourceLines) : null,
                screenshotUrl,
                quoteText
            ]
        );

        res.json({
            success: true,
            annotation: {
                id: annotationId,
                sessionId,
                annotationType,
                bbox,
                pathData,
                domSelector,
                domXpath,
                sourceFile,
                sourceLines,
                screenshotUrl,
                quoteText,
                createdAt: new Date()
            }
        });
    } catch (error: any) {
        console.error('[Preview] Create annotation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/preview/annotations/:annotationId/reference - 引用到对话/节点
router.patch('/annotations/:annotationId/reference', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { annotationId } = req.params;
        const { referencedIn } = req.body;

        // 验证标注属于用户的会话
        const [annotations] = await pool.execute<RowDataPacket[]>(
            `SELECT a.id FROM preview_annotations a
             JOIN preview_sessions s ON a.session_id = s.id
             WHERE a.id = ? AND s.user_id = ?`,
            [annotationId, userId]
        );

        if (annotations.length === 0) {
            res.status(404).json({ error: '标注不存在' });
            return;
        }

        await pool.execute(
            `UPDATE preview_annotations SET referenced_in = ? WHERE id = ?`,
            [referencedIn, annotationId]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Preview] Reference annotation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/preview/annotations/:annotationId - 删除标注
router.delete('/annotations/:annotationId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { annotationId } = req.params;

        // 验证标注属于用户的会话
        const [result] = await pool.execute<ResultSetHeader>(
            `DELETE a FROM preview_annotations a
             JOIN preview_sessions s ON a.session_id = s.id
             WHERE a.id = ? AND s.user_id = ?`,
            [annotationId, userId]
        );

        if (result.affectedRows === 0) {
            res.status(404).json({ error: '标注不存在' });
            return;
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Preview] Delete annotation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/preview/sessions - 获取用户的预览会话列表
router.get('/sessions', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { status } = req.query;

        let query = `SELECT * FROM preview_sessions WHERE user_id = ?`;
        const params: any[] = [userId];

        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT 50`;

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        res.json({
            success: true,
            sessions: rows.map(s => ({
                id: s.id,
                previewUrl: s.preview_url,
                snapshotUrl: s.snapshot_url,
                status: s.status,
                workflowRunId: s.workflow_run_id,
                sandboxSessionId: s.sandbox_session_id,
                createdAt: s.created_at,
                closedAt: s.closed_at
            }))
        });
    } catch (error: any) {
        console.error('[Preview] List sessions error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
