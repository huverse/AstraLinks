/**
 * MCP Executor - MCP 执行器
 * 统一执行 MCP 工具调用，支持内置和第三方 MCP
 */

import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import { pool } from '../config/database';
import {
    MCPScope,
    MCPCallRequest,
    MCPCallResponse,
    MCPRegistryEntry,
    MCPToolDefinition,
    MCPPermission,
    MCPConnectionType
} from './types';
import { mcpRegistry } from './MCPRegistry';
import { WorkspaceMCPHandler } from './workspace/WorkspaceMCPHandler';
import { ChatMCPHandler } from './chat/ChatMCPHandler';

export class MCPExecutor {
    private workspaceHandler: WorkspaceMCPHandler;
    private chatHandler: ChatMCPHandler;
    private stdioProcesses: Map<string, ChildProcess> = new Map();

    constructor() {
        this.workspaceHandler = new WorkspaceMCPHandler();
        this.chatHandler = new ChatMCPHandler();
    }

    // 执行 MCP 工具调用
    async execute(request: MCPCallRequest): Promise<MCPCallResponse> {
        const startTime = Date.now();
        const timestamp = new Date().toISOString();

        try {
            // 获取 MCP 定义
            const mcp = await mcpRegistry.getMCP(request.mcpId);
            if (!mcp) {
                return this.errorResponse(request, 'MCP_NOT_FOUND', 'MCP not found', startTime, timestamp);
            }

            // 检查作用域权限
            if (!this.checkScope(mcp, request.scope)) {
                return this.errorResponse(request, 'SCOPE_MISMATCH', `MCP scope mismatch: expected ${mcp.scope}, got ${request.scope}`, startTime, timestamp);
            }

            // 查找工具定义
            const tool = mcp.tools.find(t => t.name === request.tool);
            if (!tool) {
                return this.errorResponse(request, 'TOOL_NOT_FOUND', `Tool ${request.tool} not found in MCP ${request.mcpId}`, startTime, timestamp);
            }

            // 验证参数
            const paramError = this.validateParams(tool, request.params);
            if (paramError) {
                return this.errorResponse(request, 'INVALID_PARAMS', paramError, startTime, timestamp);
            }

            // 执行工具
            let result: unknown;
            if (mcp.isBuiltin) {
                result = await this.executeBuiltin(mcp, request);
            } else {
                result = await this.executeExternal(mcp, request);
            }

            // 记录使用
            if (request.context?.userId) {
                await mcpRegistry.recordUsage(request.context.userId, request.mcpId);
            }

            // 记录调用日志
            await this.logCall(request, 'success', result, Date.now() - startTime);

            return {
                success: true,
                result,
                metadata: {
                    duration: Date.now() - startTime,
                    timestamp,
                    mcpId: request.mcpId,
                    tool: request.tool,
                    scope: request.scope
                }
            };
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Unknown error';
            await this.logCall(request, 'failed', null, Date.now() - startTime, error);
            return this.errorResponse(request, 'EXECUTION_ERROR', error, startTime, timestamp);
        }
    }

    // 执行内置 MCP
    private async executeBuiltin(mcp: MCPRegistryEntry, request: MCPCallRequest): Promise<unknown> {
        // 根据作用域分发到不同处理器
        if (mcp.scope === 'workspace') {
            return this.workspaceHandler.execute(mcp.id, request.tool, request.params, request.context);
        } else if (mcp.scope === 'chat') {
            return this.chatHandler.execute(mcp.id, request.tool, request.params, request.context);
        } else {
            // 'both' 类型根据请求作用域选择
            if (request.scope === 'workspace') {
                return this.workspaceHandler.execute(mcp.id, request.tool, request.params, request.context);
            } else {
                return this.chatHandler.execute(mcp.id, request.tool, request.params, request.context);
            }
        }
    }

    // 执行外部 MCP（stdio/http/websocket）
    private async executeExternal(mcp: MCPRegistryEntry, request: MCPCallRequest): Promise<unknown> {
        const connection = mcp.connection;

        switch (connection.type) {
            case 'stdio':
                return this.executeStdio(mcp, request);
            case 'http':
                return this.executeHttp(mcp, request);
            case 'websocket':
                return this.executeWebsocket(mcp, request);
            default:
                throw new Error(`Unsupported connection type: ${connection.type}`);
        }
    }

