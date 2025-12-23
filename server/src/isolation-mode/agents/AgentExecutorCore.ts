/**
 * Agent Executor
 * 
 * 系统中唯一直接调用 LLM 的地方。
 * 
 * 职责：
 * - 生成发言意图 (Intent)
 * - 生成实际发言 (Speech)
 * - 管理私有上下文
 * 
 * 不负责：
 * - 任何秩序或规则判断
 * - 决定是否能发言（由 ModeratorController 决定）
 * 
 * 设计原则：
 * - LLM 永远无法越权
 * - 严格限制可见上下文
 * - 强制 JSON schema 输出
 */

import {
    AgentPersona,
    AgentPrivateContext,
    AgentVisibleContext,
    AgentVisibleEventSlim,
    IntentOutput,
    SpeechOutput,
    ShortTermMemory,
    LLMRequest,
    LLMResponse,
    DEFAULT_SHORT_TERM_MAX_ENTRIES,
    DEFAULT_SHORT_TERM_MAX_TOKENS,
    DEFAULT_RECENT_EVENTS_LIMIT,
    MAX_RECENT_EVENTS_LIMIT
} from '../core/types/agent-executor.types';
import { Event, EventType, AgentVisibleEvent } from '../core/types/event.types';
import { PhaseConfig } from '../core/types/scenario.types';
import { ILLMProvider } from '../core/interfaces/ILLMProvider';

// ============================================
// Prompt 模板
// ============================================

/**
 * System Prompt 约束（写在每个请求中）
 */
const SYSTEM_CONSTRAINTS = `
## 重要约束（必须严格遵守）

1. **不允许** 讨论这个系统本身、你的身份、或 AI 相关话题
2. **不允许** 推测你无法看到的历史或他人的私有想法
3. **不允许** 假设你一定能发言——你只是在「表达意图」
4. **必须** 严格按照指定的 JSON 格式输出，不要有额外文字
5. **必须** 保持角色人设，不要出戏

如果你违反以上任何约束，你的输出将被系统丢弃。
`.trim();

/**
 * Intent 输出 JSON Schema
 */
const INTENT_JSON_SCHEMA = {
    type: 'object',
    properties: {
        type: { type: 'string', enum: ['INTENT'] },
        intent: { type: 'string', enum: ['speak', 'interrupt', 'question', 'respond', 'pass'] },
        urgency: { type: 'integer', minimum: 1, maximum: 5 },
        target: { type: 'string' },
        topic: { type: 'string' },
        reasoning: { type: 'string' }
    },
    required: ['type', 'intent', 'urgency']
};

/**
 * Speech 输出 JSON Schema
 */
const SPEECH_JSON_SCHEMA = {
    type: 'object',
    properties: {
        type: { type: 'string', enum: ['SPEECH'] },
        content: { type: 'string', minLength: 1, maxLength: 2000 },
        tone: { type: 'string', enum: ['calm', 'assertive', 'questioning', 'conciliatory', 'passionate'] },
        references: { type: 'array', items: { type: 'string' } }
    },
    required: ['type', 'content', 'tone']
};

// ============================================
// AgentExecutor 实现
// ============================================

/**
 * Agent 执行器
 * 
 * 一个 AgentExecutor 实例对应一个 Agent。
 */
export class AgentExecutor {
    private persona: AgentPersona;
    private context: AgentPrivateContext;
    private llmProvider: ILLMProvider;

    constructor(
        persona: AgentPersona,
        llmProvider: ILLMProvider,
        initialGoal: string = '积极参与讨论，表达有价值的观点'
    ) {
        this.persona = persona;
        this.llmProvider = llmProvider;
        this.context = this.createInitialContext(initialGoal);
    }

    // ============================================
    // 核心方法
    // ============================================

    /**
     * 生成发言意图
     * 
     * 用于表达"我想不想说话"，不是"我说什么"
     * 
     * @param visibleContext Agent 可见的上下文
     * @returns 意图输出
     */
    async runIntentGeneration(
        visibleContext: AgentVisibleContext
    ): Promise<IntentOutput> {
        // 1. 构建 Prompt
        const { systemPrompt, userMessage } = this.buildIntentPrompt(visibleContext);

        // 2. 调用 LLM
        const request: LLMRequest = {
            systemPrompt,
            userMessage,
            temperature: 0.7,
            maxTokens: 200,
            jsonSchema: INTENT_JSON_SCHEMA
        };

        const response = await this.callLLM<IntentOutput>(request);

        // 3. 验证输出
        const intent = this.validateIntentOutput(response.result);

        // 4. 更新私有上下文
        this.addToShortTermMemory({
            content: `我决定 ${intent.intent}，紧急程度 ${intent.urgency}`,
            importance: 0.3,
            type: 'thought'
        });

        return intent;
    }

