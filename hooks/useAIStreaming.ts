/**
 * AI 流式响应 Hook
 * 
 * @module hooks/useAIStreaming
 * @description 处理 AI 模型流式输出，支持 Gemini 和 OpenAI 格式
 */

import { useState, useCallback, useRef } from 'react';

// ============================================
// 类型定义
// ============================================

export interface StreamingConfig {
    provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
    model: string;
    apiKey: string;
    baseUrl?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface StreamingState {
    isStreaming: boolean;
    content: string;
    error: string | null;
    tokenCount: number;
    isComplete: boolean;
}

export interface StreamingResult {
    content: string;
    tokenCount: number;
    duration: number;
}

// ============================================
// API 基础 URL
// ============================================

const getApiBase = () => {
    if (typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz') {
        return 'https://astralinks.xyz';
    }
    return 'http://localhost:3001';
};

// ============================================
// 主 Hook
// ============================================

export function useAIStreaming() {
    const [state, setState] = useState<StreamingState>({
        isStreaming: false,
        content: '',
        error: null,
        tokenCount: 0,
        isComplete: false,
    });

    const abortControllerRef = useRef<AbortController | null>(null);
    const startTimeRef = useRef<number>(0);

    /**
     * 开始流式生成
     */
    const startStreaming = useCallback(async (
        input: string,
        config: StreamingConfig,
        onChunk?: (chunk: string, fullContent: string) => void
    ): Promise<StreamingResult> => {
        // 重置状态
        setState({
            isStreaming: true,
            content: '',
            error: null,
            tokenCount: 0,
            isComplete: false,
        });

        abortControllerRef.current = new AbortController();
        startTimeRef.current = Date.now();

        const API_BASE = getApiBase();
        let fullContent = '';
        let tokenCount = 0;

        try {
            const providerLower = config.provider.toLowerCase();

            if (providerLower === 'gemini' || providerLower === 'google') {
                // Gemini 流式
                const response = await fetch(`${API_BASE}/api/proxy/gemini/stream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        apiKey: config.apiKey,
                        baseUrl: config.baseUrl,
                        model: config.model || 'gemini-2.5-flash',
                        contents: [{ role: 'user', parts: [{ text: input }] }],
                        config: {
                            systemInstruction: config.systemPrompt,
                            temperature: config.temperature ?? 0.7,
                            maxOutputTokens: config.maxTokens ?? 2048,
                        },
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                if (text) {
                                    fullContent += text;
                                    tokenCount = Math.ceil(fullContent.length / 4);

                                    setState(prev => ({
                                        ...prev,
                                        content: fullContent,
                                        tokenCount,
                                    }));

                                    onChunk?.(text, fullContent);
                                }
                            } catch (e) {
                                // 跳过解析错误
                            }
                        }
                    }
                }
            } else {
                // OpenAI 兼容流式
                const messages: { role: string; content: string }[] = [];
                if (config.systemPrompt) {
                    messages.push({ role: 'system', content: config.systemPrompt });
                }
                messages.push({ role: 'user', content: input });

                const response = await fetch(`${API_BASE}/api/proxy/openai`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        apiKey: config.apiKey,
                        baseUrl: config.baseUrl,
                        model: config.model || 'gpt-4o-mini',
                        messages,
                        temperature: config.temperature ?? 0.7,
                        maxTokens: config.maxTokens ?? 2048,
                        stream: true,
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6).trim();
                            if (dataStr === '[DONE]') continue;

                            try {
                                const data = JSON.parse(dataStr);
                                const text = data.choices?.[0]?.delta?.content || '';
                                if (text) {
                                    fullContent += text;
                                    tokenCount = Math.ceil(fullContent.length / 4);

                                    setState(prev => ({
                                        ...prev,
                                        content: fullContent,
                                        tokenCount,
                                    }));

                                    onChunk?.(text, fullContent);
                                }
                            } catch (e) {
                                // 跳过解析错误
                            }
                        }
                    }
                }
            }

            // 完成
            const duration = Date.now() - startTimeRef.current;
            setState(prev => ({
                ...prev,
                isStreaming: false,
                isComplete: true,
            }));

            return { content: fullContent, tokenCount, duration };

        } catch (error: any) {
            if (error.name === 'AbortError') {
                setState(prev => ({
                    ...prev,
                    isStreaming: false,
                    error: '已取消生成',
                }));
                return { content: fullContent, tokenCount, duration: Date.now() - startTimeRef.current };
            }

            setState(prev => ({
                ...prev,
                isStreaming: false,
                error: error.message,
            }));
            throw error;
        }
    }, []);

    /**
     * 停止生成
     */
    const stopStreaming = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    /**
     * 重置状态
     */
    const reset = useCallback(() => {
        stopStreaming();
        setState({
            isStreaming: false,
            content: '',
            error: null,
            tokenCount: 0,
            isComplete: false,
        });
    }, [stopStreaming]);

    return {
        ...state,
        startStreaming,
        stopStreaming,
        reset,
    };
}

export default useAIStreaming;
