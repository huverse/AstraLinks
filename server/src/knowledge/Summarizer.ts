/**
 * Summarizer - 文档总结器
 * 使用 AI 生成文档摘要
 */

import { adapterRegistry } from '../adapters';

export type SummaryStyle = 'brief' | 'detailed' | 'bullet';

const STYLE_PROMPTS: Record<SummaryStyle, string> = {
    brief: '请用1-2句话简洁地总结以下内容的核心要点：',
    detailed: '请详细总结以下内容，包括主要观点、论据和结论：',
    bullet: '请用要点列表形式总结以下内容的关键信息（使用 - 符号）：'
};

export class Summarizer {
    // 生成总结
    async summarize(
        content: string,
        options: {
            userId: number;
            providerId?: string;
            credentialId?: string;
            model?: string;
            style?: SummaryStyle;
        }
    ): Promise<string> {
        const { userId, providerId = 'openai', credentialId, model, style = 'brief' } = options;

        // 截取内容避免超长
        const truncatedContent = content.length > 10000
            ? content.substring(0, 10000) + '\n\n[内容已截断...]'
            : content;

        const prompt = `${STYLE_PROMPTS[style]}\n\n${truncatedContent}`;

        const adapter = await adapterRegistry.createAdapter(userId, providerId, credentialId);
        const result = await adapter.chat(
            [{ role: 'user', content: prompt }],
            { model, maxTokens: 1000 }
        );

        return result.text;
    }

    // 批量总结（分块后总结）
    async summarizeLong(
        content: string,
        options: {
            userId: number;
            providerId?: string;
            credentialId?: string;
            model?: string;
            chunkSize?: number;
        }
    ): Promise<string> {
        const { userId, providerId = 'openai', credentialId, model, chunkSize = 5000 } = options;

        // 分块
        const chunks: string[] = [];
        for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push(content.substring(i, i + chunkSize));
        }

        // 分别总结每个块
        const chunkSummaries: string[] = [];
        for (const chunk of chunks) {
            const summary = await this.summarize(chunk, {
                userId,
                providerId,
                credentialId,
                model,
                style: 'brief'
            });
            chunkSummaries.push(summary);
        }

        // 如果只有一个块，直接返回
        if (chunkSummaries.length === 1) {
            return chunkSummaries[0];
        }

        // 合并总结
        const combinedContent = chunkSummaries.join('\n\n');
        return this.summarize(combinedContent, {
            userId,
            providerId,
            credentialId,
            model,
            style: 'detailed'
        });
    }
}

export const summarizer = new Summarizer();
