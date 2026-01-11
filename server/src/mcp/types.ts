/**
 * MCP 双子架构 - 类型定义
 * 区分工作区 MCP 和聊天 MCP
 */

// MCP 作用域
export type MCPScope = 'workspace' | 'chat' | 'both';

// MCP 状态
export type MCPStatus = 'active' | 'inactive' | 'error' | 'loading';

// MCP 连接类型
export type MCPConnectionType = 'stdio' | 'http' | 'websocket' | 'builtin';

// MCP 权限类型
export type MCPPermissionType = 'network' | 'filesystem' | 'env' | 'exec' | 'database' | 'custom';

// MCP 工具参数类型
export type MCPParamType = 'string' | 'number' | 'boolean' | 'array' | 'object';

// MCP 工具参数定义
export interface MCPToolParam {
    name: string;
    type: MCPParamType;
    description: string;
    required: boolean;
    default?: unknown;
    enum?: string[];
    items?: MCPToolParam;
    properties?: Record<string, MCPToolParam>;
}

// MCP 工具定义
export interface MCPToolDefinition {
    name: string;
    description: string;
    parameters: MCPToolParam[];
    returns?: {
        type: MCPParamType;
        description?: string;
    };
}

// MCP 权限定义
export interface MCPPermission {
    type: MCPPermissionType;
    scope?: string;
    description?: string;
}

// MCP 连接配置
export interface MCPConnection {
    type: MCPConnectionType;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    handler?: string;
    timeout?: number;
}

// MCP 测试用例
export interface MCPTestCase {
    name: string;
    tool: string;
    input: Record<string, unknown>;
    expectedOutput?: unknown;
    shouldFail?: boolean;
}

// MCP 使用示例
export interface MCPExample {
    title: string;
    description?: string;
    tool: string;
    input: Record<string, unknown>;
    output?: unknown;
}

// MCP 包规范
export interface MCPPackageManifest {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    license: string;
    scope: MCPScope;
    homepage?: string;
    repository?: string;
    icon?: string;
    tags?: string[];
    permissions: MCPPermission[];
    tools: MCPToolDefinition[];
    testCases?: MCPTestCase[];
    examples?: MCPExample[];
    connection: MCPConnection;
}

// MCP 注册表条目
export interface MCPRegistryEntry {
    id: string;
    name: string;
    description: string;
    version: string;
    scope: MCPScope;
    status: MCPStatus;
    isBuiltin: boolean;
    isVerified: boolean;
    ratingScore: number;
    ratingCount: number;
    tools: MCPToolDefinition[];
    permissions: MCPPermission[];
    connection: MCPConnection;
    manifest?: MCPPackageManifest;
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
    stats?: {
        callCount: number;
        successRate: number;
        avgLatency: number;
        lastUsed?: string;
    };
}

// 用户 MCP 安装记录
export interface UserMCPInstall {
    id: string;
    userId: number;
    mcpId: string;
    scope: MCPScope;
    config: Record<string, unknown>;
    isEnabled: boolean;
    installedAt: string;
    lastUsedAt?: string;
}

// MCP 调用请求
export interface MCPCallRequest {
    mcpId: string;
    tool: string;
    params: Record<string, unknown>;
    scope: MCPScope;
    context?: {
        workspaceId?: string;
        conversationId?: string;
        workflowId?: string;
        nodeId?: string;
        userId?: number;
    };
}

// MCP 调用响应
export interface MCPCallResponse {
    success: boolean;
    result?: unknown;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    metadata: {
        duration: number;
        timestamp: string;
        mcpId: string;
        tool: string;
        scope: MCPScope;
    };
}

// MCP 调用日志
export interface MCPCallLog {
    id: number;
    userId: number;
    mcpId: string;
    toolName: string;
    scope: MCPScope;
    params: Record<string, unknown>;
    result?: unknown;
    status: 'success' | 'failed' | 'timeout' | 'permission_denied';
    latencyMs: number;
    errorMessage?: string;
    createdAt: string;
}

// MCP 市场来源
export interface MCPMarketplaceSource {
    id: string;
    name: string;
    type: 'official' | 'smithery' | 'mcp_so' | 'mcp_market' | 'custom';
    baseUrl: string;
    apiKeyEncrypted?: string;
    isEnabled: boolean;
    lastSyncAt?: string;
}

// MCP 执行器接口
export interface IMCPExecutor {
    execute(request: MCPCallRequest): Promise<MCPCallResponse>;
    getTools(): MCPToolDefinition[];
    validatePermissions(permissions: MCPPermission[]): boolean;
    healthCheck(): Promise<boolean>;
}

