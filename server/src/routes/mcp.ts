import { Router, Request, Response } from 'express';
import axios from 'axios';
import { authMiddleware } from '../middleware/auth';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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
const DAILY_HOT_API_BASE = 'http://localhost:6688';

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
 * GET /api/mcp/available
 * Get all available MCP tools for user panels
 * This provides a unified list for Workspace Settings, Profile Center, etc.
 */
router.get('/available', async (req: Request, res: Response) => {
    // 内置 MCP 工具 - 与 core/mcp/types.ts BUILTIN_MCPS 保持同步
    const builtinMCPs = [
        {
            id: 'mcp-web-search',
            name: 'Web Search',
            description: '网页搜索工具 (Google/Bing/DuckDuckGo)',
            category: 'search',
            status: 'active',
        },
        {
            id: 'mcp-file-system',
            name: 'File System',
            description: '文件系统操作 (沙箱内)',
            category: 'filesystem',
            status: 'active',
        },
        {
            id: 'mcp-code-exec',
            name: 'Code Executor',
            description: '安全代码执行 (JavaScript/Python)',
            category: 'execution',
            status: 'active',
        },
        {
            id: 'mcp-http',
            name: 'HTTP Client',
            description: 'HTTP 请求工具',
            category: 'network',
            status: 'active',
        },
        {
            id: 'mcp-trends',
            name: '热点趋势',
            description: '获取微博、知乎、B站等平台热搜',
            category: 'trends',
            status: 'active',
            platforms: Object.keys(PLATFORMS),
        },
    ];

    res.json({
        success: true,
        mcps: builtinMCPs,
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

// ============================================
// Python 代码执行 API
// ============================================

/**
 * POST /api/mcp/execute-python
 * 执行 Python 代码
 */
router.post('/execute-python', authMiddleware, async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
        const { code, timeout = 5000 } = req.body;

        if (!code) {
            res.status(400).json({ error: '请提供要执行的代码' });
            return;
        }

        // 创建临时文件
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `astralinks_py_${Date.now()}.py`);

        // 写入代码 (添加安全包装)
        const wrappedCode = `
import sys
import json

# 用户代码
try:
${code.split('\n').map((line: string) => '    ' + line).join('\n')}
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
`;

        await fs.writeFile(tempFile, wrappedCode, 'utf-8');

        // 执行 Python
        let stdout = '';
        let stderr = '';
        let killed = false;

        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        const proc = spawn(pythonCmd, [tempFile], {
            cwd: tempDir,
        });

        const timeoutId = setTimeout(() => {
            killed = true;
            proc.kill('SIGTERM');
        }, timeout);

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', async (exitCode) => {
            clearTimeout(timeoutId);

            // 清理临时文件
            try { await fs.unlink(tempFile); } catch (e) { /* ignore */ }

            res.json({
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

            res.status(500).json({
                success: false,
                language: 'python',
                output: '',
                error: `Python execution failed: ${err.message}. Make sure Python is installed.`,
                executionTime: Date.now() - startTime,
            });
        });
    } catch (error: any) {
        console.error('[MCP] Python execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;

