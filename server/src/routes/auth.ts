import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { hashPassword, verifyPassword, generateDeviceFingerprint } from '../utils/crypto';
import { generateToken, authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import axios from 'axios';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user with invitation code (supports both normal and split codes)
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { username, email, password, invitationCode, deviceFingerprint } = req.body;

        // Validation
        if (!username || !password || !invitationCode) {
            res.status(400).json({ error: '用户名、密码和邀请码为必填项' });
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

        // First check normal invitation codes (8 characters)
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

        // If not found, check split invitation codes (12 characters)
        if (!codeData) {
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

        // Code not found in either system
        if (!codeData) {
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
        } else {
            insertSql = `INSERT INTO users (username, email, password_hash, invitation_code_used, device_fingerprint)
                         VALUES (?, ?, ?, ?, ?)`;
            insertParams = [username, email || null, passwordHash, invitationCode, fingerprint];
        }

        const [result] = await pool.execute<ResultSetHeader>(insertSql, insertParams);
        const userId = result.insertId;

        // Mark invitation code as used
        if (codeType === 'normal') {
            await pool.execute(
                `UPDATE invitation_codes 
                 SET is_used = TRUE, used_by_user_id = ?, used_device_fingerprint = ?, used_at = NOW()
                 WHERE id = ?`,
                [userId, fingerprint, codeData.id]
            );
        } else {
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
        const { username, password } = req.body;

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
            res.status(401).json({ error: '用户名或密码错误' });
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

// ========== QQ OAuth 2.0 ==========

const QQ_APP_ID = process.env.QQ_APP_ID || '';
const QQ_APP_KEY = process.env.QQ_APP_KEY || '';
const QQ_REDIRECT_URI = process.env.QQ_REDIRECT_URI || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// State store for CSRF protection (in production, use Redis)
const stateStore = new Map<string, { expires: number; action: 'login' | 'bind'; userId?: number }>();

// Cleanup expired states periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of stateStore.entries()) {
        if (value.expires < now) stateStore.delete(key);
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

        // For bind action, require authentication
        if (action === 'bind' && !userId) {
            res.status(401).json({ error: '请先登录后再绑定QQ' });
            return;
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

        // Login or auto-register
        const [existingUsers] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username, email, is_admin, qq_nickname FROM users WHERE qq_openid = ?',
            [openid]
        );

        let user;
        if (existingUsers.length > 0) {
            // Existing user with QQ bound
            user = existingUsers[0];
            // Update nickname/avatar if changed
            await pool.execute(
                'UPDATE users SET qq_nickname = ?, avatar_url = ?, last_login = NOW() WHERE id = ?',
                [qqNickname, avatarUrl, user.id]
            );
        } else {
            // Auto-register new user
            const username = `QQ_${openid.substring(0, 8)}`;
            const [result] = await pool.execute<ResultSetHeader>(
                `INSERT INTO users (username, qq_openid, qq_nickname, avatar_url) VALUES (?, ?, ?, ?)`,
                [username, openid, qqNickname, avatarUrl]
            );
            user = { id: result.insertId, username, email: null, is_admin: false };
        }

        // Generate JWT
        const token = generateToken({
            id: user.id,
            username: user.username,
            isAdmin: user.is_admin || false
        });

        // Redirect to frontend with token
        res.redirect(`${FRONTEND_URL}?token=${token}&qq_login=success`);

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

export default router;

