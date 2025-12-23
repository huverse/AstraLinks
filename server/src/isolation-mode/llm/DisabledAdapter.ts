/**
 * Disabled LLM Adapter
 * 
 * 当 WE_LLM_ENABLED=false 时使用
 * 所有调用返回错误，不发起外部请求
 */

import { ILlmAdapter, LlmMessage, LlmGenerateOptions, LlmGenerateResult, LlmError } from './ILlmAdapter';

export class DisabledAdapter implements ILlmAdapter {
    readonly provider = 'disabled';
    readonly model = 'none';

    isAvailable(): boolean {
        return false;
    }

    async generate(
        _messages: LlmMessage[],
        _options?: LlmGenerateOptions
    ): Promise<LlmGenerateResult> {
        throw new LlmError(
            'LLM is disabled. Set WE_LLM_ENABLED=true to enable AI responses.',
            'DISABLED'
        );
    }
}

/** 单例 */
export const disabledAdapter = new DisabledAdapter();
