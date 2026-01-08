/**
 * Future Letters - Letter Service (CRUD)
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { fromZonedTime } from 'date-fns-tz';
import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';
import { pool } from '../../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type {
    FutureLetter,
    FutureLetterSummary,
    FutureLetterDetail,
    FutureLetterAttachment,
    FutureLetterTemplate,
    FutureLetterPhysical,
    CreateLetterRequest,
    UpdateLetterRequest,
    LetterListQuery,
    LetterListResponse,
    LetterStatus,
} from './types';

// HTML sanitization config (strict allowlist)
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'strong', 'em', 'u', 's', 'code', 'pre',
        'ul', 'ol', 'li',
        'blockquote',
        'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
        'a': ['href', 'title'],
        'img': ['src', 'alt', 'title'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
};

/**
 * 创建信件
 */
export async function createLetter(
    userId: number,
    data: CreateLetterRequest
): Promise<FutureLetter> {
    const id = uuidv4();
    const now = new Date();

    // 计算UTC时间
    const timezone = data.scheduledTz || 'Asia/Shanghai';
    const scheduledLocal = new Date(data.scheduledLocal);
    const scheduledAtUtc = fromZonedTime(scheduledLocal, timezone);

    // 标准化收件邮箱
    let recipientEmailNormalized: string | null = null;
    let recipientEmailHash: string | null = null;
    if (data.recipientEmail) {
        recipientEmailNormalized = data.recipientEmail.toLowerCase().trim();
        recipientEmailHash = crypto
            .createHash('sha256')
            .update(recipientEmailNormalized)
            .digest('hex');
    }

    // 渲染并净化Markdown
    const contentHtml = await marked.parse(data.content);
    const contentHtmlSanitized = sanitizeHtml(contentHtml, SANITIZE_OPTIONS);
    const contentSha256 = crypto
        .createHash('sha256')
        .update(data.content)
        .digest('hex');

    const query = `
        INSERT INTO future_letters (
            id, sender_user_id,
            recipient_type, recipient_email, recipient_email_normalized,
            recipient_email_hash, recipient_name,
            title, content, content_html_sanitized, content_sha256,
            template_id, is_encrypted, encryption_hint,
            music_url,
            scheduled_local, scheduled_tz, scheduled_at_utc,
            letter_type, status, ai_opt_in,
            is_public, public_anonymous, public_alias,
            created_at, updated_at
        ) VALUES (
            ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?,
            ?, ?, ?,
            ?, 'draft', ?,
            ?, ?, ?,
            ?, ?
        )
    `;

    await pool.execute(query, [
        id, userId,
        data.recipientType, data.recipientEmail || null, recipientEmailNormalized,
        recipientEmailHash, data.recipientName || null,
        data.title, data.content, contentHtmlSanitized, contentSha256,
        data.templateId || null, data.isEncrypted || false, data.encryptionHint || null,
        data.musicUrl || null,
        scheduledLocal, timezone, scheduledAtUtc,
        data.letterType || 'electronic', data.aiOptIn !== false,
        data.isPublic || false, data.publicAnonymous || false, data.publicAlias || null,
        now, now,
    ]);

    // 记录事件
    await logEvent(id, userId, 'user', 'created', null, 'draft');

    return getLetter(id, userId) as Promise<FutureLetter>;
}

/**
 * 获取单封信件
 */
export async function getLetter(
    letterId: string,
    userId: number,
    includeDeleted = false
): Promise<FutureLetter | null> {
    let query = `
        SELECT * FROM future_letters
        WHERE id = ? AND sender_user_id = ?
    `;
    if (!includeDeleted) {
        query += ' AND deleted_at IS NULL';
    }

    const [rows] = await pool.execute<RowDataPacket[]>(query, [letterId, userId]);
    if (rows.length === 0) return null;

    return mapRowToLetter(rows[0]);
}

/**
 * 获取信件详情(含附件、模板等)
 */
