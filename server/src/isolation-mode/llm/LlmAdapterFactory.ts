/**
 * LLM Adapter Factory
 *
 * 根据配置创建合适的 LLM Adapter
 * 支持: 环境变量配置 / 用户自定义配置 (Galaxyous 配置中心)
 */

import { ILlmAdapter } from './ILlmAdapter';
import { DisabledAdapter, disabledAdapter } from './DisabledAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter';
import { worldEngineConfig } from '../../config/world-engine.config';
import { EncryptedLlmConfig } from '../core/types';
import { decryptLlmConfig, isValidEncryptedConfig } from '../utils/crypto';
import { isolationLogger } from '../../services/world-engine-logger';

// ============================================
// Provider 类型定义与规范化
// ============================================

/**
 * 支持的 LLM Provider 类型
 *
 * - gemini: Google Gemini API
 * - openai-compatible: OpenAI 及所有兼容 API (Claude via proxy, DeepSeek, Ollama, vLLM 等)
 * - disabled: 禁用
 *
 * 注意: 所有非 Gemini 的 provider 都会被路由到 openai-compatible
 * 因为大多数 LLM API 都兼容 OpenAI 的 /chat/completions 格式
 */
export type LlmProviderType = 'gemini' | 'openai-compatible' | 'disabled';

/**
 * Provider 别名映射表
 * 支持各种常见的 provider 名称，统一映射到内部类型
 */
const PROVIDER_ALIASES: Record<string, LlmProviderType> = {
    // Gemini
    'gemini': 'gemini',
    'GEMINI': 'gemini',
    'google': 'gemini',
    'GOOGLE': 'gemini',

    // OpenAI 及兼容 API
    'openai': 'openai-compatible',
    'openai-compatible': 'openai-compatible',
    'openai_compatible': 'openai-compatible',
    'openai-compat': 'openai-compatible',
    'openai_compat': 'openai-compatible',
    'OPENAI_COMPATIBLE': 'openai-compatible',
    'OPENAI': 'openai-compatible',

    // Claude/Anthropic (通过 OpenAI 兼容代理)
    'claude': 'openai-compatible',
    'CLAUDE': 'openai-compatible',
    'anthropic': 'openai-compatible',
    'ANTHROPIC': 'openai-compatible',

    // DeepSeek
    'deepseek': 'openai-compatible',
    'DEEPSEEK': 'openai-compatible',

    // 本地模型
    'ollama': 'openai-compatible',
    'OLLAMA': 'openai-compatible',
    'vllm': 'openai-compatible',
    'VLLM': 'openai-compatible',
    'local': 'openai-compatible',
    'LOCAL': 'openai-compatible',

    // 自定义 (默认使用 OpenAI 兼容格式)
    'custom': 'openai-compatible',
    'CUSTOM': 'openai-compatible',
};

/**
 * 规范化 provider 名称
 * 未知的 provider 默认使用 openai-compatible (因为大多数 API 都兼容)
 */
function normalizeProvider(provider: string | undefined): LlmProviderType {
    if (!provider) return 'gemini';
    // 对于未知的 provider，默认使用 openai-compatible
    return PROVIDER_ALIASES[provider] ?? 'openai-compatible';
}

/** Adapter 配置 */
interface AdapterConfig {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
}

const DEFAULT_ADAPTER_OPTIONS = { timeout: 30000, maxRetries: 2 };

/**
 * 根据 provider 类型创建 Adapter
 */
function createAdapterByType(type: LlmProviderType, config: AdapterConfig): ILlmAdapter {
    const opts = { ...DEFAULT_ADAPTER_OPTIONS, ...config };

    switch (type) {
        case 'gemini':
            return new GeminiAdapter(opts);
        case 'openai-compatible':
            return new OpenAICompatibleAdapter(opts);
        default:
            return disabledAdapter;
    }
}

// ============================================
// 从环境变量创建 (默认)
// ============================================

/**
 * 创建 LLM Adapter (从环境变量)
 */
export function createLlmAdapter(): ILlmAdapter {
    if (!worldEngineConfig.llm.enabled) {
        return disabledAdapter;
    }

    const providerType = normalizeProvider(worldEngineConfig.llm.provider);

    if (providerType === 'disabled') {
        isolationLogger.warn({ provider: worldEngineConfig.llm.provider }, 'unknown_llm_provider');
        return disabledAdapter;
    }

    return createAdapterByType(providerType, {
        model: worldEngineConfig.llm.model,
        apiKey: worldEngineConfig.llm.key,
        baseUrl: worldEngineConfig.llm.baseUrl,
    });
}

// ============================================
// 从用户配置创建 (Galaxyous 配置中心)
// ============================================

/**
 * 从用户加密配置创建 LLM Adapter
 */
export function createLlmAdapterFromUserConfig(encryptedConfig?: EncryptedLlmConfig): ILlmAdapter {
    if (!encryptedConfig) {
        isolationLogger.debug('no_user_llm_config_provided');
        return disabledAdapter;
    }

    if (!isValidEncryptedConfig(encryptedConfig)) {
        isolationLogger.warn('invalid_encrypted_llm_config_format');
        return disabledAdapter;
    }

    try {
        const config = decryptLlmConfig(encryptedConfig);
        const providerType = normalizeProvider(config.provider);

        isolationLogger.info({ provider: providerType, model: config.modelName }, 'creating_adapter_from_user_config');

        if (providerType === 'disabled') {
            isolationLogger.warn({ provider: config.provider }, 'unsupported_user_llm_provider');
            return disabledAdapter;
        }

        return createAdapterByType(providerType, {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl || (providerType === 'openai-compatible' ? 'https://api.openai.com/v1' : undefined),
            model: config.modelName,
        });
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

