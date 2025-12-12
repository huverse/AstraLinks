import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';

const router = Router();

/**
 * MCP Trends Hub Integration
 * Provides access to trending topics from multiple Chinese platforms
 * @see https://github.com/baranwang/mcp-trends-hub
 */

interface TrendItem {
    title: string;
    url: string;
    hot?: string | number;
    cover?: string;
    description?: string;
}

interface MCPToolResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
}

// Available MCP tools from trends-hub
const MCP_TOOLS = [
    'get-weibo-trending',
    'get-zhihu-trending',
    'get-baidu-trending',
    'get-bilibili-trending',
    'get-douyin-trending',
    'get-toutiao-trending',
    'get-36kr-trending',
    'get-ithome-trending',
    'get-v2ex-trending',
    'get-github-trending',
    'get-juejin-trending',
    'get-hacker-news',
    'get-producthunt-trending'
] as const;

type MCPToolName = typeof MCP_TOOLS[number];

/**
 * GET /api/mcp/trends
 * Get trending topics from a specific platform
 */
router.get('/trends/:platform', async (req: Request, res: Response) => {
    try {
        const { platform } = req.params;
        const toolName = `get-${platform}-trending` as MCPToolName;

        if (!MCP_TOOLS.includes(toolName)) {
            res.status(400).json({
                error: '不支持的平台',
                supportedPlatforms: MCP_TOOLS.map(t => t.replace('get-', '').replace('-trending', '').replace('-news', ''))
            });
            return;
        }

        const result = await callMCPTool(toolName);
        res.json({
            platform,
            timestamp: Date.now(),
            data: result
        });
    } catch (error: any) {
        console.error('MCP trends error:', error);
        res.status(500).json({ error: error.message || '获取热点失败' });
    }
});

/**
 * GET /api/mcp/trends
 * Get all available platforms
 */
router.get('/platforms', async (req: Request, res: Response) => {
    res.json({
        platforms: [
            { id: 'weibo', name: '微博热搜', icon: '🔥' },
            { id: 'zhihu', name: '知乎热榜', icon: '📚' },
            { id: 'baidu', name: '百度热搜', icon: '🔍' },
            { id: 'bilibili', name: 'B站热门', icon: '📺' },
            { id: 'douyin', name: '抖音热点', icon: '🎵' },
            { id: 'toutiao', name: '今日头条', icon: '📰' },
            { id: '36kr', name: '36氪', icon: '💡' },
            { id: 'ithome', name: 'IT之家', icon: '💻' },
            { id: 'v2ex', name: 'V2EX', icon: '🗣' },
            { id: 'github', name: 'GitHub', icon: '🐙' },
            { id: 'juejin', name: '掘金', icon: '⛏' },
            { id: 'hacker', name: 'Hacker News', icon: '📰' },
            { id: 'producthunt', name: 'Product Hunt', icon: '🚀' }
        ]
    });
});

/**
 * GET /api/mcp/all-trends
 * Get trending topics from all platforms (aggregated)
 */
router.get('/all-trends', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 5;
        const platforms = (req.query.platforms as string)?.split(',') || ['weibo', 'zhihu', 'baidu'];

        const results: Record<string, any> = {};

        // Fetch from requested platforms in parallel
        await Promise.all(
            platforms.map(async (platform) => {
                try {
                    const toolName = `get-${platform}-trending` as MCPToolName;
                    if (MCP_TOOLS.includes(toolName)) {
                        const data = await callMCPTool(toolName);
                        results[platform] = data.slice(0, limit);
                    }
                } catch (e) {
                    console.error(`Failed to fetch ${platform}:`, e);
                    results[platform] = [];
                }
            })
        );

        res.json({
            timestamp: Date.now(),
            data: results
        });
    } catch (error: any) {
        console.error('MCP all-trends error:', error);
        res.status(500).json({ error: error.message || '获取热点失败' });
    }
});

/**
 * Call MCP tool using npx
 */
async function callMCPTool(toolName: string): Promise<TrendItem[]> {
    return new Promise((resolve, reject) => {
        // Use fetch to call the DailyHot API directly (more reliable than spawning npx)
        const apiMap: Record<string, string> = {
            'get-weibo-trending': 'https://api.vvhan.com/api/hotlist/wbHot',
            'get-zhihu-trending': 'https://api.vvhan.com/api/hotlist/zhihuHot',
            'get-baidu-trending': 'https://api.vvhan.com/api/hotlist/baiduRD',
            'get-bilibili-trending': 'https://api.vvhan.com/api/hotlist/bili',
            'get-douyin-trending': 'https://api.vvhan.com/api/hotlist/douyinHot',
            'get-toutiao-trending': 'https://api.vvhan.com/api/hotlist/toutiao',
            // Fallback to DailyHotApi for others
        };

        const apiUrl = apiMap[toolName];

        if (apiUrl) {
            fetch(apiUrl)
                .then(res => res.json())
                .then((data: any) => {
                    if (data.success && data.data) {
                        resolve(data.data.map((item: any) => ({
                            title: item.title,
                            url: item.url || item.mobilUrl,
                            hot: item.hot || item.index,
                            description: item.desc
                        })));
                    } else {
                        resolve([]);
                    }
                })
                .catch(reject);
        } else {
            // Fallback: use RSSHub or other sources
            resolve([]);
        }
    });
}

export default router;
