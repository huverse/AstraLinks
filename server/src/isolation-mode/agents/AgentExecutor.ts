/**
 * Agent 执行器
 * 
 * 实现 IAgent 接口，执行 Agent 逻辑
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, AgentState, AgentMessage, DiscussionEvent } from '../core/types';
import { IAgent } from '../core/interfaces';
import { AgentContext } from './AgentContext';

/**
 * Agent 执行器实现
 */
export class AgentExecutor implements IAgent {
    readonly config: AgentConfig;
    private _state: AgentState;
    private context: AgentContext;
    private sessionId: string | null = null;

    constructor(config: AgentConfig) {
        this.config = config;
        this._state = {
            agentId: config.id,
            status: 'idle',
            speakCount: 0,
            totalTokens: 0,
            lastActiveAt: Date.now(),
        };
        this.context = new AgentContext(config.id);
    }

    get state(): AgentState {
        return { ...this._state };
    }

    /**
     * 初始化 Agent
     */
    async initialize(sessionId: string): Promise<void> {
        this.sessionId = sessionId;
        this._state.status = 'idle';
        this.context.initialize(this.config.systemPrompt);

        // TODO: 调用 LLM Provider 进行初始化 (如需要)
    }

    /**
     * 接收事件
     * Agent 根据事件类型选择处理方式
     */
    async receiveEvent(event: DiscussionEvent): Promise<void> {
        // 只处理与自己相关或公共的事件
        if (event.sourceId === this.config.id) {
            return; // 忽略自己发出的事件
        }

        // 记录到私有上下文
        this.context.addEvent(event);

        // TODO: 根据事件类型触发不同处理
        switch (event.type) {
            case 'moderator:direct':
                // 主持人指定发言
                if ((event as any).payload?.targetAgentId === this.config.id) {
                    this._state.status = 'thinking';
                }
                break;
            case 'agent:speak':
                // 其他 Agent 发言，可能需要响应
                break;
            default:
                break;
        }
    }

    /**
     * 生成发言
     */
    async generateResponse(prompt?: string): Promise<AgentMessage> {
        this._state.status = 'thinking';
        this._state.lastActiveAt = Date.now();

        // TODO: 调用 LLM Provider 生成回复
        // 1. 构建上下文消息
        // 2. 调用 LLM
        // 3. 解析响应

        // 占位实现
        const message: AgentMessage = {
            id: uuidv4(),
            agentId: this.config.id,
            content: '// TODO: 实现 LLM 调用',
            timestamp: Date.now(),
            tokens: 0,
        };

        this._state.speakCount += 1;
        this._state.status = 'idle';

        return message;
    }

    /**
     * 获取记忆摘要
     */
    getMemorySummary(): string {
        return this.context.getSummary();
    }

    /**
     * 重置状态
     */
    reset(): void {
        this._state = {
            agentId: this.config.id,
            status: 'idle',
            speakCount: 0,
            totalTokens: 0,
            lastActiveAt: Date.now(),
        };
        this.context.reset();
    }

    /**
     * 销毁实例
     */
    async destroy(): Promise<void> {
        this.context.reset();
        this.sessionId = null;
    }
}
