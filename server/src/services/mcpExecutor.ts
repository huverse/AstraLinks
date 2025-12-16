/**
 * MCP 执行器服务 - 服务端版本
 * 
 * @module server/src/services/mcpExecutor
 * @description 服务端 MCP 工具执行器
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ============================================
// 类型定义
// ============================================

export interface MCPCallRequest {
    mcpId: string;
    tool: string;
    params: Record<string, any>;
}

export interface MCPCallResponse {
    success: boolean;
    result?: any;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    metadata: {
        duration: number;
        timestamp: string;
    };
}

// ============================================
// 内置 MCP 定义
// ============================================

const BUILTIN_MCPS = [
    {
        id: 'mcp-web-search',
        name: 'Web Search',
        tools: ['search'],
    },
    {
        id: 'mcp-file-system',
        name: 'File System',
        tools: ['read', 'write', 'list', 'delete', 'mkdir'],
    },
    {
        id: 'mcp-code-exec',
        name: 'Code Executor',
        tools: ['execute'],
    },
    {
        id: 'mcp-http',
        name: 'HTTP Client',
        tools: ['request'],
    },
];

// ============================================
// MCP 执行器类
// ============================================

class MCPExecutorService {
    /**
     * 调用 MCP 工具
     */
    async call(request: MCPCallRequest): Promise<MCPCallResponse> {
        const startTime = Date.now();

        try {
            // 查找内置 MCP
            const builtinMcp = BUILTIN_MCPS.find(m => m.id === request.mcpId);
            if (!builtinMcp) {
                return {
                    success: false,
                    error: {
                        code: 'MCP_NOT_FOUND',
                        message: `Builtin MCP not found: ${request.mcpId}`,
                    },
                    metadata: {
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString(),
                    },
                };
            }

            // 检查工具是否存在
            if (!builtinMcp.tools.includes(request.tool)) {
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

            // 执行工具
            const result = await this.executeBuiltinHandler(request.mcpId, request.tool, request.params);

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
     * 检查是否为内置 MCP
     */
    isBuiltinMCP(mcpId: string): boolean {
        return BUILTIN_MCPS.some(m => m.id === mcpId);
    }

    /**
     * 执行内置处理器
     */
    private async executeBuiltinHandler(
        mcpId: string,
        tool: string,
        params: Record<string, any>
    ): Promise<any> {
        switch (mcpId) {
            case 'mcp-web-search':
                return this.executeWebSearch(params);

            case 'mcp-file-system':
                return this.executeFileSystem(tool, params);

            case 'mcp-code-exec':
                return this.executeCode(params);

            case 'mcp-http':
                return this.executeHttp(params);

            default:
                throw new Error(`Unknown builtin MCP: ${mcpId}`);
        }
    }

    /**
     * 网页搜索 (DuckDuckGo)
     */
    private async executeWebSearch(params: Record<string, any>): Promise<any> {
        const { query, limit = 10 } = params;

        try {
            const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
            const response = await fetch(ddgUrl, {
                headers: { 'User-Agent': 'AstraLinks/1.0 (Web Search MCP)' },
            });

            if (!response.ok) {
                throw new Error(`Search API error: ${response.status}`);
            }

            const data = await response.json() as {
                Abstract?: string;
                Heading?: string;
                AbstractURL?: string;
                AbstractSource?: string;
                RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
            };
            const results: any[] = [];

            if (data.Abstract) {
                results.push({
                    title: data.Heading || query,
                    url: data.AbstractURL || '',
                    snippet: data.Abstract,
                    source: data.AbstractSource || 'DuckDuckGo',
                });
            }

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

            if (results.length === 0) {
                results.push({
                    title: `Search results for "${query}"`,
                    url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    snippet: 'No instant answers available. Click to search on DuckDuckGo.',
                    source: 'DuckDuckGo',
                });
            }

            return { query, engine: 'duckduckgo', results: results.slice(0, limit), totalResults: results.length };
        } catch (error: any) {
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
     * 文件系统操作 (沙箱)
     */
    private async executeFileSystem(tool: string, params: Record<string, any>): Promise<any> {
        const sandboxBase = process.env.WORKSPACE_FILES_PATH || './workspaces';
        const workspaceId = params.workspaceId || 'default';
        const basePath = path.join(sandboxBase, workspaceId, 'files');

        // 防止目录遍历攻击
        const safePath = path.join(basePath, params.path || '');
        if (!safePath.startsWith(path.resolve(basePath))) {
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

    /**
     * 代码执行 (JavaScript + Python)
     */
    private async executeCode(params: Record<string, any>): Promise<any> {
        const { code, language = 'javascript', timeout = 5000 } = params;
        const startTime = Date.now();

        if (language === 'javascript') {
            return this.executeJavaScript(code, timeout, startTime);
        } else if (language === 'python') {
            return this.executePython(code, timeout, startTime);
        }

        return {
            success: false,
            language,
            output: '',
            error: `Language "${language}" is not supported. Available: javascript, python`,
            executionTime: 0,
        };
    }

    private async executeJavaScript(code: string, timeout: number, startTime: number): Promise<any> {
        const logs: string[] = [];

        try {
            const sandbox = {
                console: {
                    log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
                    error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' ')),
                    warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => String(a)).join(' ')),
                },
                Math, Date, JSON, Array, Object, String, Number, Boolean,
                parseInt, parseFloat, isNaN, isFinite,
            };

            const wrappedCode = `
                "use strict";
                return (async function() {
                    ${code}
                })();
            `;

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
                language: 'javascript',
                output: logs.join('\n'),
                result: result !== undefined ? String(result) : undefined,
                executionTime: Date.now() - startTime,
            };
        } catch (error: any) {
            return {
                success: false,
                language: 'javascript',
                output: logs.join('\n'),
                error: error.message,
                executionTime: Date.now() - startTime,
            };
        }
    }

    private async executePython(code: string, timeout: number, startTime: number): Promise<any> {
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `astralinks_py_${Date.now()}.py`);

        const wrappedCode = `
import sys
import json

try:
${code.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
`;

        await fs.writeFile(tempFile, wrappedCode, 'utf-8');

        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let killed = false;

            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            const proc = spawn(pythonCmd, [tempFile], { cwd: tempDir });

            const timeoutId = setTimeout(() => {
                killed = true;
                proc.kill('SIGTERM');
            }, timeout);

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', async (exitCode) => {
                clearTimeout(timeoutId);
                try { await fs.unlink(tempFile); } catch (e) { /* ignore */ }

                resolve({
                    success: exitCode === 0 && !killed,
                    language: 'python',
                    output: stdout,
                    error: killed ? `Execution timeout (${timeout}ms)` : (stderr || undefined),
                    exitCode,
                    executionTime: Date.now() - startTime,
                });
            });

            proc.on('error', async (err) => {
                clearTimeout(timeoutId);
                try { await fs.unlink(tempFile); } catch (e) { /* ignore */ }

                resolve({
                    success: false,
                    language: 'python',
                    output: '',
                    error: `Python execution failed: ${err.message}. Make sure Python is installed.`,
                    executionTime: Date.now() - startTime,
                });
            });
        });
    }

    /**
     * HTTP 请求
     */
    private async executeHttp(params: Record<string, any>): Promise<any> {
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
}

// 单例实例
export const mcpExecutor = new MCPExecutorService();
