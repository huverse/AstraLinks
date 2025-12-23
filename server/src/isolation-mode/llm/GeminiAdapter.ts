/**
 * Gemini LLM Adapter
 * 
 * 实现 Gemini API 调用
 * 支持超时、重试、速率限制
 */

import axios from 'axios';
import {
    ILlmAdapter,
    LlmMessage,
    LlmGenerateOptions,
    LlmGenerateResult,
    LlmError,
    LlmAdapterConfig
} from './ILlmAdapter';

// ============================================
// 常量
// ============================================

const DEFAULT_TIMEOUT = 30000; // 30s
const DEFAULT_MAX_RETRIES = 2;
const MAX_PROMPT_LENGTH = 30000; // 字符限制
const MAX_TOKENS_PER_MINUTE = 10000;

// ============================================
// Gemini Adapter
// ============================================

export class GeminiAdapter implements ILlmAdapter {
    readonly provider = 'gemini';
    readonly model: string;

    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly timeout: number;
    private readonly maxRetries: number;

    // 速率限制
    private tokenUsageThisMinute = 0;
    private lastResetTime = Date.now();

    constructor(config: Partial<LlmAdapterConfig> = {}) {
        this.model = config.model || process.env.WE_LLM_MODEL || 'gemini-3.0-flash';
        this.apiKey = config.apiKey || process.env.WE_LLM_KEY || '';
        this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
        this.timeout = config.timeout || DEFAULT_TIMEOUT;
        this.maxRetries = config.maxRetries || DEFAULT_MAX_RETRIES;
    }

    isAvailable(): boolean {
        return !!this.apiKey;
    }

    async generate(
        messages: LlmMessage[],
        options: LlmGenerateOptions = {}
    ): Promise<LlmGenerateResult> {
        const startTime = Date.now();

        // 1. 验证输入
        this.validateInput(messages);

        // 2. 检查速率限制
        this.checkRateLimit();

        // 3. 构建请求
        const contents = this.convertMessages(messages);
        const requestBody = this.buildRequestBody(contents, options);

        // 4. 发送请求 (带重试)
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.callApi(requestBody, options.timeout);
                const result = this.parseResponse(response, startTime);

                // 更新 token 使用量
                this.tokenUsageThisMinute += result.tokens.total;

                return result;
            } catch (error: any) {
                lastError = error;

                // 不重试的错误
                if (error.code === 'VALIDATION' || error.code === 'RATE_LIMIT') {
                    throw error;
                }

                // 最后一次尝试失败
                if (attempt === this.maxRetries) {
                    break;
                }

                // 等待后重试
                await this.sleep(1000 * (attempt + 1));
            }
        }

        throw new LlmError(
            `LLM call failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
            'API_ERROR',
            { originalError: lastError }
        );
    }

    // ============================================
    // 私有方法
    // ============================================

    private validateInput(messages: LlmMessage[]): void {
        if (!messages || messages.length === 0) {
            throw new LlmError('Messages cannot be empty', 'VALIDATION');
        }

        const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);

        if (totalLength > MAX_PROMPT_LENGTH) {
            throw new LlmError(
                `Prompt too long: ${totalLength} chars (max: ${MAX_PROMPT_LENGTH})`,
                'VALIDATION'
            );
        }

        // 清洗危险字符
        for (const msg of messages) {
            if (typeof msg.content !== 'string') {
                throw new LlmError('Message content must be string', 'VALIDATION');
            }
        }
    }

    private checkRateLimit(): void {
        const now = Date.now();

        // 每分钟重置
        if (now - this.lastResetTime > 60000) {
            this.tokenUsageThisMinute = 0;
            this.lastResetTime = now;
        }

        if (this.tokenUsageThisMinute >= MAX_TOKENS_PER_MINUTE) {
            throw new LlmError(
                `Rate limit exceeded: ${this.tokenUsageThisMinute} tokens this minute`,
                'RATE_LIMIT'
            );
        }
    }

    private convertMessages(messages: LlmMessage[]): any[] {
        // 分离 system 和其他消息
        const systemMessages = messages.filter(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        // Gemini 格式
        const contents = otherMessages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        return contents;
    }

    private buildRequestBody(contents: any[], options: LlmGenerateOptions): any {
        return {
            contents,
            generationConfig: {
                maxOutputTokens: options.maxTokens || 1024,
                temperature: options.temperature ?? 0.7,
                topP: options.topP ?? 0.9,
                stopSequences: options.stopSequences || []
            }
        };
    }

    private async callApi(requestBody: any, timeout?: number): Promise<any> {
        const url = `${this.baseUrl}/models/${this.model}:generateContent`;

        try {
            const response = await axios.post(url, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey
                },
                timeout: timeout || this.timeout
            });

            return response.data;
        } catch (error: any) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new LlmError('LLM request timed out', 'TIMEOUT');
            }

            if (error.response?.status === 429) {
                throw new LlmError('API rate limit exceeded', 'RATE_LIMIT');
            }

            throw new LlmError(
                `API error: ${error.response?.data?.error?.message || error.message}`,
                'API_ERROR',
                { status: error.response?.status }
            );
        }
    }

    private parseResponse(response: any, startTime: number): LlmGenerateResult {
        const candidate = response.candidates?.[0];

        if (!candidate) {
            throw new LlmError('No response from LLM', 'API_ERROR');
        }

        const text = candidate.content?.parts?.[0]?.text || '';
        const usageMetadata = response.usageMetadata || {};

        return {
            text,
            tokens: {
                prompt: usageMetadata.promptTokenCount || 0,
                completion: usageMetadata.candidatesTokenCount || 0,
                total: usageMetadata.totalTokenCount || 0
            },
            finishReason: candidate.finishReason === 'STOP' ? 'stop' :
                candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'error',
            latencyMs: Date.now() - startTime
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
