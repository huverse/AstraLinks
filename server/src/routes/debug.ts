import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import bcrypt from 'bcrypt';
import { hashPassword } from '../utils/crypto';

const router = Router();

// 生成密码hash
router.post('/generate-hash', async (req: Request, res: Response) => {
    try {
        const { password } = req.body;
        const hash = await hashPassword(password);

        res.json({
            password,
            hash,
            hashLength: hash.length,
            sqlCommand: `UPDATE users SET password_hash = '${hash}' WHERE username = 'admin';`
        });
    } catch (error: any) {
        res.json({ error: error.message });
    }
});

// 测试密码验证
router.post('/test-password', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        // 查询用户
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT username, password_hash FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) {
            res.json({ error: '用户不存在', username });
            return;
        }

        const user = rows[0];
        const hash = user.password_hash;

        // 测试密码验证
        const isValid = await bcrypt.compare(password, hash);

        res.json({
            username: user.username,
            passwordProvided: password,
            hashInDb: hash,
            hashPrefix: hash.substring(0, 10),
            isValid,
            bcryptVersion: bcrypt.getRounds(hash)
        });

    } catch (error: any) {
        res.json({ error: error.message, stack: error.stack });
    }
});

export default router;
