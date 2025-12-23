/**
 * Agent 私有上下文
 * 
 * 每个 Agent 独立维护，不与其他 Agent 共享
 * 
 * 注意：Agent 只能通过 Event 了解外部世界
 * 永远不能看到其他 Agent 的私有上下文
 */

import { Event, EventType } from '../core/types';

/**
 * Agent 私有上下文
 */
export class AgentContext {
    private agentId: string;
    private systemPrompt: string = '';
    private events: Event[] = [];
    private memory: string[] = [];
    private maxEvents: number = 50;  // 最多保留的事件数

    constructor(agentId: string) {
        this.agentId = agentId;
    }

    /**
     * 初始化上下文
     */
    initialize(systemPrompt: string): void {
        this.systemPrompt = systemPrompt;
        this.events = [];
        this.memory = [];
    }

    /**
     * 添加事件到上下文
     */
    addEvent(event: Event): void {
        this.events.push(event);

        // 如果超过最大数量，触发压缩
        if (this.events.length > this.maxEvents) {
            this.compress();
        }
    }

    /**
     * 压缩上下文
     * 将旧事件转换为摘要
     */
    private compress(): void {
        // 保留最近一半的事件
        const keepCount = Math.floor(this.maxEvents / 2);
        const oldEvents = this.events.slice(0, -keepCount);
        this.events = this.events.slice(-keepCount);

        // 将旧事件转换为摘要
        const summary = this.summarizeEvents(oldEvents);
        if (summary) {
            this.memory.push(summary);
        }
    }

    /**
     * 将事件转换为摘要
     */
    private summarizeEvents(events: Event[]): string {
        // TODO: 可以调用 LLM 生成更智能的摘要
        // 目前使用简单的文本拼接
        const speakers = new Set<string>();
        let speechCount = 0;

        events.forEach(e => {
            if (e.type === EventType.SPEECH) {
                speakers.add(e.speaker);
                speechCount++;
            }
        });

        return `[历史摘要] ${speakers.size} 位参与者进行了 ${speechCount} 次发言`;
    }

    /**
     * 获取完整上下文 (用于 LLM 调用)
     */
    getFullContext(): string {
        const parts: string[] = [];

        // 系统提示
        if (this.systemPrompt) {
            parts.push(`[系统] ${this.systemPrompt}`);
        }

        // 历史记忆摘要
        if (this.memory.length > 0) {
            parts.push(...this.memory);
        }

        // 近期事件
        this.events.forEach(e => {
            if (e.type === EventType.SPEECH) {
                const content = typeof e.content === 'string' ? e.content : JSON.stringify(e.content);
                parts.push(`[${e.speaker}] ${content}`);
            } else if (e.type === EventType.SUMMARY) {
                const content = typeof e.content === 'string' ? e.content : JSON.stringify(e.content);
                parts.push(`[主持人总结] ${content}`);
            } else if (e.type === EventType.SYSTEM) {
                const content = typeof e.content === 'string' ? e.content : JSON.stringify(e.content);
                parts.push(`[系统] ${content}`);
            }
        });

        return parts.join('\n');
    }

    /**
     * 构建 LLM 消息格式
     * 用于 Agent 调用 LLM 时传递上下文
     */
    buildMessages(): { role: 'system' | 'user' | 'assistant'; content: string }[] {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

        // 历史记忆作为 system 上下文
        if (this.memory.length > 0) {
            messages.push({
                role: 'system',
                content: `历史背景:\n${this.memory.join('\n')}`
            });
        }

        // 事件转换为对话历史
        this.events.forEach(e => {
            if (e.type === EventType.SPEECH) {
                const content = typeof e.content === 'string'
                    ? e.content
                    : (e.content as any)?.message || JSON.stringify(e.content);

                // 自己的发言是 assistant，其他人是 user
                const role = e.speaker === this.agentId ? 'assistant' : 'user';
                const speakerLabel = e.speaker === this.agentId ? '' : `[${e.speaker}] `;

                messages.push({
                    role,
                    content: `${speakerLabel}${content}`
                });
            } else if (e.type === EventType.SYSTEM) {
                const content = typeof e.content === 'string'
                    ? e.content
                    : (e.content as any)?.message || JSON.stringify(e.content);
                messages.push({
                    role: 'user',
                    content: `[系统提示] ${content}`
                });
            }
        });

        return messages;
    }

    /**
     * 获取摘要
     */
    getSummary(): string {
        return `Agent ${this.agentId}: ${this.events.length} 事件, ${this.memory.length} 记忆片段`;
    }

    /**
     * 重置上下文
     */
    reset(): void {
        this.systemPrompt = '';
        this.events = [];
        this.memory = [];
    }
}
