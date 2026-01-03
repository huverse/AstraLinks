/**
 * Smithery API 服务
 *
 * @module server/src/services/smitheryService
 * @description 与 Smithery.ai MCP 市场集成
 */

import axios from 'axios';

// ============================================
// 配置
// ============================================

// 默认 Smithery API 地址，可通过 SMITHERY_PROXY_URL 配置反向代理
// 注意：在中国大陆，registry.smithery.ai 可能无法访问，建议配置代理
const SMITHERY_API_BASE = process.env.SMITHERY_PROXY_URL || 'https://registry.smithery.ai';
const SMITHERY_API_KEY = process.env.SMITHERY_API_KEY || '';
const SMITHERY_TIMEOUT_MS = 5000;

// ============================================
// 类型定义
// ============================================

export interface SmitheryServer {
    qualifiedName: string;
    displayName: string;
    description?: string;
    homepage?: string;
    useCount?: number;
    isDeployed?: boolean;
    isVerified?: boolean;
    createdAt?: string;
    tools?: SmitheryTool[];
    connections?: SmitheryConnection[];
}

export interface SmitheryTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, any>;
}

export interface SmitheryConnection {
    type: string;
    url?: string;
    configSchema?: Record<string, any>;
}

export interface SmitherySearchResult {
    servers: SmitheryServer[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalPages: number;
        totalCount: number;
    };
}

// ============================================
// 内置 MCP 工具（离线后备）
// ============================================

type BuiltinSmitheryServer = SmitheryServer & { isBuiltin: boolean };

const BUILTIN_MCPS: BuiltinSmitheryServer[] = [
    {
        qualifiedName: 'builtin/web-search',
        displayName: 'Web Search',
        description: '网页搜索工具，支持 Google/Bing/DuckDuckGo',
        useCount: 1000,
        isDeployed: true,
        isVerified: true,
        isBuiltin: true,
        tools: [
            { name: 'search', description: '搜索网页' },
        ],
    },
    {
        qualifiedName: 'builtin/file-system',
        displayName: 'File System',
        description: '文件系统操作 (沙箱内)',
        useCount: 800,
        isDeployed: true,
        isVerified: true,
        isBuiltin: true,
        tools: [
            { name: 'read', description: '读取文件' },
            { name: 'write', description: '写入文件' },
            { name: 'list', description: '列出目录' },
        ],
    },
    {
        qualifiedName: 'builtin/code-executor',
        displayName: 'Code Executor',
        description: '安全代码执行 (JavaScript/Python)',
        useCount: 600,
        isDeployed: true,
        isVerified: true,
        isBuiltin: true,
        tools: [
            { name: 'execute', description: '执行代码' },
        ],
    },
    {
        qualifiedName: 'builtin/http-client',
        displayName: 'HTTP Client',
        description: 'HTTP 请求工具',
        useCount: 500,
        isDeployed: true,
        isVerified: true,
        isBuiltin: true,
        tools: [
            { name: 'request', description: '发送 HTTP 请求' },
        ],
    },
];

// ============================================
// 辅助函数
// ============================================

/**
 * 构建 Smithery API 请求头
 */
function buildSmitheryHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'AstraLinks/1.0',
    };

    if (SMITHERY_API_KEY) {
        headers['Authorization'] = `Bearer ${SMITHERY_API_KEY}`;
    }

    return headers;
}

/**
 * 过滤内置 MCP 服务器
 */
function filterBuiltinServers(query: string): BuiltinSmitheryServer[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return BUILTIN_MCPS;
    }

    return BUILTIN_MCPS.filter(m =>
        m.displayName.toLowerCase().includes(normalized) ||
        m.qualifiedName.toLowerCase().includes(normalized) ||
        m.description?.toLowerCase().includes(normalized)
    );
}

/**
 * 查找内置 MCP 服务器
 */
function findBuiltinServer(serverId: string): BuiltinSmitheryServer | undefined {
    return BUILTIN_MCPS.find(m => m.qualifiedName === serverId);
}

// ============================================
// API 函数
// ============================================

/**
 * 搜索 Smithery MCP 服务器
 */
export async function searchServers(
    query: string = '',
    page: number = 1,
    pageSize: number = 20
): Promise<SmitherySearchResult> {
    try {
        const params = new URLSearchParams({
            q: query,
            page: String(page),
            pageSize: String(pageSize),
        });

        const response = await axios.get(`${SMITHERY_API_BASE}/servers?${params}`, {
            headers: buildSmitheryHeaders(),
            timeout: SMITHERY_TIMEOUT_MS,
        });

        // 适配 Smithery API 响应格式
        const data = response.data ?? {};
        const servers = Array.isArray(data?.servers)
            ? data.servers
            : Array.isArray(data?.items)
                ? data.items
                : Array.isArray(data)
                    ? data
                    : [];

        return {
            servers,
            pagination: {
                currentPage: data.page || page,
                pageSize: data.pageSize || pageSize,
                totalPages: data.totalPages || 1,
                totalCount: data.totalCount || servers.length,
            },
        };
    } catch (error: any) {
        console.error('[Smithery] Search error:', error.message);
        console.error('[Smithery] API may be unreachable. Check SMITHERY_PROXY_URL or SMITHERY_API_KEY in .env');

        // 降级: 返回内置 MCP 工具作为后备
        const filtered = filterBuiltinServers(query);

        return {
            servers: filtered,
            pagination: {
                currentPage: page,
                pageSize: pageSize,
                totalPages: 1,
                totalCount: filtered.length,
            },
        };
    }
}

/**
 * 获取 MCP 服务器详情
 */
export async function getServerDetails(serverId: string): Promise<SmitheryServer | null> {
    try {
        // 先检查是否为内置服务器
        const builtin = findBuiltinServer(serverId);
        if (builtin) {
            return builtin;
        }

        const response = await axios.get(`${SMITHERY_API_BASE}/servers/${encodeURIComponent(serverId)}`, {
            headers: buildSmitheryHeaders(),
            timeout: SMITHERY_TIMEOUT_MS,
        });
        return response.data;
    } catch (error: any) {
        console.error('[Smithery] Get server details error:', error.message);
        // 降级: 尝试返回内置服务器
        const builtin = findBuiltinServer(serverId);
        return builtin || null;
    }
}

/**
 * 获取热门 MCP
 */
export async function getPopularServers(limit: number = 20): Promise<SmitheryServer[]> {
    try {
        const result = await searchServers('', 1, limit);

        // 按使用量排序
        return result.servers.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
    } catch (error: any) {
        console.error('[Smithery] Get popular servers error:', error.message);
        return [];
    }
}

/**
 * 按分类搜索 MCP
 */
export async function searchByCategory(
    category: string,
    page: number = 1,
    pageSize: number = 20
): Promise<SmitherySearchResult> {
    // Smithery 支持 tag 搜索
    return searchServers(`tag:${category}`, page, pageSize);
}

/**
 * 检查 Smithery API 是否可用
 */
export async function checkApiHealth(): Promise<boolean> {
    try {
        const response = await axios.get(`${SMITHERY_API_BASE}/servers?pageSize=1`, {
            headers: buildSmitheryHeaders(),
            timeout: SMITHERY_TIMEOUT_MS,
        });
        return response.status === 200;
    } catch {
        return false;
    }
}
