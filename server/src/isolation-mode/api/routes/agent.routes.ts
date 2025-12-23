/**
 * Agent API 路由
 */

import { Router, Request, Response } from 'express';
import { agentPresets } from '../../agents';
// import { sessionManager } from '../../session';

const router = Router();

/**
 * GET /api/isolation/agents/presets
 * 获取所有 Agent 预设
 */
router.get('/presets', async (req: Request, res: Response) => {
    try {
        const presets = Object.entries(agentPresets).map(([id, config]) => ({
            id,
            name: config.name,
            role: config.role,
            description: config.systemPrompt?.substring(0, 100) + '...',
        }));

        res.json({ success: true, data: presets });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/isolation/agents/presets/:id
 * 获取特定 Agent 预设
 */
router.get('/presets/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const preset = (agentPresets as any)[id];

        if (!preset) {
            res.status(404).json({ success: false, error: 'Preset not found' });
            return;
        }

        res.json({ success: true, data: { id, ...preset } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
