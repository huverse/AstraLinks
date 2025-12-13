/**
 * 云端同步 API 路由
 * 
 * @module server/src/routes/sync
 * @description 配置同步上传下载和历史管理
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const router = Router();

// 加密密钥 (生产环境应使用环境变量)
const ENCRYPTION_KEY = process.env.SYNC_ENCRYPTION_KEY || 'astralinks-sync-key-32bytes!!';
const IV_LENGTH = 16;

// ============================================
// 加密工具函数
// ============================================

function encrypt(data: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encrypted, iv: iv.toString('hex') };
}

function decrypt(encrypted: string, iv: string): string {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function checksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================
// 上传配置到云端
// ============================================

router.post('/upload', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { workspaceId, data, includeFiles } = req.body;

        if (!data) {
            return res.status(400).json({ success: false, error: 'No data provided' });
        }

        const syncId = uuidv4();
        const jsonData = JSON.stringify(data);
        const { encrypted, iv } = encrypt(jsonData);
        const hash = checksum(jsonData);

        await pool.query(`
      INSERT INTO config_syncs 
      (id, user_id, workspace_id, sync_type, encrypted_data, encryption_iv, checksum, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            syncId,
            userId,
            workspaceId || null,
            workspaceId ? 'WORKSPACE' : 'FULL',
            encrypted,
            iv,
            hash,
            jsonData.length,
        ]);

        res.json({
            success: true,
            data: {
                syncId,
                size: jsonData.length,
                checksum: hash,
                createdAt: new Date().toISOString(),
            },
        });
    } catch (error: any) {
        console.error('[Sync] Upload failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 从云端下载配置
// ============================================

router.post('/download', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { syncId } = req.body;

        const [rows] = await pool.query(
            'SELECT * FROM config_syncs WHERE id = ? AND user_id = ?',
            [syncId, userId]
        );

        if ((rows as any[]).length === 0) {
            return res.status(404).json({ success: false, error: 'Sync record not found' });
        }

        const record = (rows as any[])[0];
        const decrypted = decrypt(record.encrypted_data, record.encryption_iv);

        // 验证校验和
        if (checksum(decrypted) !== record.checksum) {
            return res.status(400).json({ success: false, error: 'Data integrity check failed' });
        }

        res.json({
            success: true,
            data: JSON.parse(decrypted),
            metadata: {
                syncId: record.id,
                syncType: record.sync_type,
                createdAt: record.created_at,
            },
        });
    } catch (error: any) {
        console.error('[Sync] Download failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 获取同步历史
// ============================================

router.get('/history', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const [rows] = await pool.query(`
      SELECT id, workspace_id, sync_type, file_size, checksum, created_at
      FROM config_syncs 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

        res.json({ success: true, data: rows });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 删除云端配置
// ============================================

router.delete('/:syncId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        await pool.query(
            'DELETE FROM config_syncs WHERE id = ? AND user_id = ?',
            [req.params.syncId, userId]
        );

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 获取最新同步
// ============================================

router.get('/latest', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const workspaceId = req.query.workspaceId as string;

        let query = 'SELECT * FROM config_syncs WHERE user_id = ?';
        const params: any[] = [userId];

        if (workspaceId) {
            query += ' AND workspace_id = ?';
            params.push(workspaceId);
        }

        query += ' ORDER BY created_at DESC LIMIT 1';

        const [rows] = await pool.query(query, params);

        if ((rows as any[]).length === 0) {
            return res.json({ success: true, data: null });
        }

        const record = (rows as any[])[0];
        res.json({
            success: true,
            data: {
                syncId: record.id,
                syncType: record.sync_type,
                fileSize: record.file_size,
                createdAt: record.created_at,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
