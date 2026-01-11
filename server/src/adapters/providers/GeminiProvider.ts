/**
 * Gemini Provider
 *
 * Google Gemini API 适配器
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

// Gemini API 响应类型
interface GeminiUsageMetadata {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
}

interface GeminiPart {
    text?: string;
    functionCall?: {
        name: string;
        args: Record<string, unknown>;
    };
}

interface GeminiContent {
    parts?: GeminiPart[];
}

interface GeminiCandidate {
    content?: GeminiContent;
    finishReason?: string;
}

interface GeminiChatResponse {
    candidates?: GeminiCandidate[];
    usageMetadata?: GeminiUsageMetadata;
}

interface GeminiEmbeddingResponse {
    embedding?: {
        values?: number[];
    };
}

export class GeminiProvider implements IUnifiedAdapter {
    readonly providerId: string;
    readonly credentialId: string | null;
    readonly providerType: ProviderType = 'gemini';

    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly defaultModel: string;
    private readonly maxRetries: number;
    private readonly timeout: number;
    private readonly capabilities: ProviderCapabilities;

    constructor(config: AdapterConfig) {
        this.providerId = config.provider.id;
        this.credentialId = config.credential?.id ?? null;
        this.apiKey = config.credential?.apiKey ?? '';
        this.baseUrl = config.credential?.baseUrl ?? config.provider.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
        this.defaultModel = config.defaultModel ?? 'gemini-2.0-flash';
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
        this.capabilities = config.provider.capabilities ?? {
            text: true,
            vision: true,
            stream: true,
            tools: true,
            embedding: true,
            image: false,
            audio: false
        };
    }

    hasCapability(cap: keyof ProviderCapabilities): boolean {
        return this.capabilities[cap] ?? false;
    }

    async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
        const startTime = Date.now();
        const model = options.model ?? this.defaultModel;

        const contents = this.convertMessages(messages);
        const systemInstruction = this.extractSystemInstruction(messages);

        const requestBody: Record<string, unknown> = {
            contents,
            generationConfig: {
                maxOutputTokens: options.maxTokens ?? 4096,
                temperature: options.temperature ?? 0.7,
                topP: options.topP ?? 0.9,
                stopSequences: options.stopSequences ?? []
            }
        };

        if (systemInstruction) {
            requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        if (options.tools?.length) {
            requestBody.tools = [{
                functionDeclarations: options.tools.map(t => t.function)
            }];
        }

        const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
        const response = await this.request(url, requestBody, options.timeout) as GeminiChatResponse;
        const candidate = response.candidates?.[0];

        if (!candidate) {
            throw new AdapterError('No response from Gemini API', 'API_ERROR', this.providerId);
        }

        const text = candidate.content?.parts?.[0]?.text ?? '';
        const usage = response.usageMetadata;

        const result: ChatResult = {
            text,
            tokens: {
                prompt: usage?.promptTokenCount ?? 0,
                completion: usage?.candidatesTokenCount ?? 0,
                total: usage?.totalTokenCount ?? 0
            },
            finishReason: this.mapFinishReason(candidate.finishReason),
            latencyMs: Date.now() - startTime
        };

        // 处理工具调用
        const functionCall = candidate.content?.parts?.find(p => p.functionCall);
        if (functionCall?.functionCall) {
            result.toolCalls = [{
                id: `call_${Date.now()}`,
                type: 'function',
                function: {
                    name: functionCall.functionCall.name,
                    arguments: JSON.stringify(functionCall.functionCall.args)
                }
            }];
            result.finishReason = 'tool_calls';
        }

        return result;
    }

    async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string, void, unknown> {
        if (!this.hasCapability('stream')) {
            throw new NotSupportedError('stream', this.providerId);
        }

        const model = options.model ?? this.defaultModel;
        const contents = this.convertMessages(messages);
        const systemInstruction = this.extractSystemInstruction(messages);

        const requestBody: Record<string, unknown> = {
            contents,
            generationConfig: {
                maxOutputTokens: options.maxTokens ?? 4096,
                temperature: options.temperature ?? 0.7
            }
        };

        if (systemInstruction) {
            requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

        const response = await axios.post(url, requestBody, {
            responseType: 'stream',
            timeout: options.timeout ?? this.timeout,
            headers: { 'Content-Type': 'application/json' }
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
                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) yield text;
                } catch {
                    // Skip malformed JSON
                }
            }
        }
    }

    async embed(texts: string[], options: EmbedOptions = {}): Promise<EmbedResult> {
        if (!this.hasCapability('embedding')) {
            throw new NotSupportedError('embedding', this.providerId);
        }

        const startTime = Date.now();
        const model = options.model ?? 'text-embedding-004';

        const embeddings: number[][] = [];
        let totalTokens = 0;

        // Gemini embedding API 需要逐个请求
        for (const text of texts) {
            const url = `${this.baseUrl}/models/${model}:embedContent?key=${this.apiKey}`;
            const response = await this.request(url, {
                model: `models/${model}`,
                content: { parts: [{ text }] }
            }, options.timeout) as GeminiEmbeddingResponse;

            embeddings.push(response.embedding?.values ?? []);
            totalTokens += text.length / 4; // 估算
        }

        return {
            embeddings,
            model,
            tokens: Math.ceil(totalTokens),
            latencyMs: Date.now() - startTime
        };
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
            const url = `${this.baseUrl}/models?key=${this.apiKey}`;
            const response = await axios.get(url, { timeout: 10000 });
            const models = response.data?.models?.map((m: { name: string }) => m.name.replace('models/', '')) ?? [];

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
                error: err.response?.status === 400 ? 'Invalid API key' : (err.message ?? 'Connection failed')
            };
        }
    }

    private convertMessages(messages: ChatMessage[]): unknown[] {
        return messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: typeof m.content === 'string'
                    ? [{ text: m.content }]
                    : m.content.map(part => {
                        if (part.type === 'text') return { text: part.text };
                        if (part.type === 'image_url' && part.imageUrl?.url) {
                            // Base64 inline data
                            const match = part.imageUrl.url.match(/^data:(\w+\/\w+);base64,(.+)$/);
                            if (match) {
                                return { inlineData: { mimeType: match[1], data: match[2] } };
                            }
                            return { fileData: { fileUri: part.imageUrl.url } };
                        }
                        return { text: '' };
                    })
            }));
    }

    private extractSystemInstruction(messages: ChatMessage[]): string | null {
        const systemMsg = messages.find(m => m.role === 'system');
        if (systemMsg && typeof systemMsg.content === 'string') {
            return systemMsg.content;
        }
        return null;
    }

    private async request(url: string, data: unknown, timeout?: number): Promise<Record<string, unknown>> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await axios.post(url, data, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: timeout ?? this.timeout
                });
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

                if (err.response?.status === 400) {
                    const errMsg = err.response?.data?.error?.message ?? '';
                    // 仅当明确是 API key 问题时才抛 AuthError
                    if (errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('invalid')) {
                        throw new AuthError('Invalid API key', this.providerId);
                    }
                    throw new AdapterError(errMsg ?? 'Bad request', 'VALIDATION', this.providerId);
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

    private mapFinishReason(reason?: string): ChatResult['finishReason'] {
        switch (reason) {
            case 'STOP': return 'stop';
            case 'MAX_TOKENS': return 'length';
            default: return 'error';
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
