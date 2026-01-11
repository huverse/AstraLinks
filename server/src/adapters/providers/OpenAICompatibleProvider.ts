/**
 * OpenAI Compatible Provider
 *
 * 支持 OpenAI API 及所有兼容接口
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
    ToolCall,
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

// OpenAI API 响应类型
interface OpenAIUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
}

interface OpenAIChoice {
    message?: {
        content?: string;
        tool_calls?: unknown[];
    };
    finish_reason?: string;
}

interface OpenAIChatResponse {
    choices?: OpenAIChoice[];
    usage?: OpenAIUsage;
}

interface OpenAIEmbeddingData {
    embedding: number[];
}

interface OpenAIEmbeddingResponse {
    data: OpenAIEmbeddingData[];
    usage?: OpenAIUsage;
}

interface OpenAIImageData {
    url?: string;
    b64_json?: string;
}

interface OpenAIImageResponse {
    data: OpenAIImageData[];
}

export class OpenAICompatibleProvider implements IUnifiedAdapter {
    readonly providerId: string;
    readonly credentialId: string | null;
    readonly providerType: ProviderType = 'openai_compatible';

    private readonly client: AxiosInstance;
    private readonly defaultModel: string;
    private readonly maxRetries: number;
    private readonly capabilities: ProviderCapabilities;

    constructor(config: AdapterConfig) {
        this.providerId = config.provider.id;
        this.credentialId = config.credential?.id ?? null;
        this.defaultModel = config.defaultModel ?? 'gpt-4o-mini';
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.capabilities = config.provider.capabilities ?? {
            text: true,
            vision: true,
            stream: true,
            tools: true,
            embedding: true,
            image: true,
            audio: true
        };

        const baseURL = config.credential?.baseUrl ?? config.provider.baseUrl ?? 'https://api.openai.com/v1';
        const apiKey = config.credential?.apiKey ?? '';

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
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

        const requestBody: Record<string, unknown> = {
            model,
            messages: this.formatMessages(messages),
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature ?? 0.7,
            top_p: options.topP ?? 0.9,
            stream: false
        };

        if (options.stopSequences?.length) {
            requestBody.stop = options.stopSequences;
        }

        if (options.tools?.length) {
            requestBody.tools = options.tools;
            requestBody.tool_choice = options.toolChoice ?? 'auto';
        }

        const response = await this.request('/chat/completions', requestBody, options.timeout) as OpenAIChatResponse;
        const choice = response.choices?.[0];

        if (!choice) {
            throw new AdapterError('No response from API', 'API_ERROR', this.providerId);
        }

        const result: ChatResult = {
            text: choice.message?.content ?? '',
            tokens: this.extractUsage(response.usage),
            finishReason: this.mapFinishReason(choice.finish_reason),
            latencyMs: Date.now() - startTime
        };

        if (choice.message?.tool_calls) {
            result.toolCalls = choice.message.tool_calls as ToolCall[];
            result.finishReason = 'tool_calls';
        }

        return result;
    }

    async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string, void, unknown> {
        if (!this.hasCapability('stream')) {
            throw new NotSupportedError('stream', this.providerId);
        }

        const model = options.model ?? this.defaultModel;

        const requestBody = {
            model,
            messages: this.formatMessages(messages),
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature ?? 0.7,
            stream: true
        };

        const response = await this.client.post('/chat/completions', requestBody, {
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
                if (!trimmed || trimmed === 'data: [DONE]') continue;

                if (trimmed.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const content = json.choices?.[0]?.delta?.content;
                        if (content) yield content;
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        }
    }

    async embed(texts: string[], options: EmbedOptions = {}): Promise<EmbedResult> {
        if (!this.hasCapability('embedding')) {
            throw new NotSupportedError('embedding', this.providerId);
        }

        const startTime = Date.now();
        const model = options.model ?? 'text-embedding-3-small';

        const response = await this.request('/embeddings', {
            model,
            input: texts
        }, options.timeout) as unknown as OpenAIEmbeddingResponse;

        return {
            embeddings: response.data.map(d => d.embedding),
            model,
            tokens: response.usage?.total_tokens ?? 0,
            latencyMs: Date.now() - startTime
        };
    }

    async generateImage(prompt: string, options: ImageOptions = {}): Promise<ImageResult> {
        if (!this.hasCapability('image')) {
            throw new NotSupportedError('image', this.providerId);
        }

        const startTime = Date.now();
        const model = options.model ?? 'dall-e-3';

        const response = await this.request('/images/generations', {
            model,
            prompt,
            size: options.size ?? '1024x1024',
            quality: options.quality ?? 'standard',
            style: options.style ?? 'vivid',
            n: options.n ?? 1
        }, options.timeout ?? 120000) as unknown as OpenAIImageResponse;

        return {
            images: response.data.map(d => ({
                url: d.url,
                b64Json: d.b64_json
            })),
            model,
            latencyMs: Date.now() - startTime
        };
    }

    async generateAudio(text: string, options: AudioOptions = {}): Promise<AudioResult> {
        if (!this.hasCapability('audio')) {
            throw new NotSupportedError('audio', this.providerId);
        }

        const startTime = Date.now();
        const model = options.model ?? 'tts-1';

        const response = await this.client.post('/audio/speech', {
            model,
            input: text,
            voice: options.voice ?? 'alloy',
            speed: options.speed ?? 1.0,
            response_format: options.responseFormat ?? 'mp3'
        }, {
            responseType: 'arraybuffer',
            timeout: options.timeout ?? 60000
        });

        return {
            audioData: Buffer.from(response.data),
            contentType: `audio/${options.responseFormat ?? 'mp3'}`,
            latencyMs: Date.now() - startTime
        };
    }

    async toolCall(tools: ToolDefinition[], messages: ChatMessage[], options: ChatOptions = {}): Promise<ToolCallResult> {
        if (!this.hasCapability('tools')) {
            throw new NotSupportedError('tools', this.providerId);
        }

        const result = await this.chat(messages, {
            ...options,
            tools,
            toolChoice: options.toolChoice ?? 'auto'
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
            const response = await this.client.get('/models', { timeout: 10000 });
            const models = response.data?.data?.map((m: { id: string }) => m.id) ?? [];

            return {
                success: true,
                latencyMs: Date.now() - startTime,
                models
            };
        } catch (error: unknown) {
            const err = error as { response?: { status?: number }; message?: string };
            return {
                success: false,
                latencyMs: Date.now() - startTime,
                error: err.response?.status === 401 ? 'Invalid API key' : (err.message ?? 'Connection failed')
            };
        }
    }

    private formatMessages(messages: ChatMessage[]): unknown[] {
        return messages.map(m => {
            const msg: Record<string, unknown> = { role: m.role };

            if (typeof m.content === 'string') {
                msg.content = m.content;
            } else {
                msg.content = m.content.map(part => {
                    if (part.type === 'text') return { type: 'text', text: part.text };
                    if (part.type === 'image_url') return { type: 'image_url', image_url: part.imageUrl };
                    return part;
                });
            }

            if (m.name) msg.name = m.name;
            if (m.toolCallId) msg.tool_call_id = m.toolCallId;
            if (m.toolCalls) msg.tool_calls = m.toolCalls;

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

    private extractUsage(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }): TokenUsage {
        return {
            prompt: usage?.prompt_tokens ?? 0,
            completion: usage?.completion_tokens ?? 0,
            total: usage?.total_tokens ?? 0
        };
    }

    private mapFinishReason(reason?: string): ChatResult['finishReason'] {
        switch (reason) {
            case 'stop': return 'stop';
            case 'length': return 'length';
            case 'tool_calls': return 'tool_calls';
            default: return 'error';
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
