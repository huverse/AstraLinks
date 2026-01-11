import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { hashPassword, verifyPassword, generateDeviceFingerprint } from '../utils/crypto';
import { generateToken, authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { sendVerificationEmail, generateVerificationCode } from '../services/email';
import axios from 'axios';

const router = Router();

// Cloudflare Turnstile Secret Key (from environment only - no hardcoded fallback for security)
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

/**
 * Check if login Turnstile is enabled from database settings
 */
async function isTurnstileLoginEnabled(): Promise<boolean> {
    try {
        const [settings] = await pool.execute<RowDataPacket[]>(
            `SELECT setting_value FROM site_settings WHERE setting_key = 'turnstile_login_enabled'`
        );
        return settings.length > 0 && settings[0].setting_value === 'true';
    } catch (error) {
        console.error('[Turnstile] Failed to check settings:', error);
        return false; // Default to disabled if error
    }
}

/**
 * Verify Cloudflare Turnstile token
 */
export async function verifyTurnstileToken(token: string, ip: string): Promise<{ success: boolean; error?: string }> {
    // If no secret key configured, skip verification
    if (!TURNSTILE_SECRET_KEY) {
        console.warn('[Turnstile] No secret key configured, skipping verification');
        return { success: true };
    }

    try {
        const response = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            secret: TURNSTILE_SECRET_KEY,
            response: token,
            remoteip: ip,
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data.success) {
            return { success: true };
        } else {
            console.warn('[Turnstile] Verification failed:', response.data['error-codes']);
            return { success: false, error: '人机验证失败，请刷新页面重试' };
        }
    } catch (error) {
        console.error('[Turnstile] Verification error:', error);
        return { success: false, error: '验证服务异常，请稍后重试' };
    }
}

/**
 * POST /api/auth/register
 * Register a new user with invitation code (supports both normal and split codes)
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { username, email, password, invitationCode, deviceFingerprint, turnstileToken } = req.body;

        // Verify Turnstile token
        if (turnstileToken) {
            const clientIP = req.ip || req.socket.remoteAddress || '';
            const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
            if (!turnstileResult.success) {
                res.status(400).json({ error: turnstileResult.error || '人机验证失败' });
                return;
            }
        }

        // Validation
        if (!username || !password) {
            res.status(400).json({ error: '用户名和密码为必填项' });
            return;
        }

        if (username.length < 3 || username.length > 60) {
            res.status(400).json({ error: '用户名长度应为 3-60 个字符' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: '密码长度至少 6 个字符' });
            return;
        }

        // Get device fingerprint
        const userAgent = req.headers['user-agent'] || '';
        const ip = req.ip || req.socket.remoteAddress || '';
        const fingerprint = deviceFingerprint || generateDeviceFingerprint(userAgent, ip);

        // Try to find invitation code in both systems
        let codeType: 'normal' | 'split' | null = null;
        let codeData: any = null;
        let splitTreeId: string | null = null;

        // Check if normal invitation code system is enabled
        const [normalCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
            'SELECT setting_value FROM site_settings WHERE setting_key = ?',
            ['invitation_code_enabled']
        );
        const normalCodeEnabled = normalCodeEnabledSetting[0]?.setting_value === 'true';

        // Check if split invitation system is enabled
        const [splitCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
            'SELECT setting_value FROM site_settings WHERE setting_key = ?',
            ['split_invitation_enabled']
        );
        const splitCodeEnabled = splitCodeEnabledSetting[0]?.setting_value === 'true';

        // If both systems are disabled, skip invitation code validation entirely
        const invitationCodeRequired = normalCodeEnabled || splitCodeEnabled;

        // First check normal invitation codes (8 characters)
        if (invitationCodeRequired && normalCodeEnabled) {
            const [normalCodes] = await pool.execute<RowDataPacket[]>(
                'SELECT id, is_used, used_device_fingerprint FROM invitation_codes WHERE code = ?',
                [invitationCode]
            );

            if (normalCodes.length > 0) {
                codeData = normalCodes[0];
                codeType = 'normal';
                if (codeData.is_used) {
                    res.status(400).json({ error: '该邀请码已被使用' });
                    return;
                }
            }
        }

        // If not found, check split invitation codes (12 characters)
        if (invitationCodeRequired && !codeData && splitCodeEnabled) {
            const [splitCodes] = await pool.execute<RowDataPacket[]>(
                `SELECT c.*, t.is_banned as tree_banned
                 FROM split_invitation_codes c
                 JOIN split_invitation_trees t ON c.tree_id = t.id
                 WHERE c.code = ?`,
                [invitationCode]
            );

            if (splitCodes.length > 0) {
                codeData = splitCodes[0];
                codeType = 'split';
                splitTreeId = codeData.tree_id;

                if (codeData.is_used) {
                    res.status(400).json({ error: '该邀请码已被使用' });
                    return;
                }
                if (codeData.tree_banned) {
                    res.status(400).json({ error: '该邀请码所属邀请树已被封禁' });
                    return;
                }
            }
        }

        // Code not found - only validate if invitation code is required
        if (invitationCodeRequired && !codeData) {
            res.status(400).json({ error: '邀请码无效' });
            return;
        }

        // Check if username exists
        const [existingUser] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existingUser.length > 0) {
            res.status(400).json({ error: '用户名已存在' });
            return;
        }

        // Check email if provided
        if (email) {
            const [existingEmail] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );
            if (existingEmail.length > 0) {
                res.status(400).json({ error: '邮箱已被注册' });
                return;
            }
        }

        // Hash password and create user
        const passwordHash = await hashPassword(password);

        // Build insert query based on code type
        let insertSql: string;
        let insertParams: any[];

        if (codeType === 'split') {
            insertSql = `INSERT INTO users (username, email, password_hash, invitation_code_used, device_fingerprint, split_code_used, split_tree_id)
                         VALUES (?, ?, ?, NULL, ?, ?, ?)`;
            insertParams = [username, email || null, passwordHash, fingerprint, invitationCode, splitTreeId];
        } else if (codeType === 'normal') {
            insertSql = `INSERT INTO users (username, email, password_hash, invitation_code_used, device_fingerprint)
                         VALUES (?, ?, ?, ?, ?)`;
            insertParams = [username, email || null, passwordHash, invitationCode, fingerprint];
        } else {
            // No invitation code required - register without code
            insertSql = `INSERT INTO users (username, email, password_hash, device_fingerprint)
                         VALUES (?, ?, ?, ?)`;
            insertParams = [username, email || null, passwordHash, fingerprint];
        }

        const [result] = await pool.execute<ResultSetHeader>(insertSql, insertParams);
        const userId = result.insertId;

        // Mark invitation code as used (only if code was required and used)
        if (codeType === 'normal' && codeData) {
            await pool.execute(
                `UPDATE invitation_codes
                 SET is_used = TRUE, used_by_user_id = ?, used_device_fingerprint = ?, used_at = NOW()
                 WHERE id = ?`,
                [userId, fingerprint, codeData.id]
            );
        } else if (codeType === 'split' && codeData) {
            await pool.execute(
                `UPDATE split_invitation_codes
                 SET is_used = TRUE, used_by_user_id = ?, used_at = NOW()
                 WHERE id = ?`,
                [userId, codeData.id]
            );
        }

        // Generate token
        const token = generateToken({ id: userId, username, isAdmin: false });

        res.status(201).json({
            message: '注册成功',
            token,
            user: { id: userId, username, email: email || null, isAdmin: false }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

/**
 * POST /api/auth/login
 * Login with username/email and password
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { username, password, turnstileToken } = req.body;

        // Verify Turnstile token
        if (turnstileToken) {
            const clientIP = req.ip || req.socket.remoteAddress || '';
            const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
            if (!turnstileResult.success) {
                res.status(400).json({ error: turnstileResult.error || '人机验证失败' });
                return;
            }
        }

        if (!username || !password) {
            res.status(400).json({ error: '请输入用户名和密码' });
            return;
        }

        // Find user by username or email
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username, email, password_hash, is_admin, needs_password_reset FROM users WHERE username = ? OR email = ?',
            [username, username]
        );

        if (rows.length === 0) {
            // Check if this username was deleted
            const [deletedUsers] = await pool.execute<RowDataPacket[]>(
                'SELECT reason, additional_measures, created_at FROM deleted_users WHERE username = ? ORDER BY created_at DESC LIMIT 1',
                [username]
            );

            if (deletedUsers.length > 0) {
                const deleted = deletedUsers[0];
                const measures = JSON.parse(deleted.additional_measures || '{}');
                let measuresText = '';
                if (measures.blacklist_qq) measuresText += 'QQ 号已被拉入黑名单';
                if (measures.blacklist_ip) {
                    measuresText += measuresText ? '，IP 地址已被拉入黑名单' : 'IP 地址已被拉入黑名单';
                }

                res.status(403).json({
                    error: '账户已被永久删除',
                    accountDeleted: true,
                    reason: deleted.reason,
                    measures: measuresText || '无额外措施',
                    deletedAt: deleted.created_at
                });
                return;
            }

            res.status(401).json({ error: '用户名或密码错误' });
            return;
        }

        // Check IP blacklist
        const clientIP = req.ip || req.socket.remoteAddress || '';
        const normalizedIP = clientIP.startsWith('::ffff:') ? clientIP.substring(7) : clientIP;

        const [ipBlacklist] = await pool.execute<RowDataPacket[]>(
            'SELECT reason FROM blacklist WHERE type = "ip" AND value = ? AND is_active = TRUE',
            [normalizedIP]
        );

        if (ipBlacklist.length > 0) {
            res.status(403).json({
                error: 'IP 地址已被封禁',
                ipBlocked: true,
                reason: ipBlacklist[0].reason
            });
            return;
        }

        const user = rows[0];

        // Check if user needs password reset (synced from WordPress)
        if (user.needs_password_reset && !user.password_hash) {
            res.status(403).json({
                error: '此账号需要重置密码',
                needsPasswordReset: true,
                userId: user.id
            });
            return;
        }

        // Verify password
        if (!user.password_hash) {
            res.status(401).json({ error: '请先设置密码' });
            return;
        }

        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            res.status(401).json({ error: '用户名或密码错误' });
            return;
        }

        // Update last login
        await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

        // Generate token
        const token = generateToken({
            id: user.id,
            username: user.username,
            isAdmin: user.is_admin
        });

        res.json({
            message: '登录成功',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isAdmin: user.is_admin,
                needsPasswordReset: user.needs_password_reset
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

/**
 * POST /api/auth/reset-password
 * Reset password for synced users
 */
