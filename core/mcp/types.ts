/**
 * MCP (Model Context Protocol) 核心类型定义
 * 
 * @module core/mcp/types
 * @description MCP 注册表、工具和能力类型
 */

// ============================================
// MCP 基础类型
// ============================================

/** MCP 提供者类型 */
export type MCPProviderType = 'builtin' | 'custom' | 'marketplace';

/** MCP 状态 */
export type MCPStatus = 'active' | 'inactive' | 'error' | 'loading';

/** MCP 工具参数类型 */
export type MCPParamType = 'string' | 'number' | 'boolean' | 'array' | 'object';

// ============================================
// MCP 工具定义
// ============================================

/** MCP 工具参数 */
export interface MCPToolParam {
    name: string;
    type: MCPParamType;
    description: string;
    required: boolean;
    default?: any;
    enum?: string[];
    items?: MCPToolParam; // For array type
    properties?: Record<string, MCPToolParam>; // For object type
}

/** MCP 工具定义 */
export interface MCPTool {
    name: string;
    description: string;
    parameters: MCPToolParam[];
    returns?: {
        type: MCPParamType;
        description?: string;
    };
}

// ============================================
// MCP 注册条目
// ============================================

/** MCP 注册条目 */
export interface MCPRegistryEntry {
    id: string;
    name: string;
    description: string;
    version: string;
    providerType: MCPProviderType;
    status: MCPStatus;

    /** 工具列表 */
    tools: MCPTool[];

    /** 连接配置 */
    connection: MCPConnection;

    /** 权限要求 */
    permissions: MCPPermission[];

    /** 元数据 */
    metadata: {
        author?: string;
        homepage?: string;
        repository?: string;
        license?: string;
        tags?: string[];
        icon?: string;
        createdAt: string;
        updatedAt: string;
    };

    /** 使用统计 */
    stats?: {
        callCount: number;
        successRate: number;
        avgLatency: number;
        lastUsed?: string;
    };
}

/** MCP 连接配置 */
export interface MCPConnection {
    type: 'stdio' | 'http' | 'websocket' | 'function';

    /** stdio 连接 */
    command?: string;
    args?: string[];
    env?: Record<string, string>;

    /** HTTP/WebSocket 连接 */
    url?: string;
    headers?: Record<string, string>;

    /** 函数连接 (内置 MCP) */
    handler?: string;

    /** 超时设置 (ms) */
    timeout?: number;
}

/** MCP 权限 */
export interface MCPPermission {
    type: 'network' | 'filesystem' | 'env' | 'exec' | 'custom';
    scope?: string;
    description?: string;
}

// ============================================
// MCP 调用相关
// ============================================

/** MCP 调用请求 */
export interface MCPCallRequest {
    mcpId: string;
    tool: string;
    params: Record<string, any>;
    context?: {
        workflowId?: string;
        executionId?: string;
        nodeId?: string;
    };
}

/** MCP 调用响应 */
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
// 用户 MCP 设置
// ============================================

/** 用户 MCP 配置 */
export interface UserMCPConfig {
    mcpId: string;
    enabled: boolean;
    customSettings?: Record<string, any>;
    apiKeys?: Record<string, string>;
}

// ============================================
// 内置 MCP 列表
// ============================================

export const BUILTIN_MCPS: Partial<MCPRegistryEntry>[] = [
    {
        id: 'mcp-web-search',
        name: 'Web Search',
        description: '网页搜索工具，支持 Google/Bing/DuckDuckGo',
        version: '1.0.0',
        providerType: 'builtin',
        tools: [
            {
                name: 'search',
                description: '搜索网页',
                parameters: [
                    { name: 'query', type: 'string', description: '搜索关键词', required: true },
                    { name: 'engine', type: 'string', description: '搜索引擎', required: false, enum: ['google', 'bing', 'duckduckgo'] },
                    { name: 'limit', type: 'number', description: '结果数量', required: false, default: 10 },
                ],
            },
        ],
        permissions: [{ type: 'network', scope: '*', description: '访问搜索API' }],
    },
    {
        id: 'mcp-file-system',
        name: 'File System',
        description: '文件系统操作 (沙箱内)',
        version: '1.0.0',
        providerType: 'builtin',
        tools: [
            {
                name: 'read',
                description: '读取文件',
                parameters: [
                    { name: 'path', type: 'string', description: '文件路径', required: true },
                ],
            },
            {
                name: 'write',
                description: '写入文件',
                parameters: [
                    { name: 'path', type: 'string', description: '文件路径', required: true },
                    { name: 'content', type: 'string', description: '文件内容', required: true },
                ],
            },
            {
                name: 'list',
                description: '列出目录',
                parameters: [
                    { name: 'path', type: 'string', description: '目录路径', required: true },
                ],
            },
        ],
        permissions: [{ type: 'filesystem', scope: 'sandbox', description: '沙箱文件系统访问' }],
    },
    {
        id: 'mcp-code-exec',
        name: 'Code Executor',
        description: '安全代码执行 (isolated-vm)',
        version: '1.0.0',
        providerType: 'builtin',
        tools: [
            {
                name: 'execute',
                description: '执行代码',
                parameters: [
                    { name: 'code', type: 'string', description: '代码内容', required: true },
                    { name: 'language', type: 'string', description: '编程语言', required: false, enum: ['javascript', 'python'], default: 'javascript' },
                    { name: 'timeout', type: 'number', description: '超时 (ms)', required: false, default: 5000 },
                ],
            },
        ],
        permissions: [{ type: 'exec', scope: 'sandbox', description: '沙箱代码执行' }],
    },
    {
        id: 'mcp-http',
        name: 'HTTP Client',
        description: 'HTTP 请求工具',
        version: '1.0.0',
        providerType: 'builtin',
        tools: [
            {
                name: 'request',
                description: '发送 HTTP 请求',
                parameters: [
                    { name: 'url', type: 'string', description: 'URL', required: true },
                    { name: 'method', type: 'string', description: '方法', required: false, enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
                    { name: 'headers', type: 'object', description: '请求头', required: false },
                    { name: 'body', type: 'string', description: '请求体', required: false },
                ],
            },
        ],
        permissions: [{ type: 'network', scope: '*', description: '访问外部网络' }],
    },
];
