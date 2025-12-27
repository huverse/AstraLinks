/**
 * 评委系统
 *
 * 支持多评委加权评分
 */

import {
    JudgeConfig,
    JudgeScore,
    ScoringDimension,
    ScoringResult,
    Event,
    EventType,
} from '../core/types';
import { ILLMProvider, LLMMessage } from '../core/interfaces';

/** 默认评分维度 */
const DEFAULT_DIMENSIONS: ScoringDimension[] = [
    {
        id: 'logic',
        name: '逻辑性',
        description: '论证是否严密，推理是否合理',
        weight: 0.25,
        maxScore: 10,
    },
    {
        id: 'evidence',
        name: '论据支持',
        description: '是否有充分的事实、数据支持',
        weight: 0.2,
        maxScore: 10,
    },
    {
        id: 'expression',
        name: '表达能力',
        description: '语言是否清晰、有说服力',
        weight: 0.2,
        maxScore: 10,
    },
    {
        id: 'interaction',
        name: '互动质量',
        description: '是否有效回应对方观点',
        weight: 0.2,
        maxScore: 10,
    },
    {
        id: 'insight',
        name: '洞察深度',
        description: '是否有独到见解和深度思考',
        weight: 0.15,
        maxScore: 10,
    },
];

/**
 * 评委系统
 */
export class JudgeSystem {
    private llmProvider: ILLMProvider | null = null;
    private dimensions: ScoringDimension[] = DEFAULT_DIMENSIONS;

    setProvider(provider: ILLMProvider): void {
        this.llmProvider = provider;
    }

    setDimensions(dimensions: ScoringDimension[]): void {
        this.dimensions = dimensions;
    }

    /**
     * 执行评分
     */
    async score(params: {
        sessionId: string;
        topic: string;
        events: Event[];
        agentIds: string[];
        judges: JudgeConfig[];
    }): Promise<ScoringResult> {
        const { sessionId, topic, events, agentIds, judges } = params;

        // 提取各 Agent 的发言
        const agentSpeeches = this.extractAgentSpeeches(events, agentIds);

        // 各评委评分
        const judgeScores: JudgeScore[] = [];
        for (const judge of judges) {
            for (const agentId of agentIds) {
                const speeches = agentSpeeches.get(agentId) || [];
                const score = await this.judgeAgent(judge, agentId, speeches, topic);
                judgeScores.push(score);
            }
        }

        // 计算加权汇总
        const aggregatedScores = this.aggregateScores(judgeScores, judges, agentIds);

        // 生成排名
        const ranking = Object.entries(aggregatedScores)
            .sort(([, a], [, b]) => b - a)
            .map(([agentId, score], idx) => ({
                agentId,
                rank: idx + 1,
                score,
            }));

        // 生成最终评语
        const finalComment = await this.generateFinalComment(ranking, topic);

        return {
            sessionId,
            dimensions: this.dimensions,
            judgeScores,
            aggregatedScores,
            ranking,
            finalComment,
            generatedAt: Date.now(),
        };
    }

    /**
     * 提取各 Agent 的发言
     */
    private extractAgentSpeeches(
        events: Event[],
        agentIds: string[]
    ): Map<string, string[]> {
        const result = new Map<string, string[]>();

        for (const agentId of agentIds) {
            result.set(agentId, []);
        }

        for (const event of events) {
            if (event.type !== EventType.SPEECH) continue;
            if (!agentIds.includes(event.speaker)) continue;

            const speeches = result.get(event.speaker) || [];
            const content = typeof event.content === 'string'
                ? event.content
                : (event.content as any)?.message || '';
            if (content) {
                speeches.push(content);
            }
            result.set(event.speaker, speeches);
        }

        return result;
    }

