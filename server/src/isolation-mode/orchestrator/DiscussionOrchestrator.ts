/**
 * Discussion Orchestrator
 * 
 * 将所有模块串联起来运行完整讨论流程：
 * - Scenario Config (YAML)
 * - Shared Event Log
 * - Moderator Controller
 * - Agent Executor
 * - Moderator LLM
 * 
 * 这不是新的核心抽象，只是组装层。
 */

import { v4 as uuidv4 } from 'uuid';

// 场景配置
import { ScenarioSchema, PhaseConfig } from '../core/types/scenario.types';
import { ScenarioConfigLoader } from '../scenarios/ScenarioConfigLoader';

// 事件日志
import { Event, EventType, EventSpeaker } from '../core/types/event.types';
import { eventLogService } from '../event-log/EventLogService';

// 主持人控制器
import { ModeratorControllerCore } from '../moderator/ModeratorControllerCore';
import { ModeratorAction, ModeratorState, ModeratorDecision, Intent } from '../core/types/moderator.types';

// Agent 执行器
import { AgentExecutor, AgentExecutorService } from '../agents/AgentExecutorCore';
import { AgentPersona, AgentVisibleContext, IntentOutput, SpeechOutput } from '../core/types/agent-executor.types';

// Moderator LLM
import { ModeratorLLMService } from '../moderator/ModeratorLLMService';
import { SummaryInput, QuestionInput, OpeningInput, ClosingInput } from '../core/types/moderator-llm.types';

// LLM Provider
import { ILLMProvider, LLMMessage, LLMCompletionResult } from '../core/interfaces/ILLMProvider';

// ============================================
// Mock LLM Provider（用于演示）
// ============================================

/**
 * 模拟 LLM Provider
 * 
 * 用于演示场景，返回预设的响应
 */
class MockLLMProvider implements ILLMProvider {
    readonly name = 'mock';
    private responseIndex = 0;

    async complete(messages: LLMMessage[]): Promise<LLMCompletionResult> {
        // 解析最后一条消息来确定返回什么
        const lastMessage = messages[messages.length - 1].content;
        let response: string;

        if (lastMessage.includes('INTENT')) {
            // Intent 生成
            const intents = ['speak', 'respond', 'question', 'pass'];
            const intent = intents[this.responseIndex % intents.length];
            response = JSON.stringify({
                type: 'INTENT',
                intent,
                urgency: 3 + (this.responseIndex % 3),
                topic: '关于核心议题的观点'
            });
        } else if (lastMessage.includes('SPEECH')) {
            // Speech 生成
            response = JSON.stringify({
                type: 'SPEECH',
                content: `这是第 ${this.responseIndex + 1} 次发言的模拟内容。我认为我们需要更深入地讨论这个问题的各个方面。`,
                tone: 'calm'
            });
        } else if (lastMessage.includes('summaryText')) {
            // Summary 生成
            response = JSON.stringify({
                summaryText: '本阶段讨论围绕核心议题展开，各方表达了不同观点。存在共识和分歧，建议下一阶段深入探讨。',
                consensusHighlights: ['需要进一步讨论', '已识别关键问题'],
                divergenceHighlights: ['方案选择', '资源分配'],
                nextStepsSuggestion: '建议聚焦核心分歧点'
            });
        } else if (lastMessage.includes('openingText')) {
            // Opening 生成
            response = JSON.stringify({
                openingText: '欢迎各位参与今天的讨论。我们将围绕核心议题展开探讨，请各位积极发言。'
            });
        } else if (lastMessage.includes('question')) {
            // Question 生成
            response = JSON.stringify({
                question: '能否请您具体说明一下您的核心论点？',
                questionType: 'directed',
                targetName: null
            });
        } else {
            response = JSON.stringify({ content: '默认响应' });
        }

        this.responseIndex++;

        return {
            content: response,
            tokens: { prompt: 100, completion: 50, total: 150 },
            finishReason: 'stop'
        };
    }

