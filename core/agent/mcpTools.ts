/**
 * Agent MCP 工具集成
 * 
 * @module core/agent/mcpTools
 * @description 为 Agent 提供 MCP 工具调用能力 (函数调用格式)
 */

import { mcpRegistry, mcpExecutor } from '../mcp/registry';
import { MCPRegistryEntry, MCPTool } from '../mcp/types';

// ============================================
// 类型定义
// ============================================

export interface MCPToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
        };
    };
}

export interface MCPToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface MCPToolResult {
    tool_call_id: string;
    role: 'tool';
    content: string;
}

// ============================================
// 工具定义生成
// ============================================

/**
 * 将 MCP 工具转换为 OpenAI 函数调用格式
 */
export function mcpToFunctionDefinition(mcp: MCPRegistryEntry, tool: MCPTool): MCPToolDefinition {
    // 将 MCPTool parameters 转换为 OpenAI 格式
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
        properties[param.name] = {
            type: param.type,
            description: param.description,
        };
        if (param.required) {
            required.push(param.name);
        }
    }

    return {
        type: 'function',
        function: {
            name: `${mcp.id}__${tool.name}`,
            description: `[${mcp.name}] ${tool.description}`,
            parameters: {
                type: 'object',
                properties,
                required,
            },
        },
    };
}

/**
 * 获取所有可用的 MCP 工具定义 (用于 AI 函数调用)
 */
export async function getAvailableMCPTools(): Promise<MCPToolDefinition[]> {
    await mcpRegistry.initialize();
    const mcps = mcpRegistry.getAll().filter(m => m.status === 'active');

    const tools: MCPToolDefinition[] = [];

    for (const mcp of mcps) {
        for (const tool of mcp.tools) {
            tools.push(mcpToFunctionDefinition(mcp, tool));
        }
    }

    return tools;
}

/**
 * 获取指定 MCP 的工具定义
 */
export async function getMCPToolsForAgent(mcpIds: string[]): Promise<MCPToolDefinition[]> {
    await mcpRegistry.initialize();

    const tools: MCPToolDefinition[] = [];

    for (const mcpId of mcpIds) {
        const mcp = mcpRegistry.get(mcpId);
        if (mcp && mcp.status === 'active') {
            for (const tool of mcp.tools) {
                tools.push(mcpToFunctionDefinition(mcp, tool));
            }
        }
    }

    return tools;
}

// ============================================
// 工具调用执行
// ============================================

/**
 * 执行 MCP 工具调用
 */
export async function executeMCPToolCall(toolCall: MCPToolCall): Promise<MCPToolResult> {
    const { name, arguments: argsJson } = toolCall.function;

    // 解析工具名称 (格式: mcpId__toolName)
    const separatorIndex = name.indexOf('__');
    if (separatorIndex === -1) {
        return {
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify({ error: `Invalid tool name format: ${name}` }),
        };
    }

    const mcpId = name.substring(0, separatorIndex);
    const toolName = name.substring(separatorIndex + 2);

    // 解析参数
    let params: Record<string, any>;
    try {
        params = JSON.parse(argsJson);
    } catch {
        params = {};
    }

    // 执行工具
    try {
        const response = await mcpExecutor.call({
            mcpId,
            tool: toolName,
            params,
        });

        if (response.success) {
            return {
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify(response.result),
            };
        } else {
            return {
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify({ error: response.error?.message || 'Tool execution failed' }),
            };
        }
    } catch (error: any) {
        return {
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify({ error: error.message }),
        };
    }
}

/**
 * 批量执行 MCP 工具调用
 */
export async function executeMCPToolCalls(toolCalls: MCPToolCall[]): Promise<MCPToolResult[]> {
    return Promise.all(toolCalls.map(tc => executeMCPToolCall(tc)));
}

// ============================================
// Agent 增强
// ============================================

/**
 * 为 Agent 系统提示词添加 MCP 工具说明
 */
export function enhanceSystemPromptWithMCPTools(
    systemPrompt: string,
    mcpIds?: string[]
): string {
    const tools = mcpRegistry.getAll()
        .filter(m => m.status === 'active')
        .filter(m => !mcpIds || mcpIds.includes(m.id));

    if (tools.length === 0) {
        return systemPrompt;
    }

    const toolDescriptions = tools.map(mcp => {
        const toolList = mcp.tools.map(t => `  - ${t.name}: ${t.description}`).join('\n');
        return `【${mcp.name}】\n${toolList}`;
    }).join('\n\n');

    return `${systemPrompt}

你可以使用以下 MCP 工具来完成任务:

${toolDescriptions}

使用工具时，请调用相应的函数。`;
}

/**
 * 创建 MCP 工具感知的 Agent 配置
 */
export interface MCPEnabledAgentConfig {
    enableMCP: boolean;
    mcpIds?: string[];
    autoToolExecution: boolean;
}

export const defaultMCPAgentConfig: MCPEnabledAgentConfig = {
    enableMCP: true,
    mcpIds: undefined, // undefined = 所有可用 MCP
    autoToolExecution: true,
};
