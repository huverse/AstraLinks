/**
 * LLM Adapter Interface
 * 
 * 统一的 LLM 调用抽象层
 */

// ============================================
// 类型定义
// ============================================

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LlmGenerateOptions {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    timeout?: number;
}

export interface LlmGenerateResult {
    text: string;
    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    finishReason: 'stop' | 'length' | 'error';
    latencyMs: number;
}

// ============================================
// 接口定义
// ============================================

/**
 * LLM Adapter 接口
 * 
 * 所有 LLM 提供商必须实现此接口
 */
export interface ILlmAdapter {
    /** 提供商名称 */
    readonly provider: string;

    /** 模型名称 */
    readonly model: string;

    /** 是否可用 */
    isAvailable(): boolean;

    /**
     * 生成文本
     *
     * @param messages 消息历史
     * @param options 生成选项
     * @returns 生成结果
     */
    generate(
        messages: LlmMessage[],
        options?: LlmGenerateOptions
    ): Promise<LlmGenerateResult>;

    /**
     * 流式生成文本
     *
     * @param messages 消息历史
     * @param options 生成选项
     * @returns 流式文本生成器
     */
    generateStream?(
        messages: LlmMessage[],
        options?: LlmGenerateOptions
    ): AsyncGenerator<string, void, unknown>;
}

// ============================================
// 错误类型
// ============================================

export class LlmError extends Error {
    constructor(
        message: string,
        public readonly code: 'DISABLED' | 'TIMEOUT' | 'RATE_LIMIT' | 'API_ERROR' | 'VALIDATION',
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'LlmError';
    }
}

// ============================================
// 配置类型
// ============================================

export interface LlmAdapterConfig {
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    timeout: number;
    maxRetries: number;
}
