import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

/**
 * MCP Trends Hub Integration
 * Provides access to trending topics from multiple Chinese platforms
 * Uses DailyHotApi as data source
 * @see https://github.com/imsyy/DailyHotApi
 */

interface TrendItem {
    title: string;
    url: string;
    hot?: string | number;
    cover?: string;
    description?: string;
}

// DailyHotApi base URL - you can self-host or use a public instance
const DAILY_HOT_API_BASE = 'https://hot.imsyy.top';

// Platform configuration with DailyHotApi endpoints
const PLATFORMS = {
    weibo: { name: '微博热搜', icon: '🔥', endpoint: '/weibo' },
    zhihu: { name: '知乎热榜', icon: '📚', endpoint: '/zhihu' },
    baidu: { name: '百度热搜', icon: '🔍', endpoint: '/baidu' },
    bilibili: { name: 'B站热门', icon: '📺', endpoint: '/bilibili' },
    douyin: { name: '抖音热点', icon: '🎵', endpoint: '/douyin' },
    toutiao: { name: '今日头条', icon: '📰', endpoint: '/toutiao' },
    kr36: { name: '36氪', icon: '💡', endpoint: '/36kr' },
    ithome: { name: 'IT之家', icon: '💻', endpoint: '/ithome' },
    juejin: { name: '掘金', icon: '⛏', endpoint: '/juejin' },
    github: { name: 'GitHub', icon: '🐙', endpoint: '/github' },
    // Add more platforms as needed
} as const;

type PlatformId = keyof typeof PLATFORMS;

/**
 * GET /api/mcp/platforms
 * Get all available platforms
 */
router.get('/platforms', async (req: Request, res: Response) => {
    res.json({
        platforms: Object.entries(PLATFORMS).map(([id, info]) => ({
            id,
            name: info.name,
            icon: info.icon
        }))
    });
});

/**
 * GET /api/mcp/trends/:platform
 * Get trending topics from a specific platform
 */
router.get('/trends/:platform', async (req: Request, res: Response) => {
    try {
        const { platform } = req.params;

        if (!(platform in PLATFORMS)) {
            res.status(400).json({
                error: '不支持的平台',
                supportedPlatforms: Object.keys(PLATFORMS)
            });
            return;
        }

        const platformConfig = PLATFORMS[platform as PlatformId];
        const result = await fetchTrends(platformConfig.endpoint);

        res.json({
            platform,
            name: platformConfig.name,
            timestamp: Date.now(),
            data: result
        });
    } catch (error: any) {
        console.error('MCP trends error:', error.message);
        res.status(500).json({ error: error.message || '获取热点失败' });
    }
});

/**
 * GET /api/mcp/all-trends
 * Get trending topics from multiple platforms (aggregated)
 */
router.get('/all-trends', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 5;
        const requestedPlatforms = (req.query.platforms as string)?.split(',') || ['weibo', 'zhihu', 'baidu'];

        const results: Record<string, TrendItem[]> = {};

        // Fetch from requested platforms in parallel
        await Promise.all(
            requestedPlatforms.map(async (platform) => {
                try {
                    if (platform in PLATFORMS) {
                        const platformConfig = PLATFORMS[platform as PlatformId];
                        const data = await fetchTrends(platformConfig.endpoint);
                        results[platform] = data.slice(0, limit);
                    }
                } catch (e: any) {
                    console.error(`Failed to fetch ${platform}:`, e.message);
                    results[platform] = [];
                }
            })
        );

        res.json({
            timestamp: Date.now(),
            data: results
        });
    } catch (error: any) {
        console.error('MCP all-trends error:', error.message);
        res.status(500).json({ error: error.message || '获取热点失败' });
    }
});

/**
 * Fetch trending topics from DailyHotApi
 */
async function fetchTrends(endpoint: string): Promise<TrendItem[]> {
    try {
        const url = `${DAILY_HOT_API_BASE}${endpoint}`;
        console.log(`Fetching trends from: ${url}`);

        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MCPTrendsHub/1.0)'
            }
        });

        const data = response.data;

        // DailyHotApi response format
        if (data.code === 200 && Array.isArray(data.data)) {
            return data.data.map((item: any) => ({
                title: item.title || item.name,
                url: item.url || item.mobileUrl,
                hot: item.hot || item.hotNum,
                description: item.desc || item.description,
                cover: item.pic || item.cover
            }));
        }

        console.warn('Unexpected API response format:', data);
        return [];
    } catch (error: any) {
        console.error(`Failed to fetch ${endpoint}:`, error.message);
        throw new Error(`获取热点失败: ${error.message}`);
    }
}

export default router;
