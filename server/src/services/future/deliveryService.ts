/**
 * Future Letters - Delivery Service
 * Handles email delivery via Resend + BullMQ scheduling
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import crypto from 'crypto';
import { pool } from '../../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { FutureLetter, DeliveryResult } from './types';

// Redis connection for BullMQ
const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

// Queue for scheduled deliveries
export const futureLetterQueue = new Queue('future-letters', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 60000,  // 1 minute initial delay
        },
        removeOnComplete: { age: 7 * 24 * 3600 },  // Keep 7 days
        removeOnFail: { age: 30 * 24 * 3600 },  // Keep 30 days
    },
});

// ============================================
// Email Rendering
// ============================================

interface LetterEmailData {
    letter: FutureLetter;
    senderName: string;
    templateCss?: string;
    unlockUrl?: string;
}

function renderLetterHtml(data: LetterEmailData): string {
    const { letter, senderName, templateCss, unlockUrl } = data;

    // 加密信使用门户链接
    if (letter.isEncrypted && unlockUrl) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .title { font-size: 24px; color: #333; }
        .from { color: #666; margin-top: 10px; }
        .hint { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .button { display: inline-block; background: #007AFF; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 8px; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="title">🔐 ${letter.title}</div>
            <div class="from">来自 ${senderName} 的时光信</div>
        </div>
        <p>这封信已加密保护，请点击下方按钮解锁阅读：</p>
        ${letter.encryptionHint ? `<div class="hint"><strong>提示：</strong>${letter.encryptionHint}</div>` : ''}
        <p style="text-align: center;">
            <a href="${unlockUrl}" class="button">解锁信件</a>
        </p>
        <p style="color: #666; font-size: 14px;">链接有效期 7 天，请尽快查看。</p>
        <div class="footer">
            <p>由 AstraLinks 时光信 提供服务</p>
        </div>
    </div>
</body>
</html>`;
    }

    // 普通信
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .title { font-size: 24px; color: #333; }
        .from { color: #666; margin-top: 10px; }
        .date { color: #999; font-size: 14px; margin-top: 5px; }
        .content { line-height: 1.8; color: #333; }
        .content img { max-width: 100%; height: auto; }
        .music { background: linear-gradient(135deg, #ff6b6b, #ee5a5a); color: white; padding: 15px; border-radius: 12px; margin: 20px 0; }
        .music a { color: white; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; }
        ${templateCss || ''}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="title">✉️ ${letter.title}</div>
            <div class="from">来自 ${senderName}</div>
            <div class="date">写于 ${formatDate(letter.createdAt)}</div>
        </div>
        <div class="content">
            ${letter.contentHtmlSanitized || letter.content}
        </div>
        ${letter.musicName ? `
        <div class="music">
            🎵 <strong>${letter.musicName}</strong>
            ${letter.musicArtist ? ` - ${letter.musicArtist}` : ''}
            ${letter.musicUrl ? `<br><a href="${letter.musicUrl}" target="_blank">在网易云音乐收听</a>` : ''}
        </div>` : ''}
        <div class="footer">
            <p>这是一封来自过去的时光信</p>
            <p>由 AstraLinks 时光信 在 ${formatDate(letter.scheduledAtUtc)} 送达</p>
        </div>
    </div>
</body>
</html>`;
}

function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ============================================
// Delivery Logic
// ============================================

/**
 * 发送信件邮件
 */