router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        const { userId, username, newPassword } = req.body;

        if (!userId || !username || !newPassword) {
            res.status(400).json({ error: '缺少必要参数' });
            return;
        }

        if (newPassword.length < 6) {
            res.status(400).json({ error: '密码长度至少 6 个字符' });
            return;
        }

        // Verify user exists and needs reset
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username FROM users WHERE id = ? AND username = ? AND needs_password_reset = TRUE',
            [userId, username]
        );

        if (rows.length === 0) {
            res.status(400).json({ error: '用户不存在或不需要重置密码' });
            return;
        }

        // Hash and update password
        const passwordHash = await hashPassword(newPassword);
        await pool.execute(
            'UPDATE users SET password_hash = ?, needs_password_reset = FALSE WHERE id = ?',
            [passwordHash, userId]
        );

        // Generate token
        const token = generateToken({
            id: rows[0].id,
            username: rows[0].username,
            isAdmin: false
        });

        res.json({
            message: '密码重置成功',
            token,
            user: { id: rows[0].id, username: rows[0].username }
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, server just confirms)
 */
router.post('/logout', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    res.json({ message: '登出成功' });
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.user?.id;

        if (!oldPassword || !newPassword) {
            res.status(400).json({ error: '请输入旧密码和新密码' });
            return;
        }

        if (newPassword.length < 6) {
            res.status(400).json({ error: '新密码长度至少6位' });
            return;
        }

        // Get current password hash
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT password_hash FROM users WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        // Verify old password
        const isValid = await verifyPassword(oldPassword, rows[0].password_hash);
        if (!isValid) {
            res.status(401).json({ error: '旧密码错误' });
            return;
        }

        // Hash new password and update
        const newPasswordHash = await hashPassword(newPassword);
        await pool.execute(
            'UPDATE users SET password_hash = ?, needs_password_reset = 0 WHERE id = ?',
            [newPasswordHash, userId]
        );

        res.json({ message: '密码修改成功' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

/**
 * DELETE /api/auth/delete-account
 * Delete account for authenticated user (requires password confirmation)
 */
router.delete('/delete-account', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { password } = req.body;
        const userId = req.user?.id;

        if (!password) {
            res.status(400).json({ error: '请输入密码以确认注销' });
            return;
        }

        // Get current password hash
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT password_hash, username FROM users WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        // Verify password
        const isValid = await verifyPassword(password, rows[0].password_hash);
        if (!isValid) {
            res.status(401).json({ error: '密码错误' });
            return;
        }

        // Delete user (cascade should handle related data based on DB schema)
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

        console.log(`User ${rows[0].username} (ID: ${userId}) deleted their account`);

        res.json({ message: '账户已注销' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== QQ OAuth 2.0 ==========

const QQ_APP_ID = process.env.QQ_APP_ID || '';
const QQ_APP_KEY = process.env.QQ_APP_KEY || '';
const QQ_REDIRECT_URI = process.env.QQ_REDIRECT_URI || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// State store for CSRF protection (in production, use Redis)
const stateStore = new Map<string, { expires: number; action: 'login' | 'bind'; userId?: number }>();

// QQ Session store for new users completing registration
interface QQSessionData {
    openid: string;
    qqNickname: string;
    avatarUrl: string;
    expires: number;
}
const qqSessionStore = new Map<string, QQSessionData>();

// Cleanup expired states periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of stateStore.entries()) {
        if (value.expires < now) stateStore.delete(key);
    }
    for (const [key, value] of qqSessionStore.entries()) {
        if (value.expires < now) qqSessionStore.delete(key);
    }
}, 60000);

// Optional auth middleware - validates token if present but doesn't require it
// Supports both Authorization header and query param 'token' (for redirect scenarios)
const optionalAuthMiddleware = async (req: Request, res: Response, next: () => void) => {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;

    // Check header first
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authMiddleware(req as any, res, next as any);
    }

    // Check query param (for redirect scenarios like QQ bind)
    if (queryToken) {
        req.headers.authorization = `Bearer ${queryToken}`;
        return authMiddleware(req as any, res, next as any);
    }

    next();
};

/**
 * GET /api/auth/qq
 * Initiate QQ OAuth authorization
 * Query params: action=login|bind (default: login)
 */
router.get('/qq', optionalAuthMiddleware as any, async (req: Request, res: Response) => {
    try {
        const action = (req.query.action as string) === 'bind' ? 'bind' : 'login';
        const userId = action === 'bind' ? (req as AuthenticatedRequest).user?.id : undefined;
        const turnstileToken = req.query.turnstileToken as string | undefined;

        // For bind action, require authentication
        if (action === 'bind' && !userId) {
            res.status(401).json({ error: '请先登录后再绑定QQ' });
            return;
        }

        // Verify Turnstile for login action (not required for bind since user is already authenticated)
        if (action === 'login' && await isTurnstileLoginEnabled()) {
            if (!turnstileToken) {
                res.status(400).json({ error: '请先完成人机验证' });
                return;
            }
            const clientIP = req.ip || req.socket.remoteAddress || '';
            const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
            if (!turnstileResult.success) {
                res.status(400).json({ error: turnstileResult.error || '人机验证失败' });
                return;
            }
        }

        // Generate state for CSRF protection
        const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        stateStore.set(state, {
            expires: Date.now() + 10 * 60 * 1000, // 10 minutes
            action,
            userId
        });

        const authUrl = new URL('https://graph.qq.com/oauth2.0/authorize');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', QQ_APP_ID);
        authUrl.searchParams.set('redirect_uri', QQ_REDIRECT_URI);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('scope', 'get_user_info');

        res.redirect(authUrl.toString());
    } catch (error) {
        console.error('QQ OAuth init error:', error);
        res.status(500).json({ error: 'OAuth初始化失败' });
    }
});

/**
 * GET /api/auth/qq/callback
 * Handle QQ OAuth callback
 */
router.get('/qq/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;

        if (!code || !state) {
            res.redirect(`${FRONTEND_URL}?error=missing_params`);
            return;
        }

        // Verify state
        const stateData = stateStore.get(state as string);
        if (!stateData || stateData.expires < Date.now()) {
            stateStore.delete(state as string);
            res.redirect(`${FRONTEND_URL}?error=invalid_state`);
            return;
        }
        stateStore.delete(state as string);

        // Exchange code for access_token
        const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
        tokenUrl.searchParams.set('grant_type', 'authorization_code');
        tokenUrl.searchParams.set('client_id', QQ_APP_ID);
        tokenUrl.searchParams.set('client_secret', QQ_APP_KEY);
        tokenUrl.searchParams.set('code', code as string);
        tokenUrl.searchParams.set('redirect_uri', QQ_REDIRECT_URI);
        tokenUrl.searchParams.set('fmt', 'json');

        const tokenRes = await axios.get(tokenUrl.toString());
        const tokenData = tokenRes.data as { error?: number; access_token?: string };

        if (tokenData.error || !tokenData.access_token) {
            console.error('QQ token error:', tokenData);
            res.redirect(`${FRONTEND_URL}?error=token_failed`);
            return;
        }

        const accessToken = tokenData.access_token;

        // Get OpenID
        const meUrl = `https://graph.qq.com/oauth2.0/me?access_token=${accessToken}&fmt=json`;
        const meRes = await axios.get(meUrl);
        const meData = meRes.data as { error?: number; openid?: string };

        if (meData.error || !meData.openid) {
            console.error('QQ openid error:', meData);
            res.redirect(`${FRONTEND_URL}?error=openid_failed`);
            return;
        }

        const openid = meData.openid;

        // Get user info
        const userInfoUrl = `https://graph.qq.com/user/get_user_info?access_token=${accessToken}&oauth_consumer_key=${QQ_APP_ID}&openid=${openid}`;
        const userInfoRes = await axios.get(userInfoUrl);
        const userInfo = userInfoRes.data as {
            nickname?: string;
            figureurl_qq_2?: string;
            figureurl_qq_1?: string;
            figureurl_2?: string
        };

        const qqNickname = userInfo.nickname || 'QQ用户';
        const avatarUrl = userInfo.figureurl_qq_2 || userInfo.figureurl_qq_1 || userInfo.figureurl_2 || '';

        // Handle based on action
        if (stateData.action === 'bind' && stateData.userId) {
            // Bind QQ to existing user
            const [existing] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE qq_openid = ?',
                [openid]
            );

            if (existing.length > 0) {
                res.redirect(`${FRONTEND_URL}?error=qq_already_bound`);
                return;
            }

            await pool.execute(
                'UPDATE users SET qq_openid = ?, qq_nickname = ?, avatar_url = ? WHERE id = ?',
                [openid, qqNickname, avatarUrl, stateData.userId]
            );

            res.redirect(`${FRONTEND_URL}?qq_bind=success`);
            return;
        }

        // Login or redirect for new user registration

        // Check if this QQ is blacklisted
        const [qqBlacklist] = await pool.execute<RowDataPacket[]>(
            'SELECT reason FROM blacklist WHERE type = "qq" AND value = ? AND is_active = TRUE',
            [openid]
        );

        if (qqBlacklist.length > 0) {
            const reason = encodeURIComponent(qqBlacklist[0].reason);
            res.redirect(`${FRONTEND_URL}?error=qq_blacklisted&reason=${reason}`);
            return;
        }

        const [existingUsers] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username, email, is_admin, qq_nickname FROM users WHERE qq_openid = ?',
            [openid]
        );

        if (existingUsers.length > 0) {
            // Existing user with QQ bound - login directly
            const user = existingUsers[0];
            // Update nickname/avatar if changed
            await pool.execute(
                'UPDATE users SET qq_nickname = ?, avatar_url = ?, last_login = NOW() WHERE id = ?',
                [qqNickname, avatarUrl, user.id]
            );

            // Generate JWT
            const token = generateToken({
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin || false
            });

            // Redirect to frontend with token
            res.redirect(`${FRONTEND_URL}?token=${token}&qq_login=success`);
        } else {
            // New QQ user - create session and redirect to complete registration
            const qqSession = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            qqSessionStore.set(qqSession, {
                openid,
                qqNickname,
                avatarUrl,
                expires: Date.now() + 30 * 60 * 1000 // 30 minutes
            });

            // Redirect to frontend complete-oauth page
            res.redirect(`${FRONTEND_URL}/complete-oauth?qq_session=${qqSession}`);
        }

    } catch (error: any) {
        console.error('QQ callback error:', error);
        const errorMsg = encodeURIComponent(error.message || 'Unknown error');
        res.redirect(`${FRONTEND_URL}?error=callback_failed&detail=${errorMsg}`);
    }
});