    async *completeStream(): AsyncGenerator<string, void, unknown> {
        yield '流式响应不支持';
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }
}

// ============================================
// DiscussionOrchestrator
// ============================================

/**
 * 讨论会话状态
 */
interface DiscussionSession {
    sessionId: string;
    scenario: ScenarioSchema;
    moderatorState: ModeratorState;
    agentPersonas: Map<string, AgentPersona>;
    currentRound: number;
    isRunning: boolean;
    startedAt: number;
}

/**
 * 讨论协调器
 * 
 * 串联所有模块的组装层
 */
export class DiscussionOrchestrator {
    private scenarioLoader: ScenarioConfigLoader;
    private llmProvider: ILLMProvider;
    private moderatorLLM: ModeratorLLMService;
    private agentService: AgentExecutorService;

    constructor(llmProvider?: ILLMProvider) {
        this.llmProvider = llmProvider || new MockLLMProvider();
        this.scenarioLoader = new ScenarioConfigLoader();
        this.moderatorLLM = new ModeratorLLMService(this.llmProvider);
        this.agentService = new AgentExecutorService(this.llmProvider);
    }

    /**
     * 创建讨论会话
     */
    async createSession(
        scenarioId: string,
        agentPersonas: AgentPersona[]
    ): Promise<DiscussionSession> {
        // 1. 加载场景配置
        const scenario = await this.scenarioLoader.load(scenarioId);

        // 2. 创建会话 ID
        const sessionId = uuidv4();

        // 3. 创建 Agent 实例
        const personaMap = new Map<string, AgentPersona>();
        for (const persona of agentPersonas) {
            this.agentService.createAgent(persona, `参与 ${scenario.name} 讨论`);
            personaMap.set(persona.agentId, persona);
        }

        // 4. 创建 Moderator Controller
        const controller = new ModeratorControllerCore(scenario);
        const moderatorState = controller.createInitialState(agentPersonas.map(p => p.agentId));

        // 5. 初始化 Event Log
        // Event Log 会在首次 appendEvent 时自动创建会话

        return {
            sessionId,
            scenario,
            moderatorState,
            agentPersonas: personaMap,
            currentRound: 0,
            isRunning: false,
            startedAt: Date.now()
        };
    }

