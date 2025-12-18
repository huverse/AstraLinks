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
     * 网页搜索 (DuckDuckGo HTML + 内容抓取)
     */
    private async executeWebSearch(params: Record<string, any>): Promise<any> {
        const { query, limit = 5, fetchContent = true } = params;

        try {
            // Step 1: 使用 DuckDuckGo HTML 搜索获取真实结果
            const searchResults = await this.duckDuckGoHtmlSearch(query, limit);

            // Step 2: 抓取前几个结果的实际内容
            if (fetchContent && searchResults.length > 0) {
                const contentPromises = searchResults.slice(0, 3).map(async (result: any, index: number) => {
                    try {
                        const content = await this.fetchPageContent(result.url);
                        return { ...result, content, contentFetched: true };
                    } catch (e) {
                        return { ...result, content: null, contentFetched: false };
                    }
                });

                const resultsWithContent = await Promise.all(contentPromises);
                // 合并有内容的和没有抓取的
                const remaining = searchResults.slice(3).map((r: any) => ({ ...r, content: null, contentFetched: false }));
                const allResults = [...resultsWithContent, ...remaining];

                // Step 3: 生成合成上下文供 AI 使用
                const synthesizedContext = this.synthesizeSearchContext(query, allResults);

                return {
                    query,
                    engine: 'duckduckgo',
                    results: allResults,
                    totalResults: allResults.length,
                    synthesizedContext,
                    hasContent: resultsWithContent.some((r: any) => r.content)
                };
            }

            return {
                query,
                engine: 'duckduckgo',
                results: searchResults,
                totalResults: searchResults.length,
                synthesizedContext: this.synthesizeSearchContext(query, searchResults),
                hasContent: false
            };
        } catch (error: any) {
            console.error('[Web Search] Error:', error.message);
            // 降级到 Instant Answer API
            return this.duckDuckGoInstantAnswer(query, limit);
        }
    }

    /**
     * DuckDuckGo HTML 搜索 - 解析真实搜索结果
     */
    private async duckDuckGoHtmlSearch(query: string, limit: number): Promise<any[]> {
        const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        const response = await fetch(htmlUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            },
        });

        if (!response.ok) {
            throw new Error(`DuckDuckGo HTML search failed: ${response.status}`);
        }

        const html = await response.text();
        const results: any[] = [];

        // 解析搜索结果 - DuckDuckGo HTML 格式
        // 结果在 <div class="result"> 或 <div class="links_main"> 中
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;
        const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

        // 更简单的正则来匹配结果
        const simpleResultRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
        const simpleSnippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

        let match;
        const titles: string[] = [];
        const urls: string[] = [];
        const snippets: string[] = [];

        // 提取标题和URL
        while ((match = simpleResultRegex.exec(html)) !== null && urls.length < limit) {
            let url = match[1];
            // DuckDuckGo 使用重定向 URL，需要解码
            if (url.includes('uddg=')) {
                const decoded = decodeURIComponent(url.split('uddg=')[1]?.split('&')[0] || url);
                url = decoded;
            }
            urls.push(url);
            titles.push(this.cleanHtml(match[2]));
        }

        // 提取摘要
        while ((match = simpleSnippetRegex.exec(html)) !== null && snippets.length < limit) {
            snippets.push(this.cleanHtml(match[1]));
        }

        // 组合结果
        for (let i = 0; i < Math.min(urls.length, limit); i++) {
            results.push({
                title: titles[i] || `Result ${i + 1}`,
                url: urls[i],
                snippet: snippets[i] || '',
                source: 'DuckDuckGo',
            });
        }

        return results;
    }

    /**
     * 抓取网页内容
     */
    private async fetchPageContent(url: string): Promise<string | null> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; AstraLinksBot/1.0)',
                    'Accept': 'text/html,application/xhtml+xml',
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) return null;

            const html = await response.text();

            // 提取主要内容
            let content = this.extractMainContent(html);

            // 限制长度
            if (content.length > 2000) {
                content = content.substring(0, 2000) + '...';
            }

            return content || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 从 HTML 提取主要文本内容
     */
    private extractMainContent(html: string): string {
        // 移除 script 和 style 标签
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

        // 尝试提取 <article> 或 <main> 内容
        const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

        if (articleMatch) {
            text = articleMatch[1];
        } else if (mainMatch) {
            text = mainMatch[1];
        }

        // 清理 HTML 标签
        text = this.cleanHtml(text);

        // 清理多余空白
        text = text.replace(/\s+/g, ' ').trim();

        return text;
    }

    /**
     * 清理 HTML 标签
     */
    private cleanHtml(html: string): string {
        return html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * 合成搜索上下文供 AI 使用
     */
    private synthesizeSearchContext(query: string, results: any[]): string {
        let context = `【网页搜索结果】查询: "${query}"\n\n`;

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            context += `--- 结果 ${i + 1} ---\n`;
            context += `标题: ${r.title}\n`;
            context += `来源: ${r.url}\n`;
            if (r.snippet) {
                context += `摘要: ${r.snippet}\n`;
            }
            if (r.content) {
                context += `内容:\n${r.content}\n`;
            }
            context += '\n';
        }

        return context;
    }

    /**
     * DuckDuckGo Instant Answer API (降级方案)
     */
    private async duckDuckGoInstantAnswer(query: string, limit: number): Promise<any> {
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

        return {
            query,
            engine: 'duckduckgo',
            results: results.slice(0, limit),
            totalResults: results.length,
            synthesizedContext: this.synthesizeSearchContext(query, results),
            hasContent: false
        };
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
