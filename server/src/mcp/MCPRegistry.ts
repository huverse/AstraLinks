/**
 * MCP Registry - MCP 注册表
 * 管理工作区 MCP 和聊天 MCP 的注册、查询、用户安装
 */

import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import {
    MCPScope,
    MCPStatus,
    MCPRegistryEntry,
    MCPToolDefinition,
    MCPPermission,
    UserMCPInstall,
    WORKSPACE_MCPS,
    CHAT_MCPS
} from './types';

export class MCPRegistry {
    private cache: Map<string, MCPRegistryEntry> = new Map();
    private cacheExpiry: number = 0;
    private cacheTTL: number = 5 * 60 * 1000; // 5 分钟缓存

    constructor() {
        this.initializeBuiltinMCPs();
    }

    // 初始化内置 MCP
    private initializeBuiltinMCPs(): void {
        const now = new Date().toISOString();

        // 工作区 MCP
        for (const mcp of WORKSPACE_MCPS) {
            const entry: MCPRegistryEntry = {
                id: mcp.id!,
                name: mcp.name!,
                description: mcp.description!,
                version: mcp.version!,
                scope: mcp.scope!,
                status: 'active',
                isBuiltin: true,
                isVerified: true,
                ratingScore: 5.0,
                ratingCount: 0,
                tools: mcp.tools!,
                permissions: mcp.permissions!,
                connection: { type: 'builtin', handler: mcp.id },
                metadata: {
                    author: 'AstraLinks',
                    createdAt: now,
                    updatedAt: now
                }
            };
            this.cache.set(entry.id, entry);
        }

        // 聊天 MCP
        for (const mcp of CHAT_MCPS) {
            const entry: MCPRegistryEntry = {
                id: mcp.id!,
                name: mcp.name!,
                description: mcp.description!,
                version: mcp.version!,
                scope: mcp.scope!,
                status: 'active',
                isBuiltin: true,
                isVerified: true,
                ratingScore: 5.0,
                ratingCount: 0,
                tools: mcp.tools!,
                permissions: mcp.permissions!,
                connection: { type: 'builtin', handler: mcp.id },
                metadata: {
                    author: 'AstraLinks',
                    createdAt: now,
                    updatedAt: now
                }
            };
            this.cache.set(entry.id, entry);
        }
    }

    // 获取单个 MCP
    async getMCP(mcpId: string): Promise<MCPRegistryEntry | null> {
        // 先查缓存
        if (this.cache.has(mcpId)) {
            return this.cache.get(mcpId)!;
        }

        // 查数据库
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM mcp_registry WHERE id = ?`,
            [mcpId]
        );

        if (rows.length === 0) return null;

        const entry = this.rowToEntry(rows[0]);
        this.cache.set(mcpId, entry);
        return entry;
    }

    // 按作用域获取 MCP 列表
    async getMCPsByScope(scope: MCPScope): Promise<MCPRegistryEntry[]> {
        const results: MCPRegistryEntry[] = [];

        // 从缓存获取内置 MCP
        for (const entry of this.cache.values()) {
            if (entry.isBuiltin && (entry.scope === scope || entry.scope === 'both')) {
                results.push(entry);
            }
        }

        // 从数据库获取第三方 MCP
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM mcp_registry WHERE (scope = ? OR scope = 'both') AND is_enabled = TRUE`,
            [scope]
        );

        for (const row of rows) {
            const entry = this.rowToEntry(row);
            if (!this.cache.has(entry.id)) {
                results.push(entry);
            }
        }

