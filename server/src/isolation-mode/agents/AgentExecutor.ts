/**
 * Agent 执行器
 * 
 * 实现 IAgent 接口，执行 Agent 逻辑
 * 集成 LLM Adapter 进行真正的 AI 调用
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, AgentState, AgentMessage, Event, EventType } from '../core/types';
import { IAgent } from '../core/interfaces';
import { AgentContext } from './AgentContext';
import { ILlmAdapter, LlmMessage, LlmError, getDefaultLlmAdapter } from '../llm';
import { worldEngineConfig } from '../../config/world-engine.config';

/**
 * Agent 执行器实现
 */
export class AgentExecutor implements IAgent {
    readonly config: AgentConfig;
    private _state: AgentState;
    private context: AgentContext;
    private sessionId: string | null = null;
    private llmAdapter: ILlmAdapter;

    constructor(config: AgentConfig, llmAdapter?: ILlmAdapter) {
        this.config = config;
        this._state = {
            agentId: config.id,
            status: 'idle',
            speakCount: 0,
            totalTokens: 0,
            lastActiveAt: Date.now(),
        };
        this.context = new AgentContext(config.id);
        this.llmAdapter = llmAdapter || getDefaultLlmAdapter();
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
    }

    /**
     * 接收事件
     * Agent 根据事件类型选择处理方式
     */
    async receiveEvent(event: Event): Promise<void> {
        // 只处理与自己相关或公共的事件
        if (event.speaker === this.config.id) {
            return; // 忽略自己发出的事件
        }

        // 记录到私有上下文
        this.context.addEvent(event);

        // 根据事件类型触发不同处理
        switch (event.type) {
            case EventType.SYSTEM:
                // 系统事件，检查是否有指令
                const content = event.content as any;
                if (content?.action === 'DIRECT_SPEAK' && content?.targetAgentId === this.config.id) {
                    this._state.status = 'thinking';
                }
                break;
            case EventType.SPEECH:
                // 其他 Agent 发言，可能需要响应
                break;
            default:
                break;
        }
    }

    /**
     * 生成发言
     * 
     * 调用 LLM Adapter 生成真正的 AI 回复
     */
    async generateResponse(prompt?: string): Promise<AgentMessage> {
        this._state.status = 'thinking';
        this._state.lastActiveAt = Date.now();

        try {
            // 1. 检查 LLM 是否可用
            if (!this.llmAdapter.isAvailable()) {
                throw new LlmError(
                    'LLM is unavailable. Provide a valid API key or enable LLM configuration.',
                    'DISABLED'
                );
            }

            // 2. 构建消息历史
            const messages = this.buildLlmMessages(prompt);

            // 3. 调用 LLM
            const result = await this.llmAdapter.generate(messages, {
                maxTokens: 1024,
                temperature: 0.7,
                timeout: worldEngineConfig.llm.timeout || 30000
            });

            // 4. 更新 token 统计
            this._state.totalTokens += result.tokens.total;
            this._state.speakCount += 1;
            this._state.status = 'idle';

            // 5. 返回消息
            return {
                id: uuidv4(),
                agentId: this.config.id,
                content: result.text,
                timestamp: Date.now(),
                tokens: result.tokens.total,
            };

        } catch (error: any) {
            this._state.status = 'idle';

            // LLM 禁用时返回明确错误消息
            if (error instanceof LlmError && error.code === 'DISABLED') {
                return {
                    id: uuidv4(),
                    agentId: this.config.id,
                    content: `[LLM Disabled] ${this.config.name} 无法发言: AI 功能未启用`,
                    timestamp: Date.now(),
                    tokens: 0,
                };
            }

            // 其他错误
            return {
                id: uuidv4(),
                agentId: this.config.id,
                content: `[Error] ${this.config.name} 发言失败: ${error.message}`,
                timestamp: Date.now(),
                tokens: 0,
            };
        }
    }

    /**
     * 构建 LLM 消息历史
     */
    private buildLlmMessages(additionalPrompt?: string): LlmMessage[] {
        const messages: LlmMessage[] = [];

        // System prompt
        if (this.config.systemPrompt) {
            messages.push({
                role: 'system',
                content: this.config.systemPrompt
            });
        }

        // 上下文历史
        const contextMessages = this.context.buildMessages();
        messages.push(...contextMessages);

        // 额外 prompt
        if (additionalPrompt) {
            messages.push({
                role: 'user',
                content: additionalPrompt
            });
        }

        // 如果没有用户消息，添加触发语
        if (!messages.some(m => m.role === 'user')) {
            messages.push({
                role: 'user',
                content: '请根据当前讨论发表你的观点。'
            });
        }

        return messages;
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
