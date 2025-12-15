/**
 * Agent 执行器
 * 
 * @module core/agent/executor
 * @description 单个 Agent 的执行逻辑
 */

import { Agent, AgentResult, AgentStatus, DEFAULT_AGENT_CONFIG } from './types';

// ============================================
// Agent 执行器
// ============================================

export interface ExecuteOptions {
    apiKey: string;
    baseUrl?: string;
    maxTokens?: number;
    onProgress?: (status: AgentStatus, message: string) => void;
}

/**
 * 执行单个 Agent
 */
export async function executeAgent(
    agent: Agent,
    input: any,
    options: ExecuteOptions
): Promise<AgentResult> {
    const startTime = Date.now();
    const { apiKey, baseUrl, maxTokens = DEFAULT_AGENT_CONFIG.maxTokens, onProgress } = options;

    onProgress?.('thinking', `${agent.name} 正在思考...`);

    try {
        // 构建消息
        const messages: { role: string; content: string }[] = [
            { role: 'system', content: agent.systemPrompt },
            { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input, null, 2) },
        ];

        onProgress?.('executing', `${agent.name} 正在执行...`);

        // 调用 AI API
        const response = await callAI({
            messages,
            model: agent.model || DEFAULT_AGENT_CONFIG.model,
            provider: agent.provider || DEFAULT_AGENT_CONFIG.provider,
            temperature: agent.temperature ?? DEFAULT_AGENT_CONFIG.temperature,
            maxTokens,
            apiKey,
            baseUrl,
        });

        onProgress?.('completed', `${agent.name} 执行完成`);

        return {
            agentId: agent.id,
            status: 'completed',
            input,
            output: response.content,
            tokensUsed: response.tokens,
            duration: Date.now() - startTime,
        };
    } catch (error: any) {
        onProgress?.('failed', `${agent.name} 执行失败: ${error.message}`);

        return {
            agentId: agent.id,
            status: 'failed',
            input,
            output: null,
            error: error.message,
            tokensUsed: 0,
            duration: Date.now() - startTime,
        };
    }
}

// ============================================
// AI 调用
// ============================================

interface AICallOptions {
    messages: { role: string; content: string }[];
    model: string;
    provider: string;
    temperature: number;
    maxTokens: number;
    apiKey: string;
    baseUrl?: string;
}

interface AICallResponse {
    content: string;
    tokens: number;
}

async function callAI(options: AICallOptions): Promise<AICallResponse> {
    const { messages, model, provider, temperature, maxTokens, apiKey, baseUrl } = options;

    // 检测运行环境
    if (typeof window !== 'undefined') {
        // 浏览器: 使用后端代理
        const API_BASE = window.location.hostname === 'astralinks.xyz'
            ? 'https://astralinks.xyz'
            : 'http://localhost:3001';

        const response = await fetch(`${API_BASE}/api/proxy/openai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey,
                baseUrl,
                model,
                messages,
                temperature,
                maxTokens,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({})) as any;
            throw new Error(error.error || `API Error: ${response.status}`);
        }

        const data = await response.json() as any;
        return {
            content: data.choices?.[0]?.message?.content || '',
            tokens: data.usage?.total_tokens || 0,
        };
    }

    // 服务器端: 直接调用
    let url: string;
    let headers: Record<string, string>;
    let body: any;

    if (provider === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        headers = { 'Content-Type': 'application/json' };
        body = {
            contents: messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : m.role,
                parts: [{ text: m.content }]
            })),
            generationConfig: { temperature, maxOutputTokens: maxTokens }
        };
    } else {
        url = baseUrl ? `${baseUrl}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        };
        body = { model, messages, temperature, max_tokens: maxTokens };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (provider === 'gemini') {
        return {
            content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
            tokens: data.usageMetadata?.totalTokenCount || 0,
        };
    }

    return {
        content: data.choices?.[0]?.message?.content || '',
        tokens: data.usage?.total_tokens || 0,
    };
}
