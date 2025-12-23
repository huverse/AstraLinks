/**
 * 主持人 LLM
 * 
 * 负责智能决策，调用 LLM
 */

import { Event, EventType } from '../core/types';
import { IModeratorLLM, ILLMProvider, LLMMessage } from '../core/interfaces';

/**
 * 主持人 LLM 实现
 */
export class ModeratorLLM implements IModeratorLLM {
    private llmProvider: ILLMProvider | null = null;

    /**
     * 设置 LLM Provider
     */
    setProvider(provider: ILLMProvider): void {
        this.llmProvider = provider;
    }

    /**
     * 生成开场白
     */
    async generateOpening(topic: string, agents: string[]): Promise<string> {
        if (!this.llmProvider) {
            return `欢迎参加今天的讨论！\n\n讨论主题：${topic}\n\n参与者：${agents.join('、')}\n\n请各位依次发表观点。`;
        }

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: '你是一位专业的讨论主持人。请为以下讨论生成一段简洁有力的开场白。',
            },
            {
                role: 'user',
                content: `主题：${topic}\n参与者：${agents.join('、')}`,
            },
        ];

        const result = await this.llmProvider.complete(messages, {
            maxTokens: 200,
            temperature: 0.7,
        });

        return result.content;
    }

    /**
     * 生成中场总结
     */
    async generateSummary(events: Event[]): Promise<string> {
        if (!this.llmProvider) {
            return `目前已有 ${events.length} 条发言。`;
        }

        // 提取发言内容
        const speakEvents = events.filter(e => e.type === EventType.SPEECH);
        const summary = speakEvents
            .map(e => {
                const content = typeof e.content === 'string' ? e.content : JSON.stringify(e.content);
                return `${e.speaker}: ${content}`;
            })
            .join('\n');

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: '你是一位专业的讨论主持人。请对以下讨论内容进行简洁的中场总结。',
            },
            {
                role: 'user',
                content: summary,
            },
        ];

        const result = await this.llmProvider.complete(messages, {
            maxTokens: 300,
            temperature: 0.5,
        });

        return result.content;
    }

    /**
     * 生成结束语
     */
    async generateClosing(events: Event[]): Promise<string> {
        if (!this.llmProvider) {
            return '感谢各位的精彩讨论！本次讨论到此结束。';
        }

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: '你是一位专业的讨论主持人。请为讨论生成一段简洁的结束语。',
            },
            {
                role: 'user',
                content: `讨论共有 ${events.length} 条发言。请总结并结束讨论。`,
            },
        ];

        const result = await this.llmProvider.complete(messages, {
            maxTokens: 200,
            temperature: 0.7,
        });

        return result.content;
    }

    /**
     * 决定是否干预
     */
    async shouldIntervene(events: Event[]): Promise<boolean> {
        // TODO: 分析讨论内容，决定是否需要干预
        // 例如：讨论偏题、争论过于激烈、某人发言过多等
        return false;
    }

    /**
     * 生成干预内容
     */
    async generateIntervention(events: Event[]): Promise<string> {
        if (!this.llmProvider) {
            return '请各位保持讨论的主题聚焦和专业性。';
        }

        // TODO: 实现智能干预生成
        return '请各位保持讨论的主题聚焦和专业性。';
    }

    /**
     * 评估讨论质量
     */
    async evaluateDiscussion(events: Event[]): Promise<{
        score: number;
        feedback: string;
    }> {
        // TODO: 实现智能评估
        return {
            score: 7.5,
            feedback: '讨论总体表现良好，建议增加更多数据支持。',
        };
    }
}

export const moderatorLLM = new ModeratorLLM();
