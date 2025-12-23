/**
 * Galaxyous LLM Provider
 * 
 * 复用现有 Galaxyous 配置中心的 API
 * 通过后端代理调用 Gemini/OpenAI
 */

import { ILLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult } from '../../core/interfaces';

// 后端代理地址
const PROXY_API_BASE = process.env.PROXY_API_BASE || 'http://localhost:3001';

/**
 * Galaxyous Provider 实现
 * 
 * 复用 App.tsx 中的 participants 配置通过后端代理调用 LLM
 */
export class GalaxyousProvider implements ILLMProvider {
    readonly name = 'galaxyous';
    private apiKey: string = '';
    private defaultModel: string = 'gemini-2.0-flash';

    /**
     * 设置 API Key
     */
    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
    }

    /**
     * 设置默认模型
     */
    setDefaultModel(model: string): void {
        this.defaultModel = model;
    }

    /**
     * 生成补全
     */
    async complete(
        messages: LLMMessage[],
        options?: LLMCompletionOptions
    ): Promise<LLMCompletionResult> {
        const model = options?.model || this.defaultModel;

        // 转换消息格式为 Gemini 格式
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role === 'system' ? 'user' : msg.role,
            parts: [{ text: msg.content }]
        }));

        // 如果有 system prompt，提取出来
        const systemPrompt = messages.find(m => m.role === 'system')?.content;

        try {
            const response = await fetch(`${PROXY_API_BASE}/api/proxy/gemini`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: this.apiKey,
                    model,
                    contents: contents.filter(c => c.role !== 'system'),
                    config: {
                        generationConfig: {
                            temperature: options?.temperature ?? 0.7,
                            maxOutputTokens: options?.maxTokens ?? 1024,
                        },
                        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as any;
                throw new Error(errorData.error || `API error: ${response.status}`);
            }

            const data = await response.json() as any;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const tokenMetadata = data.usageMetadata || {};

            return {
                content: text,
                tokens: {
                    prompt: tokenMetadata.promptTokenCount || 0,
                    completion: tokenMetadata.candidatesTokenCount || 0,
                    total: tokenMetadata.totalTokenCount || 0,
                },
                finishReason: data.candidates?.[0]?.finishReason === 'STOP' ? 'stop' : 'length',
            };
        } catch (error: any) {
            console.error('[GalaxyousProvider] Error:', error);
            return {
                content: `错误: ${error.message}`,
                tokens: { prompt: 0, completion: 0, total: 0 },
                finishReason: 'error',
            };
        }
    }

    /**
     * 流式生成补全
     */
    async *completeStream(
        messages: LLMMessage[],
        options?: LLMCompletionOptions
    ): AsyncGenerator<string, void, unknown> {
        // 简化实现：调用非流式接口
        const result = await this.complete(messages, options);
        yield result.content;
    }

    /**
     * 检查是否可用
     */
    async isAvailable(): Promise<boolean> {
        return !!this.apiKey;
    }
}