    /**
     * 生成实际发言
     * 
     * 只有在 ModeratorController 允许后才应该被调用
     * 
     * @param visibleContext Agent 可见的上下文
     * @param intendedTopic 之前意图中的话题（可选）
     * @returns 发言输出
     */
    async runSpeechGeneration(
        visibleContext: AgentVisibleContext,
        intendedTopic?: string
    ): Promise<SpeechOutput> {
        // 1. 构建 Prompt
        const { systemPrompt, userMessage } = this.buildSpeechPrompt(
            visibleContext,
            intendedTopic
        );

        // 2. 调用 LLM
        const request: LLMRequest = {
            systemPrompt,
            userMessage,
            temperature: 0.8,
            maxTokens: 500,
            jsonSchema: SPEECH_JSON_SCHEMA
        };

        const response = await this.callLLM<SpeechOutput>(request);

        // 3. 验证输出
        const speech = this.validateSpeechOutput(response.result);

        // 4. 更新私有上下文
        this.addToShortTermMemory({
            content: `我发言了：${speech.content.substring(0, 100)}...`,
            importance: 0.8,
            type: 'action'
        });

        return speech;
    }

    // ============================================
    // Prompt 构建（显式展示结构）
    // ============================================

    /**
     * 构建发言意图 Prompt
     * 
     * Prompt 结构：
     * 1. [固定] System Role - 角色定义 + 约束
     * 2. [动态] Persona - 人格 + 立场
     * 3. [动态] Phase - 当前阶段信息
     * 4. [动态] Recent Events - 最近公共事件
     * 5. [动态] Task - 当前任务指令
     */
    private buildIntentPrompt(ctx: AgentVisibleContext): {
        systemPrompt: string;
        userMessage: string;
    } {
        // ===== 1. System Role Prompt =====
        const systemRole = `你是一个参与讨论的角色，名字是「${this.persona.name}」。

## 你的身份
${this.persona.personaDescription}

## 你的说话风格
${this.getSpeakingStyleDescription()}

${this.persona.stance ? `## 你的立场
阵营：${this.persona.stance.factionId}
立场：${this.persona.stance.position}
` : ''}

${SYSTEM_CONSTRAINTS}`;

        // ===== 2. User Message（当前任务） =====
        const userMessage = `## 当前讨论阶段
- 阶段：${ctx.phase.name}（${ctx.phase.type}）
- 描述：${ctx.phase.description}
- 进度：第 ${ctx.phase.round} / ${ctx.phase.maxRounds} 轮

## 讨论主题
${ctx.topic}

${ctx.phaseSummary ? `## 阶段总结
${ctx.phaseSummary}
` : ''}

## 最近发言（共 ${ctx.recentEvents.length} 条）
${this.formatRecentEvents(ctx.recentEvents)}

${ctx.isCalledToSpeak ? `## ⚠️ 你被点名发言了！
原因：${ctx.callReason || '主持人点名'}
` : ''}

## 你的任务
请决定你是否想要发言。输出一个 JSON 对象：

\`\`\`json
{
  "type": "INTENT",
  "intent": "speak | interrupt | question | respond | pass",
  "urgency": 1-5,
  "target": "（可选）回应的对象或话题",
  "topic": "（可选）你想讨论的话题"
}
\`\`\`

- intent: speak=正常发言, interrupt=插话, question=提问, respond=回应某人, pass=不发言
- urgency: 1=无所谓, 3=一般, 5=非常紧急

只输出 JSON，不要有其他文字。`;

        return { systemPrompt: systemRole, userMessage };
    }

