/**
 * Adapter Registry - 适配器注册表
 *
 * 管理 AI Provider 和凭证，创建适配器实例
 */

import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import {
    AIProvider,
    IUnifiedAdapter,
    AdapterConfig,
    ProviderType,
    ProviderCapabilities
} from './types';
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { ClaudeProvider } from './providers/ClaudeProvider';
import { credentialService } from './encryption/CredentialService';
import { AdapterError } from './errors';

export class AdapterRegistry {
    private providerCache: Map<string, AIProvider> = new Map();
    private adapterCache: Map<string, IUnifiedAdapter> = new Map();

    // 获取所有激活的 Provider
    async listProviders(): Promise<AIProvider[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM ai_providers WHERE is_active = TRUE ORDER BY is_builtin DESC, name ASC'
        );
        return rows.map(row => this.rowToProvider(row));
    }

    // 获取单个 Provider
    async getProvider(providerId: string): Promise<AIProvider | null> {
        const cached = this.providerCache.get(providerId);
        if (cached) return cached;

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM ai_providers WHERE id = ?',
            [providerId]
        );

        if (rows.length === 0) return null;

        const provider = this.rowToProvider(rows[0]);
        this.providerCache.set(providerId, provider);
        return provider;
    }

    // 根据类型获取 Provider
    async getProviderByType(type: ProviderType): Promise<AIProvider | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM ai_providers WHERE type = ? AND is_active = TRUE LIMIT 1',
            [type]
        );

        if (rows.length === 0) return null;
        return this.rowToProvider(rows[0]);
    }

    // 创建适配器（使用用户凭证）
    async createAdapter(
        userId: number,
        providerId: string,
        credentialId?: string,
        options?: { defaultModel?: string; timeout?: number; maxRetries?: number }
    ): Promise<IUnifiedAdapter> {
        const cacheKey = `${userId}:${providerId}:${credentialId ?? 'default'}`;
        const cached = this.adapterCache.get(cacheKey);
        if (cached) return cached;

        const provider = await this.getProvider(providerId);
        if (!provider) {
            throw new AdapterError(`Provider not found: ${providerId}`, 'VALIDATION', providerId);
        }

        if (!provider.isActive) {
            throw new AdapterError(`Provider is disabled: ${providerId}`, 'VALIDATION', providerId);
        }

        let credential = undefined;
        if (credentialId) {
            credential = await credentialService.getUserCredential(userId, credentialId);
            if (!credential) {
                throw new AdapterError(`Credential not found: ${credentialId}`, 'AUTH_ERROR', providerId);
            }
        }

        const config: AdapterConfig = {
            provider,
            credential,
            defaultModel: options?.defaultModel,
            timeout: options?.timeout,
            maxRetries: options?.maxRetries
        };

        const adapter = this.instantiateAdapter(config);
        this.adapterCache.set(cacheKey, adapter);

        return adapter;
    }

    // 使用环境变量创建默认适配器（用于系统级调用）
    async createSystemAdapter(
        providerType: ProviderType = 'openai_compatible',
        options?: { defaultModel?: string; timeout?: number }
    ): Promise<IUnifiedAdapter> {
        const cacheKey = `system:${providerType}`;
        const cached = this.adapterCache.get(cacheKey);
        if (cached) return cached;

        let provider = await this.getProviderByType(providerType);

        // 如果数据库中没有，创建一个临时的
        if (!provider) {
            provider = this.createDefaultProvider(providerType);
        }

        // 从环境变量获取凭证
        const envCredential = this.getEnvCredential(providerType);

        const config: AdapterConfig = {
            provider,
            credential: envCredential,
            defaultModel: options?.defaultModel,
            timeout: options?.timeout
        };

        const adapter = this.instantiateAdapter(config);
        this.adapterCache.set(cacheKey, adapter);

        return adapter;
    }

    // 创建或更新 Provider
    async upsertProvider(provider: Omit<AIProvider, 'createdAt' | 'updatedAt'>): Promise<string> {
        const id = provider.id ?? crypto.randomUUID();

        await pool.execute(
            `INSERT INTO ai_providers
             (id, name, type, base_url, default_headers, capabilities, default_models, is_builtin, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             type = VALUES(type),
             base_url = VALUES(base_url),
             default_headers = VALUES(default_headers),
             capabilities = VALUES(capabilities),
             default_models = VALUES(default_models),
             is_active = VALUES(is_active)`,
            [
                id,
                provider.name,
                provider.type,
                provider.baseUrl,
                provider.defaultHeaders ? JSON.stringify(provider.defaultHeaders) : null,
                provider.capabilities ? JSON.stringify(provider.capabilities) : null,
                provider.defaultModels ? JSON.stringify(provider.defaultModels) : null,
                provider.isBuiltin,
                provider.isActive
            ]
        );

        this.providerCache.delete(id);
        return id;
    }

    // 初始化内置 Provider
    async initBuiltinProviders(): Promise<void> {
        const builtins: Omit<AIProvider, 'createdAt' | 'updatedAt'>[] = [
            {
                id: 'openai',
                name: 'OpenAI',
                type: 'openai_compatible',
                baseUrl: 'https://api.openai.com/v1',
                defaultHeaders: null,
                capabilities: { text: true, vision: true, stream: true, tools: true, embedding: true, image: true, audio: true },
                defaultModels: [
                    { id: 'gpt-4o', name: 'GPT-4o', tier: 'pro' },
                    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'free' },
                    { id: 'o1-preview', name: 'o1 Preview', tier: 'ultra' }
                ],
                isBuiltin: true,
                isActive: true
            },
            {
                id: 'gemini',
                name: 'Google Gemini',
                type: 'gemini',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                defaultHeaders: null,
                capabilities: { text: true, vision: true, stream: true, tools: true, embedding: true, image: false, audio: false },
                defaultModels: [
                    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tier: 'free' },
                    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tier: 'pro' }
                ],
                isBuiltin: true,
                isActive: true
            },
            {
                id: 'anthropic',
                name: 'Anthropic Claude',
                type: 'claude',
                baseUrl: 'https://api.anthropic.com/v1',
                defaultHeaders: { 'anthropic-version': '2023-06-01' },
                capabilities: { text: true, vision: true, stream: true, tools: true, embedding: false, image: false, audio: false },
                defaultModels: [
                    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'pro' },
                    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tier: 'free' }
                ],
                isBuiltin: true,
                isActive: true
            },
            {
                id: 'deepseek',
                name: 'DeepSeek',
                type: 'openai_compatible',
                baseUrl: 'https://api.deepseek.com',
                defaultHeaders: null,
                capabilities: { text: true, vision: false, stream: true, tools: true, embedding: false, image: false, audio: false },
                defaultModels: [
                    { id: 'deepseek-chat', name: 'DeepSeek Chat', tier: 'free' },
                    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', tier: 'pro' }
                ],
                isBuiltin: true,
                isActive: true
            }
        ];

        for (const provider of builtins) {
            await this.upsertProvider(provider);
        }
    }

    // 使用指定 API Key 创建适配器（用于密钥验证，不缓存）
    async createAdapterWithKey(
        providerId: string,
        apiKey: string,
        options?: { baseUrl?: string; headers?: Record<string, string>; timeout?: number }
    ): Promise<IUnifiedAdapter> {
        const provider = await this.getProvider(providerId);
        if (!provider) {
            throw new AdapterError(`Provider not found: ${providerId}`, 'VALIDATION', providerId);
        }

        const config: AdapterConfig = {
            provider,
            credential: {
                id: 'temp-key-validation',
                providerId,
                apiKey,
                headers: options?.headers ?? null,
                baseUrl: options?.baseUrl ?? null,
                endpointId: null
            },
            timeout: options?.timeout
        };

        // 不缓存，因为这是临时验证用的
        return this.instantiateAdapter(config);
    }

    // 清除缓存
    clearCache(): void {
        this.providerCache.clear();
        this.adapterCache.clear();
    }

    // 清除特定用户的缓存
    clearUserCache(userId: number): void {
        for (const key of this.adapterCache.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.adapterCache.delete(key);
            }
        }
    }

    private instantiateAdapter(config: AdapterConfig): IUnifiedAdapter {
        switch (config.provider.type) {
            case 'gemini':
                return new GeminiProvider(config);
            case 'claude':
                return new ClaudeProvider(config);
            case 'openai_compatible':
            case 'custom':
            default:
                return new OpenAICompatibleProvider(config);
        }
    }

    private createDefaultProvider(type: ProviderType): AIProvider {
        const defaults: Record<ProviderType, Partial<AIProvider>> = {
            openai_compatible: {
                id: 'default-openai',
                name: 'Default OpenAI',
                baseUrl: 'https://api.openai.com/v1'
            },
            gemini: {
                id: 'default-gemini',
                name: 'Default Gemini',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
            },
            claude: {
                id: 'default-claude',
                name: 'Default Claude',
                baseUrl: 'https://api.anthropic.com/v1'
            },
            custom: {
                id: 'default-custom',
                name: 'Custom Provider',
                baseUrl: null
            }
        };

        return {
            id: defaults[type].id!,
            name: defaults[type].name!,
            type,
            baseUrl: defaults[type].baseUrl ?? null,
            defaultHeaders: null,
            capabilities: { text: true, vision: false, stream: true, tools: false, embedding: false, image: false, audio: false },
            defaultModels: null,
            isBuiltin: false,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    private getEnvCredential(type: ProviderType): { id: string; providerId: string; apiKey: string; headers: null; baseUrl: string | null; endpointId: null } | undefined {
        const envMap: Record<ProviderType, { keyEnv: string; urlEnv?: string }> = {
            openai_compatible: { keyEnv: 'OPENAI_API_KEY', urlEnv: 'OPENAI_BASE_URL' },
            gemini: { keyEnv: 'GEMINI_API_KEY' },
            claude: { keyEnv: 'ANTHROPIC_API_KEY' },
            custom: { keyEnv: 'CUSTOM_API_KEY', urlEnv: 'CUSTOM_BASE_URL' }
        };

        const env = envMap[type];
        const apiKey = process.env[env.keyEnv];

        if (!apiKey) return undefined;

        return {
            id: `env-${type}`,
            providerId: `default-${type}`,
            apiKey,
            headers: null,
            baseUrl: env.urlEnv ? process.env[env.urlEnv] ?? null : null,
            endpointId: null
        };
    }

    private rowToProvider(row: RowDataPacket): AIProvider {
        return {
            id: row.id,
            name: row.name,
            type: row.type,
            baseUrl: row.base_url,
            defaultHeaders: row.default_headers ? JSON.parse(row.default_headers) : null,
            capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
            defaultModels: row.default_models ? JSON.parse(row.default_models) : null,
            isBuiltin: row.is_builtin,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

// 单例
export const adapterRegistry = new AdapterRegistry();
