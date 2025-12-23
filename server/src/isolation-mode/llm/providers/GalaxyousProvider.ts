/**
 * Galaxyous LLM Provider
 * 
 * 复用现有 Galaxyous 配置中心的 API
 */

import { ILLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult } from '../../core/interfaces';

/**
 * Galaxyous Provider 实现
 * 
 * 复用 App.tsx 中的 participants 配置和 aiService
 */
export class GalaxyousProvider implements ILLMProvider {
    readonly name = 'galaxyous';

    /**
     * 生成补全
     */
    async complete(
        messages: LLMMessage[],
        options?: LLMCompletionOptions
    ): Promise<LLMCompletionResult> {
        // TODO: 调用 Galaxyous aiService
        // 1. 获取活跃的 participant 配置
        // 2. 构建请求
        // 3. 调用 API

        // 占位实现
        return {
            content: '// TODO: 集成 Galaxyous aiService',
            tokens: {
                prompt: 0,
                completion: 0,
                total: 0,
            },
            finishReason: 'stop',
        };
    }

    /**
     * 流式生成补全
     */
    async *completeStream(
        messages: LLMMessage[],
        options?: LLMCompletionOptions
    ): AsyncGenerator<string, void, unknown> {
        // TODO: 实现流式调用
        yield '// TODO: 集成 Galaxyous 流式 API';
    }

    /**
     * 检查是否可用
     */
    async isAvailable(): Promise<boolean> {
        // TODO: 检查是否有可用的 participant 配置
        return true;
    }
}
