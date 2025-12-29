/**
 * Agent 类型定义
 */

import { EncryptedLlmConfig } from './session.types';

/**
 * Agent 独立 LLM 配置
 * 允许每个 Agent 使用不同的模型（Claude vs GPT vs Gemini）
 */
export interface AgentLlmConfig {
    /** 使用会话级配置 (默认) */
    useSessionConfig?: boolean;
    /** 独立的加密 LLM 配置 */
    llmConfig?: EncryptedLlmConfig;
    /** 配置来源标识 (用于 UI 显示) */
    configSource?: 'session' | 'custom' | 'galaxyous';
    /** Galaxyous 配置中心的配置 ID */
    galaxyousConfigId?: string;
}

export interface AgentConfig {
    /** 唯一标识符 */
    id: string;
    /** 显示名称 */
    name: string;
    /** 角色类型 */
    role: AgentRole;
    /** LLM Provider 配置 ID (旧版兼容) */
    llmProviderId: string;
    /** 系统提示词 */
    systemPrompt: string;
    /** 人格描述 */
    personality?: string;
    /** 立场 (辩论场景) */
    stance?: 'for' | 'against' | 'neutral';
    /** Agent 独立 LLM 配置 */
    agentLlmConfig?: AgentLlmConfig;
    /** 发言长度限制 (maxTokens)，默认 1024 */
    maxTokens?: number;
    /** 额外配置 */
    metadata?: Record<string, unknown>;
}

export type AgentRole =
    | 'debater'      // 辩论者
    | 'critic'       // 批评者
    | 'supporter'    // 支持者
    | 'analyst'      // 分析师
    | 'mediator'     // 调解者
    | 'custom';      // 自定义

export interface AgentState {
    /** Agent ID */
    agentId: string;
    /** 当前状态 */
    status: 'idle' | 'thinking' | 'speaking' | 'waiting';
    /** 发言次数 */
    speakCount: number;
    /** 累计 Token */
    totalTokens: number;
    /** 最后活动时间 */
    lastActiveAt: number;
}

export interface AgentMessage {
    /** 消息 ID */
    id: string;
    /** Agent ID */
    agentId: string;
    /** 消息内容 */
    content: string;
    /** 时间戳 */
    timestamp: number;
    /** Token 数 */
    tokens?: number;
}