/**
 * DELETE /api/auth/qq/unbind
 * Unbind QQ from current user account
 */
router.delete('/qq/unbind', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        // Check if user has password set (can't unbind if it's the only login method)
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT password_hash, qq_openid FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        const user = users[0];
        if (!user.password_hash && user.qq_openid) {
            res.status(400).json({ error: '请先设置密码后再解绑QQ' });
            return;
        }

        await pool.execute(
            'UPDATE users SET qq_openid = NULL, qq_nickname = NULL WHERE id = ?',
            [userId]
        );

        res.json({ message: 'QQ解绑成功' });
    } catch (error) {
        console.error('QQ unbind error:', error);
        res.status(500).json({ error: '解绑失败' });
    }
});

/**
 * GET /api/auth/qq/status
 * Get QQ binding status for current user
 */
router.get('/qq/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT qq_openid, qq_nickname, avatar_url FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        const user = users[0];
        res.json({
            bound: !!user.qq_openid,
            nickname: user.qq_nickname,
            avatar: user.avatar_url
        });
    } catch (error) {
        console.error('QQ status error:', error);
        res.status(500).json({ error: '获取状态失败' });
    }
});

/**
 * GET /api/auth/qq/session
 * Get QQ session info for completing registration
 */
router.get('/qq/session', async (req: Request, res: Response) => {
    try {
        const qqSession = req.query.session as string;

        if (!qqSession) {
            res.status(400).json({ error: '缺少 session 参数' });
            return;
        }

        const sessionData = qqSessionStore.get(qqSession);
        if (!sessionData || sessionData.expires < Date.now()) {
            qqSessionStore.delete(qqSession);
            res.status(400).json({ error: 'Session 已过期，请重新登录' });
            return;
        }

        res.json({
            qqNickname: sessionData.qqNickname,
            avatarUrl: sessionData.avatarUrl
        });
    } catch (error) {
        console.error('QQ session error:', error);
        res.status(500).json({ error: '获取 session 失败' });
    }
});

/**
 * POST /api/auth/qq/complete
 * Complete QQ OAuth registration - either bind to existing account or create new
 */