    /**
     * 运行一轮讨论
     * 
     * 这是核心循环：
     * 1. Agent 生成 Intent
     * 2. Controller 决策
     * 3. 执行决策（Allow Speech → 生成 Speech，Force Summary → 生成 Summary）
     * 4. 写入 Event Log
     */
    async runRound(
        session: DiscussionSession,
        controller: ModeratorControllerCore
    ): Promise<{
        decision: ModeratorDecision;
        events: Event[];
    }> {
        const { sessionId, scenario, moderatorState, agentPersonas } = session;
        const events: Event[] = [];

        // 1. 构建 Agent 可见上下文
        const visibleContext = await this.buildVisibleContext(session);

        // 2. 收集所有 Agent 的 Intent
        const intents: Intent[] = [];
        for (const [agentId, persona] of agentPersonas) {
            const executor = this.agentService.getAgent(agentId);
            if (!executor) continue;

            try {
                const intentOutput = await executor.runIntentGeneration(visibleContext);
                if (intentOutput.intent !== 'pass') {
                    intents.push({
                        agentId,
                        type: intentOutput.intent as Intent['type'],
                        urgency: intentOutput.urgency,
                        topic: intentOutput.topic,
                        timestamp: Date.now()
                    });

                    // 记录 INTENT 事件
                    const intentEvent = await eventLogService.appendEvent({
                        sessionId,
                        type: EventType.INTENT,
                        speaker: agentId,
                        content: JSON.stringify(intentOutput),
                        meta: { urgency: intentOutput.urgency }
                    });
                    events.push(intentEvent);
                }
            } catch (e) {
                console.error(`[Orchestrator] Agent ${agentId} intent failed:`, e);
            }
        }

        // 3. 获取最近事件
        const recentEvents = await eventLogService.getRecentEvents(sessionId, 10);

        // 4. Controller 决策
        const decision = controller.decideNextAction(moderatorState, intents, recentEvents);

        // 5. 执行决策
        switch (decision.action) {
            case ModeratorAction.ALLOW_SPEECH:
                if (decision.targetAgentId) {
                    const speechEvent = await this.executeSpeech(
                        session,
                        decision.targetAgentId,
                        visibleContext
                    );
                    if (speechEvent) events.push(speechEvent);
                }
                break;

            case ModeratorAction.CALL_AGENT:
                // 记录点名事件
                const callEvent = await eventLogService.appendEvent({
                    sessionId,
                    type: EventType.SYSTEM,
                    speaker: 'moderator',
                    content: `主持人点名 ${decision.targetAgentId}：${decision.reason}`,
                    meta: { action: 'call_agent', targetAgentId: decision.targetAgentId }
                });
                events.push(callEvent);

                // 执行发言
                if (decision.targetAgentId) {
                    const speechEvent = await this.executeSpeech(
                        session,
                        decision.targetAgentId,
                        { ...visibleContext, isCalledToSpeak: true, callReason: decision.reason }
                    );
                    if (speechEvent) events.push(speechEvent);
                }
                break;

            case ModeratorAction.FORCE_SUMMARY:
                const summaryEvent = await this.executeSummary(session);
                if (summaryEvent) events.push(summaryEvent);
                break;

            case ModeratorAction.SWITCH_PHASE:
                const phaseEvent = await eventLogService.appendEvent({
                    sessionId,
                    type: EventType.SYSTEM,
                    speaker: 'system',
                    content: `阶段切换：进入 ${decision.nextPhaseId}`,
                    meta: {
                        action: 'phase_switch',
                        fromPhaseId: moderatorState.currentPhaseId,
                        toPhaseId: decision.nextPhaseId
                    }
                });
                events.push(phaseEvent);
                break;

            case ModeratorAction.PROMPT_QUESTION:
                const questionEvent = await this.executeQuestion(session, decision);
                if (questionEvent) events.push(questionEvent);
                break;

            case ModeratorAction.END_DISCUSSION:
                const endEvent = await eventLogService.appendEvent({
                    sessionId,
                    type: EventType.SYSTEM,
                    speaker: 'system',
                    content: '讨论结束',
                    meta: { action: 'end_discussion' }
                });
                events.push(endEvent);
                break;
        }

        return { decision, events };
    }

    /**
     * 执行发言
     */
    private async executeSpeech(
        session: DiscussionSession,
        agentId: string,
        visibleContext: AgentVisibleContext
    ): Promise<Event | null> {
        const executor = this.agentService.getAgent(agentId);
        if (!executor) return null;

        try {
            const speechOutput = await executor.runSpeechGeneration(visibleContext);

            return await eventLogService.appendEvent({
                sessionId: session.sessionId,
                type: EventType.SPEECH,
                speaker: agentId,
                content: speechOutput.content,
                meta: { tone: speechOutput.tone }
            });
        } catch (e) {
            console.error(`[Orchestrator] Agent ${agentId} speech failed:`, e);
            return null;
        }
    }

    /**
     * 执行总结
     */
    private async executeSummary(session: DiscussionSession): Promise<Event | null> {
        const { sessionId, scenario, moderatorState } = session;

        // 获取精简的事件
        const recentEvents = await eventLogService.getRecentEvents(sessionId, 10);
        const condensedEvents = recentEvents
            .filter(e => e.type === EventType.SPEECH)
            .map(e => ({
                speaker: e.speaker as string,
                keyPoint: typeof e.content === 'string'
                    ? e.content.substring(0, 100)
                    : '发言内容'
            }));

        const summaryInput: SummaryInput = {
            topic: scenario.description,
            phase: {
                id: moderatorState.currentPhaseId,
                name: moderatorState.currentPhaseId,
                type: moderatorState.currentPhaseType
            },
            condensedEvents,
            consensusPoints: [],
            divergencePoints: [],
            summaryType: 'phase_end'
        };

        try {
            const summaryOutput = await this.moderatorLLM.generateSummary(summaryInput);

            return await eventLogService.appendEvent({
                sessionId,
                type: EventType.SUMMARY,
                speaker: 'moderator',
                content: summaryOutput.summaryText,
                meta: {
                    phaseId: moderatorState.currentPhaseId,
                    consensusHighlights: summaryOutput.consensusHighlights,
                    divergenceHighlights: summaryOutput.divergenceHighlights
                }
            });
        } catch (e) {
            console.error(`[Orchestrator] Summary generation failed:`, e);
            return null;
        }
    }

