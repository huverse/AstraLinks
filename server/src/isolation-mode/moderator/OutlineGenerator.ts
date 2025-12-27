/**
 * 讨论大纲生成器
 *
 * 在讨论开始前根据议题自动生成讨论大纲
 */

import { DiscussionOutline, OutlineItem } from '../core/types';
import { ILLMProvider, LLMMessage } from '../core/interfaces';

/**
 * 大纲生成器
 */
export class OutlineGenerator {
    private llmProvider: ILLMProvider | null = null;

    setProvider(provider: ILLMProvider): void {
        this.llmProvider = provider;
    }

    /**
     * 生成讨论大纲
     */
    async generate(params: {
        topic: string;
        objective: 'explore' | 'debate' | 'consensus';
        agentNames: string[];
        factions?: Array<{ id: string; name: string }>;
        maxRounds?: number;
    }): Promise<DiscussionOutline> {
        const { topic, objective, agentNames, factions, maxRounds = 10 } = params;

        if (!this.llmProvider) {
            return this.generateDefaultOutline(topic, objective, maxRounds);
        }

        const objectiveDesc = {
            explore: '开放探索，广泛讨论各种可能性',
            debate: '碰撞交锋，正反双方激烈辩论',
            consensus: '收敛共识，寻找各方都能接受的方案',
        }[objective];

        const factionInfo = factions?.length
            ? `\n阵营设置：${factions.map(f => f.name).join(' vs ')}`
            : '';

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: `你是一位专业的讨论策划师。请为以下讨论生成一份结构化大纲。

要求：
1. 设计3-5个递进的讨论层次
2. 每个层次预埋1-2个冲突点，让讨论更有张力
3. 建议每个话题的发言者，制造针锋相对
4. 输出JSON格式`,
            },
            {
                role: 'user',
                content: `讨论主题：${topic}
讨论目标：${objectiveDesc}
参与者：${agentNames.join('、')}${factionInfo}
预期轮次：${maxRounds}

请生成讨论大纲，JSON格式：
{
  "objective": "讨论目标描述",
  "items": [
    {
      "order": 1,
      "topic": "话题",
      "description": "描述",
      "conflictPoints": ["冲突点1"],
      "suggestedSpeakers": ["发言者"],
      "expectedRounds": 2
    }
  ],
  "conflictDesign": ["预埋的核心冲突点"]
}`,
            },
        ];

        try {
            const result = await this.llmProvider.complete(messages, {
                maxTokens: 800,
                temperature: 0.7,
            });

            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    topic,
                    objective: parsed.objective || objectiveDesc,
                    items: (parsed.items || []).map((item: any, idx: number) => ({
                        order: item.order || idx + 1,
                        topic: item.topic || '',
                        description: item.description || '',
                        conflictPoints: item.conflictPoints || [],
                        suggestedSpeakers: item.suggestedSpeakers || [],
                        expectedRounds: item.expectedRounds || 2,
                    })),
                    conflictDesign: parsed.conflictDesign || [],
                    expectedTotalRounds: maxRounds,
                    generatedAt: Date.now(),
                };
            }
        } catch {
            // 解析失败，使用默认大纲
        }

        return this.generateDefaultOutline(topic, objective, maxRounds);
    }

    /**
     * 生成默认大纲
     */
    private generateDefaultOutline(
        topic: string,
        objective: string,
        maxRounds: number
    ): DiscussionOutline {
        const items: OutlineItem[] = [
            {
                order: 1,
                topic: '立场阐述',
                description: '各方阐述基本立场和核心观点',
                expectedRounds: 2,
            },
            {
                order: 2,
                topic: '论据展开',
                description: '用事实和数据支持各自观点',
                conflictPoints: ['数据解读差异', '案例适用性'],
                expectedRounds: 3,
            },
            {
                order: 3,
                topic: '交锋质疑',
                description: '针对对方观点进行质疑和反驳',
                conflictPoints: ['逻辑漏洞', '前提假设'],
                expectedRounds: 3,
            },
            {
                order: 4,
                topic: '总结收敛',
                description: '总结各方观点，明确共识与分歧',
                expectedRounds: 2,
            },
        ];

        return {
            topic,
            objective: `围绕"${topic}"进行${objective === 'debate' ? '辩论' : objective === 'consensus' ? '共识讨论' : '探索讨论'}`,
            items,
            conflictDesign: ['核心价值观差异', '利益立场冲突'],
            expectedTotalRounds: maxRounds,
            generatedAt: Date.now(),
        };
    }
}

export const outlineGenerator = new OutlineGenerator();
