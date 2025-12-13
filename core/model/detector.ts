/**
 * 模型能力探测器
 * 
 * @module core/model/detector
 * @description 自动探测 AI 模型的能力和参数范围
 */

// ============================================
// 类型定义
// ============================================

/** 模型能力类型 */
export interface ModelCapabilities {
    id: string;
    provider: string;
    model: string;

    /** 基础能力 */
    capabilities: {
        chat: boolean;
        completion: boolean;
        embedding: boolean;
        vision: boolean;
        audio: boolean;
        functionCall: boolean;
        jsonMode: boolean;
        streaming: boolean;
    };

    /** 参数范围 */
    parameters: {
        maxTokens: { min: number; max: number; default: number };
        temperature: { min: number; max: number; default: number };
        topP: { min: number; max: number; default: number };
        frequencyPenalty?: { min: number; max: number; default: number };
        presencePenalty?: { min: number; max: number; default: number };
    };

    /** 上下文窗口 */
    contextWindow: number;

    /** 定价 (每百万 tokens) */
    pricing?: {
        inputPerMillion: number;
        outputPerMillion: number;
    };

    /** 探测元数据 */
    metadata: {
        detectedAt: string;
        expiresAt: string;
        confidence: number;
        source: 'api' | 'probe' | 'fallback';
    };
}

/** 探测选项 */
export interface DetectorOptions {
    /** API 端点 */
    endpoint: string;
    /** API Key */
    apiKey: string;
    /** 超时时间 (ms) */
    timeout?: number;
    /** 是否使用缓存 */
    useCache?: boolean;
}

// ============================================
// 预设模型能力
// ============================================

export const KNOWN_MODELS: Record<string, Partial<ModelCapabilities>> = {
    // OpenAI
    'gpt-4o': {
        provider: 'openai',
        capabilities: { chat: true, completion: true, embedding: false, vision: true, audio: true, functionCall: true, jsonMode: true, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 16384, default: 4096 },
            temperature: { min: 0, max: 2, default: 1 },
            topP: { min: 0, max: 1, default: 1 },
        },
        contextWindow: 128000,
        pricing: { inputPerMillion: 2.5, outputPerMillion: 10 },
    },
    'gpt-4o-mini': {
        provider: 'openai',
        capabilities: { chat: true, completion: true, embedding: false, vision: true, audio: false, functionCall: true, jsonMode: true, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 16384, default: 4096 },
            temperature: { min: 0, max: 2, default: 1 },
            topP: { min: 0, max: 1, default: 1 },
        },
        contextWindow: 128000,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    },
    'gpt-4-turbo': {
        provider: 'openai',
        capabilities: { chat: true, completion: true, embedding: false, vision: true, audio: false, functionCall: true, jsonMode: true, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 4096, default: 4096 },
            temperature: { min: 0, max: 2, default: 1 },
            topP: { min: 0, max: 1, default: 1 },
        },
        contextWindow: 128000,
        pricing: { inputPerMillion: 10, outputPerMillion: 30 },
    },

    // Claude (Anthropic)
    'claude-3-5-sonnet-20241022': {
        provider: 'anthropic',
        capabilities: { chat: true, completion: false, embedding: false, vision: true, audio: false, functionCall: true, jsonMode: false, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 8192, default: 4096 },
            temperature: { min: 0, max: 1, default: 1 },
            topP: { min: 0, max: 1, default: 1 },
        },
        contextWindow: 200000,
        pricing: { inputPerMillion: 3, outputPerMillion: 15 },
    },
    'claude-3-5-haiku-20241022': {
        provider: 'anthropic',
        capabilities: { chat: true, completion: false, embedding: false, vision: true, audio: false, functionCall: true, jsonMode: false, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 8192, default: 4096 },
            temperature: { min: 0, max: 1, default: 1 },
            topP: { min: 0, max: 1, default: 1 },
        },
        contextWindow: 200000,
        pricing: { inputPerMillion: 1, outputPerMillion: 5 },
    },

    // Google Gemini
    'gemini-2.0-flash-exp': {
        provider: 'google',
        capabilities: { chat: true, completion: false, embedding: false, vision: true, audio: true, functionCall: true, jsonMode: true, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 8192, default: 2048 },
            temperature: { min: 0, max: 2, default: 1 },
            topP: { min: 0, max: 1, default: 0.95 },
        },
        contextWindow: 1000000,
        pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    },
    'gemini-1.5-pro': {
        provider: 'google',
        capabilities: { chat: true, completion: false, embedding: false, vision: true, audio: true, functionCall: true, jsonMode: true, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 8192, default: 2048 },
            temperature: { min: 0, max: 2, default: 1 },
            topP: { min: 0, max: 1, default: 0.95 },
        },
        contextWindow: 2000000,
        pricing: { inputPerMillion: 1.25, outputPerMillion: 5 },
    },

    // DeepSeek
    'deepseek-chat': {
        provider: 'deepseek',
        capabilities: { chat: true, completion: true, embedding: false, vision: false, audio: false, functionCall: true, jsonMode: true, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 8192, default: 4096 },
            temperature: { min: 0, max: 2, default: 1 },
            topP: { min: 0, max: 1, default: 1 },
        },
        contextWindow: 64000,
        pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
    },
    'deepseek-reasoner': {
        provider: 'deepseek',
        capabilities: { chat: true, completion: true, embedding: false, vision: false, audio: false, functionCall: false, jsonMode: false, streaming: true },
        parameters: {
            maxTokens: { min: 1, max: 8192, default: 4096 },
            temperature: { min: 0, max: 2, default: 1 },
            topP: { min: 0, max: 1, default: 1 },
        },
        contextWindow: 64000,
        pricing: { inputPerMillion: 0.55, outputPerMillion: 2.19 },
    },
};

