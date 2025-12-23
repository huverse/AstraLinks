/**
 * LLM Adapter Factory
 * 
 * 根据配置创建合适的 LLM Adapter
 */

import { ILlmAdapter } from './ILlmAdapter';
import { DisabledAdapter, disabledAdapter } from './DisabledAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { worldEngineConfig } from '../../config/world-engine.config';

// ============================================
// 工厂
// ============================================

/**
 * 创建 LLM Adapter
 * 
 * 根据 WE_LLM_ENABLED 和 WE_LLM_PROVIDER 返回合适的 adapter
 */
export function createLlmAdapter(): ILlmAdapter {
    // 检查 feature flag
    if (!worldEngineConfig.llm.enabled) {
        return disabledAdapter;
    }

    const provider = worldEngineConfig.llm.provider?.toLowerCase() || 'gemini';

    switch (provider) {
        case 'gemini':
            return new GeminiAdapter({
                model: worldEngineConfig.llm.model,
                apiKey: worldEngineConfig.llm.key,
                timeout: 30000,
                maxRetries: 2
            });

        // 可扩展其他提供商
        // case 'openai':
        //     return new OpenAIAdapter({ ... });

        default:
            console.warn(`[LLM] Unknown provider "${provider}", using disabled adapter`);
            return disabledAdapter;
    }
}

/** 默认 adapter 实例 (延迟初始化) */
let _defaultAdapter: ILlmAdapter | null = null;

export function getDefaultLlmAdapter(): ILlmAdapter {
    if (!_defaultAdapter) {
        _defaultAdapter = createLlmAdapter();
    }
    return _defaultAdapter;
}

/** 重置默认 adapter (用于测试或配置变更) */
export function resetDefaultLlmAdapter(): void {
    _defaultAdapter = null;
}
