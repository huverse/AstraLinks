/**
 * Unified Adapter - 统一适配器入口
 *
 * 提供统一的 AI 调用接口，自动处理日志记录
 */

import { pool } from '../config/database';
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
    UsageLogEntry,
    ProviderType,
    RequestType,
    UsageStatus
} from './types';
import { adapterRegistry } from './AdapterRegistry';
import { credentialService } from './encryption/CredentialService';
import { AdapterError } from './errors';

export class UnifiedAdapter implements IUnifiedAdapter {
    readonly providerId: string;
    readonly credentialId: string | null;
    readonly providerType: ProviderType;

    private readonly adapter: IUnifiedAdapter;
    private readonly userId: number;
    private readonly logUsage: boolean;

    private constructor(
        adapter: IUnifiedAdapter,
        userId: number,
        logUsage: boolean = true
    ) {
        this.adapter = adapter;
        this.userId = userId;
        this.logUsage = logUsage;
        this.providerId = adapter.providerId;
        this.credentialId = adapter.credentialId;
        this.providerType = adapter.providerType;
    }

    // 创建用户适配器
    static async forUser(
        userId: number,
        providerId: string,
        credentialId?: string,
        options?: { defaultModel?: string; timeout?: number; logUsage?: boolean }
    ): Promise<UnifiedAdapter> {
        const adapter = await adapterRegistry.createAdapter(userId, providerId, credentialId, options);
        return new UnifiedAdapter(adapter, userId, options?.logUsage ?? true);
    }

    // 创建系统适配器（使用环境变量）
    static async forSystem(
        providerType: ProviderType = 'openai_compatible',
        options?: { defaultModel?: string; timeout?: number; logUsage?: boolean }
    ): Promise<UnifiedAdapter> {
        const adapter = await adapterRegistry.createSystemAdapter(providerType, options);
        return new UnifiedAdapter(adapter, 0, options?.logUsage ?? false);
    }

    hasCapability(cap: keyof ProviderCapabilities): boolean {
        return this.adapter.hasCapability(cap);
    }

    async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
        const startTime = Date.now();
        let status: UsageStatus = 'success';
        let errorCode: string | undefined;
        let errorMessage: string | undefined;