router.post('/qq/complete', async (req: Request, res: Response) => {
    try {
        const { qqSession, action, username, password, invitationCode } = req.body;

        // Validate session
        if (!qqSession) {
            res.status(400).json({ error: '缺少 QQ session' });
            return;
        }

        const sessionData = qqSessionStore.get(qqSession);
        if (!sessionData || sessionData.expires < Date.now()) {
            qqSessionStore.delete(qqSession);
            res.status(400).json({ error: 'Session 已过期，请重新登录' });
            return;
        }

        if (!username || !password) {
            res.status(400).json({ error: '请输入用户名和密码' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: '密码长度至少 6 个字符' });
            return;
        }

        const { openid, qqNickname, avatarUrl } = sessionData;

        if (action === 'bind') {
            // Bind to existing account - verify username and password
            const [users] = await pool.execute<RowDataPacket[]>(
                'SELECT id, username, password_hash, is_admin, qq_openid FROM users WHERE username = ?',
                [username]
            );

            if (users.length === 0) {
                res.status(401).json({ error: '用户名或密码错误' });
                return;
            }

            const user = users[0];

            // Check if this account already has QQ bound
            if (user.qq_openid) {
                res.status(400).json({ error: '该账户已绑定其他 QQ' });
                return;
            }

            // Verify password
            if (!user.password_hash) {
                res.status(400).json({ error: '该账户未设置密码，无法绑定' });
                return;
            }

            const isValid = await verifyPassword(password, user.password_hash);
            if (!isValid) {
                res.status(401).json({ error: '用户名或密码错误' });
                return;
            }

            // Bind QQ to this account
            await pool.execute(
                'UPDATE users SET qq_openid = ?, qq_nickname = ?, avatar_url = ?, last_login = NOW() WHERE id = ?',
                [openid, qqNickname, avatarUrl, user.id]
            );

            // Clean up session
            qqSessionStore.delete(qqSession);

            // Generate token
            const token = generateToken({
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin || false
            });

            res.json({
                message: '绑定成功',
                token,
                user: { id: user.id, username: user.username, isAdmin: user.is_admin }
            });

        } else if (action === 'create') {
            // Create new account
            if (username.length < 3 || username.length > 60) {
                res.status(400).json({ error: '用户名长度应为 3-60 个字符' });
                return;
            }

            // Check if username exists
            const [existingUser] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );

            if (existingUser.length > 0) {
                res.status(400).json({ error: '用户名已存在' });
                return;
            }

            // Check if invitation code systems are enabled
            const [normalCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
                'SELECT setting_value FROM site_settings WHERE setting_key = ?',
                ['invitation_code_enabled']
            );
            const normalCodeEnabled = normalCodeEnabledSetting[0]?.setting_value === 'true';

            const [splitCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
                'SELECT setting_value FROM site_settings WHERE setting_key = ?',
                ['split_invitation_enabled']
            );
            const splitCodeEnabled = splitCodeEnabledSetting[0]?.setting_value === 'true';

            const invitationCodeRequired = normalCodeEnabled || splitCodeEnabled;

            // Validate invitation code only if required
            let codeType: 'normal' | 'split' | null = null;
            let codeData: any = null;
            let splitTreeId: string | null = null;

            if (invitationCodeRequired) {
                if (!invitationCode) {
                    res.status(400).json({ error: '请输入邀请码' });
                    return;
                }

                // Check normal invitation codes
                if (normalCodeEnabled) {
                    const [normalCodes] = await pool.execute<RowDataPacket[]>(
                        'SELECT id, is_used FROM invitation_codes WHERE code = ?',
                        [invitationCode]
                    );

                    if (normalCodes.length > 0) {
                        codeData = normalCodes[0];
                        codeType = 'normal';
                        if (codeData.is_used) {
                            res.status(400).json({ error: '该邀请码已被使用' });
                            return;
                        }
                    }
                }

                // Check split invitation codes
                if (!codeData && splitCodeEnabled) {
                    const [splitCodes] = await pool.execute<RowDataPacket[]>(
                        `SELECT c.*, t.is_banned as tree_banned
                         FROM split_invitation_codes c
                         JOIN split_invitation_trees t ON c.tree_id = t.id
                         WHERE c.code = ?`,
                        [invitationCode]
                    );

                    if (splitCodes.length > 0) {
                        codeData = splitCodes[0];
                        codeType = 'split';
                        splitTreeId = codeData.tree_id;

                        if (codeData.is_used) {
                            res.status(400).json({ error: '该邀请码已被使用' });
                            return;
                        }
                        if (codeData.tree_banned) {
                            res.status(400).json({ error: '该邀请码所属邀请树已被封禁' });
                            return;
                        }
                    }
                }

                if (!codeData) {
                    res.status(400).json({ error: '邀请码无效' });
                    return;
                }
            }

            // Hash password and create user
            const passwordHash = await hashPassword(password);

            let insertSql: string;
            let insertParams: any[];

            if (codeType === 'split') {
                insertSql = `INSERT INTO users (username, password_hash, qq_openid, qq_nickname, avatar_url, split_code_used, split_tree_id)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`;
                insertParams = [username, passwordHash, openid, qqNickname, avatarUrl, invitationCode, splitTreeId];
            } else if (codeType === 'normal') {
                insertSql = `INSERT INTO users (username, password_hash, qq_openid, qq_nickname, avatar_url, invitation_code_used)
                             VALUES (?, ?, ?, ?, ?, ?)`;
                insertParams = [username, passwordHash, openid, qqNickname, avatarUrl, invitationCode];
            } else {
                // No invitation code required
                insertSql = `INSERT INTO users (username, password_hash, qq_openid, qq_nickname, avatar_url)
                             VALUES (?, ?, ?, ?, ?)`;
                insertParams = [username, passwordHash, openid, qqNickname, avatarUrl];
            }

            const [result] = await pool.execute<ResultSetHeader>(insertSql, insertParams);
            const userId = result.insertId;

            // Mark invitation code as used (only if code was required)
            if (codeType === 'normal' && codeData) {
                await pool.execute(
                    `UPDATE invitation_codes SET is_used = TRUE, used_by_user_id = ?, used_at = NOW() WHERE id = ?`,
                    [userId, codeData.id]
                );
            } else if (codeType === 'split' && codeData) {
                await pool.execute(
                    `UPDATE split_invitation_codes SET is_used = TRUE, used_by_user_id = ?, used_at = NOW() WHERE id = ?`,
                    [userId, codeData.id]
                );
            }

            // Clean up session
            qqSessionStore.delete(qqSession);

            // Generate token
            const token = generateToken({ id: userId, username, isAdmin: false });

            res.status(201).json({
                message: '注册成功',
                token,
                user: { id: userId, username, isAdmin: false }
            });

        } else {
            res.status(400).json({ error: '无效的 action，请使用 bind 或 create' });
        }

    } catch (error) {
        console.error('QQ complete error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ============================================
// Email Verification Auth
// ============================================

// Email verification code store (in-memory, consider Redis for production)
const emailCodeStore = new Map<string, { code: string; email: string; expires: number }>();

// Email session store for new users (similar to QQ session)
const emailSessionStore = new Map<string, { email: string; expires: number }>();

/**
 * POST /api/auth/email/send-code
 * Send verification code to email
 */
router.post('/email/send-code', async (req: Request, res: Response) => {
    try {
        const { email, turnstileToken } = req.body;

        if (!email || !email.includes('@')) {
            res.status(400).json({ error: '请输入有效的邮箱地址' });
            return;
        }

        // Verify Turnstile token if login verification is enabled
        if (await isTurnstileLoginEnabled()) {
            if (!turnstileToken) {
                res.status(400).json({ error: '请先完成人机验证' });
                return;
            }
            const clientIP = req.ip || req.socket.remoteAddress || '';
            const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
            if (!turnstileResult.success) {
                res.status(400).json({ error: turnstileResult.error || '人机验证失败' });
                return;
            }
        }

        // Rate limiting - check if code was sent recently
        const existingCode = Array.from(emailCodeStore.values()).find(
            v => v.email === email && v.expires > Date.now()
        );
        if (existingCode && (existingCode.expires - Date.now()) > 9 * 60 * 1000) {
            res.status(429).json({ error: '验证码已发送，请稍后再试' });
            return;
        }

        // Generate and store code
        const code = generateVerificationCode();
        const codeId = Math.random().toString(36).substring(2, 15);

        emailCodeStore.set(codeId, {
            code,
            email,
            expires: Date.now() + 10 * 60 * 1000 // 10 minutes
        });

        // Send email
        const result = await sendVerificationEmail(email, code);

        if (!result.success) {
            emailCodeStore.delete(codeId);
            res.status(500).json({ error: result.error || '发送失败' });
            return;
        }

        res.json({
            message: '验证码已发送',
            codeId // Return codeId for verification
        });
    } catch (error: any) {
        console.error('[Email] Send code error:', error);
        res.status(500).json({ error: '发送验证码失败' });
    }
});

/**
 * POST /api/auth/email/verify
 * Verify email code and login or start registration flow
 */
router.post('/email/verify', async (req: Request, res: Response) => {
    try {
        const { email, code, codeId } = req.body;

        if (!email || !code || !codeId) {
            res.status(400).json({ error: '请输入邮箱和验证码' });
            return;
        }

        // Verify code
        const storedCode = emailCodeStore.get(codeId);
        if (!storedCode || storedCode.expires < Date.now()) {
            emailCodeStore.delete(codeId);
            res.status(400).json({ error: '验证码已过期，请重新获取' });
            return;
        }

        if (storedCode.email !== email || storedCode.code !== code) {
            res.status(400).json({ error: '验证码错误' });
            return;
        }

        // Code is valid, delete it
        emailCodeStore.delete(codeId);

        // Check if email exists in users
        const [existingUsers] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username, email, is_admin FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            // Existing user with this email - login directly
            const user = existingUsers[0];
            await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

            const token = generateToken({
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin || false
            });

            res.json({
                success: true,
                isExisting: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    isAdmin: user.is_admin || false
                }
            });
        } else {
            // New email - create session for registration
            const emailSession = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            emailSessionStore.set(emailSession, {
                email,
                expires: Date.now() + 30 * 60 * 1000 // 30 minutes
            });

            res.json({
                success: true,
                isExisting: false,
                emailSession
            });
        }
    } catch (error: any) {
        console.error('[Email] Verify error:', error);
        res.status(500).json({ error: '验证失败' });
    }
});

/**
 * GET /api/auth/email/session
 * Get email session info for completing registration
 */
router.get('/email/session', async (req: Request, res: Response) => {
    try {
        const emailSession = req.query.session as string;

        if (!emailSession) {
            res.status(400).json({ error: '缺少 session 参数' });
            return;
        }

        const sessionData = emailSessionStore.get(emailSession);
        if (!sessionData || sessionData.expires < Date.now()) {
            emailSessionStore.delete(emailSession);
            res.status(400).json({ error: 'Session 已过期' });
            return;
        }

        res.json({ email: sessionData.email });
    } catch (error) {
        console.error('Email session error:', error);
        res.status(500).json({ error: '获取 session 失败' });
    }
});

/**
 * POST /api/auth/email/complete
 * Complete email registration - bind to existing account or create new
 */
router.post('/email/complete', async (req: Request, res: Response) => {
    try {
        const { emailSession, action, username, password, invitationCode } = req.body;

        if (!emailSession) {
            res.status(400).json({ error: '缺少 email session' });
            return;
        }

        const sessionData = emailSessionStore.get(emailSession);
        if (!sessionData || sessionData.expires < Date.now()) {
            emailSessionStore.delete(emailSession);
            res.status(400).json({ error: 'Session 已过期，请重新验证邮箱' });
            return;
        }

        const { email } = sessionData;

        if (!username || !password) {
            res.status(400).json({ error: '请输入用户名和密码' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: '密码长度至少 6 个字符' });
            return;
        }

        if (action === 'bind') {
            // Bind to existing account
            const [users] = await pool.execute<RowDataPacket[]>(
                'SELECT id, username, password_hash, is_admin, email FROM users WHERE username = ?',
                [username]
            );

            if (users.length === 0) {
                res.status(401).json({ error: '用户名或密码错误' });
                return;
            }

            const user = users[0];

            if (user.email) {
                res.status(400).json({ error: '该账户已绑定其他邮箱' });
                return;
            }

            const isValid = await verifyPassword(password, user.password_hash);
            if (!isValid) {
                res.status(401).json({ error: '用户名或密码错误' });
                return;
            }

            // Bind email to this account
            await pool.execute(
                'UPDATE users SET email = ?, last_login = NOW() WHERE id = ?',
                [email, user.id]
            );

            emailSessionStore.delete(emailSession);

            const token = generateToken({
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin || false
            });

            res.json({
                message: '邮箱绑定成功',
                token,
                user: { id: user.id, username: user.username, isAdmin: user.is_admin || false }
            });

        } else if (action === 'create') {
            // Create new account
            if (username.length < 3 || username.length > 60) {
                res.status(400).json({ error: '用户名长度应为 3-60 个字符' });
                return;
            }

            // Check if username exists
            const [existingUser] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );

            if (existingUser.length > 0) {
                res.status(400).json({ error: '用户名已存在' });
                return;
            }

            // Check if invitation code systems are enabled
            const [normalCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
                'SELECT setting_value FROM site_settings WHERE setting_key = ?',
                ['invitation_code_enabled']
            );
            const normalCodeEnabled = normalCodeEnabledSetting[0]?.setting_value === 'true';

            const [splitCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
                'SELECT setting_value FROM site_settings WHERE setting_key = ?',
                ['split_invitation_enabled']
            );
            const splitCodeEnabled = splitCodeEnabledSetting[0]?.setting_value === 'true';

            const invitationCodeRequired = normalCodeEnabled || splitCodeEnabled;

            // Validate invitation code only if required
            let codeType: 'normal' | 'split' | null = null;
            let codeData: any = null;
            let splitTreeId: string | null = null;

            if (invitationCodeRequired) {
                if (!invitationCode) {
                    res.status(400).json({ error: '请输入邀请码' });
                    return;
                }

                // Check normal invitation codes
                if (normalCodeEnabled) {
                    const [normalCodes] = await pool.execute<RowDataPacket[]>(
                        'SELECT id, is_used FROM invitation_codes WHERE code = ?',
                        [invitationCode]
                    );

                    if (normalCodes.length > 0) {
                        codeData = normalCodes[0];
                        codeType = 'normal';
                        if (codeData.is_used) {
                            res.status(400).json({ error: '该邀请码已被使用' });
                            return;
                        }
                    }
                }

                // Check split invitation codes
                if (!codeData && splitCodeEnabled) {
                    const [splitCodes] = await pool.execute<RowDataPacket[]>(
                        `SELECT c.*, t.is_banned as tree_banned
                         FROM split_invitation_codes c
                         JOIN split_invitation_trees t ON c.tree_id = t.id
                         WHERE c.code = ?`,
                        [invitationCode]
                    );

                    if (splitCodes.length > 0) {
                        codeData = splitCodes[0];
                        codeType = 'split';
                        splitTreeId = codeData.tree_id;

                        if (codeData.is_used) {
                            res.status(400).json({ error: '该邀请码已被使用' });
                            return;
                        }
                        if (codeData.tree_banned) {
                            res.status(400).json({ error: '该邀请码所属邀请树已被封禁' });
                            return;
                        }
                    }
                }

                if (!codeData) {
                    res.status(400).json({ error: '邀请码无效' });
                    return;
                }
            }

            // Hash password and create user
            const passwordHash = await hashPassword(password);

            let insertSql: string;
            let insertParams: any[];

            if (codeType === 'split') {
                insertSql = `INSERT INTO users (username, email, password_hash, split_code_used, split_tree_id)
                             VALUES (?, ?, ?, ?, ?)`;
                insertParams = [username, email, passwordHash, invitationCode, splitTreeId];
            } else if (codeType === 'normal') {
                insertSql = `INSERT INTO users (username, email, password_hash, invitation_code_used)
                             VALUES (?, ?, ?, ?)`;
                insertParams = [username, email, passwordHash, invitationCode];
            } else {
                // No invitation code required
                insertSql = `INSERT INTO users (username, email, password_hash)
                             VALUES (?, ?, ?)`;
                insertParams = [username, email, passwordHash];
            }

            const [result] = await pool.execute<ResultSetHeader>(insertSql, insertParams);
            const userId = result.insertId;

            // Mark invitation code as used (only if code was required)
            if (codeType === 'normal' && codeData) {
                await pool.execute(
                    `UPDATE invitation_codes SET is_used = TRUE, used_by_user_id = ?, used_at = NOW() WHERE id = ?`,
                    [userId, codeData.id]
                );
            } else if (codeType === 'split' && codeData) {
                await pool.execute(
                    `UPDATE split_invitation_codes SET is_used = TRUE, used_by_user_id = ?, used_at = NOW() WHERE id = ?`,
                    [userId, codeData.id]
                );
            }

            emailSessionStore.delete(emailSession);

            const token = generateToken({ id: userId, username, isAdmin: false });

            res.status(201).json({
                message: '注册成功',
                token,
                user: { id: userId, username, isAdmin: false }
            });

        } else {
            res.status(400).json({ error: '无效的 action' });
        }
    } catch (error: any) {
        console.error('[Email] Complete error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ============================================
// Google OAuth
// ============================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

// Google session store for new users
const googleSessionStore = new Map<string, { googleId: string; email: string; name: string; avatar: string; expires: number }>();
// Google state store for CSRF protection
const googleStateStore = new Map<string, { action: string; userId?: number; expires: number }>();

// Add Google stores to cleanup interval (uses existing FRONTEND_URL and optionalAuthMiddleware from QQ OAuth section)

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */
router.get('/google', optionalAuthMiddleware as any, async (req: Request, res: Response) => {
    try {
        const action = (req.query.action as string) === 'bind' ? 'bind' : 'login';
        const userId = action === 'bind' ? (req as AuthenticatedRequest).user?.id : undefined;
        const turnstileToken = req.query.turnstileToken as string | undefined;

        if (action === 'bind' && !userId) {
            res.status(401).json({ error: '请先登录后再绑定Google' });
            return;
        }

        // Verify Turnstile for login action (not required for bind since user is already authenticated)
        if (action === 'login' && await isTurnstileLoginEnabled()) {
            if (!turnstileToken) {
                res.status(400).json({ error: '请先完成人机验证' });
                return;
            }
            const clientIP = req.ip || req.socket.remoteAddress || '';
            const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
            if (!turnstileResult.success) {
                res.status(400).json({ error: turnstileResult.error || '人机验证失败' });
                return;
            }
        }

        // Generate state for CSRF protection
        const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        googleStateStore.set(state, { action, userId, expires: Date.now() + 10 * 60 * 1000 });

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid email profile');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('access_type', 'offline');

        res.redirect(authUrl.toString());
    } catch (error) {
        console.error('Google OAuth init error:', error);
        res.status(500).json({ error: 'OAuth初始化失败' });
    }
});

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;

        if (!code || !state) {
            res.redirect(`${FRONTEND_URL}?error=missing_params`);
            return;
        }

        // Verify state
        const stateData = googleStateStore.get(state as string);
        if (!stateData || stateData.expires < Date.now()) {
            googleStateStore.delete(state as string);
            res.redirect(`${FRONTEND_URL}?error=invalid_state`);
            return;
        }
        googleStateStore.delete(state as string);

        if (!GOOGLE_CLIENT_SECRET) {
            console.error('[Google] No client secret configured');
            res.redirect(`${FRONTEND_URL}?error=config_error`);
            return;
        }

        // Exchange code for tokens
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: GOOGLE_REDIRECT_URI,
        });

        const { access_token, id_token } = tokenResponse.data;

        // Get user info
        const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const { id: googleId, email, name, picture } = userInfoResponse.data;

        // Handle bind action
        if (stateData.action === 'bind' && stateData.userId) {
            const [existing] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE google_id = ?',
                [googleId]
            );

            if (existing.length > 0) {
                res.redirect(`${FRONTEND_URL}?error=google_already_bound`);
                return;
            }

            await pool.execute(
                'UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
                [googleId, picture, stateData.userId]
            );

            res.redirect(`${FRONTEND_URL}?google_bound=success`);
            return;
        }

        // Check if user exists with this Google ID
        const [existingUsers] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username, email, is_admin FROM users WHERE google_id = ?',
            [googleId]
        );

        if (existingUsers.length > 0) {
            // Existing user - login directly
            const user = existingUsers[0];
            await pool.execute(
                'UPDATE users SET avatar_url = COALESCE(avatar_url, ?), last_login = NOW() WHERE id = ?',
                [picture, user.id]
            );

            const token = generateToken({
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin || false
            });

            res.redirect(`${FRONTEND_URL}?token=${token}`);
        } else {
            // New Google user - create session and redirect to complete registration
            const googleSession = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            googleSessionStore.set(googleSession, {
                googleId,
                email: email || '',
                name: name || 'Google用户',
                avatar: picture || '',
                expires: Date.now() + 30 * 60 * 1000
            });

            res.redirect(`${FRONTEND_URL}/complete-oauth?google_session=${googleSession}`);
        }
    } catch (error: any) {
        console.error('Google callback error:', error.response?.data || error);
        res.redirect(`${FRONTEND_URL}?error=google_auth_failed`);
    }
});