export async function getLetterDetail(
    letterId: string,
    userId: number
): Promise<FutureLetterDetail | null> {
    const letter = await getLetter(letterId, userId);
    if (!letter) return null;

    // 获取附件
    const [attachments] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM future_letter_attachments WHERE letter_id = ? ORDER BY sort_order',
        [letterId]
    );

    // 获取模板
    let template: FutureLetterTemplate | undefined;
    if (letter.templateId) {
        const [templates] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM future_letter_templates WHERE id = ?',
            [letter.templateId]
        );
        if (templates.length > 0) {
            template = mapRowToTemplate(templates[0]);
        }
    }

    // 获取实体信订单（任何已提交的信件都可能有实体信订单）
    let physicalOrder: any | undefined;
    const [physical] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM future_letter_physical WHERE letter_id = ?',
        [letterId]
    );
    if (physical.length > 0) {
        physicalOrder = mapRowToPhysical(physical[0]);
    }

    return {
        ...letter,
        attachmentsList: attachments.map(mapRowToAttachment),
        template,
        physicalOrder,
    };
}

/**
 * 获取收件人的信件详情（仅限已投递状态）
 */
export async function getReceivedLetterDetail(
    letterId: string,
    recipientEmail: string
): Promise<FutureLetterDetail | null> {
    const normalizedEmail = recipientEmail.toLowerCase().trim();

    // 只能查看已投递的信件
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM future_letters
         WHERE id = ? AND recipient_email_normalized = ? AND status = 'delivered' AND deleted_at IS NULL`,
        [letterId, normalizedEmail]
    );
    if (rows.length === 0) return null;

    const letter = mapRowToLetter(rows[0]);

    // 获取附件
    const [attachments] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM future_letter_attachments WHERE letter_id = ? ORDER BY sort_order',
        [letterId]
    );

    // 获取模板
    let template: FutureLetterTemplate | undefined;
    if (letter.templateId) {
        const [templates] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM future_letter_templates WHERE id = ?',
            [letter.templateId]
        );
        if (templates.length > 0) {
            template = mapRowToTemplate(templates[0]);
        }
    }

    return {
        ...letter,
        attachmentsList: attachments.map(mapRowToAttachment),
        template,
    };
}

/**
 * 获取信件列表
 */
export async function getLetterList(
    userId: number,
    query: LetterListQuery
): Promise<LetterListResponse> {
    const limit = Math.min(query.limit || 20, 100);
    const sort = query.sort || 'created_at';
    const order = query.order || 'desc';

    let whereClause = 'WHERE deleted_at IS NULL';
    const params: (string | number)[] = [];

    // 类型筛选
    if (query.type === 'sent') {
        whereClause += ' AND sender_user_id = ?';
        params.push(userId);
    } else if (query.type === 'received') {
        whereClause += ' AND (recipient_user_id = ? OR recipient_email_hash = (SELECT recipient_email_hash FROM users WHERE id = ?)) AND recipient_deleted_at IS NULL';
        params.push(userId, userId);
    } else if (query.type === 'drafts') {
        whereClause += ' AND sender_user_id = ? AND status = "draft"';
        params.push(userId);
    } else {
        whereClause += ' AND sender_user_id = ?';
        params.push(userId);
    }

    // 状态筛选
    if (query.status) {
        whereClause += ' AND status = ?';
        params.push(query.status);
    }

    // 游标分页
    if (query.cursor) {
        const cursorValue = Buffer.from(query.cursor, 'base64').toString('utf-8');
        const op = order === 'desc' ? '<' : '>';
        whereClause += ` AND ${sort} ${op} ?`;
        params.push(cursorValue);
    }

    // 计数
    const countSql = `SELECT COUNT(*) as total FROM future_letters ${whereClause}`;
    const [countRows] = await pool.execute<RowDataPacket[]>(countSql, params);
    const total = countRows[0].total;

    // 列表
    const listSql = `
        SELECT
            fl.id, fl.title, fl.recipient_type, fl.recipient_name,
            fl.scheduled_at_utc, fl.scheduled_tz, fl.status,
            fl.is_encrypted, fl.music_url, fl.is_public, fl.created_at,
            (SELECT COUNT(*) FROM future_letter_attachments WHERE letter_id = fl.id) as attachment_count
        FROM future_letters fl
        ${whereClause}
        ORDER BY ${sort} ${order}
        LIMIT ?
    `;
    params.push(limit + 1);  // 多取一条判断是否有下一页

    const [rows] = await pool.execute<RowDataPacket[]>(listSql, params);

    const hasMore = rows.length > limit;
    const letters = rows.slice(0, limit).map(mapRowToSummary);

    let nextCursor: string | undefined;
    if (hasMore && letters.length > 0) {
        const lastItem = letters[letters.length - 1];
        const cursorValue = sort === 'scheduled_at_utc'
            ? lastItem.scheduledAtUtc
            : lastItem.createdAt;
        nextCursor = Buffer.from(cursorValue).toString('base64');
    }

    return { letters, nextCursor, total };
}

/**
 * 更新信件
 */
export async function updateLetter(
    letterId: string,
    userId: number,
    data: UpdateLetterRequest
): Promise<FutureLetter | null> {
    // 获取当前版本(乐观锁)
    const current = await getLetter(letterId, userId);
    if (!current) return null;

    // 只能更新草稿
    if (current.status !== 'draft') {
        throw new Error('Can only update draft letters');
    }

    // 版本检查
    if (data.version !== current.version) {
        throw new Error('Conflict: letter has been modified');
    }

    const updates: string[] = [];
    const params: (string | number | null | Date)[] = [];

    if (data.title !== undefined) {
        updates.push('title = ?');
        params.push(data.title);
    }

    if (data.content !== undefined) {
        updates.push('content = ?');
        params.push(data.content);

        // 重新渲染HTML
        const contentHtml = await marked.parse(data.content);
        const contentHtmlSanitized = sanitizeHtml(contentHtml, SANITIZE_OPTIONS);
        updates.push('content_html_sanitized = ?');
        params.push(contentHtmlSanitized);

        const contentSha256 = crypto
            .createHash('sha256')
            .update(data.content)
            .digest('hex');
        updates.push('content_sha256 = ?');
        params.push(contentSha256);
    }

    if (data.templateId !== undefined) {
        updates.push('template_id = ?');
        params.push(data.templateId);
    }

    if (data.recipientEmail !== undefined) {
        updates.push('recipient_email = ?');
        params.push(data.recipientEmail || null);

        if (data.recipientEmail) {
            const normalized = data.recipientEmail.toLowerCase().trim();
            updates.push('recipient_email_normalized = ?');
            params.push(normalized);
            updates.push('recipient_email_hash = ?');
            params.push(crypto.createHash('sha256').update(normalized).digest('hex'));
        } else {
            updates.push('recipient_email_normalized = NULL, recipient_email_hash = NULL');
        }
    }

    if (data.recipientName !== undefined) {
        updates.push('recipient_name = ?');
        params.push(data.recipientName || null);
    }

    if (data.isEncrypted !== undefined) {
        updates.push('is_encrypted = ?');
        params.push(data.isEncrypted ? 1 : 0);
    }

    if (data.encryptionHint !== undefined) {
        updates.push('encryption_hint = ?');
        params.push(data.encryptionHint || null);
    }

    if (data.musicUrl !== undefined) {
        updates.push('music_url = ?');
        params.push(data.musicUrl || null);
    }

    if (data.scheduledLocal !== undefined) {
        const timezone = data.scheduledTz || current.scheduledTz;
        const scheduledLocal = new Date(data.scheduledLocal);
        const scheduledAtUtc = fromZonedTime(scheduledLocal, timezone);

        updates.push('scheduled_local = ?, scheduled_tz = ?, scheduled_at_utc = ?');
        params.push(scheduledLocal, timezone, scheduledAtUtc);
    }

    if (data.aiOptIn !== undefined) {
        updates.push('ai_opt_in = ?');
        params.push(data.aiOptIn ? 1 : 0);
    }

    // 公开信选项
    if (data.isPublic !== undefined) {
        updates.push('is_public = ?');
        params.push(data.isPublic ? 1 : 0);
    }

    if (data.publicAnonymous !== undefined) {
        updates.push('public_anonymous = ?');
        params.push(data.publicAnonymous ? 1 : 0);
    }

    if (data.publicAlias !== undefined) {
        updates.push('public_alias = ?');
        params.push(data.publicAlias || null);
    }

    // 更新版本
    updates.push('version = version + 1');
    updates.push('updated_at = ?');
    params.push(new Date());

    if (updates.length === 0) {
        return current;
    }

    const sql = `
        UPDATE future_letters
        SET ${updates.join(', ')}
        WHERE id = ? AND sender_user_id = ? AND version = ?
    `;
    params.push(letterId, userId, data.version);

    const [result] = await pool.execute<ResultSetHeader>(sql, params);

    if (result.affectedRows === 0) {
        throw new Error('Conflict: letter has been modified');
    }

    await logEvent(letterId, userId, 'user', 'updated', 'draft', 'draft');

    return getLetter(letterId, userId);
}

/**
 * 删除信件(软删除,仅草稿)
 */
export async function deleteLetter(
    letterId: string,
    userId: number
): Promise<boolean> {
    const letter = await getLetter(letterId, userId);
    if (!letter) return false;

    if (letter.status !== 'draft') {
        throw new Error('Can only delete draft letters');
    }

    await pool.execute(
        'UPDATE future_letters SET deleted_at = ? WHERE id = ? AND sender_user_id = ?',
        [new Date(), letterId, userId]
    );

    await logEvent(letterId, userId, 'user', 'deleted', 'draft', null);

    return true;
}

/**
 * 撤回已提交审核的信件 (pending_review -> draft)
 */
export async function withdrawLetter(
    letterId: string,
    userId: number
): Promise<FutureLetter | null> {
    const letter = await getLetter(letterId, userId);
    if (!letter) return null;

    if (letter.status !== 'pending_review') {
        throw new Error('Can only withdraw pending_review letters');
    }

    await pool.execute(
        `UPDATE future_letters
         SET status = 'draft', submitted_at = NULL, turnstile_verified = FALSE
         WHERE id = ? AND sender_user_id = ?`,
        [letterId, userId]
    );

    await logEvent(letterId, userId, 'user', 'withdrawn', 'draft', '用户撤回了信件');

    return getLetter(letterId, userId);
}

/**
 * 取消已排期但未送达的信件 (approved/scheduled/delivering -> cancelled)
 * 允许用户在信件送达前取消发送
 */
export async function cancelScheduledLetter(
    letterId: string,
    userId: number
): Promise<FutureLetter | null> {
    const letter = await getLetter(letterId, userId);
    if (!letter) return null;

    // 只能取消这些状态的信件
    const cancellableStatuses = ['approved', 'scheduled', 'delivering'];
    if (!cancellableStatuses.includes(letter.status)) {
        throw new Error(`Cannot cancel letter with status: ${letter.status}`);
    }

    // 检查是否已送达
    if (letter.deliveredAt) {
        throw new Error('Cannot cancel already delivered letter');
    }

    await pool.execute(
        `UPDATE future_letters
         SET status = 'cancelled', cancelled_at = ?
         WHERE id = ? AND sender_user_id = ?`,
        [new Date(), letterId, userId]
    );

    await logEvent(letterId, userId, 'user', 'cancelled', 'cancelled', '用户取消了信件发送');

    return getLetter(letterId, userId);
}

/**
 * 切换信件的公开状态
 * 允许用户在任何时刻将公开信件改为非公开（反之亦然，但改为公开需要审核）
 */
export async function togglePublicStatus(
    letterId: string,
    userId: number,
    isPublic: boolean
): Promise<FutureLetter | null> {
    const letter = await getLetter(letterId, userId);
    if (!letter) return null;

    // 不能修改已删除的信件
    if (letter.deletedAt) {
        throw new Error('Cannot modify deleted letter');
    }

    // 如果是将非公开改为公开，且信件已经提交/排期，需要重新审核
    if (isPublic && !letter.isPublic && letter.status !== 'draft') {
        throw new Error('Cannot make a submitted letter public. Please withdraw and resubmit.');
    }

    await pool.execute(
        `UPDATE future_letters
         SET is_public = ?
         WHERE id = ? AND sender_user_id = ?`,
        [isPublic, letterId, userId]
    );

    const action = isPublic ? 'set_public' : 'set_private';
    const note = isPublic ? '用户将信件设为公开' : '用户将信件设为非公开';
    await logEvent(letterId, userId, 'user', action, letter.status, note);

    return getLetter(letterId, userId);
}

/**
 * 删除收到的信件 (软删除，仅从收件人视角)
 */
export async function deleteReceivedLetter(
    letterId: string,
    userId: number
): Promise<boolean> {
    // 获取用户邮箱
    const [userRows] = await pool.execute<RowDataPacket[]>(
        'SELECT email FROM users WHERE id = ?',
        [userId]
    );
    if (userRows.length === 0) return false;
    const userEmail = userRows[0].email;

    // 检查用户是否是收件人
    const [letterRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM future_letters
         WHERE id = ? AND (
             (recipient_type = 'self' AND sender_user_id = ?)
             OR (recipient_type = 'other' AND recipient_email = ?)
         ) AND deleted_at IS NULL`,
        [letterId, userId, userEmail]
    );

    if (letterRows.length === 0) return false;

    // 软删除：设置收件人删除时间 (不影响发件人)
    await pool.execute(
        'UPDATE future_letters SET recipient_deleted_at = ? WHERE id = ?',
        [new Date(), letterId]
    );

    await logEvent(letterId, userId, 'user', 'recipient_deleted', null, '收件人删除了信件');

    return true;
}

