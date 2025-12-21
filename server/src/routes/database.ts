/**
 * 数据库 API
 * 
 * @module server/routes/database
 * @description 数据库连接测试和查询执行
 */

import { Router, Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// ============================================
// 类型定义
// ============================================

interface DatabaseConfig {
    type: 'mysql' | 'postgresql';
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
}

// ============================================
// 测试连接
// ============================================

/**
 * POST /api/database/test
 * 测试数据库连接
 */
router.post('/test', async (req: Request, res: Response): Promise<void> => {
    try {
        const config: DatabaseConfig = req.body;

        if (!config.host || !config.database || !config.username) {
            res.status(400).json({ error: '缺少必要的连接参数' });
            return;
        }

        if (config.type === 'postgresql') {
            // PostgreSQL 暂不支持，返回提示
            res.status(400).json({ error: 'PostgreSQL 支持即将推出' });
            return;
        }

        // MySQL 连接测试
        const connection = await mysql.createConnection({
            host: config.host,
            port: config.port || 3306,
            database: config.database,
            user: config.username,
            password: config.password,
            connectTimeout: 10000,
        });

        // 执行简单查询验证连接
        await connection.query('SELECT 1');
        await connection.end();

        res.json({ success: true, message: '连接成功' });
    } catch (error: any) {
        console.error('[Database] Test connection error:', error);
        res.status(500).json({
            error: error.code === 'ECONNREFUSED'
                ? '无法连接到数据库服务器'
                : error.code === 'ER_ACCESS_DENIED_ERROR'
                    ? '用户名或密码错误'
                    : error.code === 'ER_BAD_DB_ERROR'
                        ? '数据库不存在'
                        : error.message,
        });
    }
});

// ============================================
// 执行查询
// ============================================

/**
 * POST /api/database/query
 * 执行数据库查询
 */
router.post('/query', async (req: Request, res: Response): Promise<void> => {
    try {
        const { config, query, params } = req.body;

        if (!config || !query) {
            res.status(400).json({ error: '缺少配置或查询语句' });
            return;
        }

        if (config.type === 'postgresql') {
            res.status(400).json({ error: 'PostgreSQL 支持即将推出' });
            return;
        }

        // 安全检查：禁止危险操作
        const dangerousPatterns = [
            /DROP\s+TABLE/i,
            /DROP\s+DATABASE/i,
            /TRUNCATE/i,
            /DELETE\s+FROM\s+\w+\s*;?\s*$/i, // DELETE without WHERE
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(query)) {
                res.status(400).json({ error: '检测到危险 SQL 操作，已阻止执行' });
                return;
            }
        }

        // 限制只允许 SELECT 和安全的写操作
        const allowedOperations = /^(SELECT|INSERT|UPDATE|DELETE|SHOW|DESCRIBE|EXPLAIN)/i;
        if (!allowedOperations.test(query.trim())) {
            res.status(400).json({ error: '不支持的 SQL 操作' });
            return;
        }

        const connection = await mysql.createConnection({
            host: config.host,
            port: config.port || 3306,
            database: config.database,
            user: config.username,
            password: config.password,
            connectTimeout: 10000,
        });

        const startTime = Date.now();
        const [rows, fields] = await connection.query(query, params || []);
        const duration = Date.now() - startTime;

        await connection.end();

        res.json({
            success: true,
            rows: Array.isArray(rows) ? rows : [rows],
            rowCount: Array.isArray(rows) ? rows.length : 1,
            fields: fields?.map((f: any) => ({ name: f.name, type: f.type })),
            duration,
        });
    } catch (error: any) {
        console.error('[Database] Query error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 获取表结构
// ============================================

/**
 * POST /api/database/tables
 * 获取数据库表列表
 */
router.post('/tables', async (req: Request, res: Response): Promise<void> => {
    try {
        const config: DatabaseConfig = req.body;

        if (config.type === 'postgresql') {
            res.status(400).json({ error: 'PostgreSQL 支持即将推出' });
            return;
        }

        const connection = await mysql.createConnection({
            host: config.host,
            port: config.port || 3306,
            database: config.database,
            user: config.username,
            password: config.password,
            connectTimeout: 10000,
        });

        const [tables] = await connection.query('SHOW TABLES');
        await connection.end();

        const tableNames = (tables as any[]).map(t => Object.values(t)[0]);

        res.json({ tables: tableNames });
    } catch (error: any) {
        console.error('[Database] Get tables error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/database/columns
 * 获取表字段列表
 */
router.post('/columns', async (req: Request, res: Response): Promise<void> => {
    try {
        const { config, table } = req.body;

        if (!table) {
            res.status(400).json({ error: '缺少表名' });
            return;
        }

        if (config.type === 'postgresql') {
            res.status(400).json({ error: 'PostgreSQL 支持即将推出' });
            return;
        }

        const connection = await mysql.createConnection({
            host: config.host,
            port: config.port || 3306,
            database: config.database,
            user: config.username,
            password: config.password,
            connectTimeout: 10000,
        });

        const [columns] = await connection.query('DESCRIBE ??', [table]);
        await connection.end();

        res.json({
            columns: (columns as any[]).map(c => ({
                name: c.Field,
                type: c.Type,
                nullable: c.Null === 'YES',
                key: c.Key,
                default: c.Default,
            })),
        });
    } catch (error: any) {
        console.error('[Database] Get columns error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