    /**
     * 执行引导提问
     */
    private async executeQuestion(
        session: DiscussionSession,
        decision: ModeratorDecision
    ): Promise<Event | null> {
        const { sessionId, scenario, moderatorState } = session;

        const recentEvents = await eventLogService.getRecentEvents(sessionId, 5);

        const questionInput: QuestionInput = {
            topic: scenario.description,
            currentPhase: {
                id: moderatorState.currentPhaseId,
                name: moderatorState.currentPhaseId,
                type: moderatorState.currentPhaseType,
                round: moderatorState.phaseRound,
                maxRounds: moderatorState.phaseMaxRounds
            },
            divergencePoints: [],
            recentSpeechSummaries: recentEvents
                .filter(e => e.type === EventType.SPEECH)
                .slice(-3)
                .map(e => ({
                    speaker: e.speaker as string,
                    summary: typeof e.content === 'string' ? e.content.substring(0, 50) : ''
                }))
        };

        try {
            const questionOutput = await this.moderatorLLM.generateQuestion(questionInput);

            return await eventLogService.appendEvent({
                sessionId,
                type: EventType.SYSTEM,
                speaker: 'moderator',
                content: questionOutput.question,
                meta: { action: 'question', questionType: questionOutput.questionType }
            });
        } catch (e) {
            console.error(`[Orchestrator] Question generation failed:`, e);
            return null;
        }
    }

    /**
     * 构建 Agent 可见上下文
     */
    private async buildVisibleContext(session: DiscussionSession): Promise<AgentVisibleContext> {
        const { sessionId, scenario, moderatorState } = session;

        // 获取最近事件
        const recentEvents = await eventLogService.getRecentEvents(sessionId, 10);

        // 获取最近的 Summary（如果有）
        const summaryEvents = await eventLogService.getEventsByType(sessionId, EventType.SUMMARY, 1);
        const phaseSummary = summaryEvents.length > 0
            ? (typeof summaryEvents[0].content === 'string' ? summaryEvents[0].content : undefined)
            : undefined;

        return {
            phase: {
                type: moderatorState.currentPhaseType,
                name: moderatorState.currentPhaseId,
                description: '讨论阶段',
                round: moderatorState.phaseRound,
                maxRounds: moderatorState.phaseMaxRounds
            },
            recentEvents: recentEvents.map(e => ({
                type: e.type,
                speaker: e.speaker as string,
                content: typeof e.content === 'string' ? e.content : JSON.stringify(e.content),
                relativeTime: this.getRelativeTime(e.timestamp)
            })),
            phaseSummary,
            topic: scenario.description,
            isCalledToSpeak: false
        };
    }

    /**
     * 获取相对时间
     */
    private getRelativeTime(timestamp: string): string {
        const now = Date.now();
        const then = new Date(timestamp).getTime();
        const diff = Math.floor((now - then) / 1000);

        if (diff < 60) return `${diff}秒前`;
        if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
        return `${Math.floor(diff / 3600)}小时前`;
    }

    /**
     * 清理会话
     */
    async cleanupSession(sessionId: string): Promise<void> {
        await eventLogService.clearSession(sessionId);
        this.agentService.clear();
    }
}

// 导出单例
export const discussionOrchestrator = new DiscussionOrchestrator();
