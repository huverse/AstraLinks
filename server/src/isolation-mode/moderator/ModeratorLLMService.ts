/**
 * Moderator LLM Service
 * 
 * 主持人的"语言表达层"。
 * 
 * 职责：
 * ✅ 生成讨论大纲（Outline）
 * ✅ 生成引导性问题
 * ✅ 生成阶段总结 / 最终总结
 * 
 * 不可做：
 * ❌ 判断谁该说话
 * ❌ 判断 phase 是否切换
 * ❌ 判断是否冷场
 * ❌ 决定是否结束讨论
 * 
 * 调用关系：
 * Moderator Controller → Moderator LLM → Event Log
 * 
 * 设计原则：
 * 即使 LLM 出 bug，也无法破坏系统秩序
 */

import {
    OutlineInput,
    OutlineOutput,
    QuestionInput,
    QuestionOutput,
    SummaryInput,
    SummaryOutput,
    OpeningInput,
    OpeningOutput,
    ClosingInput,
    ClosingOutput,
    OUTLINE_MAX_TOKENS,
    QUESTION_MAX_TOKENS,
    SUMMARY_MAX_TOKENS,
    OPENING_MAX_TOKENS,
    CLOSING_MAX_TOKENS
} from '../core/types/moderator-llm.types';
import { ILLMProvider, LLMMessage } from '../core/interfaces/ILLMProvider';

// ============================================
// Prompt 模板 - 核心约束
// ============================================

/**
 * 主持人系统约束（写在每个 Prompt 中）
 */
const MODERATOR_SYSTEM_CONSTRAINTS = `
## 你是主持人（Moderator）

你的职责是：
- 引导讨论顺利进行
- 生成清晰、中立的语言输出
- 保持专业、公正的态度

## 重要约束（必须严格遵守）

1. **你不能做任何决策**
   - 不能决定谁该发言
   - 不能决定是否切换阶段
   - 不能决定是否结束讨论
   所有决策由系统控制，你只负责语言表达

2. **你只能基于给定输入生成文本**
   - 不要推测未提供的信息
   - 不要假设任何未明确说明的状态

3. **输出必须简洁、可控**
   - 不要复述完整发言内容
   - 使用摘要和要点形式
   - 严格遵守输出格式

4. **保持中立**
   - 不表达个人观点
   - 不偏袒任何一方
   - 客观总结各方立场
`.trim();

// ============================================
// ModeratorLLMService
// ============================================

export class ModeratorLLMService {
    private llmProvider: ILLMProvider;

    constructor(llmProvider: ILLMProvider) {
        this.llmProvider = llmProvider;
    }

    // ============================================
    // 大纲生成（Outline）
    // ============================================

    /**
     * 生成讨论大纲
     * 
     * 输入：议题、alignment、flow
     * 输出：分阶段要点（结构化）
     * 
     * @example
     * 输入:
     * {
     *   topic: "远程办公是否应该成为主流工作方式",
     *   alignmentType: "opposing",
     *   factions: [
     *     { id: "pro", name: "正方", position: "支持远程办公" },
     *     { id: "con", name: "反方", position: "反对远程办公" }
     *   ],
     *   phases: [
     *     { id: "opening", name: "开场", type: "opening", description: "..." },
     *     { id: "free", name: "自由辩论", type: "free_discussion", description: "..." }
     *   ]
     * }
     * 
     * 输出:
     * {
     *   title: "关于远程办公的辩论",
     *   phaseOutlines: [
     *     { phaseId: "opening", phaseName: "开场", keyPoints: [...], suggestedQuestions: [...] }
     *   ],
     *   moderatorNotes: ["注意时间控制", "引导焦点问题"]
     * }
     */
    async generateOutline(input: OutlineInput): Promise<OutlineOutput> {
        const systemPrompt = `${MODERATOR_SYSTEM_CONSTRAINTS}

## 当前任务：生成讨论大纲

你需要根据给定的议题和阶段信息，生成一份结构化的讨论大纲。`;

        const userMessage = `## 讨论议题
${input.topic}

## 阵营设置
类型：${input.alignmentType}
${input.factions ? input.factions.map(f => `- ${f.name}（${f.id}）：${f.position}`).join('\n') : '无特定阵营'}

## 阶段安排
${input.phases.map((p, i) => `${i + 1}. ${p.name}（${p.type}）：${p.description}`).join('\n')}

${input.estimatedDurationMinutes ? `## 预计时长\n${input.estimatedDurationMinutes} 分钟` : ''}

## 请输出 JSON 格式：
\`\`\`json
{
  "title": "讨论标题（10字内）",
  "phaseOutlines": [
    {
      "phaseId": "阶段ID",
      "phaseName": "阶段名称",
      "keyPoints": ["要点1", "要点2"],
      "suggestedQuestions": ["可用问题1", "可用问题2"]
    }
  ],
  "moderatorNotes": ["主持人注意事项"]
}
\`\`\`

只输出 JSON，不要有其他文字。`;

        const result = await this.callLLM<OutlineOutput>(
            systemPrompt,
            userMessage,
            OUTLINE_MAX_TOKENS
        );

        return this.validateOutlineOutput(result);
    }

