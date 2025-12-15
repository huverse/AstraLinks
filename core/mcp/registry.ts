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
        // 执行内置 MCP 处理器 (真实实现)
        switch (mcpId) {
            case 'mcp-web-search':
                return this.realWebSearch(params);

            case 'mcp-file-system':
                return this.realFileSystem(tool, params);

            case 'mcp-code-exec':
                return this.realCodeExecutor(params);

            case 'mcp-http':
                return this.executeHttpRequest(params);

            default:
                throw new Error(`Unknown builtin MCP: ${mcpId}`);
        }
    }


    /**
     * 真实文件系统操作 (沙箱内)
     * @note 此方法在前端运行时会调用后端 API
     */
    private async realFileSystem(tool: string, params: Record<string, any>): Promise<any> {
        // 检查是否在浏览器环境
        if (typeof window !== 'undefined') {
            // 前端: 调用后端 API
            const token = localStorage.getItem('galaxyous_token');
            const workspaceId = params.workspaceId || 'default';

            const response = await fetch(`/api/workspace-config/${workspaceId}/files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ tool, ...params }),
            });

            if (!response.ok) {
                throw new Error(`File operation failed: ${response.statusText}`);
            }

            return response.json();
        } else {
            // 后端: 直接操作文件系统
            const fs = await import('fs/promises');
            const path = await import('path');

            // 工作区沙箱基础路径
            const sandboxBase = process.env.WORKSPACE_FILES_PATH || './workspaces';
            const workspaceId = params.workspaceId || 'default';
            const basePath = path.join(sandboxBase, workspaceId, 'files');

            // 确保路径安全 (防止目录遍历攻击)
            const safePath = path.join(basePath, params.path || '');
            if (!safePath.startsWith(basePath)) {
                throw new Error('Access denied: Path traversal detected');
            }

            switch (tool) {
                case 'read':
                    const content = await fs.readFile(safePath, 'utf-8');
                    return { path: params.path, content, success: true };

                case 'write':
                    await fs.mkdir(path.dirname(safePath), { recursive: true });
                    await fs.writeFile(safePath, params.content, 'utf-8');
                    return { path: params.path, success: true, size: params.content.length };

                case 'list':
                    try {
                        const entries = await fs.readdir(safePath, { withFileTypes: true });
                        const files = entries.map(e => ({
                            name: e.name,
                            type: e.isDirectory() ? 'directory' : 'file',
                        }));
                        return { path: params.path, files, success: true };
                    } catch (e: any) {
                        if (e.code === 'ENOENT') {
                            return { path: params.path, files: [], success: true };
                        }
                        throw e;
                    }

                case 'delete':
                    await fs.unlink(safePath);
                    return { path: params.path, success: true };

                case 'mkdir':
                    await fs.mkdir(safePath, { recursive: true });
                    return { path: params.path, success: true };

                default:
                    throw new Error(`Unknown file system tool: ${tool}`);
            }
        }
    }

    /**
     * 真实代码执行 (JavaScript 沙箱)
     */
    private async realCodeExecutor(params: Record<string, any>): Promise<any> {
        const { code, language = 'javascript', timeout = 5000 } = params;

        if (language !== 'javascript') {
            return {
                success: false,
                output: '',
                error: `Language "${language}" is not supported. Only JavaScript is available.`,
                executionTime: 0,
            };
        }

        const startTime = Date.now();
        const logs: string[] = [];

        try {
            // 创建沙箱环境
            const sandbox = {
                console: {
                    log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
                    error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' ')),
                    warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => String(a)).join(' ')),
                },
                Math,
                Date,
                JSON,
                Array,
                Object,
                String,
                Number,
                Boolean,
                parseInt,
                parseFloat,
                isNaN,
                isFinite,
            };

            // 使用 Function 构造器创建隔离执行
            const wrappedCode = `
                "use strict";
                return (async function() {
                    ${code}
                })();
            `;

            // 创建带超时的执行
            const executeWithTimeout = async () => {
                const fn = new Function(...Object.keys(sandbox), wrappedCode);
                return await fn(...Object.values(sandbox));
            };

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Execution timeout (${timeout}ms)`)), timeout);
            });

            const result = await Promise.race([executeWithTimeout(), timeoutPromise]);

            return {
                success: true,
                output: logs.join('\n'),
                result: result !== undefined ? String(result) : undefined,
                executionTime: Date.now() - startTime,
            };
        } catch (error: any) {
            return {
                success: false,
                output: logs.join('\n'),
                error: error.message,
                executionTime: Date.now() - startTime,
            };
        }
    }

    /**
     * 真实网页搜索 (DuckDuckGo Instant Answer API)
     */
    private async realWebSearch(params: Record<string, any>): Promise<any> {
        const { query, limit = 10 } = params;

        try {
            // 使用 DuckDuckGo Instant Answer API
            const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

            const response = await fetch(ddgUrl, {
                headers: {
                    'User-Agent': 'AstraLinks/1.0 (Web Search MCP)',
                },
            });

            if (!response.ok) {
                throw new Error(`Search API error: ${response.status}`);
            }

            const data = await response.json();

            // 解析 DuckDuckGo 响应
            const results: any[] = [];

            // Abstract (主要结果)
            if (data.Abstract) {
                results.push({
                    title: data.Heading || query,
                    url: data.AbstractURL || '',
                    snippet: data.Abstract,
                    source: data.AbstractSource || 'DuckDuckGo',
                });
            }

            // Related Topics
            if (data.RelatedTopics) {
                for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 60),
                            url: topic.FirstURL,
                            snippet: topic.Text,
                            source: 'DuckDuckGo',
                        });
                    }
                }
            }

            // 如果没有结果，返回提示
            if (results.length === 0) {
                results.push({
                    title: `Search results for "${query}"`,
                    url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    snippet: 'No instant answers available. Click to search on DuckDuckGo.',
                    source: 'DuckDuckGo',
                });
            }

            return {
                query,
                engine: 'duckduckgo',
                results: results.slice(0, limit),
                totalResults: results.length,
            };
        } catch (error: any) {
            // 降级: 返回搜索链接
            return {
                query,
                engine: 'duckduckgo',
                results: [{
                    title: `Search "${query}" on DuckDuckGo`,
                    url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    snippet: `Search failed: ${error.message}. Click to search manually.`,
                    source: 'DuckDuckGo',
                }],
                error: error.message,
            };
        }
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