    /**
     * 构建实际发言 Prompt
     */
    private buildSpeechPrompt(
        ctx: AgentVisibleContext,
        intendedTopic?: string
    ): { systemPrompt: string; userMessage: string } {
        // ===== 1. System Role Prompt =====
        const systemRole = `你是一个参与讨论的角色，名字是「${this.persona.name}」。

## 你的身份
${this.persona.personaDescription}

## 你的说话风格
${this.getSpeakingStyleDescription()}

${this.persona.stance ? `## 你的立场
阵营：${this.persona.stance.factionId}
立场：${this.persona.stance.position}
` : ''}

${SYSTEM_CONSTRAINTS}`;

        // ===== 2. User Message =====
        const userMessage = `## 当前讨论阶段
- 阶段：${ctx.phase.name}
- 进度：第 ${ctx.phase.round} / ${ctx.phase.maxRounds} 轮

## 讨论主题
${ctx.topic}

${ctx.phaseSummary ? `## 阶段总结
${ctx.phaseSummary}
` : ''}

## 最近发言
${this.formatRecentEvents(ctx.recentEvents)}

${intendedTopic ? `## 你之前表达的意图
你想讨论：${intendedTopic}
` : ''}

## 你的任务
**主持人已经允许你发言。** 请根据讨论内容，以你的角色身份发表观点。

输出一个 JSON 对象：

\`\`\`json
{
  "type": "SPEECH",
  "content": "你的发言内容（自然语言，100-300字）",
  "tone": "calm | assertive | questioning | conciliatory | passionate"
}
\`\`\`

只输出 JSON，不要有其他文字。`;

        return { systemPrompt: systemRole, userMessage };
    }

    // ============================================
    // 辅助方法
    // ============================================

    /**
     * 格式化最近事件为可读文本
     */
    private formatRecentEvents(events: AgentVisibleEventSlim[]): string {
        if (events.length === 0) {
            return '（暂无发言）';
        }

        return events.map((e, i) =>
            `${i + 1}. [${e.speaker}] ${e.content} (${e.relativeTime})`
        ).join('\n');
    }

    /**
     * 获取说话风格描述
     */
    private getSpeakingStyleDescription(): string {
        const styleMap: Record<string, string> = {
            'concise': '你说话简洁有力，直击要点，不喜欢废话。',
            'elaborate': '你喜欢详细解释自己的观点，提供充分的论据和背景。',
            'aggressive': '你态度坚定，言辞犀利，善于反驳对方观点。',
            'diplomatic': '你措辞谨慎，善于调和不同意见，寻找共识。',
            'analytical': '你注重逻辑和数据，习惯用分析框架来讨论问题。',
            'emotional': '你善于用情感打动人，经常从个人经验和感受出发。'
        };
        return styleMap[this.persona.speakingStyle] || '你有自己独特的说话风格。';
    }