    // ============================================
    // 引导问题生成（Question）
    // ============================================

    /**
     * 生成引导性问题
     * 
     * 输入：当前 phase、已有分歧摘要
     * 输出：一句明确、可点名的问题
     * 
     * @example
     * 输入:
     * {
     *   topic: "远程办公是否应该成为主流工作方式",
     *   currentPhase: { id: "free", name: "自由辩论", type: "free_discussion", round: 3, maxRounds: 8 },
     *   divergencePoints: ["协作效率问题", "员工管理难度"],
     *   recentSpeechSummaries: [
     *     { speaker: "李强", summary: "认为远程协作工具可以弥补效率损失" },
     *     { speaker: "王明", summary: "强调面对面沟通的不可替代性" }
     *   ],
     *   targetAgent: { id: "agent-3", name: "张华" }
     * }
     * 
     * 输出:
     * {
     *   question: "张华，您作为技术专家，如何看待远程协作工具在弥补效率损失方面的实际效果？",
     *   questionType: "directed",
     *   targetName: "张华"
     * }
     */
    async generateQuestion(input: QuestionInput): Promise<QuestionOutput> {
        const systemPrompt = `${MODERATOR_SYSTEM_CONSTRAINTS}

## 当前任务：生成引导性问题

你需要根据当前讨论状态，生成一个有针对性的问题来推进讨论。
问题应该：
- 简洁明确（一句话）
- 聚焦核心分歧
- 可以点名特定参与者（如果指定了目标）`;

        const userMessage = `## 讨论议题
${input.topic}

## 当前阶段
- 阶段：${input.currentPhase.name}（${input.currentPhase.type}）
- 进度：第 ${input.currentPhase.round} / ${input.currentPhase.maxRounds} 轮

## 已识别的分歧点
${input.divergencePoints.length > 0
                ? input.divergencePoints.map((d, i) => `${i + 1}. ${d}`).join('\n')
                : '暂无明显分歧'}

## 最近发言摘要
${input.recentSpeechSummaries.map(s => `- ${s.speaker}：${s.summary}`).join('\n')}

${input.targetAgent
                ? `## 点名对象\n请向「${input.targetAgent.name}」提问`
                : '## 可以向任何人提问'}

## 请输出 JSON 格式：
\`\`\`json
{
  "question": "你的问题（一句话，50字内）",
  "questionType": "open | directed | clarification | challenge",
  "targetName": "点名对象姓名（可选）"
}
\`\`\`

只输出 JSON，不要有其他文字。`;

        const result = await this.callLLM<QuestionOutput>(
            systemPrompt,
            userMessage,
            QUESTION_MAX_TOKENS
        );

