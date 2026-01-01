/**
 * Future Letters - Attachment Upload Service
 * Handles file uploads, validation, storage, and retrieval
 */

import crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database';
import * as letterService from './letterService';
import type { AttachmentType, FutureLetterAttachment } from './types';

// ============================================
// Types
// ============================================

export interface AttachmentUploadPayload {
    fileName?: string;
    mimeType?: string;
    attachmentType?: AttachmentType;
    fileBase64?: string;
    base64?: string;  // Alternative field name
    durationMs?: number;  // For audio files
}

export class UploadError extends Error {
    status: number;
    code: string;
    details?: Record<string, unknown>;

    constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
        super(message);
        this.name = 'UploadError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

interface AttachmentLimits {
    maxImages: number;
    maxAudio: number;
    maxImageSizeBytes: number;
    maxAudioSizeBytes: number;
    maxAudioDurationMs: number;
}

// ============================================
// Constants
// ============================================

const UPLOAD_ROOT = process.env.FUTURE_LETTER_UPLOAD_DIR
    || path.join(process.cwd(), 'uploads', 'future-letters');

const THUMBNAIL_SIZE = 360;
const THUMBNAIL_QUALITY = 80;

const ALLOWED_IMAGE_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);

const ALLOWED_AUDIO_MIME = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/m4a',
    'audio/x-m4a',
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
};

// ============================================
// Helper Functions
// ============================================

/**
 * Parse numeric setting with fallback
 */
