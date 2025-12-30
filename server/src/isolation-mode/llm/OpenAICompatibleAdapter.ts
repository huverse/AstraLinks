/**
 * OpenAI-Compatible LLM Adapter
 *
 * Uses the /chat/completions endpoint for OpenAI-compatible providers.
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

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_PROMPT_LENGTH = 30000;
const MAX_TOKENS_PER_MINUTE = 10000;

export class OpenAICompatibleAdapter implements ILlmAdapter {
    readonly provider = 'openai_compatible';
    readonly model: string;

    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly timeout: number;
    private readonly maxRetries: number;

    private tokenUsageThisMinute = 0;
    private lastResetTime = Date.now();

    constructor(config: Partial<LlmAdapterConfig> = {}) {
        this.model = config.model || process.env.WE_LLM_MODEL || 'gpt-4o-mini';
        this.apiKey = config.apiKey || process.env.WE_LLM_KEY || '';
        this.baseUrl = (config.baseUrl || process.env.WE_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
        this.timeout = config.timeout || DEFAULT_TIMEOUT;
        this.maxRetries = config.maxRetries || DEFAULT_MAX_RETRIES;
    }

    isAvailable(): boolean {
        return !!this.apiKey;
    }

    async generate(messages: LlmMessage[], options: LlmGenerateOptions = {}): Promise<LlmGenerateResult> {
        const startTime = Date.now();

        this.validateInput(messages);
        this.checkRateLimit();

        const requestBody = this.buildRequestBody(messages, options);

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.callApi(requestBody, options.timeout);
                const result = this.parseResponse(response, startTime);

                this.tokenUsageThisMinute += result.tokens.total;
                return result;
            } catch (error: any) {
                lastError = error;

                if (error.code === 'VALIDATION' || error.code === 'RATE_LIMIT') {
                    throw error;
                }

                if (attempt === this.maxRetries) {
                    break;
                }

                await this.sleep(1000 * (attempt + 1));
            }
        }

        throw new LlmError(
            `LLM call failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
            'API_ERROR',
            { originalError: lastError }
        );
    }

    /**
     * 流式生成文本
     */
    async *generateStream(
        messages: LlmMessage[],
        options: LlmGenerateOptions = {}
    ): AsyncGenerator<string, void, unknown> {
        this.validateInput(messages);
        this.checkRateLimit();

        const requestBody = {
            ...this.buildRequestBody(messages, options),
            stream: true
        };

        const url = `${this.baseUrl}/chat/completions`;

        try {
            const response = await axios.post(url, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                timeout: options.timeout || this.timeout,
                responseType: 'stream'
            });

            let buffer = '';

            for await (const chunk of response.data) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;

                    if (trimmed.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                yield content;
                            }
                        } catch {
                            // Skip malformed JSON
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new LlmError('LLM request timed out', 'TIMEOUT');
            }
            throw new LlmError(
                `Stream error: ${error.message}`,
                'API_ERROR',
                { originalError: error }
            );
        }
    }

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

        for (const msg of messages) {
            if (typeof msg.content !== 'string') {
                throw new LlmError('Message content must be string', 'VALIDATION');
            }
        }
    }

    private checkRateLimit(): void {
        const now = Date.now();
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

    private buildRequestBody(messages: LlmMessage[], options: LlmGenerateOptions): any {
        return {
            model: this.model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature ?? 0.7,
            top_p: options.topP ?? 0.9,
            stop: options.stopSequences || undefined
        };
    }

    private async callApi(requestBody: any, timeout?: number): Promise<any> {
        const url = `${this.baseUrl}/chat/completions`;

        try {
            const response = await axios.post(url, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
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
        const choice = response.choices?.[0];
        if (!choice) {
            throw new LlmError('No response from LLM', 'API_ERROR');
        }

        const text = choice.message?.content || '';
        const usage = response.usage || {};

        return {
            text,
            tokens: {
                prompt: usage.prompt_tokens || 0,
                completion: usage.completion_tokens || 0,
                total: usage.total_tokens || 0
            },
            finishReason: choice.finish_reason === 'stop' ? 'stop' :
                choice.finish_reason === 'length' ? 'length' : 'error',
            latencyMs: Date.now() - startTime
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
