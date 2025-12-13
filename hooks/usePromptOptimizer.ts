/**
 * 提示词优化 React Hook
 * 
 * @module hooks/usePromptOptimizer
 * @description 提示词分析、优化和建议
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { promptOptimizer, PromptSuggestion, OptimizationResult } from '../core/prompt';

export interface UsePromptOptimizerReturn {
    /** 当前建议 */
    suggestions: PromptSuggestion[];
    /** 快速建议 (输入时) */
    quickSuggestions: string[];
    /** 优化结果 */
    result: OptimizationResult | null;
    /** 当前分数 */
    score: number;
    /** 分析提示词 */
    analyze: (prompt: string) => void;
    /** 优化提示词 */
    optimize: (prompt: string, taskType?: string) => OptimizationResult;
    /** 应用建议 */
    applySuggestion: (suggestion: PromptSuggestion, currentPrompt: string) => string;
    /** 清除状态 */
    clear: () => void;
}

export function usePromptOptimizer(
    options?: {
        /** 自动分析阈值 (字符数) */
        autoAnalyzeThreshold?: number;
        /** 防抖延迟 (ms) */
        debounceMs?: number;
    }
): UsePromptOptimizerReturn {
    const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
    const [quickSuggestions, setQuickSuggestions] = useState<string[]>([]);
    const [result, setResult] = useState<OptimizationResult | null>(null);
    const [score, setScore] = useState(0);

    const autoThreshold = options?.autoAnalyzeThreshold ?? 20;

    const analyze = useCallback((prompt: string) => {
        if (prompt.length < autoThreshold) {
            setSuggestions([]);
            setQuickSuggestions([]);
            setScore(0);
            return;
        }

        const analysis = promptOptimizer.analyze(prompt);
        setSuggestions(analysis);

        const quick = promptOptimizer.quickSuggest(prompt);
        setQuickSuggestions(quick);

        // 计算简单分数
        const baseResult = promptOptimizer.optimize(prompt);
        setScore(baseResult.score.original);
    }, [autoThreshold]);

    const optimize = useCallback((prompt: string, taskType?: string): OptimizationResult => {
        const optimizationResult = promptOptimizer.optimize(prompt, {
            taskType: taskType as any,
        });
        setResult(optimizationResult);
        setSuggestions(optimizationResult.suggestions);
        setScore(optimizationResult.score.optimized);
        return optimizationResult;
    }, []);

    const applySuggestion = useCallback((
        suggestion: PromptSuggestion,
        currentPrompt: string
    ): string => {
        if (suggestion.original && suggestion.suggested) {
            return currentPrompt.replace(suggestion.original, suggestion.suggested);
        }
        if (suggestion.suggested) {
            return currentPrompt + suggestion.suggested;
        }
        return currentPrompt;
    }, []);

    const clear = useCallback(() => {
        setSuggestions([]);
        setQuickSuggestions([]);
        setResult(null);
        setScore(0);
    }, []);

    return {
        suggestions,
        quickSuggestions,
        result,
        score,
        analyze,
        optimize,
        applySuggestion,
        clear,
    };
}

/**
 * 自动分析 Hook (带防抖)
 */
export function useAutoPromptAnalysis(
    prompt: string,
    debounceMs = 500
) {
    const { suggestions, quickSuggestions, score, analyze } = usePromptOptimizer();

    useEffect(() => {
        const timer = setTimeout(() => {
            analyze(prompt);
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [prompt, debounceMs, analyze]);

    return { suggestions, quickSuggestions, score };
}

export default usePromptOptimizer;