export async function deliverLetter(letterId: string): Promise<void> {
    // 获取信件
    const [letters] = await pool.execute<RowDataPacket[]>(
        `SELECT fl.*, u.username as sender_username, u.email as sender_email
         FROM future_letters fl
         JOIN users u ON fl.sender_user_id = u.id
         WHERE fl.id = ?`,
        [letterId]
    );

    if (letters.length === 0) {
        throw new Error(`Letter not found: ${letterId}`);
    }

    const letterRow = letters[0];

    // 检查状态
    if (!['scheduled', 'delivering'].includes(letterRow.status)) {
        console.log(`Letter ${letterId} status is ${letterRow.status}, skipping delivery`);
        return;
    }

    // 确定收件邮箱
    let recipientEmail: string;
    if (letterRow.recipient_type === 'self') {
        recipientEmail = letterRow.sender_email;
    } else if (letterRow.recipient_email) {
        recipientEmail = letterRow.recipient_email;
    } else if (letterRow.recipient_user_id) {
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT email FROM users WHERE id = ?',
            [letterRow.recipient_user_id]
        );
        if (users.length === 0) {
            throw new Error(`Recipient user not found: ${letterRow.recipient_user_id}`);
        }
        recipientEmail = users[0].email;
    } else {
        throw new Error(`No recipient email for letter: ${letterId}`);
    }

    // 检查抑制列表
    const emailHash = crypto.createHash('sha256').update(recipientEmail.toLowerCase()).digest('hex');
    const [suppressed] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM future_letter_suppression
         WHERE email_hash = ? AND (expires_at IS NULL OR expires_at > NOW())`,
        [emailHash]
    );

    if (suppressed.length > 0) {
        await updateLetterStatus(letterId, 'failed', 'Email is suppressed');
        await logDeliveryAttempt(letterId, 'failed', 'SUPPRESSED', 'Email is on suppression list');
        throw new Error(`Email suppressed: ${recipientEmail}`);
    }

    // 更新状态为投递中
    await pool.execute(
        'UPDATE future_letters SET status = "delivering", updated_at = NOW() WHERE id = ?',
        [letterId]
    );

    // 获取模板CSS
    let templateCss: string | undefined;
    if (letterRow.template_id) {
        const [templates] = await pool.execute<RowDataPacket[]>(
            'SELECT css_styles FROM future_letter_templates WHERE id = ?',
            [letterRow.template_id]
        );
        if (templates.length > 0) {
            templateCss = templates[0].css_styles;
        }
    }

    // 生成解锁URL(加密信)
    let unlockUrl: string | undefined;
    if (letterRow.is_encrypted) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);  // 7 days

        await pool.execute(
            `UPDATE future_letters
             SET unlock_token_hash = ?, unlock_expires_at = ?
             WHERE id = ?`,
            [tokenHash, expiresAt, letterId]
        );

        const baseUrl = process.env.APP_URL || 'https://astralinks.xyz';
        unlockUrl = `${baseUrl}/future/letter/${letterId}/unlock?token=${token}`;
    }

    // 构造信件对象
    const letter: FutureLetter = {
        id: letterRow.id,
        senderUserId: letterRow.sender_user_id,
        recipientType: letterRow.recipient_type,
        title: letterRow.title,
        content: letterRow.content,
        contentHtmlSanitized: letterRow.content_html_sanitized,
        isEncrypted: Boolean(letterRow.is_encrypted),
        encryptionScheme: letterRow.encryption_scheme || 'none',
        encryptionHint: letterRow.encryption_hint,
        musicUrl: letterRow.music_url,
        musicName: letterRow.music_name,
        musicArtist: letterRow.music_artist,
        scheduledLocal: letterRow.scheduled_local,
        scheduledTz: letterRow.scheduled_tz,
        scheduledAtUtc: letterRow.scheduled_at_utc,
        letterType: letterRow.letter_type,
        status: letterRow.status,
        aiOptIn: Boolean(letterRow.ai_opt_in),
        turnstileVerified: Boolean(letterRow.turnstile_verified),
        version: letterRow.version,
        deliveryAttempts: letterRow.delivery_attempts || 0,
        createdAt: letterRow.created_at,
        updatedAt: letterRow.updated_at,
    };

    // 渲染邮件HTML
    const html = renderLetterHtml({
        letter,
        senderName: letterRow.sender_username,
        templateCss,
        unlockUrl,
    });

    // 获取发件设置
    const [settings] = await pool.execute<RowDataPacket[]>(
        "SELECT setting_key, setting_value FROM future_letter_settings WHERE setting_key IN ('email_from_address', 'email_from_name')"
    );
    const settingsMap = Object.fromEntries(settings.map((s: RowDataPacket) => [s.setting_key, s.setting_value]));
    const fromAddress = settingsMap['email_from_address'] || 'timehome@astralinks.xyz';
    const fromName = settingsMap['email_from_name'] || 'AstraLinks 时光信';

    // 发送邮件 (使用Resend)
    try {
        const response = await sendEmailViaResend({
            from: `${fromName} <${fromAddress}>`,
            to: recipientEmail,
            subject: `来自过去的信: ${letter.title}`,
            html,
            headers: {
                'X-Letter-ID': letterId,
            },
        });

        // 更新状态
        await pool.execute(
            `UPDATE future_letters
             SET status = 'delivered', delivered_at = NOW(), provider_message_id = ?,
                 delivery_attempts = delivery_attempts + 1, updated_at = NOW()
             WHERE id = ?`,
            [response.id, letterId]
        );

        await logDeliveryAttempt(letterId, 'success', null, null, response.id);
        await logEvent(letterId, null, 'system', 'delivered', 'delivering', 'delivered');

        console.log(`Letter ${letterId} delivered successfully to ${recipientEmail}`);

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        await pool.execute(
            `UPDATE future_letters
             SET delivery_attempts = delivery_attempts + 1, last_delivery_error = ?, updated_at = NOW()
             WHERE id = ?`,
            [errorMessage, letterId]
        );

        await logDeliveryAttempt(letterId, 'failed', 'SEND_ERROR', errorMessage);

        throw error;
    }
}

/**
 * 通过Resend API发送邮件
 */
async function sendEmailViaResend(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
}): Promise<{ id: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error('RESEND_API_KEY not configured');
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
    });

    if (!response.ok) {
        const errorData = await response.json() as { message?: string };
        throw new Error(`Resend API error: ${errorData.message || response.statusText}`);
    }

    return response.json() as Promise<{ id: string }>;
}

/**
 * 更新信件状态
 */
async function updateLetterStatus(
    letterId: string,
    status: string,
    error?: string
): Promise<void> {
    await pool.execute(
        `UPDATE future_letters
         SET status = ?, last_delivery_error = ?, updated_at = NOW()
         WHERE id = ?`,
        [status, error || null, letterId]
    );
}

/**
 * 记录投递尝试
 */
async function logDeliveryAttempt(
    letterId: string,
    result: DeliveryResult,
    errorCode?: string | null,
    errorMessage?: string | null,
    providerMessageId?: string
): Promise<void> {
    await pool.execute(
        `INSERT INTO future_letter_delivery_attempts
         (letter_id, provider, provider_message_id, result, error_code, error_message, attempted_at)
         VALUES (?, 'resend', ?, ?, ?, ?, NOW())`,
        [letterId, providerMessageId || null, result, errorCode || null, errorMessage || null]
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
    toStatus: string | null
): Promise<void> {
    await pool.execute(
        `INSERT INTO future_letter_events
         (letter_id, actor_user_id, actor_type, event_type, from_status, to_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [letterId, actorUserId, actorType, eventType, fromStatus, toStatus]
    );
}