function parseNumberSetting(settings: Record<string, string>, key: string, fallback: number): number {
    const raw = settings[key];
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Get attachment limits from settings
 */
async function getAttachmentLimits(): Promise<AttachmentLimits> {
    const settings = await letterService.getSettings();
    return {
        maxImages: parseNumberSetting(settings, 'max_images_per_letter', 2),
        maxAudio: parseNumberSetting(settings, 'max_audio_per_letter', 1),
        maxImageSizeBytes: parseNumberSetting(settings, 'max_image_size_mb', 5) * 1024 * 1024,
        maxAudioSizeBytes: parseNumberSetting(settings, 'max_audio_size_mb', 10) * 1024 * 1024,
        maxAudioDurationMs: parseNumberSetting(settings, 'max_audio_duration_sec', 180) * 1000,
    };
}

/**
 * Extract raw base64 from data URL or plain base64
 */
function extractBase64(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';

    // Handle data URL format: data:mime;base64,xxx
    const commaIndex = trimmed.indexOf(',');
    if (trimmed.startsWith('data:') && commaIndex !== -1) {
        return trimmed.slice(commaIndex + 1);
    }
    return trimmed;
}

/**
 * Normalize storage key to use forward slashes
 */
function normalizeStorageKey(...segments: string[]): string {
    return segments.join('/').replace(/\\/g, '/');
}

/**
 * Resolve storage key to absolute file path with security checks
 */
function resolveStoragePath(storageKey: string): string {
    // Sanitize: remove backslashes, parent directory traversal, leading slashes
    const sanitized = storageKey
        .replace(/\\/g, '/')
        .replace(/(\.\.\/|\.\.\/|^\/+)/g, '')
        .replace(/^(\.\.([\/\\]|$))+/, '');

    const base = path.resolve(UPLOAD_ROOT);
    const resolved = path.resolve(base, sanitized);

    // Security: ensure resolved path is within upload root
    if (!resolved.startsWith(base)) {
        throw new UploadError('VALIDATION_ERROR', 'Invalid storage key');
    }

    return resolved;
}

/**
 * Get file extension for MIME type
 */
function extensionForMime(mimeType: string, originalName?: string): string {
    const mapped = MIME_EXTENSION_MAP[mimeType];
    if (mapped) return `.${mapped}`;

    // Fallback to original file extension
    if (originalName) {
        const ext = path.extname(originalName).toLowerCase();
        if (ext && ext.length <= 10) {
            return ext.startsWith('.') ? ext : `.${ext}`;
        }
    }

    return '';
}

/**
 * Sanitize filename for safe storage
 */
function sanitizeFilename(name?: string): string | undefined {
    if (!name) return undefined;
    return path.basename(name)
        .replace(/[^\w.\-() \u4e00-\u9fa5]+/g, '_')  // Allow Chinese characters
        .slice(0, 150);
}

/**
 * Safe file removal (ignores errors)
 */
async function safeRemove(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch {
        // Ignore errors (file may not exist)
    }
}

/**
 * Verify letter exists and is editable (draft status)
 */
async function ensureEditableLetter(letterId: string, userId: number) {
    const letter = await letterService.getLetter(letterId, userId);
    if (!letter) {
        throw new UploadError('NOT_FOUND', '信件不存在', 404);
    }
    if (letter.status !== 'draft') {
        throw new UploadError(
            'VALIDATION_ERROR',
            '只能在草稿状态添加附件',
            400,
            { status: letter.status }
        );
    }
    return letter;
}

/**
 * Get current attachment counts for a letter
 */
async function getAttachmentCounts(letterId: string): Promise<Record<AttachmentType, number>> {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT attachment_type, COUNT(*) as count
         FROM future_letter_attachments
         WHERE letter_id = ?
         GROUP BY attachment_type`,
        [letterId]
    );

    const counts: Record<AttachmentType, number> = {
        image: 0,
        audio: 0,
    };

    for (const row of rows) {
        if (row.attachment_type === 'image') {
            counts.image = Number(row.count) || 0;
        } else if (row.attachment_type === 'audio') {
            counts.audio = Number(row.count) || 0;
        }
    }

    return counts;
}

/**
 * Map database row to FutureLetterAttachment
 */
function mapRowToAttachment(row: RowDataPacket): FutureLetterAttachment {
    return {
        id: row.id,
        letterId: row.letter_id,
        storageKey: row.storage_key,
        originalName: row.original_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        sha256: row.sha256,
        attachmentType: row.attachment_type,
        durationMs: row.duration_ms,
        width: row.width,
        height: row.height,
        thumbnailKey: row.thumbnail_key,
        scanStatus: row.scan_status,
        scannedAt: row.scanned_at,
        scanResult: row.scan_result ? JSON.parse(row.scan_result) : undefined,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
    };
}

// ============================================
// Public Functions
// ============================================

/**
 * Upload an attachment for a letter
 */
export async function uploadAttachment(
    letterId: string,
    userId: number,
    payload: AttachmentUploadPayload
): Promise<FutureLetterAttachment> {
    // Validate letter is editable
    await ensureEditableLetter(letterId, userId);

    // Validate required fields
    const attachmentType = payload.attachmentType;
    const mimeType = payload.mimeType?.trim();
    const fileName = sanitizeFilename(payload.fileName);
    const rawBase64 = payload.fileBase64 || payload.base64;

    if (!attachmentType) {
        throw new UploadError('VALIDATION_ERROR', '缺少附件类型', 400, { field: 'attachmentType' });
    }
    if (!mimeType) {
        throw new UploadError('VALIDATION_ERROR', '缺少MIME类型', 400, { field: 'mimeType' });
    }
    if (!rawBase64) {
        throw new UploadError('VALIDATION_ERROR', '缺少文件数据', 400, { field: 'fileBase64' });
    }

    // Validate MIME type
    if (attachmentType === 'image' && !ALLOWED_IMAGE_MIME.has(mimeType)) {
        throw new UploadError('VALIDATION_ERROR', '不支持的图片格式', 400, { mimeType });
    }
    if (attachmentType === 'audio' && !ALLOWED_AUDIO_MIME.has(mimeType)) {
        throw new UploadError('VALIDATION_ERROR', '不支持的音频格式', 400, { mimeType });
    }

    // Decode base64
    const base64 = extractBase64(rawBase64);
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
        throw new UploadError('VALIDATION_ERROR', '无效的文件数据');
    }

    // Check size limits
    const limits = await getAttachmentLimits();
    if (attachmentType === 'image' && buffer.length > limits.maxImageSizeBytes) {
        throw new UploadError('VALIDATION_ERROR', `图片大小超过限制(${Math.round(limits.maxImageSizeBytes / 1024 / 1024)}MB)`, 400, {
            maxBytes: limits.maxImageSizeBytes,
            sizeBytes: buffer.length,
        });
    }
    if (attachmentType === 'audio' && buffer.length > limits.maxAudioSizeBytes) {
        throw new UploadError('VALIDATION_ERROR', `音频大小超过限制(${Math.round(limits.maxAudioSizeBytes / 1024 / 1024)}MB)`, 400, {
            maxBytes: limits.maxAudioSizeBytes,
            sizeBytes: buffer.length,
        });
    }

    // Check duration limit for audio
    if (attachmentType === 'audio' && payload.durationMs && payload.durationMs > limits.maxAudioDurationMs) {
        throw new UploadError('VALIDATION_ERROR', `音频时长超过限制(${Math.round(limits.maxAudioDurationMs / 1000)}秒)`, 400, {
            maxDurationMs: limits.maxAudioDurationMs,
            durationMs: payload.durationMs,
        });
    }

    // Check attachment count limits
    const counts = await getAttachmentCounts(letterId);
    if (attachmentType === 'image' && counts.image >= limits.maxImages) {
        throw new UploadError('VALIDATION_ERROR', `图片数量已达上限(${limits.maxImages})`, 400, { maxImages: limits.maxImages });
    }
    if (attachmentType === 'audio' && counts.audio >= limits.maxAudio) {
        throw new UploadError('VALIDATION_ERROR', `音频数量已达上限(${limits.maxAudio})`, 400, { maxAudio: limits.maxAudio });
    }

    // Generate storage key and paths
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const fileId = uuidv4();
    const extension = extensionForMime(mimeType, fileName);
    const storageKey = normalizeStorageKey(letterId, `${fileId}${extension}`);
    const storagePath = resolveStoragePath(storageKey);

    let thumbnailKey: string | null = null;
    let width: number | undefined;
    let height: number | undefined;

    try {
        // Create directory and write file
        await fs.mkdir(path.dirname(storagePath), { recursive: true });
        await fs.writeFile(storagePath, buffer);

        // Process image: get dimensions and generate thumbnail
        if (attachmentType === 'image') {
            let metadata;
            try {
                metadata = await sharp(buffer).metadata();
            } catch {
                throw new UploadError('VALIDATION_ERROR', '无效的图片文件');
            }

            width = metadata.width;
            height = metadata.height;

            // Generate thumbnail
            const thumbnailName = `${fileId}-thumb.webp`;
            thumbnailKey = normalizeStorageKey(letterId, thumbnailName);
            const thumbnailPath = resolveStoragePath(thumbnailKey);

            const thumbBuffer = await sharp(buffer)
                .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
                .webp({ quality: THUMBNAIL_QUALITY })
                .toBuffer();

            await fs.writeFile(thumbnailPath, thumbBuffer);
        }

        // Get next sort order
        const [orderRows] = await pool.execute<RowDataPacket[]>(
            'SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM future_letter_attachments WHERE letter_id = ?',
            [letterId]
        );
        const sortOrder = (orderRows[0]?.maxOrder || 0) + 1;

        // Insert attachment record
        const [result] = await pool.execute<ResultSetHeader>(
            `INSERT INTO future_letter_attachments
             (letter_id, storage_key, original_name, mime_type, size_bytes, sha256,
              attachment_type, duration_ms, width, height, thumbnail_key,
              scan_status, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
            [
                letterId,
                storageKey,
                fileName || null,
                mimeType,
                buffer.length,
                sha256,
                attachmentType,
                attachmentType === 'audio' ? payload.durationMs || null : null,
                width || null,
                height || null,
                thumbnailKey,
                sortOrder,
            ]
        );

        // Fetch and return the created attachment
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM future_letter_attachments WHERE id = ?',
            [result.insertId]
        );

        if (!rows.length) {
            throw new UploadError('INTERNAL_ERROR', '创建附件失败', 500);
        }

        return mapRowToAttachment(rows[0]);
    } catch (error) {
        // Cleanup on failure
        await safeRemove(storagePath);
        if (thumbnailKey) {
            await safeRemove(resolveStoragePath(thumbnailKey));
        }
        throw error;
    }
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(
    letterId: string,
    attachmentId: number,
    userId: number
): Promise<boolean> {
    // Validate letter is editable
    await ensureEditableLetter(letterId, userId);

    // Get attachment record
    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM future_letter_attachments WHERE id = ? AND letter_id = ?',
        [attachmentId, letterId]
    );

    if (!rows.length) {
        return false;
    }

    const attachment = rows[0];

    // Delete from database
    await pool.execute(
        'DELETE FROM future_letter_attachments WHERE id = ? AND letter_id = ?',
        [attachmentId, letterId]
    );

    // Delete files from storage
    await safeRemove(resolveStoragePath(attachment.storage_key));
    if (attachment.thumbnail_key) {
        await safeRemove(resolveStoragePath(attachment.thumbnail_key));
    }

    return true;
}

