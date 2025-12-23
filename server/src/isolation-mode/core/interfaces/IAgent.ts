/**
 * Agent 接口定义
 */

import { AgentConfig, AgentState, AgentMessage } from '../types';
import { DiscussionEvent } from '../types';

/**
 * Agent 实例接口
 * 
 * 每个 Agent 维护独立的上下文和记忆
 */
export interface IAgent {
    /** Agent 配置 */
    readonly config: AgentConfig;

    /** 当前状态 */
    readonly state: AgentState;

    /**
     * 初始化 Agent
     * @param sessionId 会话 ID
     */
    initialize(sessionId: string): Promise<void>;

    /**
     * 接收事件 (从 Shared Event Log)
     * Agent 可以选择性地处理事件
     */
    receiveEvent(event: DiscussionEvent): Promise<void>;

    /**
     * 生成发言
     * @param prompt 主持人的指示或上下文
     * @returns 发言内容
     */
    generateResponse(prompt?: string): Promise<AgentMessage>;

    /**
     * 获取 Agent 的私有记忆摘要
     */
    getMemorySummary(): string;

    /**
     * 重置 Agent 状态
     */
    reset(): void;

    /**
     * 销毁 Agent 实例
     */
    destroy(): Promise<void>;
}

/**
 * Agent 工厂接口
 */
export interface IAgentFactory {
    /**
     * 创建 Agent 实例
     */
    create(config: AgentConfig): IAgent;

    /**
     * 从预设创建 Agent
     */
    createFromPreset(presetId: string, overrides?: Partial<AgentConfig>): IAgent;
}
