/**
 * 提示词优化 API 路由 (Gemini 驱动)
 * 
 * @module server/src/routes/prompt
 * @description 基于 Gemini AI 的智能提示词优化
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 认证中间件
router.use(authMiddleware);

// ============================================
// Gemini 提示词优化
// ============================================

/**
 * 使用 Gemini 优化提示词
 * POST /api/prompt/optimize
 * 
 * Body: { prompt: string, taskType: string, geminiApiKey: string }
 */
router.post('/optimize', async (req: Request, res: Response): Promise<void> => {
    try {
        const { prompt, taskType = 'chat', geminiApiKey } = req.body;

        if (!prompt) {
            res.status(400).json({ error: '请提供要优化的提示词' });
            return;
        }

        if (!geminiApiKey) {
            res.status(400).json({ error: '请提供 Gemini API Key' });
            return;
        }

        // 构建优化请求
        const systemPrompt = buildOptimizationPrompt(taskType);

        // 调用 Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

        const geminiRequest = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\n---\n\n用户提示词:\n${prompt}` }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
            }
        };

        const startTime = Date.now();

        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequest),
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json().catch(() => ({})) as any;
            res.status(400).json({
                error: `Gemini API 错误: ${errorData.error?.message || geminiResponse.statusText}`
            });
            return;
        }

        const geminiData = await geminiResponse.json() as any;
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // 解析 Gemini 响应
        const result = parseGeminiResponse(responseText, prompt);
        result.metadata = {
            processingTime: Date.now() - startTime,
            model: 'gemini-2.0-flash',
            taskType,
        };

        res.json(result);
    } catch (error: any) {
        console.error('[Prompt Optimizer] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 辅助函数
// ============================================

/**
 * 构建优化提示词
 */
function buildOptimizationPrompt(taskType: string): string {
    const taskDescriptions: Record<string, string> = {
        chat: '一般对话任务',
        code: '代码生成和编程任务',
        creative: '创意写作任务',
        analysis: '数据分析和总结任务',
        translation: '翻译任务',
    };

    return `你是一位提示词工程专家。请分析并优化以下提示词，使其更加清晰、具体和有效。

任务类型: ${taskDescriptions[taskType] || taskType}

请按以下格式返回结果 (使用 JSON):

\`\`\`json
{
  "optimizedPrompt": "优化后的提示词",
  "originalScore": 0-100的分数,
  "optimizedScore": 0-100的分数,
  "suggestions": [
    {
      "type": "improvement|warning|tip",
      "message": "具体建议描述"
    }
  ],
  "explanation": "优化说明"
}
\`\`\`

优化原则:
1. 添加明确的角色设定 (如果缺少)
2. 使任务目标更加具体
3. 添加输出格式要求
4. 包含必要的上下文信息
5. 使用清晰的结构
6. 避免歧义`;
}

/**
 * 解析 Gemini 响应
 */
function parseGeminiResponse(responseText: string, originalPrompt: string): any {
    try {
        // 尝试提取 JSON
        const jsonMatch = responseText.match(/```json\n?([\s\S]*?)```/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1]);
            return {
                originalPrompt,
                optimizedPrompt: parsed.optimizedPrompt || originalPrompt,
                score: {
                    original: parsed.originalScore || 50,
                    optimized: parsed.optimizedScore || 75,
                },
                suggestions: parsed.suggestions || [],
                explanation: parsed.explanation || '',
            };
        }

        // 如果没有 JSON，尝试直接解析
        const directParse = JSON.parse(responseText);
        return {
            originalPrompt,
            optimizedPrompt: directParse.optimizedPrompt || originalPrompt,
            score: {
                original: directParse.originalScore || 50,
                optimized: directParse.optimizedScore || 75,
            },
            suggestions: directParse.suggestions || [],
            explanation: directParse.explanation || '',
        };
    } catch (e) {
        // 解析失败，返回原始响应作为优化结果
        return {
            originalPrompt,
            optimizedPrompt: responseText,
            score: {
                original: 50,
                optimized: 70,
            },
            suggestions: [
                { type: 'tip', message: 'AI 已为您重写了提示词' }
            ],
            explanation: '基于 Gemini AI 的智能优化',
        };
    }
}

export default router;
