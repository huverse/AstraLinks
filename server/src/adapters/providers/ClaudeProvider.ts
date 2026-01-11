/**
 * Claude (Anthropic) Provider
 *
 * Anthropic Claude API 原生适配器
 * API 格式与 OpenAI 不同，需要单独实现
 */

import axios, { AxiosInstance } from 'axios';
import {
    IUnifiedAdapter,
    ChatMessage,
    ChatOptions,
    ChatResult,
    EmbedOptions,
    EmbedResult,
    ImageOptions,
    ImageResult,
    AudioOptions,
    AudioResult,
    ToolDefinition,
    ToolCallResult,
    ConnectionTestResult,
    ProviderCapabilities,
    AdapterConfig,
    TokenUsage,
    ProviderType
} from '../types';
import { AdapterError, TimeoutError, RateLimitError, AuthError, NotSupportedError } from '../errors';

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 2;
const ANTHROPIC_VERSION = '2023-06-01';

// Anthropic API 响应类型
interface AnthropicUsage {
    input_tokens?: number;
    output_tokens?: number;
}

interface AnthropicContentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
}

interface AnthropicResponse {
    content?: AnthropicContentBlock[];
    usage?: AnthropicUsage;
    stop_reason?: string;
}

export class ClaudeProvider implements IUnifiedAdapter {
    readonly providerId: string;
    readonly credentialId: string | null;
    readonly providerType: ProviderType = 'claude';

    private readonly client: AxiosInstance;
    private readonly defaultModel: string;
    private readonly maxRetries: number;
    private readonly capabilities: ProviderCapabilities;

    constructor(config: AdapterConfig) {
        this.providerId = config.provider.id;
        this.credentialId = config.credential?.id ?? null;
        this.defaultModel = config.defaultModel ?? 'claude-sonnet-4-20250514';
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.capabilities = config.provider.capabilities ?? {
            text: true,
            vision: true,
            stream: true,
            tools: true,
            embedding: false,
            image: false,
            audio: false
        };

        const baseURL = config.credential?.baseUrl ?? config.provider.baseUrl ?? 'https://api.anthropic.com/v1';
        const apiKey = config.credential?.apiKey ?? '';

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION
        };

        // 合并自定义 headers
        if (config.provider.defaultHeaders) {
            Object.assign(headers, config.provider.defaultHeaders);
        }
        if (config.credential?.headers) {
            Object.assign(headers, config.credential.headers);
        }