/**
 * 提交审核
 */
export async function submitForReview(
    letterId: string,
    userId: number
): Promise<FutureLetter | null> {
    const letter = await getLetter(letterId, userId);
    if (!letter) return null;

    if (letter.status !== 'draft') {
        throw new Error('Can only submit draft letters');
    }

    // 检查是否需要审核
    const [settings] = await pool.execute<RowDataPacket[]>(
        "SELECT setting_value FROM future_letter_settings WHERE setting_key IN ('require_review', 'auto_approve_self')"
    );
    const settingsMap = Object.fromEntries(
        settings.map((s: RowDataPacket) => [s.setting_key, s.setting_value])
    );

    const requireReview = settingsMap['require_review'] !== 'false';
    const autoApproveSelf = settingsMap['auto_approve_self'] === 'true';

    let newStatus: LetterStatus = 'pending_review';

    // 自动通过审核的情况
    if (!requireReview || (autoApproveSelf && letter.recipientType === 'self')) {
        newStatus = 'scheduled';
    }

    const now = new Date();
    await pool.execute(
        `UPDATE future_letters
         SET status = ?, submitted_at = ?, turnstile_verified = TRUE,
             reviewed_at = ?, updated_at = ?
         WHERE id = ? AND sender_user_id = ?`,
        [
            newStatus,
            now,
            newStatus === 'scheduled' ? now : null,
            now,
            letterId,
            userId,
        ]
    );

    await logEvent(letterId, userId, 'user', 'submitted', 'draft', newStatus);

    // 如果已排期，创建投递任务
    if (newStatus === 'scheduled') {
        await scheduleDelivery(letterId);
    }

    return getLetter(letterId, userId);
}