        return results;
    }

    // 获取用户已安装的 MCP
    async getUserInstalledMCPs(userId: number, scope?: MCPScope): Promise<UserMCPInstall[]> {
        let query = `SELECT * FROM mcp_user_installs WHERE user_id = ?`;
        const params: unknown[] = [userId];

        if (scope) {
            query += ` AND (scope = ? OR scope = 'both')`;
            params.push(scope);
        }

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        return rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            mcpId: row.mcp_id,
            scope: row.scope,
            config: row.config_json ? JSON.parse(row.config_json) : {},
            isEnabled: row.is_enabled === 1,
            installedAt: row.installed_at,
            lastUsedAt: row.last_used_at
        }));
    }

    // 获取用户可用的 MCP（内置 + 已安装且启用）
    async getAvailableMCPsForUser(userId: number, scope: MCPScope): Promise<MCPRegistryEntry[]> {
        // 获取内置 MCP
        const builtinMCPs = await this.getMCPsByScope(scope);

        // 获取用户已安装的 MCP
        const userInstalls = await this.getUserInstalledMCPs(userId, scope);
        const enabledMcpIds = userInstalls.filter(i => i.isEnabled).map(i => i.mcpId);

        // 获取已安装 MCP 的详情
        const installedMCPs: MCPRegistryEntry[] = [];
        for (const mcpId of enabledMcpIds) {
            const mcp = await this.getMCP(mcpId);
            if (mcp && !mcp.isBuiltin) {
                installedMCPs.push(mcp);
            }
        }

        return [...builtinMCPs, ...installedMCPs];
    }

    // 安装 MCP
    async installMCP(
        userId: number,
        mcpId: string,
        scope: MCPScope,
        config: Record<string, unknown> = {}
    ): Promise<string> {
        const mcp = await this.getMCP(mcpId);
        if (!mcp) {
            throw new Error('MCP not found');
        }

        const installId = crypto.randomUUID();
        await pool.execute(
            `INSERT INTO mcp_user_installs (id, user_id, mcp_id, scope, config_json, is_enabled, installed_at)
             VALUES (?, ?, ?, ?, ?, 1, NOW())
             ON DUPLICATE KEY UPDATE config_json = VALUES(config_json), is_enabled = 1`,
            [installId, userId, mcpId, scope, JSON.stringify(config)]
        );

        return installId;
    }

    // 卸载 MCP
    async uninstallMCP(userId: number, mcpId: string): Promise<void> {
        await pool.execute(
            `DELETE FROM mcp_user_installs WHERE user_id = ? AND mcp_id = ?`,
            [userId, mcpId]
        );
    }

    // 启用/禁用 MCP
    async setMCPEnabled(userId: number, mcpId: string, enabled: boolean): Promise<void> {
        await pool.execute(
            `UPDATE mcp_user_installs SET is_enabled = ? WHERE user_id = ? AND mcp_id = ?`,
            [enabled ? 1 : 0, userId, mcpId]
        );
    }

    // 更新 MCP 配置
    async updateMCPConfig(
        userId: number,
        mcpId: string,
        config: Record<string, unknown>
    ): Promise<void> {
        await pool.execute(
            `UPDATE mcp_user_installs SET config_json = ? WHERE user_id = ? AND mcp_id = ?`,
            [JSON.stringify(config), userId, mcpId]
        );
    }

    // 记录 MCP 使用
    async recordUsage(userId: number, mcpId: string): Promise<void> {
        await pool.execute(
            `UPDATE mcp_user_installs SET last_used_at = NOW() WHERE user_id = ? AND mcp_id = ?`,
            [userId, mcpId]
        );
    }

    // 注册第三方 MCP
    async registerMCP(entry: Omit<MCPRegistryEntry, 'isBuiltin' | 'isVerified' | 'ratingScore' | 'ratingCount'>): Promise<void> {
        await pool.execute(
            `INSERT INTO mcp_registry
             (id, name, description, version, scope, status, tools_json, permissions_json, connection_json, manifest_json, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.id,
                entry.name,
                entry.description,
                entry.version,
                entry.scope,
                entry.status,
                JSON.stringify(entry.tools),
                JSON.stringify(entry.permissions),
                JSON.stringify(entry.connection),
                entry.manifest ? JSON.stringify(entry.manifest) : null,
                JSON.stringify(entry.metadata)
            ]
        );
    }

    // 搜索 MCP
    async searchMCPs(query: string, scope?: MCPScope): Promise<MCPRegistryEntry[]> {
        let sql = `SELECT * FROM mcp_registry WHERE (name LIKE ? OR description LIKE ?) AND is_enabled = TRUE`;
        const params: unknown[] = [`%${query}%`, `%${query}%`];

        if (scope) {
            sql += ` AND (scope = ? OR scope = 'both')`;
            params.push(scope);
        }

        sql += ` ORDER BY rating_score DESC, rating_count DESC LIMIT 50`;

        const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
        return rows.map(row => this.rowToEntry(row));
    }

    // 获取热门 MCP
    async getPopularMCPs(scope?: MCPScope, limit: number = 20): Promise<MCPRegistryEntry[]> {
        let sql = `SELECT * FROM mcp_registry WHERE is_enabled = TRUE`;
        const params: unknown[] = [];

        if (scope) {
            sql += ` AND (scope = ? OR scope = 'both')`;
            params.push(scope);
        }

        sql += ` ORDER BY rating_score DESC, rating_count DESC LIMIT ?`;
        params.push(limit);

        const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
        return rows.map(row => this.rowToEntry(row));
    }

    // 行数据转换为 Entry
    private rowToEntry(row: RowDataPacket): MCPRegistryEntry {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            version: row.version,
            scope: row.scope,
            status: row.is_enabled ? 'active' : 'inactive',
            isBuiltin: row.is_builtin === 1,
            isVerified: row.is_verified === 1,
            ratingScore: row.rating_score,
            ratingCount: row.rating_count,
            tools: row.tools_json ? JSON.parse(row.tools_json) : [],
            permissions: row.permissions_json ? JSON.parse(row.permissions_json) : [],
            connection: row.connection_json ? JSON.parse(row.connection_json) : { type: 'builtin' },
            manifest: row.manifest_json ? JSON.parse(row.manifest_json) : undefined,
            metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {
                createdAt: row.created_at,
                updatedAt: row.updated_at
            },
            stats: row.stats_json ? JSON.parse(row.stats_json) : undefined
        };
    }

    // 获取 MCP 的工具列表
    getToolsForMCP(mcpId: string): MCPToolDefinition[] {
        const mcp = this.cache.get(mcpId);
        return mcp?.tools ?? [];
    }

    // 清除缓存
    clearCache(): void {
        // 保留内置 MCP
        const builtinEntries: [string, MCPRegistryEntry][] = [];
        for (const [id, entry] of this.cache.entries()) {
            if (entry.isBuiltin) {
                builtinEntries.push([id, entry]);
            }
        }
        this.cache.clear();
        for (const [id, entry] of builtinEntries) {
            this.cache.set(id, entry);
        }
        this.cacheExpiry = 0;
    }
}

// 单例
export const mcpRegistry = new MCPRegistry();