// ============================================
// 能力探测器
// ============================================

export class ModelCapabilityDetector {
    private cache: Map<string, ModelCapabilities> = new Map();
    private cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours

    /**
     * 获取模型能力
     */
    async getCapabilities(
        model: string,
        options?: DetectorOptions
    ): Promise<ModelCapabilities> {
        const cacheKey = `${options?.endpoint || 'default'}:${model}`;

        // 检查缓存
        if (options?.useCache !== false) {
            const cached = this.cache.get(cacheKey);
            if (cached && new Date(cached.metadata.expiresAt) > new Date()) {
                return cached;
            }
        }

        // 尝试从已知模型获取
        let capabilities = this.getFromKnownModels(model);

        // 如果是自定义端点，尝试探测
        if (options?.endpoint && options?.apiKey) {
            try {
                capabilities = await this.probeModel(model, options);
            } catch (error) {
                console.warn(`[Detector] Probe failed for ${model}, using fallback`);
            }
        }

        // 缓存结果
        this.cache.set(cacheKey, capabilities);

        return capabilities;
    }

    /**
     * 从已知模型获取
     */
    private getFromKnownModels(model: string): ModelCapabilities {
        const known = KNOWN_MODELS[model];
        const now = new Date();

        if (known) {
            return {
                id: `${known.provider}:${model}`,
                provider: known.provider!,
                model,
                capabilities: known.capabilities!,
                parameters: known.parameters!,
                contextWindow: known.contextWindow!,
                pricing: known.pricing,
                metadata: {
                    detectedAt: now.toISOString(),
                    expiresAt: new Date(now.getTime() + this.cacheExpiry).toISOString(),
                    confidence: 1.0,
                    source: 'fallback',
                },
            };
        }

        // 返回默认能力
        return this.getDefaultCapabilities(model);
    }

    /**
     * 默认能力
     */
    private getDefaultCapabilities(model: string): ModelCapabilities {
        const now = new Date();
        return {
            id: `unknown:${model}`,
            provider: 'unknown',
            model,
            capabilities: {
                chat: true,
                completion: true,
                embedding: false,
                vision: false,
                audio: false,
                functionCall: false,
                jsonMode: false,
                streaming: true,
            },
            parameters: {
                maxTokens: { min: 1, max: 4096, default: 2048 },
                temperature: { min: 0, max: 2, default: 1 },
                topP: { min: 0, max: 1, default: 1 },
            },
            contextWindow: 4096,
            metadata: {
                detectedAt: now.toISOString(),
                expiresAt: new Date(now.getTime() + this.cacheExpiry).toISOString(),
                confidence: 0.3,
                source: 'fallback',
            },
        };
    }

    /**
     * 探测模型能力
     */
    private async probeModel(
        model: string,
        options: DetectorOptions
    ): Promise<ModelCapabilities> {
        const now = new Date();
        const base = this.getFromKnownModels(model);

        // 尝试发送测试请求探测能力
        try {
            const response = await fetch(`${options.endpoint}/v1/models`, {
                headers: {
                    'Authorization': `Bearer ${options.apiKey}`,
                },
                signal: AbortSignal.timeout(options.timeout || 5000),
            });

            if (response.ok) {
                const data = await response.json();
                // 解析模型信息
                const modelInfo = data.data?.find((m: any) => m.id === model);

                if (modelInfo) {
                    return {
                        ...base,
                        contextWindow: modelInfo.context_window || base.contextWindow,
                        metadata: {
                            ...base.metadata,
                            confidence: 0.9,
                            source: 'api',
                        },
                    };
                }
            }
        } catch (error) {
            // 忽略错误，使用备用数据
        }

        // 尝试发送简单聊天请求探测
        try {
            const response = await fetch(`${options.endpoint}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${options.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 5,
                }),
                signal: AbortSignal.timeout(options.timeout || 10000),
            });

            if (response.ok) {
                return {
                    ...base,
                    capabilities: { ...base.capabilities, chat: true },
                    metadata: {
                        ...base.metadata,
                        confidence: 0.8,
                        source: 'probe',
                    },
                };
            }
        } catch (error) {
            // 忽略错误
        }

        return {
            ...base,
            metadata: {
                ...base.metadata,
                confidence: 0.5,
                source: 'fallback',
            },
        };
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * 获取所有已知模型
     */
    getKnownModels(): string[] {
        return Object.keys(KNOWN_MODELS);
    }
}

// 单例实例
export const modelDetector = new ModelCapabilityDetector();
