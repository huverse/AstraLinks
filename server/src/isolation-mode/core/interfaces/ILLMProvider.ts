/**
 * LLM Provider 接口
 * 
 * 抽象 LLM 调用，支持多种 Provider
 */

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMCompletionOptions {
    /** 模型名称 (可选，使用 Provider 默认) */
    model?: string;
    /** 温度 */
    temperature?: number;
    /** 最大 Token */
    maxTokens?: number;
    /** 停止序列 */
    stopSequences?: string[];
}

export interface LLMCompletionResult {
    /** 生成的内容 */
    content: string;
    /** 使用的 Token 数 */
    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    /** 完成原因 */
    finishReason: 'stop' | 'length' | 'error';
}

/**
 * LLM Provider 接口
 */
export interface ILLMProvider {
    /** Provider 名称 */
    readonly name: string;

    /**
     * 生成补全
     */
    complete(
        messages: LLMMessage[],
        options?: LLMCompletionOptions
    ): Promise<LLMCompletionResult>;

    /**
     * 流式生成补全
     */
    completeStream(
        messages: LLMMessage[],
        options?: LLMCompletionOptions
    ): AsyncGenerator<string, void, unknown>;

    /**
     * 检查 Provider 是否可用
     */
    isAvailable(): Promise<boolean>;
}

/**
 * LLM Provider 工厂接口
 */
export interface ILLMProviderFactory {
    /**
     * 获取 Provider
     * @param providerId Provider ID (如 'galaxyous', 'openai', 'anthropic')
     */
    getProvider(providerId: string): ILLMProvider;

    /**
     * 注册自定义 Provider
     */
    registerProvider(providerId: string, provider: ILLMProvider): void;

    /**
     * 获取所有可用 Provider
     */
    getAvailableProviders(): string[];
}
