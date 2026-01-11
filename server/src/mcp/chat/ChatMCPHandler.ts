/**
 * Chat MCP Handler - 聊天 MCP 处理器
 * 处理网页搜索、热点趋势、HTTP 客户端等间接联网操作
 */

import axios from 'axios';
import { MCPCallRequest } from '../types';

// DailyHotApi 配置
const DAILY_HOT_API_BASE = process.env.DAILY_HOT_API_BASE ?? 'http://localhost:6688';

// 平台端点映射
const PLATFORM_ENDPOINTS: Record<string, string> = {
    weibo: '/weibo',
    zhihu: '/zhihu',
    baidu: '/baidu',
    bilibili: '/bilibili',
    douyin: '/douyin',
    toutiao: '/toutiao',
    kr36: '/36kr',
    ithome: '/ithome',
    juejin: '/juejin',
    github: '/github'
};

// HTTP 白名单域名
const HTTP_WHITELIST = [
    'api.github.com',
    'api.openai.com',
    'generativelanguage.googleapis.com',
    'api.anthropic.com'
];

export class ChatMCPHandler {
    // 执行聊天 MCP 工具
    async execute(
        mcpId: string,
        tool: string,
        params: Record<string, unknown>,
        context?: MCPCallRequest['context']
    ): Promise<unknown> {
        switch (mcpId) {
            case 'mcp-web-search':
                return this.handleWebSearch(tool, params);
            case 'mcp-trends':
                return this.handleTrends(tool, params);
            case 'mcp-http-client':
                return this.handleHttpClient(tool, params);
            case 'mcp-calculator':
                return this.handleCalculator(tool, params);
            default:
                throw new Error(`Unknown chat MCP: ${mcpId}`);
        }
    }

    // 网页搜索
    private async handleWebSearch(
        tool: string,
        params: Record<string, unknown>
    ): Promise<unknown> {
        if (tool !== 'search') {
            throw new Error(`Unknown web search tool: ${tool}`);
        }

        const query = params.query as string;
        const engine = (params.engine as string) ?? 'duckduckgo';
        const limit = (params.limit as number) ?? 10;

        // 使用 DuckDuckGo Instant Answer API（无需 API Key）
        if (engine === 'duckduckgo') {
            return this.searchDuckDuckGo(query, limit);
        }

        // 其他搜索引擎需要 API Key 配置
        throw new Error(`Search engine ${engine} requires API key configuration`);
    }

    // DuckDuckGo 搜索
    private async searchDuckDuckGo(query: string, limit: number): Promise<unknown> {
        try {
            const response = await axios.get('https://api.duckduckgo.com/', {
                params: {
                    q: query,
                    format: 'json',
                    no_html: 1,
                    skip_disambig: 1
                },
                timeout: 10000
            });

            const data = response.data;
            const results: unknown[] = [];

            // Abstract (主要结果)
            if (data.Abstract) {
                results.push({
                    title: data.Heading ?? query,
                    url: data.AbstractURL,
                    description: data.Abstract,
                    source: data.AbstractSource
                });
            }

            // Related Topics
            if (data.RelatedTopics) {
                for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
                    if (topic.Text) {
                        results.push({
                            title: topic.Text.split(' - ')[0],
                            url: topic.FirstURL,
                            description: topic.Text
                        });
                    }
                }
            }

            return {
                query,
                engine: 'duckduckgo',
                results: results.slice(0, limit),
                timestamp: Date.now()
            };
        } catch (err) {
            throw new Error(`DuckDuckGo search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    // 热点趋势
    private async handleTrends(
        tool: string,
        params: Record<string, unknown>
    ): Promise<unknown> {
        switch (tool) {
            case 'get_trends': {
                const platform = params.platform as string;
                const limit = (params.limit as number) ?? 20;

                const endpoint = PLATFORM_ENDPOINTS[platform];
                if (!endpoint) {
                    throw new Error(`Unsupported platform: ${platform}`);
                }

                return this.fetchTrends(endpoint, platform, limit);
            }

            case 'search_news': {
                const keyword = params.keyword as string;
                // 使用头条搜索新闻
                return this.searchNews(keyword);
            }

            default:
                throw new Error(`Unknown trends tool: ${tool}`);
        }
    }

    // 获取热榜
    private async fetchTrends(endpoint: string, platform: string, limit: number): Promise<unknown> {
        try {
            const url = `${DAILY_HOT_API_BASE}${endpoint}`;
            const response = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': 'AstraLinks-MCP/1.0' }
            });

            const data = response.data;
            if (data.code === 200 && Array.isArray(data.data)) {
                const items = data.data.slice(0, limit).map((item: Record<string, unknown>) => ({
                    title: item.title ?? item.name,
                    url: item.url ?? item.mobileUrl,
                    hot: item.hot ?? item.hotNum,
                    description: item.desc ?? item.description,
                    cover: item.pic ?? item.cover
                }));

                return {
                    platform,
                    items,
                    timestamp: Date.now()
                };
            }

            return { platform, items: [], timestamp: Date.now() };
        } catch (err) {
            throw new Error(`Failed to fetch trends: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    // 搜索新闻
    private async searchNews(keyword: string): Promise<unknown> {
        // 简化实现：使用头条 API 搜索
        return {
            keyword,
            message: 'News search via DailyHotApi requires additional configuration',
            timestamp: Date.now()
        };
    }

    // HTTP 客户端
    private async handleHttpClient(
        tool: string,
        params: Record<string, unknown>
    ): Promise<unknown> {
        if (tool !== 'fetch') {
            throw new Error(`Unknown HTTP client tool: ${tool}`);
        }

        const url = params.url as string;
        const method = ((params.method as string) ?? 'GET').toUpperCase();
        const headers = (params.headers as Record<string, string>) ?? {};
        const body = params.body as string | undefined;

        // 白名单检查
        const urlObj = new URL(url);
        if (!HTTP_WHITELIST.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain))) {
            throw new Error(`URL not in whitelist: ${urlObj.hostname}`);
        }

        try {
            const response = await axios({
                url,
                method,
                headers,
                data: body,
                timeout: 30000,
                validateStatus: () => true
            });

            return {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                data: response.data
            };
        } catch (err) {
            throw new Error(`HTTP request failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    // 计算器
    private async handleCalculator(
        tool: string,
        params: Record<string, unknown>
    ): Promise<unknown> {
        if (tool !== 'evaluate') {
            throw new Error(`Unknown calculator tool: ${tool}`);
        }

        const expression = params.expression as string;

        // 安全检查：只允许数学表达式
        const safePattern = /^[0-9+\-*/().\s]+$/;
        if (!safePattern.test(expression)) {
            throw new Error('Invalid expression: only numbers and basic operators allowed');
        }

        try {
            // 使用 Function 安全执行数学表达式
            const result = new Function(`"use strict"; return (${expression})`)();

            if (typeof result !== 'number' || !isFinite(result)) {
                throw new Error('Invalid result');
            }

            return {
                expression,
                result,
                timestamp: Date.now()
            };
        } catch (err) {
            throw new Error(`Calculation failed: ${err instanceof Error ? err.message : 'Invalid expression'}`);
        }
    }
}