        this.client = axios.create({
            baseURL: baseURL.replace(/\/+$/, ''),
            headers,
            timeout: config.timeout ?? DEFAULT_TIMEOUT
        });
    }

    hasCapability(cap: keyof ProviderCapabilities): boolean {
        return this.capabilities[cap] ?? false;
    }

    async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
        const startTime = Date.now();
        const model = options.model ?? this.defaultModel;

        // 分离 system 消息
        const systemMessage = messages.find(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        const requestBody: Record<string, unknown> = {
            model,
            messages: this.formatMessages(otherMessages),
            max_tokens: options.maxTokens ?? 4096
        };

        if (systemMessage && typeof systemMessage.content === 'string') {
            requestBody.system = systemMessage.content;
        }

        if (options.temperature !== undefined) {
            requestBody.temperature = options.temperature;
        }

        if (options.topP !== undefined) {
            requestBody.top_p = options.topP;
        }

        if (options.stopSequences?.length) {
            requestBody.stop_sequences = options.stopSequences;
        }

        if (options.tools?.length) {
            requestBody.tools = options.tools.map(t => ({
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters
            }));
        }

        const response = await this.request('/messages', requestBody, options.timeout) as unknown as AnthropicResponse;

        // 解析响应
        let text = '';
        const toolCalls: ChatResult['toolCalls'] = [];

        for (const block of response.content ?? []) {
            if (block.type === 'text') {
                text += block.text;
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id!,
                    type: 'function',
                    function: {
                        name: block.name!,
                        arguments: JSON.stringify(block.input)
                    }
                });
            }
        }

        const result: ChatResult = {
            text,
            tokens: {
                prompt: response.usage?.input_tokens ?? 0,
                completion: response.usage?.output_tokens ?? 0,
                total: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)
            },
            finishReason: this.mapStopReason(response.stop_reason),
            latencyMs: Date.now() - startTime
        };

        if (toolCalls.length > 0) {
            result.toolCalls = toolCalls;
            result.finishReason = 'tool_calls';
        }

        return result;
    }

    async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string, void, unknown> {
        if (!this.hasCapability('stream')) {
            throw new NotSupportedError('stream', this.providerId);
        }

        const model = options.model ?? this.defaultModel;
        const systemMessage = messages.find(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        const requestBody: Record<string, unknown> = {
            model,
            messages: this.formatMessages(otherMessages),
            max_tokens: options.maxTokens ?? 4096,
            stream: true
        };

        if (systemMessage && typeof systemMessage.content === 'string') {
            requestBody.system = systemMessage.content;
        }

        if (options.temperature !== undefined) {
            requestBody.temperature = options.temperature;
        }

        const response = await this.client.post('/messages', requestBody, {
            responseType: 'stream',
            timeout: options.timeout
        });

        let buffer = '';

        for await (const chunk of response.data) {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                try {
                    const json = JSON.parse(trimmed.slice(6));

                    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                        yield json.delta.text;
                    }
                } catch {
                    // Skip malformed JSON
                }
            }
        }
    }

    async embed(texts: string[], options: EmbedOptions = {}): Promise<EmbedResult> {
        throw new NotSupportedError('embedding', this.providerId);
    }

    async generateImage(prompt: string, options: ImageOptions = {}): Promise<ImageResult> {
        throw new NotSupportedError('image', this.providerId);
    }

    async generateAudio(text: string, options: AudioOptions = {}): Promise<AudioResult> {
        throw new NotSupportedError('audio', this.providerId);
    }

    async toolCall(tools: ToolDefinition[], messages: ChatMessage[], options: ChatOptions = {}): Promise<ToolCallResult> {
        if (!this.hasCapability('tools')) {
            throw new NotSupportedError('tools', this.providerId);
        }

        const result = await this.chat(messages, {
            ...options,
            tools
        });

        return {
            message: {
                role: 'assistant',
                content: result.text,
                toolCalls: result.toolCalls
            },
            tokens: result.tokens,
            finishReason: result.finishReason === 'tool_calls' ? 'tool_calls' : 'stop',
            latencyMs: result.latencyMs
        };
    }

    async testConnection(): Promise<ConnectionTestResult> {
        const startTime = Date.now();

        try {
            // Anthropic 没有 /models 端点，发送一个最小请求来测试
            await this.chat([{ role: 'user', content: 'hi' }], { maxTokens: 1 });

            return {
                success: true,
                latencyMs: Date.now() - startTime,
                models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514']
            };
        } catch (error: unknown) {
            const err = error as { code?: string; message?: string };
            return {
                success: false,
                latencyMs: Date.now() - startTime,
                error: err.code === 'AUTH_ERROR' ? 'Invalid API key' : (err.message ?? 'Connection failed')
            };
        }
    }

    private formatMessages(messages: ChatMessage[]): unknown[] {
        return messages.map(m => {
            const msg: Record<string, unknown> = { role: m.role === 'assistant' ? 'assistant' : 'user' };

            if (typeof m.content === 'string') {
                msg.content = m.content;
            } else {
                msg.content = m.content.map(part => {
                    if (part.type === 'text') {
                        return { type: 'text', text: part.text };
                    }
                    if (part.type === 'image_url' && part.imageUrl?.url) {
                        // Base64 或 URL
                        const match = part.imageUrl.url.match(/^data:(image\/\w+);base64,(.+)$/);
                        if (match) {
                            return {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: match[1],
                                    data: match[2]
                                }
                            };
                        }
                        return {
                            type: 'image',
                            source: {
                                type: 'url',
                                url: part.imageUrl.url
                            }
                        };
                    }
                    return { type: 'text', text: '' };
                });
            }

            // 处理工具调用结果
            if (m.role === 'tool' && m.toolCallId) {
                return {
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: m.toolCallId,
                        content: m.content
                    }]
                };
            }

            return msg;
        });
    }

    private async request(endpoint: string, data: unknown, timeout?: number): Promise<Record<string, unknown>> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.client.post(endpoint, data, { timeout });
                return response.data;
            } catch (error: unknown) {
                const err = error as { code?: string; message?: string; response?: { status?: number; data?: { error?: { message?: string } } } };
                lastError = err as Error;

                if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                    throw new TimeoutError('Request timed out', this.providerId);
                }

                if (err.response?.status === 429) {
                    throw new RateLimitError('Rate limit exceeded', this.providerId);
                }

                if (err.response?.status === 401) {
                    throw new AuthError('Invalid API key', this.providerId);
                }

                if (err.response?.status === 403) {
                    throw new AuthError('Access denied - check API key permissions', this.providerId);
                }

                if (attempt < this.maxRetries && err.response?.status && err.response.status >= 500) {
                    await this.sleep(1000 * (attempt + 1));
                    continue;
                }

                throw new AdapterError(
                    err.response?.data?.error?.message ?? err.message ?? 'API error',
                    'API_ERROR',
                    this.providerId,
                    { status: err.response?.status }
                );
            }
        }

        throw new AdapterError(
            `Request failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
            'API_ERROR',
            this.providerId
        );
    }

    private mapStopReason(reason?: string): ChatResult['finishReason'] {
        switch (reason) {
            case 'end_turn':
            case 'stop_sequence':
                return 'stop';
            case 'max_tokens':
                return 'length';
            case 'tool_use':
                return 'tool_calls';
            default:
                return 'error';
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
