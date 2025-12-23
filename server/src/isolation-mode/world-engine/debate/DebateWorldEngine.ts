/**
 * Debate World Engine
 * 
 * 辩论场景的 WorldEngine 实现
 * 
 * 架构说明：
 * ┌──────────────────────────────────────────────┐
 * │           DebateWorldEngine                   │
 * │  ┌──────────────────────────────────────┐    │
 * │  │ DebateArbiter (冲突裁决)              │    │
 * │  └──────────────────────────────────────┘    │
 * │  ┌──────────────────────────────────────┐    │
 * │  │ DebateRuleEngine (规则验证+应用)     │    │
 * │  └──────────────────────────────────────┘    │
 * │  ┌──────────────────────────────────────┐    │
 * │  │ DebateScheduler (阶段+时间)          │    │
 * │  └──────────────────────────────────────┘    │
 * │  ┌──────────────────────────────────────┐    │
 * │  │ DebateNarrator (LLM 语言生成)        │    │
 * │  └──────────────────────────────────────┘    │
 * │  ┌──────────────────────────────────────┐    │
 * │  │ DebateWorldState (世界状态)          │    │
 * │  └──────────────────────────────────────┘    │
 * └──────────────────────────────────────────────┘
 */

import { v4 as uuidv4 } from 'uuid';
import {
    IWorldEngine,
    INarrator,
    WorldConfig,
    Action,
    ActionResult,
    WorldEvent,
    Entity,
    PhaseConfig
} from '../interfaces';
import {
    DebateWorldState,
    DebatePhaseState,
    createInitialDebateWorldState
} from './DebateWorldState';
import {
    DebateRuleEngine,
    DebateScheduler,
    DebateArbiter
} from './DebateComponents';
import { ScenarioSchema, PhaseConfig as LegacyPhaseConfig } from '../../core/types/scenario.types';
import { ModeratorLLMService } from '../../moderator/ModeratorLLMService';
import { SummaryInput, QuestionInput, OpeningInput } from '../../core/types/moderator-llm.types';
import { ILLMProvider } from '../../core/interfaces/ILLMProvider';

// ============================================
// DebateNarrator（适配 ModeratorLLM）
// ============================================

/**
 * 辩论叙述者
 * 
 * 复用 ModeratorLLMService
 */
export class DebateNarrator implements INarrator {
    private moderatorLLM: ModeratorLLMService;

    constructor(llmProvider: ILLMProvider) {
        this.moderatorLLM = new ModeratorLLMService(llmProvider);
    }

    async generateSummary(worldState: DebateWorldState, recentEvents: WorldEvent[]): Promise<string> {
        const input: SummaryInput = {
            topic: worldState.topic,
            phase: {
                id: worldState.currentPhase.phaseId,
                name: worldState.currentPhase.phaseId,
                type: (worldState.currentPhase as DebatePhaseState).phaseType
            },
            condensedEvents: recentEvents
                .filter(e => e.eventType === 'speech')
                .slice(-10)
                .map(e => ({
                    speaker: e.source,
                    keyPoint: typeof e.content === 'string'
                        ? e.content.substring(0, 100)
                        : '发言内容'
                })),
            consensusPoints: [],
            divergencePoints: [],
            summaryType: 'phase_end'
        };

        const output = await this.moderatorLLM.generateSummary(input);
        return output.summaryText;
    }

    async narrateEvent(event: WorldEvent): Promise<string> {
        // 简单格式化事件
        return `[${event.source}] ${typeof event.content === 'string' ? event.content : JSON.stringify(event.content)}`;
    }

    async generateOpening(worldState: DebateWorldState): Promise<string> {
        const participants = Array.from(worldState.entities.values())
            .filter(e => e.type === 'agent')
            .map(e => ({
                id: e.id,
                name: e.name,
                role: e.attributes.get('role') as string || '参与者',
                factionName: e.attributes.get('factionName') as string
            }));

        const input: OpeningInput = {
            topic: worldState.topic,
            alignmentType: worldState.alignment.type,
            participants,
            firstPhase: {
                name: worldState.currentPhase.phaseId,
                description: '第一阶段'
            }
        };

        const output = await this.moderatorLLM.generateOpening(input);
        return output.openingText;
    }