// 内置 Workspace MCP
export const WORKSPACE_MCPS: Partial<MCPRegistryEntry>[] = [
    {
        id: 'mcp-file-system',
        name: 'File System',
        description: '沙箱内文件系统操作',
        version: '1.0.0',
        scope: 'workspace',
        isBuiltin: true,
        tools: [
            {
                name: 'read_file',
                description: '读取文件内容',
                parameters: [
                    { name: 'path', type: 'string', description: '文件路径', required: true },
                    { name: 'encoding', type: 'string', description: '编码', required: false, default: 'utf-8' },
                ],
            },
            {
                name: 'write_file',
                description: '写入文件',
                parameters: [
                    { name: 'path', type: 'string', description: '文件路径', required: true },
                    { name: 'content', type: 'string', description: '内容', required: true },
                ],
            },
            {
                name: 'list_dir',
                description: '列出目录',
                parameters: [
                    { name: 'path', type: 'string', description: '目录路径', required: true },
                ],
            },
            {
                name: 'delete_file',
                description: '删除文件',
                parameters: [
                    { name: 'path', type: 'string', description: '文件路径', required: true },
                ],
            },
        ],
        permissions: [{ type: 'filesystem', scope: 'sandbox' }],
    },
    {
        id: 'mcp-code-executor',
        name: 'Code Executor',
        description: '安全代码执行（Python/JavaScript）',
        version: '1.0.0',
        scope: 'workspace',
        isBuiltin: true,
        tools: [
            {
                name: 'execute',
                description: '执行代码',
                parameters: [
                    { name: 'code', type: 'string', description: '代码内容', required: true },
                    { name: 'language', type: 'string', description: '语言', required: true, enum: ['python', 'javascript'] },
                    { name: 'timeout', type: 'number', description: '超时(ms)', required: false, default: 30000 },
                ],
            },
        ],
        permissions: [{ type: 'exec', scope: 'sandbox' }],
    },
    {
        id: 'mcp-database',
        name: 'Database',
        description: '数据库操作（沙箱SQLite）',
        version: '1.0.0',
        scope: 'workspace',
        isBuiltin: true,
        tools: [
            {
                name: 'query',
                description: '执行SQL查询',
                parameters: [
                    { name: 'sql', type: 'string', description: 'SQL语句', required: true },
                    { name: 'params', type: 'array', description: '参数', required: false },
                ],
            },
        ],
        permissions: [{ type: 'database', scope: 'sandbox' }],
    },
];

// 内置 Chat MCP
export const CHAT_MCPS: Partial<MCPRegistryEntry>[] = [
    {
        id: 'mcp-web-search',
        name: 'Web Search',
        description: '网页搜索（间接联网）',
        version: '1.0.0',
        scope: 'chat',
        isBuiltin: true,
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
        permissions: [{ type: 'network', scope: 'search-api' }],
    },
    {
        id: 'mcp-trends',
        name: 'Trending Topics',
        description: '获取热点趋势（微博/知乎/B站等）',
        version: '1.0.0',
        scope: 'chat',
        isBuiltin: true,
        tools: [
            {
                name: 'get_trends',
                description: '获取平台热榜',
                parameters: [
                    { name: 'platform', type: 'string', description: '平台', required: true, enum: ['weibo', 'zhihu', 'bilibili', 'douyin', 'baidu'] },
                    { name: 'limit', type: 'number', description: '数量', required: false, default: 20 },
                ],
            },
            {
                name: 'search_news',
                description: '搜索新闻',
                parameters: [
                    { name: 'keyword', type: 'string', description: '关键词', required: true },
                ],
            },
        ],
        permissions: [{ type: 'network', scope: 'trends-api' }],
    },
    {
        id: 'mcp-http-client',
        name: 'HTTP Client',
        description: 'HTTP请求（白名单URL）',
        version: '1.0.0',
        scope: 'chat',
        isBuiltin: true,
        tools: [
            {
                name: 'fetch',
                description: '发送HTTP请求',
                parameters: [
                    { name: 'url', type: 'string', description: 'URL', required: true },
                    { name: 'method', type: 'string', description: '方法', required: false, enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
                    { name: 'headers', type: 'object', description: '请求头', required: false },
                    { name: 'body', type: 'string', description: '请求体', required: false },
                ],
            },
        ],
        permissions: [{ type: 'network', scope: 'whitelist' }],
    },
    {
        id: 'mcp-calculator',
        name: 'Calculator',
        description: '数学计算',
        version: '1.0.0',
        scope: 'both',
        isBuiltin: true,
        tools: [
            {
                name: 'evaluate',
                description: '计算数学表达式',
                parameters: [
                    { name: 'expression', type: 'string', description: '表达式', required: true },
                ],
            },
        ],
        permissions: [],
    },
];
