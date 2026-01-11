/**
 * Workspace MCP Handler - 工作区 MCP 处理器
 * 处理沙箱内文件系统、代码执行、数据库等操作
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { MCPCallRequest } from '../types';

export class WorkspaceMCPHandler {
    private sandboxRoot: string;

    constructor() {
        // 沙箱根目录，生产环境应配置为 Docker 挂载点
        this.sandboxRoot = process.env.SANDBOX_ROOT ?? '/tmp/astralinks-sandbox';
    }

    // 执行工作区 MCP 工具
    async execute(
        mcpId: string,
        tool: string,
        params: Record<string, unknown>,
        context?: MCPCallRequest['context']
    ): Promise<unknown> {
        switch (mcpId) {
            case 'mcp-file-system':
                return this.handleFileSystem(tool, params, context);
            case 'mcp-code-executor':
                return this.handleCodeExecutor(tool, params, context);
            case 'mcp-database':
                return this.handleDatabase(tool, params, context);
            default:
                throw new Error(`Unknown workspace MCP: ${mcpId}`);
        }
    }

    // 文件系统操作
    private async handleFileSystem(
        tool: string,
        params: Record<string, unknown>,
        context?: MCPCallRequest['context']
    ): Promise<unknown> {
        const workspaceId = context?.workspaceId ?? 'default';
        const sandboxPath = path.join(this.sandboxRoot, workspaceId);

        // 确保沙箱目录存在
        await fs.mkdir(sandboxPath, { recursive: true });

        switch (tool) {
            case 'read_file': {
                const filePath = this.resolveSandboxPath(sandboxPath, params.path as string);
                const encoding = (params.encoding as BufferEncoding) ?? 'utf-8';
                const content = await fs.readFile(filePath, encoding);
                return { content, path: params.path };
            }

            case 'write_file': {
                const filePath = this.resolveSandboxPath(sandboxPath, params.path as string);
                const content = params.content as string;
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, content, 'utf-8');
                return { success: true, path: params.path };
            }

            case 'list_dir': {
                const dirPath = this.resolveSandboxPath(sandboxPath, params.path as string);
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                return {
                    path: params.path,
                    entries: entries.map(entry => ({
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file'
                    }))
                };
            }

            case 'delete_file': {
                const filePath = this.resolveSandboxPath(sandboxPath, params.path as string);
                await fs.unlink(filePath);
                return { success: true, path: params.path };
            }

            default:
                throw new Error(`Unknown file system tool: ${tool}`);
        }
    }

    // 代码执行
    private async handleCodeExecutor(
        tool: string,
        params: Record<string, unknown>,
        context?: MCPCallRequest['context']
    ): Promise<unknown> {
        if (tool !== 'execute') {
            throw new Error(`Unknown code executor tool: ${tool}`);
        }

        const code = params.code as string;
        const language = params.language as string;
        const timeout = (params.timeout as number) ?? 30000;

        switch (language) {
            case 'javascript':
                return this.executeJavaScript(code, timeout, context);
            case 'python':
                return this.executePython(code, timeout, context);
            default:
                throw new Error(`Unsupported language: ${language}`);
        }
    }

    // 执行 JavaScript
    private async executeJavaScript(
        code: string,
        timeout: number,
        context?: MCPCallRequest['context']
    ): Promise<unknown> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let output = '';
            let error = '';

            try {
                // 使用 Function 构造器创建沙箱环境
                // 注意：生产环境应使用 Docker/gVisor 沙箱
                const sandbox = {
                    console: {
                        log: (...args: unknown[]) => { output += args.map(String).join(' ') + '\n'; },
                        error: (...args: unknown[]) => { error += args.map(String).join(' ') + '\n'; }
                    },
                    setTimeout: undefined,
                    setInterval: undefined,
                    fetch: undefined,
                    require: undefined
                };

                const wrappedCode = `
                    "use strict";
                    const console = sandbox.console;
                    ${code}
                `;

                const fn = new Function('sandbox', wrappedCode);

                const timeoutId = setTimeout(() => {
                    resolve({
                        success: false,
                        language: 'javascript',
                        output,
                        error: `Execution timeout (${timeout}ms)`,
                        executionTime: Date.now() - startTime
                    });
                }, timeout);

                const result = fn(sandbox);
                clearTimeout(timeoutId);

                resolve({
                    success: true,
                    language: 'javascript',
                    output: output.trim(),
                    result,
                    executionTime: Date.now() - startTime
                });
            } catch (err) {
                resolve({
                    success: false,
                    language: 'javascript',
                    output,
                    error: err instanceof Error ? err.message : 'Execution failed',
                    executionTime: Date.now() - startTime
                });
            }
        });
    }

    // 执行 Python
    private async executePython(
        code: string,
        timeout: number,
        context?: MCPCallRequest['context']
    ): Promise<unknown> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';
            let killed = false;

            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            const proc = spawn(pythonCmd, ['-c', code], {
                cwd: this.sandboxRoot,
                env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
            });

            const timeoutId = setTimeout(() => {
                killed = true;
                proc.kill('SIGTERM');
            }, timeout);

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (exitCode) => {
                clearTimeout(timeoutId);
                resolve({
                    success: exitCode === 0 && !killed,
                    language: 'python',
                    output: stdout.trim(),
                    error: killed ? `Execution timeout (${timeout}ms)` : (stderr.trim() || undefined),
                    exitCode,
                    executionTime: Date.now() - startTime
                });
            });

            proc.on('error', (err) => {
                clearTimeout(timeoutId);
                resolve({
                    success: false,
                    language: 'python',
                    output: '',
                    error: `Python execution failed: ${err.message}`,
                    executionTime: Date.now() - startTime
                });
            });
        });
    }

    // 数据库操作（沙箱 SQLite）
    private async handleDatabase(
        tool: string,
        params: Record<string, unknown>,
        context?: MCPCallRequest['context']
    ): Promise<unknown> {
        if (tool !== 'query') {
            throw new Error(`Unknown database tool: ${tool}`);
        }

        // 使用 better-sqlite3 或类似库
        // 这里简化为返回模拟结果
        const sql = params.sql as string;
        const queryParams = params.params as unknown[];

        // 安全检查：禁止危险操作
        const dangerousPatterns = [/DROP\s+DATABASE/i, /DROP\s+TABLE/i, /TRUNCATE/i, /DELETE\s+FROM\s+\w+\s*$/i];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(sql)) {
                throw new Error('Dangerous SQL operation not allowed in sandbox');
            }
        }

        // TODO: 实现实际的 SQLite 执行
        return {
            success: true,
            message: 'SQLite sandbox not yet implemented',
            sql,
            params: queryParams
        };
    }

    // 解析沙箱路径（防止路径遍历攻击）
    private resolveSandboxPath(sandboxRoot: string, relativePath: string): string {
        const normalized = path.normalize(relativePath).replace(/^\.\.(\\|\/)?/, '');
        const fullPath = path.join(sandboxRoot, normalized);

        // 确保路径在沙箱内
        if (!fullPath.startsWith(sandboxRoot)) {
            throw new Error('Path traversal detected');
        }

        return fullPath;
    }
}