    async generateClosing(worldState: DebateWorldState): Promise<string> {
        const input = {
            topic: worldState.topic,
            phaseSummaries: [],
            finalConsensus: [],
            unresolvedDivergences: [],
            durationMinutes: Math.floor((Date.now() - worldState.currentPhase.startedAt) / 60000)
        };

        const output = await this.moderatorLLM.generateClosing(input);
        return output.closingText;
    }

    async generateQuestion(worldState: DebateWorldState, context: Record<string, unknown>): Promise<string> {
        const input: QuestionInput = {
            topic: worldState.topic,
            currentPhase: {
                id: worldState.currentPhase.phaseId,
                name: worldState.currentPhase.phaseId,
                type: (worldState.currentPhase as DebatePhaseState).phaseType,
                round: worldState.currentPhase.phaseRound,
                maxRounds: worldState.currentPhase.phaseMaxRounds
            },
            divergencePoints: context.divergencePoints as string[] || [],
            recentSpeechSummaries: context.recentSpeechSummaries as any[] || [],
            targetAgent: context.targetAgent as any
        };

        const output = await this.moderatorLLM.generateQuestion(input);
        return output.question;
    }
}

// ============================================
// DebateWorldEngine
// ============================================

/**
 * 辩论世界引擎
 */
export class DebateWorldEngine implements IWorldEngine {
    readonly name = 'DebateWorldEngine';

    private scenario!: ScenarioSchema;
    private state!: DebateWorldState;
    private ruleEngine!: DebateRuleEngine;
    private scheduler!: DebateScheduler;
    private arbiter!: DebateArbiter;
    private narrator?: DebateNarrator;
    private events: WorldEvent[] = [];

    /**
     * 初始化辩论世界
     */
    async initialize(config: WorldConfig): Promise<void> {
        // 提取 scenario
        this.scenario = config.extensions?.scenario as ScenarioSchema;
        if (!this.scenario) {
            throw new Error('DebateWorldEngine requires a ScenarioSchema in config.extensions.scenario');
        }

        // 初始化组件
        this.ruleEngine = new DebateRuleEngine(this.scenario);
        this.scheduler = new DebateScheduler(this.scenario);
        this.arbiter = new DebateArbiter();
        this.events = [];
    }

    /**
     * 设置 Narrator（可选）
     */
    setNarrator(llmProvider: ILLMProvider): void {
        this.narrator = new DebateNarrator(llmProvider);
    }

    /**
     * 初始化 Agents 并创建世界状态
     */
    initializeAgents(agentIds: string[], topic: string): void {
        const firstPhase = this.scenario.flow.phases[0];
        const phaseState = this.scheduler.createPhaseState(firstPhase);

        // 处理 alignment
        let alignment: DebateWorldState['alignment'];
        if (this.scenario.alignment.type === 'opposing' ||
            this.scenario.alignment.type === 'multi-faction') {
            alignment = {
                type: this.scenario.alignment.type,
                factions: this.scenario.alignment.factions?.map(f => ({
                    id: f.id,
                    name: f.name,
                    agentIds: [] // 需要外部设置
                }))
            };
        } else {
            alignment = { type: 'free' };
        }

        this.state = createInitialDebateWorldState(
            this.scenario.id,
            topic,
            agentIds,
            phaseState,
            alignment,
            this.scenario.moderatorPolicy.interventionLevel,
            this.scenario.moderatorPolicy.maxIdleRounds
        );

        // 设置开始时间
        this.state.globalVars.set('startedAt', Date.now());

        // 记录开始事件
        this.events.push({
            eventId: uuidv4(),
            eventType: 'debate_start',
            timestamp: Date.now(),
            source: 'system',
            content: { topic, agentIds }
        });
    }