/**
 * 创建投递任务
 */
async function scheduleDelivery(letterId: string): Promise<void> {
    const [letters] = await pool.execute<RowDataPacket[]>(
        'SELECT scheduled_at_utc FROM future_letters WHERE id = ?',
        [letterId]
    );
    if (letters.length === 0) return;

    const scheduledAt = letters[0].scheduled_at_utc;

    await pool.execute(
        `INSERT INTO future_letter_queue
         (letter_id, action, status, scheduled_for, created_at)
         VALUES (?, 'send_email', 'pending', ?, NOW())`,
        [letterId, scheduledAt]
    );
}

/**
 * 记录事件
 */
async function logEvent(
    letterId: string,
    actorUserId: number | null,
    actorType: 'user' | 'admin' | 'system',
    eventType: string,
    fromStatus: string | null,
    toStatus: string | null,
    metadata?: object
): Promise<void> {
    await pool.execute(
        `INSERT INTO future_letter_events
         (letter_id, actor_user_id, actor_type, event_type, from_status, to_status, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [letterId, actorUserId, actorType, eventType, fromStatus, toStatus, metadata ? JSON.stringify(metadata) : null]
    );
}

// ============================================
// Mapper Functions
// ============================================

function mapRowToLetter(row: RowDataPacket): FutureLetter {
    return {
        id: row.id,
        senderUserId: row.sender_user_id,
        recipientType: row.recipient_type,
        recipientUserId: row.recipient_user_id,
        recipientEmail: row.recipient_email,
        recipientEmailNormalized: row.recipient_email_normalized,
        recipientEmailHash: row.recipient_email_hash,
        recipientName: row.recipient_name,
        title: row.title,
        content: row.content,
        contentHtmlSanitized: row.content_html_sanitized,
        contentSha256: row.content_sha256,
        templateId: row.template_id,
        isEncrypted: Boolean(row.is_encrypted),
        encryptionScheme: row.encryption_scheme || 'none',
        encryptedPayload: row.encrypted_payload,
        kdfParams: row.kdf_params ? JSON.parse(row.kdf_params) : undefined,
        encryptionHint: row.encryption_hint,
        unlockTokenHash: row.unlock_token_hash,
        unlockExpiresAt: row.unlock_expires_at,
        unlockUsedAt: row.unlock_used_at,
        attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
        musicUrl: row.music_url,
        musicId: row.music_id,
        musicName: row.music_name,
        musicArtist: row.music_artist,
        musicCoverUrl: row.music_cover_url,
        scheduledLocal: row.scheduled_local,
        scheduledTz: row.scheduled_tz,
        scheduledAtUtc: row.scheduled_at_utc,
        deliveredAt: row.delivered_at,
        letterType: row.letter_type,
        status: row.status,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        reviewerUserId: row.reviewer_user_id,
        reviewNote: row.review_note,
        rejectedReason: row.rejected_reason,
        deliveryAttempts: row.delivery_attempts || 0,
        lastDeliveryError: row.last_delivery_error,
        providerMessageId: row.provider_message_id,
        aiOptIn: Boolean(row.ai_opt_in),
        aiSuggestions: row.ai_suggestions ? JSON.parse(row.ai_suggestions) : undefined,
        timetraceData: row.timetrace_data ? JSON.parse(row.timetrace_data) : undefined,
        turnstileVerified: Boolean(row.turnstile_verified),
        isPublic: Boolean(row.is_public),
        publicAnonymous: Boolean(row.public_anonymous),
        publicAlias: row.public_alias,
        version: row.version,
        deletedAt: row.deleted_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapRowToSummary(row: RowDataPacket): FutureLetterSummary {
    return {
        id: row.id,
        title: row.title,
        recipientType: row.recipient_type,
        recipientName: row.recipient_name,
        scheduledAtUtc: row.scheduled_at_utc?.toISOString(),
        scheduledTz: row.scheduled_tz,
        status: row.status,
        isEncrypted: Boolean(row.is_encrypted),
        hasMusic: Boolean(row.music_url),
        attachmentCount: row.attachment_count || 0,
        isPublic: Boolean(row.is_public),
        createdAt: row.created_at?.toISOString(),
    };
}

function mapRowToTemplate(row: RowDataPacket): FutureLetterTemplate {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        previewUrl: row.preview_url,
        thumbnailUrl: row.thumbnail_url,
        cssClass: row.css_class,
        cssStyles: row.css_styles,
        backgroundUrl: row.background_url,
        category: row.category,
        isPremium: Boolean(row.is_premium),
        price: parseFloat(row.price) || 0,
        sortOrder: row.sort_order,
        enabled: Boolean(row.enabled),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

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

function mapRowToPhysical(row: RowDataPacket): FutureLetterPhysical {
    return {
        id: row.id,
        letterId: row.letter_id,
        recipientName: row.recipient_name,
        recipientAddressEncrypted: row.recipient_address_encrypted,
        recipientPhoneEncrypted: row.recipient_phone_encrypted,
        postalCode: row.postal_code,
        country: row.country,
        paperType: row.paper_type,
        envelopeType: row.envelope_type,
        orderStatus: row.order_status,
        shippingStatus: row.shipping_status,
        trackingNumber: row.tracking_number,
        carrier: row.carrier,
        shippedAt: row.shipped_at,
        deliveredAt: row.delivered_at,
        shippingFee: row.shipping_fee ? parseFloat(row.shipping_fee) : undefined,
        paid: Boolean(row.paid),
        paidAt: row.paid_at,
        paymentId: row.payment_id,
        adminNote: row.admin_note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ============================================
// Template Service
// ============================================

export async function getTemplates(includeDisabled = false): Promise<FutureLetterTemplate[]> {
    let query = 'SELECT * FROM future_letter_templates';
    if (!includeDisabled) {
        query += ' WHERE enabled = TRUE';
    }
    query += ' ORDER BY sort_order, id';

    const [rows] = await pool.execute<RowDataPacket[]>(query);
    return rows.map(mapRowToTemplate);
}

export async function getTemplate(id: number): Promise<FutureLetterTemplate | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM future_letter_templates WHERE id = ?',
        [id]
    );
    return rows.length > 0 ? mapRowToTemplate(rows[0]) : null;
}

// ============================================
// Settings Service
// ============================================

export async function getSettings(): Promise<Record<string, string>> {
    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT setting_key, setting_value FROM future_letter_settings'
    );
    return Object.fromEntries(rows.map((r: RowDataPacket) => [r.setting_key, r.setting_value]));
}

export async function getSetting(key: string): Promise<string | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT setting_value FROM future_letter_settings WHERE setting_key = ?',
        [key]
    );
    return rows.length > 0 ? rows[0].setting_value : null;
}

export async function updateSetting(key: string, value: string): Promise<void> {
    await pool.execute(
        `INSERT INTO future_letter_settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
        [key, value, value]
    );
}

