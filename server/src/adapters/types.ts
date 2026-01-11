/**
 * Unified AI Provider Adapter - Type Definitions
 */

// Provider 类型
export type ProviderType = 'openai_compatible' | 'gemini' | 'claude' | 'custom';

export type CredentialStatus = 'active' | 'invalid' | 'expired' | 'revoked' | 'error' | 'deleted';

export type RequestType = 'chat' | 'embedding' | 'image' | 'audio' | 'video' | 'tool';

export type UsageStatus = 'success' | 'failed' | 'timeout' | 'rate_limited';

// Provider 配置（数据库 ai_providers 表）
export interface AIProvider {
    id: string;
    name: string;
    type: ProviderType;
    baseUrl: string | null;
    defaultHeaders: Record<string, string> | null;
    capabilities: ProviderCapabilities | null;
    defaultModels: ProviderModel[] | null;
    isBuiltin: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProviderCapabilities {
    text: boolean;
    vision: boolean;
    stream: boolean;
    tools: boolean;
    embedding: boolean;
    image: boolean;
    audio: boolean;
}

export interface ProviderModel {
    id: string;
    name: string;
    tier: 'free' | 'pro' | 'ultra';
}

// 用户凭证（数据库 ai_credentials 表）
export interface AICredential {
    id: string;
    userId: number;
    providerId: string;
    name: string | null;
    encryptedApiKey: string;
    encryptedHeaders: string | null;
    customBaseUrl: string | null;
    endpointId: string | null;
    keyFingerprint: string;
    encryptionKeyId: string;
    encryptionNonce: Buffer;
    encryptionTag: Buffer | null;
    status: CredentialStatus;
    lastUsedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// 解密后的凭证
export interface DecryptedCredential {
    id: string;
    providerId: string;
    apiKey: string;
    headers: Record<string, string> | null;
    baseUrl: string | null;
    endpointId: string | null;
}

// 消息格式
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | ContentPart[];
    name?: string;
    toolCallId?: string;
    toolCalls?: ToolCall[];
}

export interface ContentPart {
    type: 'text' | 'image_url' | 'audio_url';
    text?: string;
    imageUrl?: { url: string; detail?: 'low' | 'high' | 'auto' };
    audioUrl?: { url: string };
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

// 工具定义
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

// 生成选项
export interface ChatOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    timeout?: number;
    stream?: boolean;
    tools?: ToolDefinition[];
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface EmbedOptions {
    model?: string;
    timeout?: number;
}

export interface ImageOptions {
    model?: string;
    size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    n?: number;
    timeout?: number;
}

export interface AudioOptions {
    model?: string;
    voice?: string;
    speed?: number;
    responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac';
    timeout?: number;
}

// 结果类型
export interface ChatResult {
    text: string;
    tokens: TokenUsage;
    finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
    toolCalls?: ToolCall[];
    latencyMs: number;
}

export interface TokenUsage {
    prompt: number;
    completion: number;
    total: number;
}

export interface EmbedResult {
    embeddings: number[][];
    model: string;
    tokens: number;
    latencyMs: number;
}

export interface ImageResult {
    images: { url?: string; b64Json?: string }[];
    model: string;
    latencyMs: number;
}

export interface AudioResult {
    audioData: Buffer;
    contentType: string;
    latencyMs: number;
}

export interface ToolCallResult {
    message: ChatMessage;
    tokens: TokenUsage;
    finishReason: 'stop' | 'tool_calls';
    latencyMs: number;
}

export interface ConnectionTestResult {
    success: boolean;
    latencyMs: number;
    error?: string;
    models?: string[];
}

// 统一 Adapter 接口
export interface IUnifiedAdapter {
    readonly providerId: string;
    readonly credentialId: string | null;
    readonly providerType: ProviderType;

    // 文本生成
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown>;

    // Embedding
    embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult>;

    // 多模态
    generateImage(prompt: string, options?: ImageOptions): Promise<ImageResult>;
    generateAudio(text: string, options?: AudioOptions): Promise<AudioResult>;

    // 工具调用
    toolCall(tools: ToolDefinition[], messages: ChatMessage[], options?: ChatOptions): Promise<ToolCallResult>;

    // 连通性测试
    testConnection(): Promise<ConnectionTestResult>;

    // 能力检查
    hasCapability(cap: keyof ProviderCapabilities): boolean;
}

// 使用日志
export interface UsageLogEntry {
    userId: number;
    credentialId: string | null;
    providerId: string;
    model: string;
    requestType: RequestType;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    status: UsageStatus;
    errorCode?: string;
    errorMessage?: string;
    requestId?: string;
}

// Adapter 配置
export interface AdapterConfig {
    provider: AIProvider;
    credential?: DecryptedCredential;
    defaultModel?: string;
    timeout?: number;
    maxRetries?: number;
}

// 注意：错误类型在 ./errors/AdapterErrors.ts 中定义
// 使用 import { AdapterError } from './errors' 导入
