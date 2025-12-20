/**
 * 代码执行 API 路由
 * 
 * @module server/src/routes/code
 * @description 安全沙箱代码执行 API
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { executeCodeSandbox, validateCode } from '../services/codeSandbox';

const router = Router();

// ============================================
// 中间件
// ============================================

router.use(authMiddleware);

// ============================================
// 执行代码
// POST /api/code/execute
// ============================================

router.post('/execute', async (req: Request, res: Response): Promise<void> => {
    try {
        const { code, input, variables, timeout, language } = req.body;

        if (!code) {
            res.status(400).json({ error: '缺少代码参数' });
            return;
        }

        // 先验证代码安全性
        const validation = validateCode(code);
        if (!validation.valid) {
            res.status(400).json({
                success: false,
                error: '代码包含不安全的模式',
                details: validation.errors
            });
            return;
        }

        // 限制超时时间 (最大 30 秒)
        const safeTimeout = Math.min(timeout || 10000, 30000);

        // 执行代码
        const result = await executeCodeSandbox({
            code,
            input,
            variables,
            timeout: safeTimeout,
            language
        });

        res.json(result);
    } catch (error: any) {
        console.error('[Code] Execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message || '代码执行失败'
        });
    }
});

// ============================================
// 验证代码
// POST /api/code/validate
// ============================================

router.post('/validate', async (req: Request, res: Response): Promise<void> => {
    try {
        const { code } = req.body;

        if (!code) {
            res.status(400).json({ error: '缺少代码参数' });
            return;
        }

        const result = validateCode(code);
        res.json(result);
    } catch (error: any) {
        console.error('[Code] Validation error:', error);
        res.status(500).json({
            valid: false,
            errors: [error.message || '验证失败']
        });
    }
});

export default router;
