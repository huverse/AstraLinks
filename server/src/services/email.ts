/**
 * Email Service using Resend
 * 
 * @module server/src/services/email
 * @description Sends verification codes via Resend API
 */

import { Resend } from 'resend';

// Initialize Resend with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'codesafe@astralinks.xyz';
const SENDER_NAME = 'AstraLinks';

/**
 * Generate a 6-digit verification code
 */
export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send verification code email
 */
export async function sendVerificationEmail(
    toEmail: string,
    code: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data, error } = await resend.emails.send({
            from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
            to: [toEmail],
            subject: `【AstraLinks】验证码：${code}`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
        .container { max-width: 500px; margin: 0 auto; padding: 40px 20px; }
        .logo { font-size: 24px; font-weight: bold; color: #6366f1; margin-bottom: 30px; }
        .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1f2937; background: #f3f4f6; padding: 20px 30px; border-radius: 8px; text-align: center; margin: 30px 0; }
        .text { color: #6b7280; line-height: 1.6; }
        .warning { color: #ef4444; font-size: 14px; margin-top: 20px; }
        .footer { color: #9ca3af; font-size: 12px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">AstraLinks</div>
        <p class="text">您正在进行邮箱验证，验证码如下：</p>
        <div class="code">${code}</div>
        <p class="text">验证码有效期为 <strong>10 分钟</strong>，请尽快完成验证。</p>
        <p class="warning">如果这不是您本人的操作，请忽略此邮件。</p>
        <div class="footer">
            <p>此邮件由系统自动发送，请勿直接回复。</p>
            <p>© ${new Date().getFullYear()} AstraLinks. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
            `,
        });

        if (error) {
            console.error('[Email] Send failed:', error);
            return { success: false, error: error.message };
        }

        console.log('[Email] Sent successfully to:', toEmail, 'id:', data?.id);
        return { success: true };
    } catch (err: any) {
        console.error('[Email] Exception:', err);
        return { success: false, error: err.message || '发送邮件失败' };
    }
}