    /**
     * 调用 LLM
     */
    private async callLLM<T>(request: LLMRequest): Promise<LLMResponse<T>> {
        const messages = [
            { role: 'system' as const, content: request.systemPrompt },
            { role: 'user' as const, content: request.userMessage }
        ];

        const response = await this.llmProvider.complete(messages, {
            temperature: request.temperature,
            maxTokens: request.maxTokens
        });

        // 解析 JSON
        let result: T;
        try {
            // 尝试提取 JSON
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (e) {
            throw new Error(`Failed to parse LLM response as JSON: ${response.content}`);
        }

        return {
            result,
            rawText: response.content,
            usage: {
                promptTokens: response.tokens?.prompt || 0,
                completionTokens: response.tokens?.completion || 0,
                totalTokens: response.tokens?.total || 0
            }
        };
    }

    /**
     * 验证意图输出
     */
    private validateIntentOutput(output: any): IntentOutput {
        // 强制类型
        output.type = 'INTENT';

        // 验证必填字段
        if (!['speak', 'interrupt', 'question', 'respond', 'pass'].includes(output.intent)) {
            output.intent = 'pass';
        }

        // 验证 urgency 范围
        output.urgency = Math.max(1, Math.min(5, Math.round(output.urgency || 1)));

        return output as IntentOutput;
    }

    /**
     * 验证发言输出
     */
    private validateSpeechOutput(output: any): SpeechOutput {
        // 强制类型
        output.type = 'SPEECH';

        // 验证内容
        if (!output.content || typeof output.content !== 'string') {
            throw new Error('Speech content is required');
        }

        // 截断过长内容
        if (output.content.length > 2000) {
            output.content = output.content.substring(0, 2000) + '...';
        }

        // 验证 tone
        if (!['calm', 'assertive', 'questioning', 'conciliatory', 'passionate'].includes(output.tone)) {
            output.tone = 'calm';
        }

        return output as SpeechOutput;
    }

    // ============================================
    // 私有上下文管理
    // ============================================

    /**
     * 创建初始上下文
     */
    private createInitialContext(initialGoal: string): AgentPrivateContext {
        return {
            shortTermMemory: {
                entries: [],
                maxEntries: DEFAULT_SHORT_TERM_MAX_ENTRIES,
                estimatedTokens: 0,
                maxTokens: DEFAULT_SHORT_TERM_MAX_TOKENS
            },
            currentGoal: initialGoal
        };
    }

    /**
     * 添加到短期记忆
     */
    private addToShortTermMemory(entry: Omit<ShortTermMemory['entries'][0], 'timestamp'>): void {
        const memory = this.context.shortTermMemory;

        const newEntry = {
            ...entry,
            timestamp: Date.now()
        };

        memory.entries.push(newEntry);

        // 估算 token（简单按字符数估算）
        memory.estimatedTokens += Math.ceil(entry.content.length / 4);

        // 裁剪：优先删除低重要性条目
        while (
            memory.entries.length > memory.maxEntries ||
            memory.estimatedTokens > memory.maxTokens
        ) {
            // 找到重要性最低的条目
            let minIndex = 0;
            let minImportance = memory.entries[0].importance;

            for (let i = 1; i < memory.entries.length; i++) {
                if (memory.entries[i].importance < minImportance) {
                    minImportance = memory.entries[i].importance;
                    minIndex = i;
                }
            }

            // 删除并更新 token 估算
            const removed = memory.entries.splice(minIndex, 1)[0];
            memory.estimatedTokens -= Math.ceil(removed.content.length / 4);
        }
    }

    /**
     * 更新当前目标
     */
    updateGoal(newGoal: string): void {
        this.context.currentGoal = newGoal;
    }

    /**
     * 处理收到的反馈（如被拒绝发言）
     */
    handleFeedback(feedback: string): void {
        this.addToShortTermMemory({
            content: feedback,
            importance: 0.5,
            type: 'feedback'
        });
    }

    // ============================================
    // Getters
    // ============================================

    get agentId(): string {
        return this.persona.agentId;
    }

    get name(): string {
        return this.persona.name;
    }

    getPersona(): AgentPersona {
        return { ...this.persona };
    }
}

// ============================================
// AgentExecutorService（管理多个 Agent）
// ============================================

/**
 * Agent 执行器服务
 * 
 * 管理一个会话中的所有 Agent 实例
 */
export class AgentExecutorService {
    private agents: Map<string, AgentExecutor> = new Map();
    private llmProvider: ILLMProvider;

    constructor(llmProvider: ILLMProvider) {
        this.llmProvider = llmProvider;
    }

    /**
     * 创建并注册 Agent
     */
    createAgent(persona: AgentPersona, initialGoal?: string): AgentExecutor {
        const executor = new AgentExecutor(persona, this.llmProvider, initialGoal);
        this.agents.set(persona.agentId, executor);
        return executor;
    }

    /**
     * 获取 Agent
     */
    getAgent(agentId: string): AgentExecutor | undefined {
        return this.agents.get(agentId);
    }

    /**
     * 获取所有 Agent ID
     */
    getAllAgentIds(): string[] {
        return Array.from(this.agents.keys());
    }

    /**
     * 批量生成意图
     */
    async generateIntents(
        visibleContext: AgentVisibleContext
    ): Promise<Map<string, IntentOutput>> {
        const results = new Map<string, IntentOutput>();

        // 并行调用所有 Agent
        const promises = Array.from(this.agents.entries()).map(
            async ([agentId, executor]) => {
                try {
                    const intent = await executor.runIntentGeneration(visibleContext);
                    return { agentId, intent };
                } catch (e) {
                    console.error(`[AgentExecutorService] Agent ${agentId} intent failed:`, e);
                    return { agentId, intent: { type: 'INTENT' as const, intent: 'pass' as const, urgency: 1 } };
                }
            }
        );

        const responses = await Promise.all(promises);
        responses.forEach(r => results.set(r.agentId, r.intent));

        return results;
    }

    /**
     * 清除所有 Agent
     */
    clear(): void {
        this.agents.clear();
    }
}
