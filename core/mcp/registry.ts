/**
 * MCP 注册表管理器
 * 
 * @module core/mcp/registry
 * @description MCP 注册、发现和管理
 */

import {
    MCPRegistryEntry,
    MCPStatus,
    MCPCallRequest,
    MCPCallResponse,
    BUILTIN_MCPS
} from './types';

// ============================================
// MCP 注册表
// ============================================

class MCPRegistry {
    private entries: Map<string, MCPRegistryEntry> = new Map();
    private initialized: boolean = false;

    /**
     * 初始化注册表
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // 注册内置 MCP
        for (const mcp of BUILTIN_MCPS) {
            if (mcp.id) {
                this.entries.set(mcp.id, {
                    ...mcp,
                    status: 'active',
                    connection: mcp.connection || { type: 'function', handler: mcp.id },
                    permissions: mcp.permissions || [],
                    metadata: {
                        author: 'AstraLinks',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        ...mcp.metadata,
                    },
                } as MCPRegistryEntry);
            }
        }

        this.initialized = true;
        console.log(`[MCP Registry] Initialized with ${this.entries.size} MCPs`);
    }

    /**
     * 获取所有 MCP
     */
    getAll(): MCPRegistryEntry[] {
        return Array.from(this.entries.values());
    }

    /**
     * 获取单个 MCP
     */
    get(id: string): MCPRegistryEntry | undefined {
        return this.entries.get(id);
    }

    /**
     * 注册新 MCP
     */
    register(entry: MCPRegistryEntry): void {
        this.entries.set(entry.id, {
            ...entry,
            metadata: {
                ...entry.metadata,
                updatedAt: new Date().toISOString(),
            },
        });
        console.log(`[MCP Registry] Registered: ${entry.id}`);
    }

    /**
     * 注销 MCP
     */
    unregister(id: string): boolean {
        const deleted = this.entries.delete(id);
        if (deleted) {
            console.log(`[MCP Registry] Unregistered: ${id}`);
        }
        return deleted;
    }

    /**
     * 更新 MCP 状态
     */
    updateStatus(id: string, status: MCPStatus): void {
        const entry = this.entries.get(id);
        if (entry) {
            entry.status = status;
            entry.metadata.updatedAt = new Date().toISOString();
        }
    }

