/**
 * 提示词优化助手
 * 
 * @module core/prompt/optimizer
 * @description AI 辅助的提示词优化和建议系统
 */

// ============================================
// 类型定义
// ============================================

/** 优化建议类型 */
export type SuggestionType =
    | 'clarity'      // 清晰度
    | 'structure'    // 结构
    | 'specificity'  // 具体性
    | 'context'      // 上下文
    | 'tone'         // 语气
    | 'length';      // 长度

/** 优化建议 */
export interface PromptSuggestion {
    type: SuggestionType;
    message: string;
    original: string;
    suggested: string;
    confidence: number;
}

/** 优化结果 */
export interface OptimizationResult {
    originalPrompt: string;
    optimizedPrompt: string;
    suggestions: PromptSuggestion[];
    score: {
        original: number;
        optimized: number;
    };
    metadata: {
        processingTime: number;
        model?: string;
    };
}

/** 优化选项 */
export interface OptimizationOptions {
    /** 目标任务类型 */
    taskType?: 'chat' | 'code' | 'creative' | 'analysis' | 'translation';
    /** 目标模型 */
    targetModel?: string;
    /** 最大长度 */
    maxLength?: number;
    /** 使用 AI 辅助 */
    useAI?: boolean;
}

// ============================================
// 提示词模式库
// ============================================

const PROMPT_PATTERNS = {
    // 角色设定
    rolePatterns: [
        { pattern: /^(你是|I want you to act as|act as)/i, good: true },
        { pattern: /^(帮我|Please help)/i, okay: true },
    ],

    // 清晰指令
    clarityPatterns: [
        { pattern: /step[- ]?by[- ]?step|逐步|一步一步/i, good: true },
        { pattern: /detailed|详细|具体/i, good: true },
        { pattern: /brief|简短|简洁/i, context: true },
    ],

    // 输出格式
    formatPatterns: [
        { pattern: /JSON|json格式/i, structured: true },
        { pattern: /markdown|表格|列表/i, structured: true },
        { pattern: /\{.*\}|\[.*\]/s, template: true },
    ],

    // 上下文
    contextPatterns: [
        { pattern: /背景|context|background/i, hasContext: true },
        { pattern: /例如|for example|such as/i, hasExample: true },
    ],
};

// ============================================
// 基于规则的优化器
// ============================================

export class PromptOptimizer {
    private minTriggerLength = 20;

    /**
     * 分析提示词
     */
    analyze(prompt: string): PromptSuggestion[] {
        const suggestions: PromptSuggestion[] = [];
        const trimmed = prompt.trim();

        if (trimmed.length < this.minTriggerLength) {
            return suggestions;
        }

        // 1. 检查角色设定
        const hasRole = PROMPT_PATTERNS.rolePatterns.some(p => p.pattern.test(trimmed));
        if (!hasRole && trimmed.length > 50) {
            suggestions.push({
                type: 'structure',
                message: '建议添加角色设定来明确 AI 的行为方式',
                original: trimmed.slice(0, 30),
                suggested: `你是一个专业的助手。${trimmed.slice(0, 30)}`,
                confidence: 0.7,
            });
        }

        // 2. 检查具体性
        const vaguePhrases = ['一些', '某些', '东西', '相关', 'something', 'stuff', 'things'];
        for (const phrase of vaguePhrases) {
            if (trimmed.toLowerCase().includes(phrase)) {
                suggestions.push({
                    type: 'specificity',
                    message: `"${phrase}" 过于模糊，建议使用更具体的描述`,
                    original: phrase,
                    suggested: '[具体内容]',
                    confidence: 0.6,
                });
                break;
            }
        }

        // 3. 检查输出格式
        const hasFormat = PROMPT_PATTERNS.formatPatterns.some(p => p.pattern.test(trimmed));
        if (!hasFormat && trimmed.length > 100) {
            suggestions.push({
                type: 'structure',
                message: '建议指定输出格式以获得更结构化的回复',
                original: '',
                suggested: '\n\n请以 markdown 格式输出结果。',
                confidence: 0.5,
            });
        }

        // 4. 检查上下文
        const hasContext = PROMPT_PATTERNS.contextPatterns.some(p => p.pattern.test(trimmed));
        if (!hasContext && trimmed.length > 80) {
            suggestions.push({
                type: 'context',
                message: '添加背景信息或示例可以获得更准确的回复',
                original: '',
                suggested: '\n\n背景: [请补充相关背景]',
                confidence: 0.4,
            });
        }

        // 5. 检查长度
        if (trimmed.length > 2000) {
            suggestions.push({
                type: 'length',
                message: '提示词过长，建议精简或分段处理',
                original: `${trimmed.length} 字符`,
                suggested: '建议控制在 1500 字符以内',
                confidence: 0.8,
            });
        }

        return suggestions;
    }

