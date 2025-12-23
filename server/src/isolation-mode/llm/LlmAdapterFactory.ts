/**
 * LLM Adapter Factory
 * 
 * 根据配置创建合适的 LLM Adapter
 * 支持: 环境变量配置 / 用户自定义配置 (Galaxyous 配置中心)
 */

import { ILlmAdapter } from './ILlmAdapter';
import { DisabledAdapter, disabledAdapter } from './DisabledAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { worldEngineConfig } from '../../config/world-engine.config';
import { EncryptedLlmConfig } from '../core/types';
import { decryptLlmConfig, isValidEncryptedConfig } from '../utils/crypto';
import { isolationLogger } from '../../services/world-engine-logger';

// ============================================
// 从环境变量创建 (默认)
// ============================================

/**
 * 创建 LLM Adapter (从环境变量)
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

        default:
            isolationLogger.warn({ provider }, 'unknown_llm_provider_using_disabled');
            return disabledAdapter;
    }
}

// ============================================
// 从用户配置创建 (Galaxyous 配置中心)
// ============================================

/**
 * 从用户加密配置创建 LLM Adapter
 * 
 * @param encryptedConfig 加密的用户配置 (从前端传递)
 * @returns ILlmAdapter 实例
 */
export function createLlmAdapterFromUserConfig(encryptedConfig?: EncryptedLlmConfig): ILlmAdapter {
    // 如果没有配置，返回禁用适配器
    if (!encryptedConfig) {
        isolationLogger.debug('no_user_llm_config_provided');
        return disabledAdapter;
    }

    // 验证配置格式
    if (!isValidEncryptedConfig(encryptedConfig)) {
        isolationLogger.warn('invalid_encrypted_llm_config_format');
        return disabledAdapter;
    }

    try {
        // 解密配置
        const config = decryptLlmConfig(encryptedConfig);

        isolationLogger.info({
            provider: config.provider,
            model: config.modelName
        }, 'creating_adapter_from_user_config');

        switch (config.provider) {
            case 'GEMINI':
                return new GeminiAdapter({
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                    model: config.modelName,
                    timeout: 30000,
                    maxRetries: 2
                });

            case 'OPENAI_COMPATIBLE':
                // 使用 GeminiAdapter 的 OpenAI 兼容模式
                // 注: 如需完整支持，可创建 OpenAICompatibleAdapter
                return new GeminiAdapter({
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl || 'https://api.openai.com/v1',
                    model: config.modelName,
                    timeout: 30000,
                    maxRetries: 2
                });

            default:
                isolationLogger.warn({ provider: config.provider }, 'unsupported_user_llm_provider');
                return disabledAdapter;
        }
    } catch (error: any) {
        isolationLogger.error({ error: error.message }, 'failed_to_decrypt_llm_config');
        return disabledAdapter;
    }
}

// ============================================
// 全局默认实例
// ============================================

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