// ============================================
// BullMQ Worker
// ============================================

/**
 * 启动Worker处理队列任务
 */
export function startDeliveryWorker(): Worker {
    const worker = new Worker(
        'future-letters',
        async (job: Job) => {
            console.log(`Processing job ${job.id} for letter ${job.data.letterId}`);

            switch (job.name) {
                case 'deliver':
                    await deliverLetter(job.data.letterId);
                    break;

                default:
                    console.warn(`Unknown job type: ${job.name}`);
            }
        },
        {
            connection: redis,
            concurrency: 5,
        }
    );

    worker.on('completed', (job) => {
        console.log(`Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`Job ${job?.id} failed:`, err.message);
    });

    return worker;
}

/**
 * 调度信件投递
 */
export async function scheduleLetterDelivery(letterId: string, scheduledAt: Date): Promise<string> {
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());

    // 使用确定性jobId支持取消/重新调度
    const jobId = `letter-${letterId}`;

    // 移除已有任务(如果有)
    const existingJob = await futureLetterQueue.getJob(jobId);
    if (existingJob) {
        await existingJob.remove();
    }

    // 添加新任务
    const job = await futureLetterQueue.add(
        'deliver',
        { letterId },
        {
            delay,
            jobId,
        }
    );

    // 记录到数据库
    await pool.execute(
        `INSERT INTO future_letter_queue
         (letter_id, job_id, action, status, scheduled_for, created_at)
         VALUES (?, ?, 'send_email', 'pending', ?, NOW())
         ON DUPLICATE KEY UPDATE
         job_id = ?, status = 'pending', scheduled_for = ?, updated_at = NOW()`,
        [letterId, job.id, scheduledAt, job.id, scheduledAt]
    );

    return job.id || jobId;
}

/**
 * 取消信件投递
 */
export async function cancelLetterDelivery(letterId: string): Promise<boolean> {
    const jobId = `letter-${letterId}`;
    const job = await futureLetterQueue.getJob(jobId);

    if (job) {
        await job.remove();
    }

    await pool.execute(
        `UPDATE future_letter_queue
         SET status = 'cancelled'
         WHERE letter_id = ? AND action = 'send_email' AND status = 'pending'`,
        [letterId]
    );

    return true;
}

// ============================================
// Webhook Handlers (Resend)
// ============================================

export interface ResendWebhookPayload {
    type: 'email.sent' | 'email.delivered' | 'email.delivery_delayed' | 'email.complained' | 'email.bounced' | 'email.opened' | 'email.clicked';
    created_at: string;
    data: {
        email_id: string;
        from: string;
        to: string[];
        subject: string;
        bounce?: {
            message: string;
        };
        complaint?: {
            feedback_type: string;
        };
    };
}

/**
 * 处理Resend Webhook
 */
export async function handleResendWebhook(
    payload: ResendWebhookPayload,
    signature: string
): Promise<void> {
    // 验证签名
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
        // TODO: 实现签名验证
    }

    const emailId = payload.data.email_id;

    // 查找对应信件
    const [letters] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM future_letters WHERE provider_message_id = ?',
        [emailId]
    );

    if (letters.length === 0) {
        console.log(`No letter found for email ${emailId}`);
        return;
    }

    const letterId = letters[0].id;

    switch (payload.type) {
        case 'email.bounced':
            await handleBounce(letterId, payload);
            break;

        case 'email.complained':
            await handleComplaint(letterId, payload);
            break;

        case 'email.delivered':
            // 已在发送时标记，这里可以更新更精确的送达时间
            break;
    }
}

async function handleBounce(letterId: string, payload: ResendWebhookPayload): Promise<void> {
    const recipientEmail = payload.data.to[0];
    const emailHash = crypto.createHash('sha256').update(recipientEmail.toLowerCase()).digest('hex');

    // 更新信件状态
    await pool.execute(
        `UPDATE future_letters
         SET status = 'failed', last_delivery_error = ?
         WHERE id = ?`,
        [payload.data.bounce?.message || 'Email bounced', letterId]
    );

    // 添加到抑制列表
    await pool.execute(
        `INSERT INTO future_letter_suppression
         (email_hash, reason, source_letter_id, bounce_type, created_at)
         VALUES (?, 'bounce', ?, 'hard', NOW())
         ON DUPLICATE KEY UPDATE reason = 'bounce', created_at = NOW()`,
        [emailHash, letterId]
    );

    await logDeliveryAttempt(letterId, 'bounce', 'BOUNCE', payload.data.bounce?.message);
}

async function handleComplaint(letterId: string, payload: ResendWebhookPayload): Promise<void> {
    const recipientEmail = payload.data.to[0];
    const emailHash = crypto.createHash('sha256').update(recipientEmail.toLowerCase()).digest('hex');

    // 添加到抑制列表
    await pool.execute(
        `INSERT INTO future_letter_suppression
         (email_hash, reason, source_letter_id, complaint_type, created_at)
         VALUES (?, 'complaint', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE reason = 'complaint', created_at = NOW()`,
        [emailHash, letterId, payload.data.complaint?.feedback_type || 'unknown']
    );

    await logDeliveryAttempt(letterId, 'complaint', 'COMPLAINT', payload.data.complaint?.feedback_type);
}

// ============================================
// Scheduler (for long delays)
// ============================================

/**
 * 定期检查并调度即将到期的信件
 * 解决BullMQ不适合超长延迟的问题
 */
export async function runScheduler(): Promise<void> {
    // 查找未来24小时内需要投递的信件
    const [letters] = await pool.execute<RowDataPacket[]>(
        `SELECT id, scheduled_at_utc
         FROM future_letters
         WHERE status = 'scheduled'
         AND scheduled_at_utc <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
         AND scheduled_at_utc > NOW()
         AND id NOT IN (
             SELECT letter_id FROM future_letter_queue
             WHERE action = 'send_email' AND status = 'pending'
         )`
    );

    for (const letter of letters) {
        await scheduleLetterDelivery(letter.id, new Date(letter.scheduled_at_utc));
        console.log(`Scheduled delivery for letter ${letter.id}`);
    }
}

/**
 * 检查逾期未投递的信件
 */
export async function processOverdueLetters(): Promise<void> {
    const [letters] = await pool.execute<RowDataPacket[]>(
        `SELECT id
         FROM future_letters
         WHERE status = 'scheduled'
         AND scheduled_at_utc <= NOW()`
    );

    for (const letter of letters) {
        console.log(`Processing overdue letter ${letter.id}`);
        try {
            await deliverLetter(letter.id);
        } catch (error) {
            console.error(`Failed to deliver letter ${letter.id}:`, error);
        }
    }
}