    /**
     * 优化提示词
     */
    optimize(prompt: string, options?: OptimizationOptions): OptimizationResult {
        const startTime = Date.now();
        const suggestions = this.analyze(prompt);

        let optimized = prompt.trim();

        // 应用高置信度建议
        for (const suggestion of suggestions) {
            if (suggestion.confidence >= 0.7) {
                if (suggestion.original && suggestion.suggested) {
                    optimized = optimized.replace(suggestion.original, suggestion.suggested);
                } else if (suggestion.suggested) {
                    optimized += suggestion.suggested;
                }
            }
        }

        // 任务类型特定优化
        if (options?.taskType) {
            optimized = this.applyTaskTypeOptimization(optimized, options.taskType);
        }

        return {
            originalPrompt: prompt,
            optimizedPrompt: optimized,
            suggestions,
            score: {
                original: this.scorePrompt(prompt),
                optimized: this.scorePrompt(optimized),
            },
            metadata: {
                processingTime: Date.now() - startTime,
            },
        };
    }

    /**
     * 任务类型优化
     */
    private applyTaskTypeOptimization(prompt: string, taskType: string): string {
        const prefixes: Record<string, string> = {
            code: '你是一个资深程序员。请编写高质量、可维护的代码。\n\n',
            creative: '你是一个富有创意的作家。请发挥想象力。\n\n',
            analysis: '你是一个数据分析专家。请提供深入、客观的分析。\n\n',
            translation: '你是一个专业翻译。请保持原文风格和准确性。\n\n',
        };

        const prefix = prefixes[taskType];
        if (prefix && !prompt.includes('你是') && !prompt.includes('act as')) {
            return prefix + prompt;
        }

        return prompt;
    }

    /**
     * 评分提示词
     */
    private scorePrompt(prompt: string): number {
        let score = 50;
        const trimmed = prompt.trim();

        // 长度适中 (+10)
        if (trimmed.length >= 50 && trimmed.length <= 1500) {
            score += 10;
        }

        // 有角色设定 (+15)
        if (PROMPT_PATTERNS.rolePatterns.some(p => p.pattern.test(trimmed))) {
            score += 15;
        }

        // 有输出格式 (+10)
        if (PROMPT_PATTERNS.formatPatterns.some(p => p.pattern.test(trimmed))) {
            score += 10;
        }

        // 有上下文/示例 (+10)
        if (PROMPT_PATTERNS.contextPatterns.some(p => p.pattern.test(trimmed))) {
            score += 10;
        }

        // 有清晰指令 (+5)
        if (PROMPT_PATTERNS.clarityPatterns.some(p => p.pattern.test(trimmed))) {
            score += 5;
        }

        return Math.min(100, score);
    }

    /**
     * 快速建议 (输入时)
     */
    quickSuggest(partialPrompt: string): string[] {
        const suggestions: string[] = [];
        const trimmed = partialPrompt.trim();

        if (trimmed.length < 10) return suggestions;

        // 根据开头提供建议
        if (trimmed.startsWith('帮我') || trimmed.startsWith('请')) {
            suggestions.push('添加 "你是..." 来设定 AI 角色');
        }

        if (trimmed.includes('?') || trimmed.includes('？')) {
            suggestions.push('可以添加 "请详细解释" 获取更完整回答');
        }

        if (trimmed.length > 200 && !trimmed.includes('格式') && !trimmed.includes('format')) {
            suggestions.push('建议指定输出格式 (如 JSON、markdown)');
        }

        return suggestions;
    }
}

// 单例实例
export const promptOptimizer = new PromptOptimizer();