    /**
     * 核心 step 循环
     * 
     * Action → Event 执行流程：
     * 
     * 1. Arbiter 裁决冲突：选出可执行的 Action
     * 2. RuleEngine 验证：检查规则合法性
     * 3. RuleEngine 应用：生成 Events 和 Effects
     * 4. 更新 WorldState
     * 5. Scheduler 检查阶段推进
     * 6. 检查终止条件
     */
    async step(agentActions: Action[]): Promise<ActionResult[]> {
        const results: ActionResult[] = [];

        // ========================================
        // 1. Arbiter 裁决：选出可执行的 Action
        // ========================================
        const resolvedActions = this.arbiter.resolveConflicts(agentActions, this.state);

        // 如果没有可执行的 Action，处理冷场
        if (resolvedActions.length === 0) {
            this.state.debate.idleRounds++;

            // 检查是否需要主持人干预
            if (this.shouldModeratorIntervene()) {
                const interventionEvent = await this.handleModeratorIntervention();
                if (interventionEvent) {
                    this.events.push(interventionEvent);
                }
            }
        } else {
            this.state.debate.idleRounds = 0;
        }

        // ========================================
        // 2 & 3. RuleEngine 验证 + 应用
        // ========================================
        for (const action of resolvedActions) {
            // 验证
            const validation = this.ruleEngine.validateAction(action, this.state);

            if (!validation.isValid) {
                // 记录被拒绝的 Action
                const rejectedEvent: WorldEvent = {
                    eventId: uuidv4(),
                    eventType: 'speech_rejected',
                    timestamp: Date.now(),
                    source: action.agentId,
                    content: {
                        actionId: action.actionId,
                        actionType: action.actionType,
                        reasons: validation.errors
                    }
                };
                this.events.push(rejectedEvent);

                results.push({
                    action,
                    success: false,
                    failureReason: validation.errors.join('; '),
                    effects: [],
                    events: [rejectedEvent]
                });
                continue;
            }

            // 应用
            const result = this.ruleEngine.applyAction(action, this.state);
            results.push(result);

            // 记录事件
            for (const event of result.events) {
                this.events.push(event);
            }

            // ========================================
            // 4. 更新 WorldState
            // ========================================
            if (result.success && ['speak', 'respond', 'question', 'interrupt'].includes(action.actionType)) {
                this.updateStateAfterSpeech(action.agentId);
            }
        }

        // 强制约束检查
        this.ruleEngine.enforceConstraints(this.state);

        // ========================================
        // 5. Scheduler 检查阶段推进
        // ========================================
        if (this.scheduler.shouldAdvancePhase(this.state)) {
            // 先生成总结（如果需要）
            const phaseState = this.state.currentPhase as DebatePhaseState;
            if (phaseState.forceSummary && this.narrator) {
                const summaryText = await this.narrator.generateSummary(this.state, this.events.slice(-20));
                this.events.push({
                    eventId: uuidv4(),
                    eventType: 'phase_summary',
                    timestamp: Date.now(),
                    source: 'moderator',
                    content: summaryText,
                    meta: { phaseId: this.state.currentPhase.phaseId }
                });
            }

            // 推进阶段
            const nextPhase = this.scheduler.getNextPhase(this.state.currentPhase.phaseId);
            if (nextPhase) {
                this.advancePhase(nextPhase);
            }
        }

        // ========================================
        // 6. 检查终止条件
        // ========================================
        if (!this.state.isTerminated && this.scheduler.shouldTerminate(this.state)) {
            this.state.isTerminated = true;
            this.state.terminationReason = 'All phases completed';

            this.events.push({
                eventId: uuidv4(),
                eventType: 'debate_end',
                timestamp: Date.now(),
                source: 'system',
                content: { reason: this.state.terminationReason }
            });
        }

        // 时间推进
        this.scheduler.nextTick();

        return results;
    }

    getWorldState(): DebateWorldState {
        return this.state;
    }

    isTerminated(): boolean {
        return this.state.isTerminated;
    }

    getTerminationReason(): string | undefined {
        return this.state.terminationReason;
    }

    registerEntity(entity: Entity): void {
        this.state.entities.set(entity.id, entity);
    }

    unregisterEntity(entityId: string): void {
        this.state.entities.delete(entityId);
    }

    getEvents(limit: number): WorldEvent[] {
        return this.events.slice(-limit);
    }

    async reset(): Promise<void> {
        this.events = [];
        // 重新初始化需要外部调用 initializeAgents
    }

    // ============================================
    // 私有方法
    // ============================================

