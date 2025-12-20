import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        username: string;
        email: string | null;
        isAdmin: boolean;
    };
}

const JWT_SECRET_ENV = process.env.JWT_SECRET;
if (!JWT_SECRET_ENV) {
    throw new Error('CRITICAL: JWT_SECRET environment variable is required');
}
const JWT_SECRET: string = JWT_SECRET_ENV;

/**
 * Generate JWT token for a user
 */
export function generateToken(user: { id: number; username: string; isAdmin: boolean }): string {
    return jwt.sign(
        { id: user.id, username: user.username, isAdmin: user.isAdmin },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): { id: number; username: string; isAdmin: boolean } | null {
    try {
        return jwt.verify(token, JWT_SECRET) as { id: number; username: string; isAdmin: boolean };
    } catch {
        return null;
    }
}

/**
 * Authentication middleware - requires valid JWT token
 */
export async function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: '未提供认证令牌' });
        return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        res.status(401).json({ error: '认证令牌无效或已过期' });
        return;
    }

    // Fetch fresh user data
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT id, username, email, is_admin FROM users WHERE id = ?',
            [decoded.id]
        );

        if (rows.length === 0) {
            res.status(401).json({ error: '用户不存在' });
            return;
        }

        req.user = {
            id: rows[0].id,
            username: rows[0].username,
            email: rows[0].email,
            isAdmin: rows[0].is_admin
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
}

/**
 * Admin-only middleware - must be used after authMiddleware
 */
export function adminMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void {
    if (!req.user?.isAdmin) {
        res.status(403).json({ error: '需要管理员权限' });
        return;
    }
    next();
}
