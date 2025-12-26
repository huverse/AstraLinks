/**
 * Scenario API routes
 */

import { Router, Request, Response } from 'express';
import { scenarioLoader } from '../../scenarios';

const router = Router();

/**
 * GET /api/isolation/scenarios
 * List available scenario presets.
 */
router.get('/', async (_req: Request, res: Response) => {
    try {
        const scenarioIds = await scenarioLoader.listAvailable();
        const scenarios = await Promise.all(
            scenarioIds.map(async (id) => {
                try {
                    const config = await scenarioLoader.load(id);
                    const raw = config as any;
                    return {
                        id: config.id,
                        name: config.name,
                        description: config.description,
                        type: raw.type || raw.alignment?.type || config.id
                    };
                } catch {
                    return null;
                }
            })
        );

        res.json({
            success: true,
            data: scenarios.filter(Boolean)
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/isolation/scenarios/:id
 * Get scenario details.
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const scenario = await scenarioLoader.load(id);
        res.json({ success: true, data: scenario });
    } catch (error: any) {
        res.status(404).json({ success: false, error: error.message });
    }
});

export default router;