/**
 * GET /api/auth/google/session
 * Get Google session info for completing registration
 */
router.get('/google/session', async (req: Request, res: Response) => {
    try {
        const googleSession = req.query.session as string;

        if (!googleSession) {
            res.status(400).json({ error: '缺少 session 参数' });
            return;
        }

        const sessionData = googleSessionStore.get(googleSession);
        if (!sessionData || sessionData.expires < Date.now()) {
            googleSessionStore.delete(googleSession);
            res.status(400).json({ error: 'Session 已过期' });
            return;
        }

        res.json({
            email: sessionData.email,
            name: sessionData.name,
            avatar: sessionData.avatar
        });
    } catch (error) {
        console.error('Google session error:', error);
        res.status(500).json({ error: '获取 session 失败' });
    }
});

/**
 * POST /api/auth/google/complete
 * Complete Google OAuth registration - bind to existing account or create new
 */
router.post('/google/complete', async (req: Request, res: Response) => {
    try {
        const { googleSession, action, username, password, invitationCode } = req.body;

        if (!googleSession) {
            res.status(400).json({ error: '缺少 Google session' });
            return;
        }

        const sessionData = googleSessionStore.get(googleSession);
        if (!sessionData || sessionData.expires < Date.now()) {
            googleSessionStore.delete(googleSession);
            res.status(400).json({ error: 'Session 已过期，请重新登录' });
            return;
        }

        const { googleId, email, name, avatar } = sessionData;

        if (!username || !password) {
            res.status(400).json({ error: '请输入用户名和密码' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: '密码长度至少 6 个字符' });
            return;
        }

        if (action === 'bind') {
            // Bind to existing account
            const [users] = await pool.execute<RowDataPacket[]>(
                'SELECT id, username, password_hash, is_admin, google_id FROM users WHERE username = ?',
                [username]
            );

            if (users.length === 0) {
                res.status(401).json({ error: '用户名或密码错误' });
                return;
            }

            const user = users[0];

            if (user.google_id) {
                res.status(400).json({ error: '该账户已绑定其他Google账号' });
                return;
            }

            const isValid = await verifyPassword(password, user.password_hash);
            if (!isValid) {
                res.status(401).json({ error: '用户名或密码错误' });
                return;
            }

            // Bind Google to this account
            await pool.execute(
                'UPDATE users SET google_id = ?, email = COALESCE(email, ?), avatar_url = COALESCE(avatar_url, ?), last_login = NOW() WHERE id = ?',
                [googleId, email, avatar, user.id]
            );

            googleSessionStore.delete(googleSession);

            const token = generateToken({
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin || false
            });

            res.json({
                message: 'Google绑定成功',
                token,
                user: { id: user.id, username: user.username, isAdmin: user.is_admin || false }
            });

        } else if (action === 'create') {
            // Create new account
            if (username.length < 3 || username.length > 60) {
                res.status(400).json({ error: '用户名长度应为 3-60 个字符' });
                return;
            }

            const [existingUser] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );

            if (existingUser.length > 0) {
                res.status(400).json({ error: '用户名已存在' });
                return;
            }

            // Check if invitation code systems are enabled
            const [normalCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
                'SELECT setting_value FROM site_settings WHERE setting_key = ?',
                ['invitation_code_enabled']
            );
            const normalCodeEnabled = normalCodeEnabledSetting[0]?.setting_value === 'true';

            const [splitCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
                'SELECT setting_value FROM site_settings WHERE setting_key = ?',
                ['split_invitation_enabled']
            );
            const splitCodeEnabled = splitCodeEnabledSetting[0]?.setting_value === 'true';

            const invitationCodeRequired = normalCodeEnabled || splitCodeEnabled;

            // Validate invitation code only if required
            let codeType: 'normal' | 'split' | null = null;
            let codeData: any = null;
            let splitTreeId: string | null = null;

            if (invitationCodeRequired) {
                if (!invitationCode) {
                    res.status(400).json({ error: '请输入邀请码' });
                    return;
                }

                // Check normal invitation codes
                if (normalCodeEnabled) {
                    const [normalCodes] = await pool.execute<RowDataPacket[]>(
                        'SELECT id, is_used FROM invitation_codes WHERE code = ?',
                        [invitationCode]
                    );

                    if (normalCodes.length > 0) {
                        codeData = normalCodes[0];
                        codeType = 'normal';
                        if (codeData.is_used) {
                            res.status(400).json({ error: '该邀请码已被使用' });
                            return;
                        }
                    }
                }

                // Check split invitation codes
                if (!codeData && splitCodeEnabled) {
                    const [splitCodes] = await pool.execute<RowDataPacket[]>(
                        `SELECT c.*, t.is_banned as tree_banned
                         FROM split_invitation_codes c
                         JOIN split_invitation_trees t ON c.tree_id = t.id
                         WHERE c.code = ?`,
                        [invitationCode]
                    );

                    if (splitCodes.length > 0) {
                        codeData = splitCodes[0];
                        codeType = 'split';
                        splitTreeId = codeData.tree_id;

                        if (codeData.is_used) {
                            res.status(400).json({ error: '该邀请码已被使用' });
                            return;
                        }
                        if (codeData.tree_banned) {
                            res.status(400).json({ error: '该邀请码所属邀请树已被封禁' });
                            return;
                        }
                    }
                }

                if (!codeData) {
                    res.status(400).json({ error: '邀请码无效' });
                    return;
                }
            }

            const passwordHash = await hashPassword(password);

            let insertSql: string;
            let insertParams: any[];

            if (codeType === 'split') {
                insertSql = `INSERT INTO users (username, email, password_hash, google_id, avatar_url, split_code_used, split_tree_id)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`;
                insertParams = [username, email, passwordHash, googleId, avatar, invitationCode, splitTreeId];
            } else if (codeType === 'normal') {
                insertSql = `INSERT INTO users (username, email, password_hash, google_id, avatar_url, invitation_code_used)
                             VALUES (?, ?, ?, ?, ?, ?)`;
                insertParams = [username, email, passwordHash, googleId, avatar, invitationCode];
            } else {
                // No invitation code required
                insertSql = `INSERT INTO users (username, email, password_hash, google_id, avatar_url)
                             VALUES (?, ?, ?, ?, ?)`;
                insertParams = [username, email, passwordHash, googleId, avatar];
            }

            const [result] = await pool.execute<ResultSetHeader>(insertSql, insertParams);
            const userId = result.insertId;

            // Mark invitation code as used (only if code was required)
            if (codeType === 'normal' && codeData) {
                await pool.execute(
                    `UPDATE invitation_codes SET is_used = TRUE, used_by_user_id = ?, used_at = NOW() WHERE id = ?`,
                    [userId, codeData.id]
                );
            } else if (codeType === 'split' && codeData) {
                await pool.execute(
                    `UPDATE split_invitation_codes SET is_used = TRUE, used_by_user_id = ?, used_at = NOW() WHERE id = ?`,
                    [userId, codeData.id]
                );
            }

            googleSessionStore.delete(googleSession);

            const token = generateToken({ id: userId, username, isAdmin: false });

            res.status(201).json({
                message: '注册成功',
                token,
                user: { id: userId, username, isAdmin: false }
            });

        } else {
            res.status(400).json({ error: '无效的 action' });
        }
    } catch (error: any) {
        console.error('[Google] Complete error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

/**
 * GET /api/auth/google/status
 * Get Google binding status for current user
 */
router.get('/google/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT google_id FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        res.json({ bound: !!users[0].google_id });
    } catch (error) {
        console.error('Google status error:', error);
        res.status(500).json({ error: '获取状态失败' });
    }
});

/**
 * DELETE /api/auth/google/unbind
 * Unbind Google from current user account
 */
router.delete('/google/unbind', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT password_hash, google_id, qq_openid FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        const user = users[0];
        // Must have password or another OAuth bound
        if (!user.password_hash && !user.qq_openid && user.google_id) {
            res.status(400).json({ error: '请先设置密码或绑定其他登录方式后再解绑Google' });
            return;
        }

        await pool.execute('UPDATE users SET google_id = NULL WHERE id = ?', [userId]);

        res.json({ message: 'Google解绑成功' });
    } catch (error) {
        console.error('Google unbind error:', error);
        res.status(500).json({ error: '解绑失败' });
    }
});