        return this.validateQuestionOutput(result);
    }

    // ============================================
    // 阶段总结生成（Summary）
    // ============================================

    /**
     * 生成阶段总结
     * 
     * 输入：当前 phase、裁剪后的事件
     * 输出：压缩后的共识 / 分歧总结
     * 
     * @example
     * 输入:
     * {
     *   topic: "远程办公是否应该成为主流工作方式",
     *   phase: { id: "free", name: "自由辩论", type: "free_discussion" },
     *   condensedEvents: [
     *     { speaker: "李强", keyPoint: "远程协作工具效率高" },
     *     { speaker: "王明", keyPoint: "面对面沟通不可替代" }
     *   ],
     *   consensusPoints: ["远程办公需要配套工具支持"],
     *   divergencePoints: ["协作效率", "员工管理"],
     *   summaryType: "phase_end"
     * }
     * 
     * 输出:
     * {
     *   summaryText: "本阶段讨论围绕协作效率展开...",
     *   consensusHighlights: ["双方认同工具支持的重要性"],
     *   divergenceHighlights: ["效率问题仍有分歧"],
     *   nextStepsSuggestion: "建议下一阶段聚焦管理层面"
     * }
     */
    async generateSummary(input: SummaryInput): Promise<SummaryOutput> {
        const systemPrompt = `${MODERATOR_SYSTEM_CONSTRAINTS}

## 当前任务：生成${input.summaryType === 'final' ? '最终' : '阶段'}总结

你需要根据讨论内容，生成一份简洁的总结。
总结应该：
- 客观中立，不偏袒任何一方
- 提炼共识和分歧要点
- 不复述完整发言内容
- 使用总结性语言`;

        const summaryTypeLabel = {
            'phase_end': '阶段结束总结',
            'mid_phase': '阶段中期总结',
            'final': '最终总结'
        }[input.summaryType];

        const userMessage = `## 讨论议题
${input.topic}

## 阶段信息
- 阶段：${input.phase.name}（${input.phase.type}）
- 总结类型：${summaryTypeLabel}

## 讨论要点摘要
${input.condensedEvents.map(e => `- ${e.speaker}：${e.keyPoint}`).join('\n')}

## 已识别的共识
${input.consensusPoints.length > 0
                ? input.consensusPoints.map((c, i) => `${i + 1}. ${c}`).join('\n')
                : '暂无明确共识'}

## 已识别的分歧
${input.divergencePoints.length > 0
                ? input.divergencePoints.map((d, i) => `${i + 1}. ${d}`).join('\n')
                : '暂无明显分歧'}

## 请输出 JSON 格式：
\`\`\`json
{
  "summaryText": "总结文本（100-200字，可直接作为主持人发言）",
  "consensusHighlights": ["共识要点1", "共识要点2"],
  "divergenceHighlights": ["分歧要点1", "分歧要点2"],
  "nextStepsSuggestion": "下一步建议（可选，一句话）"
}
\`\`\`

只输出 JSON，不要有其他文字。`;

        const result = await this.callLLM<SummaryOutput>(
            systemPrompt,
            userMessage,
            SUMMARY_MAX_TOKENS
        );

        return this.validateSummaryOutput(result);
    }

    // ============================================
    // 开场白 & 结束语
    // ============================================

    /**
     * 生成开场白
     */
    async generateOpening(input: OpeningInput): Promise<OpeningOutput> {
        const systemPrompt = `${MODERATOR_SYSTEM_CONSTRAINTS}

## 当前任务：生成开场白

你需要生成一段简洁的开场白，介绍讨论议题和参与者。`;

        const userMessage = `## 讨论议题
${input.topic}

## 阵营设置
${input.alignmentType}

## 参与者
${input.participants.map(p =>
            `- ${p.name}（${p.role}${p.factionName ? `, ${p.factionName}` : ''}）`
        ).join('\n')}

## 第一阶段
${input.firstPhase.name}：${input.firstPhase.description}

## 请输出 JSON 格式：
\`\`\`json
{
  "openingText": "开场白文本（100字内）"
}
\`\`\`

只输出 JSON，不要有其他文字。`;

        const result = await this.callLLM<OpeningOutput>(
            systemPrompt,
            userMessage,
            OPENING_MAX_TOKENS
        );

        return { openingText: result.openingText || '' };
    }

    /**
     * 生成结束语
     */
    async generateClosing(input: ClosingInput): Promise<ClosingOutput> {
        const systemPrompt = `${MODERATOR_SYSTEM_CONSTRAINTS}

## 当前任务：生成结束语

你需要生成一段结束语，总结整个讨论并做出客观结论。`;

        const userMessage = `## 讨论议题
${input.topic}

## 各阶段总结
${input.phaseSummaries.map(s => `- ${s.phaseName}：${s.summary}`).join('\n')}

## 最终共识
${input.finalConsensus.join('\n') || '无明确共识'}

## 未解决分歧
${input.unresolvedDivergences.join('\n') || '无重大分歧'}

## 讨论时长
${input.durationMinutes} 分钟

## 请输出 JSON 格式：
\`\`\`json
{
  "closingText": "结束语文本（150字内）",
  "finalConclusion": "最终结论（一句话）"
}
\`\`\`

只输出 JSON，不要有其他文字。`;

        const result = await this.callLLM<ClosingOutput>(
            systemPrompt,
            userMessage,
            CLOSING_MAX_TOKENS
        );

        return {
            closingText: result.closingText || '',
            finalConclusion: result.finalConclusion || ''
        };
    }

    // ============================================
    // 私有方法
    // ============================================

    /**
     * 调用 LLM
     */
    private async callLLM<T>(
        systemPrompt: string,
        userMessage: string,
        maxTokens: number
    ): Promise<T> {
        const messages: LLMMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        const response = await this.llmProvider.complete(messages, {
            temperature: 0.7,
            maxTokens
        });

        // 解析 JSON
        try {
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('No JSON found');
        } catch (e) {
            throw new Error(`Failed to parse Moderator LLM response: ${response.content}`);
        }
    }

    /**
     * 验证大纲输出
     */
    private validateOutlineOutput(output: any): OutlineOutput {
        return {
            title: output.title || '讨论大纲',
            phaseOutlines: Array.isArray(output.phaseOutlines)
                ? output.phaseOutlines.map((p: any) => ({
                    phaseId: p.phaseId || '',
                    phaseName: p.phaseName || '',
                    keyPoints: Array.isArray(p.keyPoints) ? p.keyPoints : [],
                    suggestedQuestions: Array.isArray(p.suggestedQuestions) ? p.suggestedQuestions : []
                }))
                : [],
            moderatorNotes: Array.isArray(output.moderatorNotes) ? output.moderatorNotes : []
        };
    }

    /**
     * 验证问题输出
     */
    private validateQuestionOutput(output: any): QuestionOutput {
        const validTypes = ['open', 'directed', 'clarification', 'challenge'];
        return {
            question: output.question || '请分享您的看法',
            questionType: validTypes.includes(output.questionType)
                ? output.questionType
                : 'open',
            targetName: output.targetName
        };
    }

    /**
     * 验证总结输出
     */
    private validateSummaryOutput(output: any): SummaryOutput {
        return {
            summaryText: output.summaryText || '',
            consensusHighlights: Array.isArray(output.consensusHighlights)
                ? output.consensusHighlights
                : [],
            divergenceHighlights: Array.isArray(output.divergenceHighlights)
                ? output.divergenceHighlights
                : [],
            nextStepsSuggestion: output.nextStepsSuggestion
        };
    }
}

// ============================================
// 单例导出
// ============================================

let moderatorLLMServiceInstance: ModeratorLLMService | null = null;

export function getModeratorLLMService(llmProvider: ILLMProvider): ModeratorLLMService {
    if (!moderatorLLMServiceInstance) {
        moderatorLLMServiceInstance = new ModeratorLLMService(llmProvider);
    }
    return moderatorLLMServiceInstance;
}