    /**
     * 更新发言后状态
     */
    private updateStateAfterSpeech(speakerId: string): void {
        const debate = this.state.debate;

        // 更新发言统计
        debate.speakCounts.set(speakerId, (debate.speakCounts.get(speakerId) || 0) + 1);

        // 更新连续发言
        if (speakerId === debate.lastSpeakerId) {
            debate.consecutiveSpeaks++;
        } else {
            debate.consecutiveSpeaks = 1;
        }

        // 更新最后发言者
        debate.lastSpeakerId = speakerId;
        debate.activeSpeaker = null;

        // 更新轮询指针
        if (debate.speakingOrder === 'round-robin') {
            debate.roundRobinIndex++;
        }

        // 更新阶段轮次
        this.state.currentPhase.phaseRound++;
    }

    /**
     * 判断是否需要主持人干预
     */
    private shouldModeratorIntervene(): boolean {
        const { interventionLevel, idleRounds, coldThreshold } = this.state.debate;

        // 级别 0: 不干预
        if (interventionLevel === 0) return false;

        // 级别 1: 严重冷场时干预
        if (interventionLevel === 1) return idleRounds >= coldThreshold * 2;

        // 级别 2+: 冷场时干预
        return idleRounds >= coldThreshold;
    }

    /**
     * 处理主持人干预
     */
    private async handleModeratorIntervention(): Promise<WorldEvent | null> {
        const { interventionLevel, agentIds, speakCounts, lastSpeakerId } = this.state.debate;

        // 找发言最少的人
        let leastSpeaker: string | null = null;
        let minSpeaks = Infinity;

        for (const agentId of agentIds) {
            if (agentId === lastSpeakerId) continue;
            const count = speakCounts.get(agentId) || 0;
            if (count < minSpeaks) {
                minSpeaks = count;
                leastSpeaker = agentId;
            }
        }

        if (interventionLevel >= 3 && this.narrator) {
            // 高度干预：生成引导问题
            const question = await this.narrator.generateQuestion(this.state, {
                targetAgent: leastSpeaker ? { id: leastSpeaker, name: leastSpeaker } : undefined
            });

            return {
                eventId: uuidv4(),
                eventType: 'moderator_question',
                timestamp: Date.now(),
                source: 'moderator',
                content: question,
                meta: { targetAgentId: leastSpeaker }
            };
        }

        if (leastSpeaker) {
            // 中低度干预：点名
            return {
                eventId: uuidv4(),
                eventType: 'moderator_call',
                timestamp: Date.now(),
                source: 'moderator',
                content: `请 ${leastSpeaker} 发表观点`,
                meta: { targetAgentId: leastSpeaker }
            };
        }

        return null;
    }

    /**
     * 推进阶段
     */
    private advancePhase(nextPhaseConfig: PhaseConfig): void {
        const legacyPhase = this.scenario.flow.phases.find(p => p.id === nextPhaseConfig.id);
        if (!legacyPhase) return;

        const newPhaseState = this.scheduler.createPhaseState(legacyPhase);

        // 更新阶段相关的辩论状态
        this.state.debate.speakingOrder = legacyPhase.speakingOrder;
        this.state.debate.allowInterrupt = legacyPhase.allowInterrupt;

        this.state.currentPhase = newPhaseState;

        // 记录阶段切换事件
        this.events.push({
            eventId: uuidv4(),
            eventType: 'phase_switch',
            timestamp: Date.now(),
            source: 'system',
            content: {
                toPhaseId: nextPhaseConfig.id,
                toPhaseType: nextPhaseConfig.type
            }
        });
    }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 从 ScenarioSchema 创建 DebateWorldEngine
 */
export async function createDebateWorldEngineFromScenario(
    scenario: ScenarioSchema,
    agentIds: string[],
    topic: string,
    llmProvider?: ILLMProvider
): Promise<DebateWorldEngine> {
    const engine = new DebateWorldEngine();

    await engine.initialize({
        worldId: scenario.id,
        worldType: 'debate',
        phases: scenario.flow.phases.map(p => ({
            id: p.id,
            type: p.type,
            name: p.name,
            maxRounds: p.maxRounds,
            rules: { allowInterrupt: p.allowInterrupt, speakingOrder: p.speakingOrder },
            endCondition: p.endCondition
        })),
        rules: [],
        terminationConditions: [
            { type: 'max_rounds', params: { maxRounds: 100 } }
        ],
        extensions: { scenario }
    });

    if (llmProvider) {
        engine.setNarrator(llmProvider);
    }

    engine.initializeAgents(agentIds, topic);

    return engine;
}
