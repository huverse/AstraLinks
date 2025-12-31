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
        if (!this.llmProvider || events.length < 3) {
            return false;
        }

        // 提取最近的发言
        const recentEvents = events.slice(-10).filter(e => e.type === EventType.SPEECH);
        if (recentEvents.length < 2) {
            return false;
        }

        // 检查发言分布是否均衡
        const speakerCounts = new Map<string, number>();
        for (const event of recentEvents) {
            const count = speakerCounts.get(event.speaker) || 0;
            speakerCounts.set(event.speaker, count + 1);
        }

        // 如果某人发言超过60%，可能需要干预
        const maxCount = Math.max(...speakerCounts.values());
        if (maxCount / recentEvents.length > 0.6) {
            return true;
        }

        // 使用 LLM 判断是否需要干预
        const summary = recentEvents
            .map(e => {
                const content = typeof e.content === 'string'
                    ? e.content
                    : (e.content as any)?.message || JSON.stringify(e.content);
                return `${e.speaker}: ${content}`;
            })
            .join('\n');

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: `你是一位讨论主持人。分析以下讨论内容，判断是否需要干预。
需要干预的情况：讨论偏离主题、争论过于激烈、人身攻击、某人垄断发言。
只回答 "是" 或 "否"。`,
            },
            {
                role: 'user',
                content: summary,
            },
        ];

        try {
            const result = await this.llmProvider.complete(messages, {
                maxTokens: 10,
                temperature: 0.3,
            });
            return result.content.includes('是');
        } catch {
            return false;
        }
    }

    /**
     * 生成干预内容
     */
    async generateIntervention(events: Event[]): Promise<string> {
        if (!this.llmProvider) {
            return '请各位保持讨论的主题聚焦和专业性。';
        }

        const recentEvents = events.slice(-10).filter(e => e.type === EventType.SPEECH);
        const summary = recentEvents
            .map(e => {
                const content = typeof e.content === 'string'
                    ? e.content
                    : (e.content as any)?.message || JSON.stringify(e.content);
                return `${e.speaker}: ${content}`;
            })
            .join('\n');

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: `你是一位专业的讨论主持人。根据以下讨论内容，生成一段简短的干预发言。
干预目的：引导讨论回到正轨、平衡发言机会、缓和紧张气氛。
要求：语气温和但坚定，不超过100字。`,
            },
            {
                role: 'user',
                content: summary,
            },
        ];

        try {
            const result = await this.llmProvider.complete(messages, {
                maxTokens: 150,
                temperature: 0.6,
            });
            return result.content;
        } catch {
            return '请各位保持讨论的主题聚焦和专业性。';
        }
    }

    /**
     * 评估讨论质量
     */
    async evaluateDiscussion(events: Event[]): Promise<{
        score: number;
        feedback: string;
    }> {
        if (!this.llmProvider || events.length < 3) {
            return {
                score: 5,
                feedback: '讨论内容较少，暂无法评估。',
            };
        }

        const speakEvents = events.filter(e => e.type === EventType.SPEECH);
        const summary = speakEvents
            .map(e => {
                const content = typeof e.content === 'string'
                    ? e.content
                    : (e.content as any)?.message || JSON.stringify(e.content);
                return `${e.speaker}: ${content}`;
            })
            .join('\n');

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: `你是一位讨论评估专家。请对以下讨论进行评估。
评估维度：论点质量、论据支持、逻辑性、互动性、专业性。
请以JSON格式返回：{"score": 1-10的数字, "feedback": "简短评价"}`,
            },
            {
                role: 'user',
                content: summary,
            },
        ];

        try {
            const result = await this.llmProvider.complete(messages, {
                maxTokens: 200,
                temperature: 0.5,
            });

            // 尝试解析 JSON
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    score: Math.min(10, Math.max(1, Number(parsed.score) || 5)),
                    feedback: String(parsed.feedback || '评估完成'),
                };
            }
        } catch {
            // 解析失败，返回默认值
        }

        return {
            score: 6,
            feedback: '讨论表现中等，建议增加更多论据支持。',
        };
    }

    /**
     * 智能选择下一个发言者
     * 当没有Agent主动举手时，由AI决定谁应该发言
     */
    async selectNextSpeaker(
        topic: string,
        recentEvents: Event[],
        agents: Array<{ id: string; name: string; role?: string; stance?: string }>,
        speakCounts: Map<string, number>
    ): Promise<{ agentId: string; reason: string } | null> {
        if (!this.llmProvider || agents.length === 0) {
            return null;
        }

        // 构建发言统计
        const speakStats = agents.map(a => {
            const count = speakCounts.get(a.id) || 0;
            return `${a.name}(${a.role || '参与者'}, ${a.stance || '中立'}): ${count}次发言`;
        }).join('\n');

        // 提取最近发言
        const recentSpeeches = recentEvents
            .filter(e => e.type === EventType.SPEECH)
            .slice(-8)
            .map(e => {
                const content = typeof e.content === 'string'
                    ? e.content
                    : (e.content as any)?.message || JSON.stringify(e.content);
                return `${e.speaker}: ${content.slice(0, 200)}`;
            })
            .join('\n');

        // 构建 Agent 列表（含 ID）
        const agentList = agents.map(a => `- ${a.id}: ${a.name} (${a.role || '参与者'}, ${a.stance || '中立'})`).join('\n');

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: `你是一位专业的讨论主持人。请根据讨论进展，决定下一个应该发言的人。

决策原则：
1. 优先让发言较少的人有机会表达
2. 如果某个立场缺少回应，选择该立场的代表
3. 如果讨论陷入僵局，选择可能带来新观点的人
4. 避免同一个人连续发言
5. 考虑谁的观点与当前话题最相关

请以JSON格式返回：{"agentId": "选中的Agent ID", "reason": "简短原因(20字内)"}`,
            },
            {
                role: 'user',
                content: `讨论主题：${topic}

参与者列表（ID: 名称）：
${agentList}

发言统计：
${speakStats}

最近发言：
${recentSpeeches || '（讨论刚开始）'}

请选择下一个发言者。`,
            },
        ];

        try {
            const result = await this.llmProvider.complete(messages, {
                maxTokens: 100,
                temperature: 0.4,
            });

            // 解析 JSON 响应
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const selectedId = String(parsed.agentId || '').trim();
                const reason = String(parsed.reason || '轮到发言').trim();

                // 验证选中的 ID 是否在 agents 列表中
                if (agents.some(a => a.id === selectedId)) {
                    return { agentId: selectedId, reason };
                }

                // 如果 ID 不匹配，尝试通过名称匹配
                const byName = agents.find(a => a.name === selectedId || parsed.agentId?.includes(a.name));
                if (byName) {
                    return { agentId: byName.id, reason };
                }
            }
        } catch (error) {
            console.error('[ModeratorLLM] selectNextSpeaker error:', error);
        }

        // 兜底：选择发言最少的 Agent
        let minCount = Infinity;
        let candidate = agents[0];
        for (const agent of agents) {
            const count = speakCounts.get(agent.id) || 0;
            if (count < minCount) {
                minCount = count;
                candidate = agent;
            }
        }
        return { agentId: candidate.id, reason: '发言机会均衡' };
    }
}

export const moderatorLLM = new ModeratorLLM();