    // stdio 方式执行
    private async executeStdio(mcp: MCPRegistryEntry, request: MCPCallRequest): Promise<unknown> {
        const connection = mcp.connection;
        if (!connection.command) {
            throw new Error('stdio MCP missing command');
        }

        return new Promise((resolve, reject) => {
            const args = connection.args ?? [];
            const env = { ...process.env, ...connection.env };
            const timeout = connection.timeout ?? 30000;

            const proc = spawn(connection.command!, args, { env });
            let stdout = '';
            let stderr = '';
            let timedOut = false;

            const timeoutId = setTimeout(() => {
                timedOut = true;
                proc.kill('SIGTERM');
                reject(new Error(`MCP execution timeout (${timeout}ms)`));
            }, timeout);

            // 发送请求
            const mcpRequest = JSON.stringify({
                jsonrpc: '2.0',
                method: request.tool,
                params: request.params,
                id: Date.now()
            });
            proc.stdin.write(mcpRequest + '\n');
            proc.stdin.end();

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                clearTimeout(timeoutId);
                if (timedOut) return;

                if (code !== 0) {
                    reject(new Error(`MCP process exited with code ${code}: ${stderr}`));
                    return;
                }

                try {
                    const response = JSON.parse(stdout);
                    if (response.error) {
                        reject(new Error(response.error.message ?? 'MCP returned error'));
                    } else {
                        resolve(response.result);
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse MCP response: ${stdout}`));
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        });
    }

    // HTTP 方式执行
    private async executeHttp(mcp: MCPRegistryEntry, request: MCPCallRequest): Promise<unknown> {
        const connection = mcp.connection;
        if (!connection.url) {
            throw new Error('HTTP MCP missing URL');
        }

        const response = await axios.post(
            connection.url,
            {
                jsonrpc: '2.0',
                method: request.tool,
                params: request.params,
                id: Date.now()
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    ...connection.headers
                },
                timeout: connection.timeout ?? 30000
            }
        );

        if (response.data.error) {
            throw new Error(response.data.error.message ?? 'MCP returned error');
        }

        return response.data.result;
    }

    // WebSocket 方式执行 (简化实现，生产环境需要连接池)
    private async executeWebsocket(mcp: MCPRegistryEntry, request: MCPCallRequest): Promise<unknown> {
        throw new Error('WebSocket MCP not yet implemented');
    }

    // 检查作用域
    private checkScope(mcp: MCPRegistryEntry, requestScope: MCPScope): boolean {
        if (mcp.scope === 'both') return true;
        return mcp.scope === requestScope;
    }

    // 验证参数
    private validateParams(tool: MCPToolDefinition, params: Record<string, unknown>): string | null {
        for (const param of tool.parameters) {
            if (param.required && !(param.name in params)) {
                return `Missing required parameter: ${param.name}`;
            }

            if (param.name in params) {
                const value = params[param.name];
                if (!this.validateParamType(value, param.type)) {
                    return `Invalid type for parameter ${param.name}: expected ${param.type}`;
                }

                if (param.enum && !param.enum.includes(String(value))) {
                    return `Invalid value for parameter ${param.name}: must be one of ${param.enum.join(', ')}`;
                }
            }
        }
        return null;
    }

    // 验证参数类型
    private validateParamType(value: unknown, expectedType: string): boolean {
        switch (expectedType) {
            case 'string': return typeof value === 'string';
            case 'number': return typeof value === 'number';
            case 'boolean': return typeof value === 'boolean';
            case 'array': return Array.isArray(value);
            case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
            default: return true;
        }
    }

    // 记录调用日志
    private async logCall(
        request: MCPCallRequest,
        status: 'success' | 'failed' | 'timeout' | 'permission_denied',
        result: unknown,
        latencyMs: number,
        errorMessage?: string
    ): Promise<void> {
        try {
            await pool.execute(
                `INSERT INTO mcp_call_logs
                 (user_id, mcp_id, tool_name, scope, params_json, result_json, status, latency_ms, error_message)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    request.context?.userId ?? 0,
                    request.mcpId,
                    request.tool,
                    request.scope,
                    JSON.stringify(request.params),
                    result ? JSON.stringify(result) : null,
                    status,
                    latencyMs,
                    errorMessage
                ]
            );
        } catch (err) {
            console.error('[MCPExecutor] Failed to log call:', err);
        }
    }

    // 构建错误响应
    private errorResponse(
        request: MCPCallRequest,
        code: string,
        message: string,
        startTime: number,
        timestamp: string
    ): MCPCallResponse {
        return {
            success: false,
            error: { code, message },
            metadata: {
                duration: Date.now() - startTime,
                timestamp,
                mcpId: request.mcpId,
                tool: request.tool,
                scope: request.scope
            }
        };
    }

    // 批量执行
    async executeBatch(requests: MCPCallRequest[]): Promise<MCPCallResponse[]> {
        return Promise.all(requests.map(req => this.execute(req)));
    }

    // 获取可用工具列表
    async getAvailableTools(userId: number, scope: MCPScope): Promise<{ mcpId: string; tools: MCPToolDefinition[] }[]> {
        const mcps = await mcpRegistry.getAvailableMCPsForUser(userId, scope);
        return mcps.map(mcp => ({
            mcpId: mcp.id,
            tools: mcp.tools
        }));
    }
}

// 单例
export const mcpExecutor = new MCPExecutor();