    /**
     * 单个评委对单个 Agent 评分
     */
    private async judgeAgent(
        judge: JudgeConfig,
        agentId: string,
        speeches: string[],
        topic: string
    ): Promise<JudgeScore> {
        if (!this.llmProvider || speeches.length === 0) {
            return this.generateDefaultScore(judge.id, agentId);
        }

        const stylePrompt = {
            strict: '你是一位严格的评委，对论证要求很高。',
            lenient: '你是一位宽容的评委，注重鼓励和发现亮点。',
            balanced: '你是一位公正的评委，客观评价优缺点。',
        }[judge.style || 'balanced'];

        const dimensionList = this.dimensions
            .map(d => `- ${d.name}(${d.id}): ${d.description}，满分${d.maxScore}分`)
            .join('\n');

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: `${stylePrompt}

请对以下辩手的表现进行评分。

评分维度：
${dimensionList}

请以JSON格式返回评分：
{"scores": {"logic": 8, "evidence": 7, ...}, "comment": "评语"}`,
            },
            {
                role: 'user',
                content: `讨论主题：${topic}

该辩手的发言：
${speeches.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}

请评分：`,
            },
        ];

        try {
            const result = await this.llmProvider.complete(messages, {
                maxTokens: 300,
                temperature: 0.5,
            });

            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const dimensionScores: Record<string, number> = {};
                let totalScore = 0;
                let totalWeight = 0;

                for (const dim of this.dimensions) {
                    const score = Math.min(dim.maxScore, Math.max(0, Number(parsed.scores?.[dim.id]) || 5));
                    dimensionScores[dim.id] = score;
                    totalScore += score * dim.weight;
                    totalWeight += dim.weight;
                }

                return {
                    judgeId: judge.id,
                    agentId,
                    dimensionScores,
                    totalScore: totalWeight > 0 ? totalScore / totalWeight : 0,
                    comment: parsed.comment || '',
                    scoredAt: Date.now(),
                };
            }
        } catch {
            // 解析失败
        }

        return this.generateDefaultScore(judge.id, agentId);
    }

    /**
     * 生成默认评分
     */
    private generateDefaultScore(judgeId: string, agentId: string): JudgeScore {
        const dimensionScores: Record<string, number> = {};
        for (const dim of this.dimensions) {
            dimensionScores[dim.id] = 5;
        }

        return {
            judgeId,
            agentId,
            dimensionScores,
            totalScore: 5,
            comment: '暂无评语',
            scoredAt: Date.now(),
        };
    }

    /**
     * 汇总各评委评分
     */
    private aggregateScores(
        judgeScores: JudgeScore[],
        judges: JudgeConfig[],
        agentIds: string[]
    ): Record<string, number> {
        const result: Record<string, number> = {};
        const judgeWeightMap = new Map(judges.map(j => [j.id, j.weight]));

        for (const agentId of agentIds) {
            const agentScores = judgeScores.filter(s => s.agentId === agentId);
            let weightedSum = 0;
            let totalWeight = 0;

            for (const score of agentScores) {
                const weight = judgeWeightMap.get(score.judgeId) || 1;
                weightedSum += score.totalScore * weight;
                totalWeight += weight;
            }

            result[agentId] = totalWeight > 0 ? weightedSum / totalWeight : 0;
        }

        return result;
    }

    /**
     * 生成最终评语
     */
    private async generateFinalComment(
        ranking: Array<{ agentId: string; rank: number; score: number }>,
        topic: string
    ): Promise<string> {
        if (!this.llmProvider) {
            const winner = ranking[0];
            return `本次关于"${topic}"的讨论中，${winner.agentId} 以 ${winner.score.toFixed(1)} 分获得最高评价。`;
        }

        const rankingText = ranking
            .map(r => `第${r.rank}名: ${r.agentId} (${r.score.toFixed(1)}分)`)
            .join('\n');

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: '你是一位专业的讨论评委。请根据排名结果生成一段简短的总结评语（50-100字）。',
            },
            {
                role: 'user',
                content: `讨论主题：${topic}\n\n排名结果：\n${rankingText}`,
            },
        ];

        try {
            const result = await this.llmProvider.complete(messages, {
                maxTokens: 150,
                temperature: 0.6,
            });
            return result.content;
        } catch {
            const winner = ranking[0];
            return `本次讨论中，${winner.agentId} 表现最为出色。`;
        }
    }
}

export const judgeSystem = new JudgeSystem();
