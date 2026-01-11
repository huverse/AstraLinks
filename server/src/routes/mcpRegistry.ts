/**
 * MCP 注册表 API 路由
 * 
 * @module server/src/routes/mcpRegistry
 * @description MCP 注册表 CRUD 和工具调用 API
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ============================================
// 获取所有 MCP
// ============================================

router.get('/', async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query(`
      SELECT * FROM mcp_registry
      WHERE is_enabled = TRUE
      ORDER BY created_at DESC
    `);

        // 解析 JSON 字段
        const mcps = (rows as any[]).map(row => ({
            ...row,
            tools: JSON.parse(row.tools || '[]'),
            connection: JSON.parse(row.connection || '{}'),
            permissions: JSON.parse(row.permissions || '[]'),
            metadata: JSON.parse(row.metadata || '{}'),
            stats: JSON.parse(row.stats || '{}'),
        }));

        res.json({ success: true, data: mcps });
    } catch (error: any) {
        console.error('[MCP Registry] Failed to get MCPs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 获取内置 MCP 列表
// ============================================

router.get('/builtin', async (req: Request, res: Response) => {
    const builtinMcps = [
        {
            id: 'mcp-web-search',
            name: 'Web Search',
            description: '网页搜索工具',
            version: '1.0.0',
            providerType: 'builtin',
            status: 'active',
            tools: [{ name: 'search', description: '搜索网页', parameters: [{ name: 'query', type: 'string', required: true }] }],
        },
        {
            id: 'mcp-file-system',
            name: 'File System',
            description: '文件系统操作 (沙箱)',
            version: '1.0.0',
            providerType: 'builtin',
            status: 'active',
            tools: [
                { name: 'read', description: '读取文件', parameters: [{ name: 'path', type: 'string', required: true }] },
                { name: 'write', description: '写入文件', parameters: [{ name: 'path', type: 'string', required: true }, { name: 'content', type: 'string', required: true }] },
            ],
        },
        {
            id: 'mcp-code-exec',
            name: 'Code Executor',
            description: '安全代码执行',
            version: '1.0.0',
            providerType: 'builtin',
            status: 'active',
            tools: [{ name: 'execute', description: '执行代码', parameters: [{ name: 'code', type: 'string', required: true }] }],
        },
        {
            id: 'mcp-http',
            name: 'HTTP Client',
            description: 'HTTP 请求工具',
            version: '1.0.0',
            providerType: 'builtin',
            status: 'active',
            tools: [{ name: 'request', description: '发送请求', parameters: [{ name: 'url', type: 'string', required: true }] }],
        },
    ];

    res.json({ success: true, data: builtinMcps });
});

// ============================================
// 获取单个 MCP
// ============================================

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query('SELECT * FROM mcp_registry WHERE id = ?', [req.params.id]);

        if ((rows as any[]).length === 0) {
            return res.status(404).json({ success: false, error: 'MCP not found' });
        }

        const row = (rows as any[])[0];
        res.json({
            success: true,
            data: {
                ...row,
                tools: JSON.parse(row.tools || '[]'),
                connection: JSON.parse(row.connection || '{}'),
                permissions: JSON.parse(row.permissions || '[]'),
                metadata: JSON.parse(row.metadata || '{}'),
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 注册新 MCP
// ============================================

router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, description, version, providerType, tools, connection, permissions, metadata } = req.body;
        const id = `mcp-custom-${uuidv4().slice(0, 8)}`;

        await pool.query(`
      INSERT INTO mcp_registry (id, name, description, version, provider_type, is_enabled, health_status, tools, connection, permissions, metadata)
      VALUES (?, ?, ?, ?, ?, TRUE, 'HEALTHY', ?, ?, ?, ?)
    `, [id, name, description, version || '1.0.0', providerType || 'custom',
            JSON.stringify(tools || []), JSON.stringify(connection || {}),
            JSON.stringify(permissions || []), JSON.stringify(metadata || {})]);

        res.json({ success: true, data: { id } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 删除 MCP
// ============================================

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        await pool.query('UPDATE mcp_registry SET is_enabled = FALSE WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 调用 MCP 工具
// ============================================

router.post('/:id/call', async (req: Request, res: Response) => {
    try {
        const { tool, params } = req.body;
        const mcpId = req.params.id;

        if (!tool) {
            res.status(400).json({ success: false, error: 'Missing tool parameter' });
            return;
        }

        // 导入服务端 MCP 执行器
        const { mcpExecutor } = await import('../services/mcpExecutor');

        // 检查是否为内置 MCP
        const isBuiltin = mcpExecutor.isBuiltinMCP(mcpId);

        if (isBuiltin) {
            // 调用内置 MCP 执行器
            const response = await mcpExecutor.call({
                mcpId,
                tool,
                params: params || {},
            });
            res.json(response);
            return;
        }

        // 非内置 MCP: 从数据库查询并执行
        const [rows] = await pool.query('SELECT * FROM mcp_registry WHERE id = ? AND is_enabled = TRUE', [mcpId]);

        if ((rows as any[]).length === 0) {
            res.status(404).json({
                success: false,
                error: { code: 'MCP_NOT_FOUND', message: `MCP not found: ${mcpId}` }
            });
            return;
        }

        const mcpRow = (rows as any[])[0];
        const connection = JSON.parse(mcpRow.connection || '{}');

        // 根据连接类型执行
        if (connection.type === 'http' && connection.url) {
            const httpResponse = await fetch(connection.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(connection.headers || {}),
                },
                body: JSON.stringify({ tool, params }),
            });

            if (!httpResponse.ok) {
                throw new Error(`HTTP error: ${httpResponse.status}`);
            }

            const result = await httpResponse.json();
            res.json({
                success: true,
                result,
                metadata: { duration: 0, timestamp: new Date().toISOString() },
            });
        } else {
            // 其他类型暂不支持
            res.status(400).json({
                success: false,
                error: { code: 'UNSUPPORTED_CONNECTION', message: `Connection type "${connection.type}" not supported` }
            });
        }
    } catch (error: any) {
        console.error('[MCP Registry] Call error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'EXECUTION_ERROR', message: error.message }
        });
    }
});

export default router;
