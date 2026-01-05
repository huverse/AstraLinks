/**
 * Future Letters - AI Writing Assistance Service
 * 使用 Galaxyous 配置中心的 LLM 配置
 */

import { pool } from '../../config/database';
import type { RowDataPacket } from 'mysql2';
import { decryptConfigApiKeys } from '../../utils/encryption';
import { getDefaultLlmAdapter } from '../../isolation-mode/llm/LlmAdapterFactory';
import { GeminiAdapter } from '../../isolation-mode/llm/GeminiAdapter';
import { OpenAICompatibleAdapter } from '../../isolation-mode/llm/OpenAICompatibleAdapter';
import type { ILlmAdapter, LlmMessage } from '../../isolation-mode/llm/ILlmAdapter';
import type { WritingAssistRequest, WritingAssistResponse } from './types';

// ============================================
// Error Types
// ============================================

export type WritingAssistErrorCode =
    | 'NO_CONFIG'
    | 'INVALID_CONFIG'
    | 'NO_MODEL'
    | 'MODEL_UNAVAILABLE'
    | 'EMPTY_RESPONSE'
    | 'LLM_ERROR';

export class WritingAssistError extends Error {
    constructor(
        message: string,
        public readonly code: WritingAssistErrorCode,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'WritingAssistError';
    }
}

// ============================================
// 配置获取
// ============================================

interface UserLlmConfig {
    provider: string;
    baseUrl?: string;
    apiKey: string;
    modelName: string;
    temperature?: number;
}

/**
 * 从配置中心获取用户第一个 LLM 配置
 */
async function getUserFirstLlmConfig(userId: number): Promise<UserLlmConfig | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT config_data FROM user_configs
         WHERE user_id = ? AND config_type = 'participant'
         ORDER BY updated_at DESC LIMIT 1`,
        [userId]
    );

    if (!rows.length || !rows[0].config_data) {
        return null;
    }

    try {
        let configData = rows[0].config_data;

        // 解析 JSON (可能是字符串或已解析的对象)
        if (typeof configData === 'string') {
            configData = JSON.parse(configData);
        }

        // 解密 API Key
        const decrypted = decryptConfigApiKeys(configData);

        // 支持数组格式 (participants) 和对象格式
        const config = Array.isArray(decrypted) ? decrypted[0]?.config : decrypted;

        if (!config || !config.apiKey || !config.modelName) {
            return null;
        }

        return {
            provider: config.provider || 'openai-compatible',
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            modelName: config.modelName,
            temperature: config.temperature,
        };
    } catch (error) {
        console.error('Failed to parse user LLM config:', error);
        return null;
    }
}

/**
 * 为用户创建 LLM Adapter
 */
async function createAdapterForUser(userId: number): Promise<{ adapter: ILlmAdapter; config: UserLlmConfig | null }> {
    const userConfig = await getUserFirstLlmConfig(userId);

    if (userConfig) {
        // 直接构造 adapter
        const normalizedProvider = normalizeProviderName(userConfig.provider);
        if (normalizedProvider === 'gemini') {
            return {
                adapter: new GeminiAdapter({
                    apiKey: userConfig.apiKey,
                    model: userConfig.modelName,
                }),
                config: userConfig,
            };
        } else {
            return {
                adapter: new OpenAICompatibleAdapter({
                    apiKey: userConfig.apiKey,
                    baseUrl: userConfig.baseUrl || 'https://api.openai.com/v1',
                    model: userConfig.modelName,
                }),
                config: userConfig,
            };
        }
    }

    // 使用系统默认 adapter
    return {
        adapter: getDefaultLlmAdapter(),
        config: null,
    };
}

function normalizeProviderName(provider: string): 'gemini' | 'openai-compatible' {
    const p = provider.toLowerCase();
    if (p === 'gemini' || p === 'google') {
        return 'gemini';
    }
    return 'openai-compatible';
}

// ============================================
// AI 辅助写作
// ============================================

const ASSIST_TYPE_PROMPTS: Record<string, string> = {
    improve: '请帮我润色和改进以下信件内容，使其更加流畅、优美、有感染力。保持原意，但提升表达质量。',
    expand: '请帮我扩展以下信件内容，添加更多细节、情感表达或相关的内容，使信件更加丰富和完整。',
    simplify: '请帮我简化以下信件内容，使其更加简洁明了、易于理解，去除冗余部分但保留核心信息。',
    emotional: '请帮我增强以下信件的情感表达，使其更加真挚、感人，更能打动收信人。',
};

/**
 * 执行 AI 写作辅助
 */
export async function composeWritingAssist(
    userId: number,
    request: WritingAssistRequest
): Promise<WritingAssistResponse> {
    const { content, assistType, context } = request;

    if (!content?.trim()) {
        throw new WritingAssistError('内容不能为空', 'EMPTY_RESPONSE');
    }

    // 获取 adapter
    const { adapter, config } = await createAdapterForUser(userId);

    if (!adapter.isAvailable()) {
        throw new WritingAssistError(
            config ? '配置的模型当前不可用' : '未配置 AI 模型',
            config ? 'MODEL_UNAVAILABLE' : 'NO_CONFIG'
        );
    }

    // 构建提示词
    const systemPrompt = `你是一位专业的信件写作助手。你的任务是帮助用户改进他们写给亲友的信件。

要求：
1. 保持信件的私人性质和真诚感
2. 保留作者的个人风格和语气
3. 使用简体中文回复
4. 直接输出改进后的信件内容，不要添加任何解释性文字`;

    const assistPrompt = ASSIST_TYPE_PROMPTS[assistType] || ASSIST_TYPE_PROMPTS.improve;

    let userPrompt = `${assistPrompt}\n\n原文：\n${content}`;
    if (context) {
        userPrompt += `\n\n补充背景：${context}`;
    }

    const messages: LlmMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];

    try {
        const result = await adapter.generate(messages, {
            maxTokens: 2048,
            temperature: 0.7,
        });

        if (!result.text?.trim()) {
            throw new WritingAssistError('AI 返回了空内容', 'EMPTY_RESPONSE');
        }

        return {
            suggestion: result.text.trim(),
            provider: config?.provider || adapter.provider,
            modelName: config?.modelName || adapter.model,
        };
    } catch (error: any) {
        if (error instanceof WritingAssistError) {
            throw error;
        }
        // 不暴露原始错误详情，只记录到日志
        console.error('AI writing assist error:', error);
        throw new WritingAssistError(
            error.message || 'AI 生成失败',
            'LLM_ERROR'
            // 不传递原始 error 对象，避免泄露敏感信息
        );
    }
}