        try {
            const result = await this.adapter.chat(messages, options);

            await this.logRequest({
                requestType: 'chat',
                model: options.model ?? 'default',
                promptTokens: result.tokens.prompt,
                completionTokens: result.tokens.completion,
                totalTokens: result.tokens.total,
                latencyMs: result.latencyMs,
                status: 'success'
            });

            return result;
        } catch (error) {
            const err = error as AdapterError;
            status = this.mapErrorToStatus(err);
            errorCode = err.code;
            errorMessage = err.message;

            await this.logRequest({
                requestType: 'chat',
                model: options.model ?? 'default',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                latencyMs: Date.now() - startTime,
                status,
                errorCode,
                errorMessage
            });

            throw error;
        }
    }

    async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string, void, unknown> {
        const startTime = Date.now();
        let tokenCount = 0;

        try {
            for await (const chunk of this.adapter.chatStream(messages, options)) {
                tokenCount += Math.ceil(chunk.length / 4); // 估算 token
                yield chunk;
            }

            await this.logRequest({
                requestType: 'chat',
                model: options.model ?? 'default',
                promptTokens: 0, // 流式无法准确获取
                completionTokens: tokenCount,
                totalTokens: tokenCount,
                latencyMs: Date.now() - startTime,
                status: 'success'
            });
        } catch (error) {
            const err = error as AdapterError;

            await this.logRequest({
                requestType: 'chat',
                model: options.model ?? 'default',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                latencyMs: Date.now() - startTime,
                status: this.mapErrorToStatus(err),
                errorCode: err.code,
                errorMessage: err.message
            });

            throw error;
        }
    }

    async embed(texts: string[], options: EmbedOptions = {}): Promise<EmbedResult> {
        const startTime = Date.now();

        try {
            const result = await this.adapter.embed(texts, options);

            await this.logRequest({
                requestType: 'embedding',
                model: options.model ?? 'default',
                promptTokens: result.tokens,
                completionTokens: 0,
                totalTokens: result.tokens,
                latencyMs: result.latencyMs,
                status: 'success'
            });

            return result;
        } catch (error) {
            const err = error as AdapterError;

            await this.logRequest({
                requestType: 'embedding',
                model: options.model ?? 'default',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                latencyMs: Date.now() - startTime,
                status: this.mapErrorToStatus(err),
                errorCode: err.code,
                errorMessage: err.message
            });

            throw error;
        }
    }

    async generateImage(prompt: string, options: ImageOptions = {}): Promise<ImageResult> {
        const startTime = Date.now();

        try {
            const result = await this.adapter.generateImage(prompt, options);

            await this.logRequest({
                requestType: 'image',
                model: options.model ?? 'default',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                latencyMs: result.latencyMs,
                status: 'success'
            });

            return result;
        } catch (error) {
            const err = error as AdapterError;

            await this.logRequest({
                requestType: 'image',
                model: options.model ?? 'default',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                latencyMs: Date.now() - startTime,
                status: this.mapErrorToStatus(err),
                errorCode: err.code,
                errorMessage: err.message
            });

            throw error;
        }
    }

    async generateAudio(text: string, options: AudioOptions = {}): Promise<AudioResult> {
        const startTime = Date.now();

        try {
            const result = await this.adapter.generateAudio(text, options);

            await this.logRequest({
                requestType: 'audio',
                model: options.model ?? 'default',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                latencyMs: result.latencyMs,
                status: 'success'
            });

            return result;
        } catch (error) {
            const err = error as AdapterError;

            await this.logRequest({
                requestType: 'audio',
                model: options.model ?? 'default',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                latencyMs: Date.now() - startTime,
                status: this.mapErrorToStatus(err),
                errorCode: err.code,
                errorMessage: err.message
            });

            throw error;
        }
    }

    async toolCall(tools: ToolDefinition[], messages: ChatMessage[], options: ChatOptions = {}): Promise<ToolCallResult> {
        const startTime = Date.now();

        try {
            const result = await this.adapter.toolCall(tools, messages, options);

            await this.logRequest({
                requestType: 'tool',
                model: options.model ?? 'default',
                promptTokens: result.tokens.prompt,
                completionTokens: result.tokens.completion,
                totalTokens: result.tokens.total,
                latencyMs: result.latencyMs,
                status: 'success'
            });

            return result;
        } catch (error) {
            const err = error as AdapterError;

            await this.logRequest({
                requestType: 'tool',
                model: options.model ?? 'default',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                latencyMs: Date.now() - startTime,
                status: this.mapErrorToStatus(err),
                errorCode: err.code,
                errorMessage: err.message
            });

            throw error;
        }
    }

    async testConnection(): Promise<ConnectionTestResult> {
        return this.adapter.testConnection();
    }

    private async logRequest(entry: Omit<UsageLogEntry, 'userId' | 'credentialId' | 'providerId'>): Promise<void> {
        if (!this.logUsage || this.userId === 0) return;

        try {
            await pool.execute(
                `INSERT INTO ai_usage_logs
                 (user_id, credential_id, provider_id, model, request_type,
                  prompt_tokens, completion_tokens, total_tokens, latency_ms,
                  status, error_code, error_message)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    this.userId,
                    this.credentialId,
                    this.providerId,
                    entry.model,
                    entry.requestType,
                    entry.promptTokens,
                    entry.completionTokens,
                    entry.totalTokens,
                    entry.latencyMs,
                    entry.status,
                    entry.errorCode ?? null,
                    entry.errorMessage ?? null
                ]
            );

            // 更新凭证最后使用时间
            if (this.credentialId && entry.status === 'success') {
                await credentialService.touchCredential(this.credentialId);
            }

            // 如果是认证错误，更新凭证状态
            if (entry.status === 'failed' && entry.errorCode === 'AUTH_ERROR' && this.credentialId) {
                await credentialService.updateCredentialStatus(this.credentialId, 'invalid', entry.errorMessage);
            }
        } catch (error) {
            // 日志记录失败不应影响主流程
            console.error('Failed to log AI usage:', error);
        }
    }

    private mapErrorToStatus(error: AdapterError): UsageStatus {
        switch (error.code) {
            case 'TIMEOUT': return 'timeout';
            case 'RATE_LIMIT': return 'rate_limited';
            default: return 'failed';
        }
    }
}