/**
 * Get attachment file info for serving
 */
export async function getAttachmentForDownload(
    storageKey: string,
    userId: number
): Promise<{ filePath: string; mimeType: string; downloadName?: string } | null> {
    const key = storageKey.replace(/\\/g, '/');

    // Query attachment with letter ownership check
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT a.*, l.sender_user_id, l.recipient_user_id, l.deleted_at
         FROM future_letter_attachments a
         JOIN future_letters l ON l.id = a.letter_id
         WHERE (a.storage_key = ? OR a.thumbnail_key = ?)
         LIMIT 1`,
        [key, key]
    );

    if (!rows.length) return null;

    const row = rows[0];

    // Check access rights
    if (row.deleted_at) return null;
    if (row.sender_user_id !== userId && row.recipient_user_id !== userId) {
        return null;  // User doesn't own or receive this letter
    }

    // Determine if this is a thumbnail request
    const isThumbnail = row.thumbnail_key && row.thumbnail_key === key;
    const fileKey = isThumbnail ? row.thumbnail_key : row.storage_key;
    if (!fileKey) return null;

    return {
        filePath: resolveStoragePath(fileKey),
        mimeType: isThumbnail ? 'image/webp' : row.mime_type,
        downloadName: sanitizeFilename(row.original_name) || undefined,
    };
}

/**
 * Get all attachments for a letter
 */
export async function getAttachmentsForLetter(
    letterId: string,
    userId: number
): Promise<FutureLetterAttachment[]> {
    // Verify access
    const letter = await letterService.getLetter(letterId, userId);
    if (!letter) {
        return [];
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM future_letter_attachments WHERE letter_id = ? ORDER BY sort_order',
        [letterId]
    );

    return rows.map(mapRowToAttachment);
}