// ============================================
// Linux DO OAuth (connect.linux.do)
// ============================================

const LINUX_DO_CLIENT_ID = process.env.LINUX_DO_CLIENT_ID;
const LINUX_DO_CLIENT_SECRET = process.env.LINUX_DO_CLIENT_SECRET;
const LINUX_DO_REDIRECT_URI = process.env.LINUX_DO_REDIRECT_URI;

// Linux DO session store for new users
const linuxDoSessionStore = new Map<string, { linuxDoId: string; username: string; expires: number }>();
// Linux DO state store for CSRF protection
const linuxDoStateStore = new Map<string, { action: string; userId?: number; expires: number }>();

/**
 * GET /api/auth/linux-do
 * Initiate Linux DO OAuth flow
 */
router.get('/linux-do', optionalAuthMiddleware as any, async (req: Request, res: Response) => {
    try {
        const action = (req.query.action as string) === 'bind' ? 'bind' : 'login';
        const userId = action === 'bind' ? (req as AuthenticatedRequest).user?.id : undefined;
        const turnstileToken = req.query.turnstileToken as string | undefined;

        if (action === 'bind' && !userId) {
            res.status(401).json({ error: '请先登录后再绑定Linux DO' });
            return;
        }

        // Verify Turnstile for login action
        if (action === 'login' && await isTurnstileLoginEnabled()) {
            if (!turnstileToken) {
                res.status(400).json({ error: '请先完成人机验证' });
                return;
            }
            const clientIP = req.ip || req.socket.remoteAddress || '';
            const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
            if (!turnstileResult.success) {
                res.status(400).json({ error: turnstileResult.error || '人机验证失败' });
                return;
            }
        }

        if (!LINUX_DO_CLIENT_ID || !LINUX_DO_REDIRECT_URI) {
            res.status(500).json({ error: 'Linux DO OAuth 未配置' });
            return;
        }

        // Generate state for CSRF protection
        const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        linuxDoStateStore.set(state, { action, userId, expires: Date.now() + 10 * 60 * 1000 });

        const authUrl = new URL('https://connect.linux.do/oauth2/authorize');
        authUrl.searchParams.set('client_id', LINUX_DO_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', LINUX_DO_REDIRECT_URI);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'read');
        authUrl.searchParams.set('state', state);

        res.redirect(authUrl.toString());
    } catch (error) {
        console.error('Linux DO OAuth init error:', error);
        res.status(500).json({ error: 'OAuth初始化失败' });
    }
});

/**
 * GET /api/auth/linux-do/callback
 * Handle Linux DO OAuth callback
 */
router.get('/linux-do/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;

        if (!code || !state) {
            res.redirect(`${FRONTEND_URL}?error=missing_params`);
            return;
        }

        // Verify state
        const stateData = linuxDoStateStore.get(state as string);
        if (!stateData || stateData.expires < Date.now()) {
            linuxDoStateStore.delete(state as string);
            res.redirect(`${FRONTEND_URL}?error=invalid_state`);
            return;
        }
        linuxDoStateStore.delete(state as string);

        if (!LINUX_DO_CLIENT_SECRET || !LINUX_DO_CLIENT_ID || !LINUX_DO_REDIRECT_URI) {
            console.error('[Linux DO] OAuth not configured');
            res.redirect(`${FRONTEND_URL}?error=config_error`);
            return;
        }

        // Exchange code for access token (per Linux DO docs: Basic Auth only, no client creds in body)
        const tokenParams = new URLSearchParams();
        tokenParams.append('grant_type', 'authorization_code');
        tokenParams.append('code', code as string);
        tokenParams.append('redirect_uri', LINUX_DO_REDIRECT_URI);

        // Basic Auth: base64(client_id:client_secret)
        const basicAuth = Buffer.from(`${LINUX_DO_CLIENT_ID}:${LINUX_DO_CLIENT_SECRET}`).toString('base64');

        // Debug logging
        console.log('[Linux DO] Token request debug:', {
            client_id_length: LINUX_DO_CLIENT_ID.length,
            client_secret_length: LINUX_DO_CLIENT_SECRET.length,
            redirect_uri: LINUX_DO_REDIRECT_URI,
            body: tokenParams.toString()
        });

        const tokenResponse = await axios.post('https://connect.linux.do/oauth2/token', tokenParams, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`
            }
        });

        const { access_token } = tokenResponse.data;

        if (!access_token) {
            console.error('[Linux DO] No access token:', tokenResponse.data);
            res.redirect(`${FRONTEND_URL}?error=token_failed`);
            return;
        }

        // Get user info from Linux DO
        const userInfoResponse = await axios.get('https://connect.linux.do/api/user', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const { id: linuxDoId, username: linuxDoUsername } = userInfoResponse.data;

        if (!linuxDoId) {
            console.error('[Linux DO] No user id:', userInfoResponse.data);
            res.redirect(`${FRONTEND_URL}?error=openid_failed`);
            return;
        }

        const linuxDoIdStr = String(linuxDoId);

        // Handle bind action
        if (stateData.action === 'bind' && stateData.userId) {
            const [existing] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE linux_do_id = ?',
                [linuxDoIdStr]
            );

            if (existing.length > 0) {
                res.redirect(`${FRONTEND_URL}?error=linux_do_already_bound`);
                return;
            }

            await pool.execute(
                'UPDATE users SET linux_do_id = ?, linux_do_username = ? WHERE id = ?',
                [linuxDoIdStr, linuxDoUsername, stateData.userId]
            );

            res.redirect(`${FRONTEND_URL}?linux_do_bind=success`);
            return;
        }

        // Check if user exists with this Linux DO ID
        const [existingUsers] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username, email, is_admin FROM users WHERE linux_do_id = ?',
            [linuxDoIdStr]
        );

        if (existingUsers.length > 0) {
            // Existing user - login directly
            const user = existingUsers[0];
            await pool.execute(
                'UPDATE users SET linux_do_username = ?, last_login = NOW() WHERE id = ?',
                [linuxDoUsername, user.id]
            );

            const token = generateToken({
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin || false
            });

            res.redirect(`${FRONTEND_URL}?token=${token}&linux_do_login=success`);
        } else {
            // New Linux DO user - create session and redirect to complete registration
            const linuxDoSession = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            linuxDoSessionStore.set(linuxDoSession, {
                linuxDoId: linuxDoIdStr,
                username: linuxDoUsername,
                expires: Date.now() + 30 * 60 * 1000
            });

            res.redirect(`${FRONTEND_URL}/complete-oauth?linux_do_session=${linuxDoSession}`);
        }
    } catch (error: any) {
        console.error('Linux DO callback error:', error.response?.data || error);
        res.redirect(`${FRONTEND_URL}?error=linux_do_auth_failed`);
    }
});

/**
 * GET /api/auth/linux-do/session
 * Get Linux DO session info for completing registration
 */
router.get('/linux-do/session', async (req: Request, res: Response) => {
    try {
        const linuxDoSession = req.query.session as string;

        if (!linuxDoSession) {
            res.status(400).json({ error: '缺少 session 参数' });
            return;
        }

        const sessionData = linuxDoSessionStore.get(linuxDoSession);
        if (!sessionData || sessionData.expires < Date.now()) {
            linuxDoSessionStore.delete(linuxDoSession);
            res.status(400).json({ error: 'Session 已过期' });
            return;
        }

        res.json({
            linuxDoUsername: sessionData.username
        });
    } catch (error) {
        console.error('Linux DO session error:', error);
        res.status(500).json({ error: '获取 session 失败' });
    }
});

/**
 * POST /api/auth/linux-do/complete
 * Complete Linux DO OAuth registration
 */
router.post('/linux-do/complete', async (req: Request, res: Response) => {
    try {
        const { linuxDoSession, action, username, password, invitationCode } = req.body;

        if (!linuxDoSession) {
            res.status(400).json({ error: '缺少 Linux DO session' });
            return;
        }

        const sessionData = linuxDoSessionStore.get(linuxDoSession);
        if (!sessionData || sessionData.expires < Date.now()) {
            linuxDoSessionStore.delete(linuxDoSession);
            res.status(400).json({ error: 'Session 已过期，请重新登录' });
            return;
        }

        const { linuxDoId, username: linuxDoUsername } = sessionData;

        if (!username || !password) {
            res.status(400).json({ error: '请输入用户名和密码' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: '密码长度至少 6 个字符' });
            return;
        }

        if (action === 'bind') {
            // Bind to existing account
            const [users] = await pool.execute<RowDataPacket[]>(
                'SELECT id, username, password_hash, is_admin, linux_do_id FROM users WHERE username = ?',
                [username]
            );

            if (users.length === 0) {
                res.status(401).json({ error: '用户名或密码错误' });
                return;
            }

            const user = users[0];

            if (user.linux_do_id) {
                res.status(400).json({ error: '该账户已绑定其他Linux DO账号' });
                return;
            }

            const isValid = await verifyPassword(password, user.password_hash);
            if (!isValid) {
                res.status(401).json({ error: '用户名或密码错误' });
                return;
            }

            await pool.execute(
                'UPDATE users SET linux_do_id = ?, linux_do_username = ?, last_login = NOW() WHERE id = ?',
                [linuxDoId, linuxDoUsername, user.id]
            );

            linuxDoSessionStore.delete(linuxDoSession);

            const token = generateToken({
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin || false
            });

            res.json({
                message: 'Linux DO 绑定成功',
                token,
                user: { id: user.id, username: user.username, isAdmin: user.is_admin || false }
            });

        } else if (action === 'create') {
            // Create new account
            if (username.length < 3 || username.length > 60) {
                res.status(400).json({ error: '用户名长度应为 3-60 个字符' });
                return;
            }

            // Check if username exists
            const [existingUser] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );

            if (existingUser.length > 0) {
                res.status(400).json({ error: '用户名已存在' });
                return;
            }

            // Check invitation code if required
            const [normalCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
                'SELECT setting_value FROM site_settings WHERE setting_key = ?',
                ['invitation_code_enabled']
            );
            const normalCodeEnabled = normalCodeEnabledSetting[0]?.setting_value === 'true';

            const [splitCodeEnabledSetting] = await pool.execute<RowDataPacket[]>(
                'SELECT setting_value FROM site_settings WHERE setting_key = ?',
                ['split_invitation_enabled']
            );
            const splitCodeEnabled = splitCodeEnabledSetting[0]?.setting_value === 'true';

            const invitationCodeRequired = normalCodeEnabled || splitCodeEnabled;

            let codeType: 'normal' | 'split' | null = null;
            let codeData: any = null;
            let splitTreeId: string | null = null;

            if (invitationCodeRequired) {
                if (!invitationCode) {
                    res.status(400).json({ error: '请输入邀请码' });
                    return;
                }

                // Check normal codes
                if (normalCodeEnabled) {
                    const [normalCodes] = await pool.execute<RowDataPacket[]>(
                        'SELECT id, is_used FROM invitation_codes WHERE code = ?',
                        [invitationCode]
                    );
                    if (normalCodes.length > 0) {
                        codeData = normalCodes[0];
                        codeType = 'normal';
                        if (codeData.is_used) {
                            res.status(400).json({ error: '该邀请码已被使用' });
                            return;
                        }
                    }
                }

                // Check split codes
                if (!codeData && splitCodeEnabled) {
                    const [splitCodes] = await pool.execute<RowDataPacket[]>(
                        `SELECT c.*, t.is_banned as tree_banned
                         FROM split_invitation_codes c
                         JOIN split_invitation_trees t ON c.tree_id = t.id
                         WHERE c.code = ?`,
                        [invitationCode]
                    );
                    if (splitCodes.length > 0) {
                        codeData = splitCodes[0];
                        codeType = 'split';
                        splitTreeId = codeData.tree_id;
                        if (codeData.is_used) {
                            res.status(400).json({ error: '该邀请码已被使用' });
                            return;
                        }
                        if (codeData.tree_banned) {
                            res.status(400).json({ error: '该邀请码所属邀请树已被封禁' });
                            return;
                        }
                    }
                }

                if (!codeData) {
                    res.status(400).json({ error: '邀请码无效' });
                    return;
                }
            }

            // Create user
            const passwordHash = await hashPassword(password);

            let insertSql: string;
            let insertParams: any[];

            if (codeType === 'split') {
                insertSql = `INSERT INTO users (username, password_hash, linux_do_id, linux_do_username, split_tree_id, invited_by_code_id, created_at, last_login)
                             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`;
                insertParams = [username, passwordHash, linuxDoId, linuxDoUsername, splitTreeId, codeData.id];
            } else {
                insertSql = `INSERT INTO users (username, password_hash, linux_do_id, linux_do_username, created_at, last_login)
                             VALUES (?, ?, ?, ?, NOW(), NOW())`;
                insertParams = [username, passwordHash, linuxDoId, linuxDoUsername];
            }

            const [result] = await pool.execute<ResultSetHeader>(insertSql, insertParams);
            const userId = result.insertId;

            // Mark invitation code as used
            if (codeType === 'normal') {
                await pool.execute(
                    'UPDATE invitation_codes SET is_used = TRUE, used_by_user_id = ?, used_at = NOW() WHERE id = ?',
                    [userId, codeData.id]
                );
            } else if (codeType === 'split') {
                await pool.execute(
                    'UPDATE split_invitation_codes SET is_used = TRUE, used_by_user_id = ?, used_at = NOW() WHERE id = ?',
                    [userId, codeData.id]
                );
            }

            linuxDoSessionStore.delete(linuxDoSession);

            const token = generateToken({
                id: userId,
                username,
                isAdmin: false
            });

            res.status(201).json({
                message: '注册成功',
                token,
                user: { id: userId, username, isAdmin: false }
            });
        } else {
            res.status(400).json({ error: '无效的 action' });
        }
    } catch (error: any) {
        console.error('Linux DO complete error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

/**
 * GET /api/auth/linux-do/status
 * Get Linux DO binding status for current user
 */
router.get('/linux-do/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT linux_do_id, linux_do_username FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        const user = users[0];
        res.json({
            bound: !!user.linux_do_id,
            username: user.linux_do_username
        });
    } catch (error) {
        console.error('Linux DO status error:', error);
        res.status(500).json({ error: '获取状态失败' });
    }
});

/**
 * DELETE /api/auth/linux-do/unbind
 * Unbind Linux DO from current user account
 */
router.delete('/linux-do/unbind', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT password_hash, qq_openid, google_id, linux_do_id FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            res.status(404).json({ error: '用户不存在' });
            return;
        }

        const user = users[0];
        // Must have password or another OAuth bound
        if (!user.password_hash && !user.qq_openid && !user.google_id && user.linux_do_id) {
            res.status(400).json({ error: '请先设置密码或绑定其他登录方式后再解绑Linux DO' });
            return;
        }

        await pool.execute('UPDATE users SET linux_do_id = NULL, linux_do_username = NULL WHERE id = ?', [userId]);

        res.json({ message: 'Linux DO 解绑成功' });
    } catch (error) {
        console.error('Linux DO unbind error:', error);
        res.status(500).json({ error: '解绑失败' });
    }
});

// Cleanup expired Google and Linux DO states periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of googleSessionStore.entries()) {
        if (value.expires < now) googleSessionStore.delete(key);
    }
    for (const [key, value] of googleStateStore.entries()) {
        if (value.expires < now) googleStateStore.delete(key);
    }
    for (const [key, value] of linuxDoSessionStore.entries()) {
        if (value.expires < now) linuxDoSessionStore.delete(key);
    }
    for (const [key, value] of linuxDoStateStore.entries()) {
        if (value.expires < now) linuxDoStateStore.delete(key);
    }
}, 60000);

/**
 * POST /api/auth/email/verify-code-only
 * Verify email code without performing any action (for security verification)
 */
router.post('/email/verify-code-only', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { email, code, codeId } = req.body;

        if (!email || !code) {
            res.status(400).json({ error: '请提供邮箱和验证码' });
            return;
        }

        // Check if code exists and is valid
        const [codes] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM email_codes WHERE email = ? AND code = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
            [email, code]
        );

        if (codes.length === 0) {
            res.status(400).json({ error: '验证码错误或已过期' });
            return;
        }

        // Delete the used code
        await pool.execute('DELETE FROM email_codes WHERE id = ?', [codes[0].id]);

        res.json({ success: true, message: '验证成功' });
    } catch (error) {
        console.error('Email code verification error:', error);
        res.status(500).json({ error: '验证失败' });
    }
});

/**
 * POST /api/auth/change-password-with-email
 * Change password using email verification (no old password required)
 */
router.post('/change-password-with-email', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { email, code, newPassword } = req.body;

        if (!email || !code || !newPassword) {
            res.status(400).json({ error: '请提供完整信息' });
            return;
        }

        if (newPassword.length < 6) {
            res.status(400).json({ error: '新密码长度至少6位' });
            return;
        }

        // Verify the email belongs to this user
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT email FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0 || users[0].email !== email) {
            res.status(403).json({ error: '邮箱验证失败' });
            return;
        }

        // Hash new password and update
        const hashedPassword = await hashPassword(newPassword);
        await pool.execute(
            'UPDATE users SET password_hash = ?, needs_password_reset = FALSE WHERE id = ?',
            [hashedPassword, userId]
        );

        res.json({ message: '密码修改成功' });
    } catch (error) {
        console.error('Change password with email error:', error);
        res.status(500).json({ error: '密码修改失败' });
    }
});

/**
 * DELETE /api/auth/delete-account-with-email
 * Delete account using email verification (no password required)
 */
router.delete('/delete-account-with-email', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { email, code } = req.body;

        if (!email || !code) {
            res.status(400).json({ error: '请提供邮箱和验证码' });
            return;
        }

        // Verify the email belongs to this user
        const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT email, username FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0 || users[0].email !== email) {
            res.status(403).json({ error: '邮箱验证失败' });
            return;
        }

        // Delete user and related data
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

        res.json({ message: '账户已注销' });
    } catch (error) {
        console.error('Delete account with email error:', error);
        res.status(500).json({ error: '账户注销失败' });
    }
});

export default router;