    /**
     * 搜索 MCP
     */
    search(query: string): MCPRegistryEntry[] {
        const lowerQuery = query.toLowerCase();
        return this.getAll().filter(mcp =>
            mcp.name.toLowerCase().includes(lowerQuery) ||
            mcp.description.toLowerCase().includes(lowerQuery) ||
            mcp.metadata.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * 按类型过滤
     */
    getByType(type: MCPRegistryEntry['providerType']): MCPRegistryEntry[] {
        return this.getAll().filter(mcp => mcp.providerType === type);
    }
}

// 单例实例
export const mcpRegistry = new MCPRegistry();

// ============================================
// MCP 执行器
// ============================================

class MCPExecutor {
    /**
     * 调用 MCP 工具
     */
    async call(request: MCPCallRequest): Promise<MCPCallResponse> {
        const startTime = Date.now();

        try {
            // 获取 MCP
            const mcp = mcpRegistry.get(request.mcpId);
            if (!mcp) {
                return {
                    success: false,
                    error: {
                        code: 'MCP_NOT_FOUND',
                        message: `MCP not found: ${request.mcpId}`,
                    },
                    metadata: {
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString(),
                    },
                };
            }

            // 检查状态
            if (mcp.status !== 'active') {
                return {
                    success: false,
                    error: {
                        code: 'MCP_INACTIVE',
                        message: `MCP is not active: ${mcp.status}`,
                    },
                    metadata: {
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString(),
                    },
                };
            }

            // 查找工具
            const tool = mcp.tools.find(t => t.name === request.tool);
            if (!tool) {
                return {
                    success: false,
                    error: {
                        code: 'TOOL_NOT_FOUND',
                        message: `Tool not found: ${request.tool}`,
                    },
                    metadata: {
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString(),
                    },
                };
            }

            // 验证参数
            for (const param of tool.parameters) {
                if (param.required && !(param.name in request.params)) {
                    return {
                        success: false,
                        error: {
                            code: 'MISSING_PARAM',
                            message: `Missing required parameter: ${param.name}`,
                        },
                        metadata: {
                            duration: Date.now() - startTime,
                            timestamp: new Date().toISOString(),
                        },
                    };
                }
            }

            // 执行工具
            const result = await this.executeHandler(mcp, request.tool, request.params);

            // 更新统计
            if (mcp.stats) {
                mcp.stats.callCount++;
                mcp.stats.lastUsed = new Date().toISOString();
            }

            return {
                success: true,
                result,
                metadata: {
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                },
            };
        } catch (error: any) {
            return {
                success: false,
                error: {
                    code: 'EXECUTION_ERROR',
                    message: error.message,
                    details: error.stack,
                },
                metadata: {
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                },
            };
        }
    }

    /**
     * 执行内置处理器
     */
    private async executeHandler(
        mcp: MCPRegistryEntry,
        tool: string,
        params: Record<string, any>
    ): Promise<any> {
        // 根据连接类型执行
        switch (mcp.connection.type) {
            case 'function':
                return this.executeBuiltinHandler(mcp.id, tool, params);

            case 'http':
                return this.executeHttpHandler(mcp.connection.url!, tool, params, mcp.connection.headers);

            case 'stdio':
                // TODO: 实现 stdio 连接
                throw new Error('stdio connection not implemented');

            case 'websocket':
                // TODO: 实现 websocket 连接
                throw new Error('websocket connection not implemented');

            default:
                throw new Error(`Unknown connection type: ${mcp.connection.type}`);
        }
    }

    /**
     * 执行内置处理器
     */
    private async executeBuiltinHandler(
        mcpId: string,
        tool: string,
        params: Record<string, any>
    ): Promise<any> {
        // 模拟内置 MCP 执行
        switch (mcpId) {
            case 'mcp-web-search':
                return this.mockWebSearch(params);

            case 'mcp-file-system':
                return this.mockFileSystem(tool, params);

            case 'mcp-code-exec':
                return this.mockCodeExec(params);

            case 'mcp-http':
                return this.executeHttpRequest(params);

            default:
                throw new Error(`Unknown builtin MCP: ${mcpId}`);
        }
    }

    /**
     * 模拟网页搜索
     */
    private async mockWebSearch(params: Record<string, any>): Promise<any> {
        // 模拟搜索结果
        await new Promise(r => setTimeout(r, 500));
        return {
            query: params.query,
            engine: params.engine || 'duckduckgo',
            results: [
                { title: `Result 1 for "${params.query}"`, url: 'https://example.com/1', snippet: 'Example snippet 1...' },
                { title: `Result 2 for "${params.query}"`, url: 'https://example.com/2', snippet: 'Example snippet 2...' },
                { title: `Result 3 for "${params.query}"`, url: 'https://example.com/3', snippet: 'Example snippet 3...' },
            ],
        };
    }

    /**
     * 模拟文件系统
     */
    private async mockFileSystem(tool: string, params: Record<string, any>): Promise<any> {
        await new Promise(r => setTimeout(r, 100));

        switch (tool) {
            case 'read':
                return { path: params.path, content: `[Mock content of ${params.path}]` };
            case 'write':
                return { path: params.path, success: true, size: params.content.length };
            case 'list':
                return { path: params.path, files: ['file1.txt', 'file2.txt', 'subdir/'] };
            default:
                throw new Error(`Unknown file system tool: ${tool}`);
        }
    }

    /**
     * 模拟代码执行
     */
    private async mockCodeExec(params: Record<string, any>): Promise<any> {
        await new Promise(r => setTimeout(r, 200));
        return {
            success: true,
            output: `[Mock execution of ${params.language || 'javascript'} code]`,
            executionTime: 150,
        };
    }

    /**
     * 执行 HTTP 请求
     */
    private async executeHttpRequest(params: Record<string, any>): Promise<any> {
        const response = await fetch(params.url, {
            method: params.method || 'GET',
            headers: params.headers,
            body: params.body,
        });

        const contentType = response.headers.get('content-type');
        let data;

        if (contentType?.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        return {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data,
        };
    }

    /**
     * 执行 HTTP 连接的 MCP
     */
    private async executeHttpHandler(
        url: string,
        tool: string,
        params: Record<string, any>,
        headers?: Record<string, string>
    ): Promise<any> {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify({ tool, params }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        return response.json();
    }
}

// 单例实例
export const mcpExecutor = new MCPExecutor();

// ============================================
// 导出
// ============================================

export { MCPRegistry, MCPExecutor };