// ============================================
// User Statistics
// ============================================

export interface UserStats {
    sent: number;
    received: number;
    receivedUnread: number;  // 未读的收到信件数
    drafts: number;
    pending: number;
    scheduled: number;
}

export async function getUserStats(userId: number, userEmail: string): Promise<UserStats> {
    const normalizedEmail = userEmail.toLowerCase().trim();

    // 已发送/投递的信件数量
    const [[sentRow]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM future_letters
         WHERE sender_user_id = ? AND status IN ('approved', 'delivered') AND deleted_at IS NULL`,
        [userId]
    );

    // 收到的信件数量 (已投递的)
    const [[receivedRow]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM future_letters
         WHERE recipient_email_normalized = ? AND status = 'delivered' AND deleted_at IS NULL AND recipient_deleted_at IS NULL`,
        [normalizedEmail]
    );

    // 未读的收到信件数量
    const [[receivedUnreadRow]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM future_letters
         WHERE recipient_email_normalized = ? AND status = 'delivered' AND recipient_read_at IS NULL AND deleted_at IS NULL AND recipient_deleted_at IS NULL`,
        [normalizedEmail]
    );

    // 草稿数量
    const [[draftsRow]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM future_letters
         WHERE sender_user_id = ? AND status = 'draft' AND deleted_at IS NULL`,
        [userId]
    );

    // 待审核数量
    const [[pendingRow]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM future_letters
         WHERE sender_user_id = ? AND status = 'pending_review' AND deleted_at IS NULL`,
        [userId]
    );

    // 已排期数量 (approved但还没到投递时间)
    const [[scheduledRow]] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM future_letters
         WHERE sender_user_id = ? AND status = 'approved' AND scheduled_at_utc > NOW() AND deleted_at IS NULL`,
        [userId]
    );

    return {
        sent: sentRow?.count || 0,
        received: receivedRow?.count || 0,
        receivedUnread: receivedUnreadRow?.count || 0,
        drafts: draftsRow?.count || 0,
        pending: pendingRow?.count || 0,
        scheduled: scheduledRow?.count || 0,
    };
}

/**
 * 标记信件为已读（收件人视角）
 */
export async function markAsRead(letterId: string, userEmail: string): Promise<boolean> {
    const normalizedEmail = userEmail.toLowerCase().trim();
    const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE future_letters
         SET recipient_read_at = NOW()
         WHERE id = ? AND recipient_email_normalized = ? AND status = 'delivered' AND recipient_read_at IS NULL`,
        [letterId, normalizedEmail]
    );
    return result.affectedRows > 0;
}

/**
 * 标记所有收到的信件为已读
 */
export async function markAllAsRead(userEmail: string): Promise<number> {
    const normalizedEmail = userEmail.toLowerCase().trim();
    const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE future_letters
         SET recipient_read_at = NOW()
         WHERE recipient_email_normalized = ? AND status = 'delivered' AND recipient_read_at IS NULL AND deleted_at IS NULL AND recipient_deleted_at IS NULL`,
        [normalizedEmail]
    );
    return result.affectedRows;
}
