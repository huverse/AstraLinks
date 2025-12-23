/**
 * Debate World Adapter
 * 
 * 将现有的 ModeratorController 包装为 WorldEngine 实现
 * 
 * 这是向后兼容层：
 * - 辩论场景无需重写即可继续运行
 * - ModeratorController 的逻辑完全保留
 */

import { v4 as uuidv4 } from 'uuid';
import {
    IWorldEngine,
    IRuleEngine,
    WorldConfig,
    WorldState,
    PhaseState,
    Action,
    ActionResult,
    WorldEvent,
    WorldStateChange,
    Entity,
    ValidationResult
} from './interfaces';
import { BaseWorldEngine, DefaultScheduler, DefaultArbiter } from './BaseWorldEngine';

// 导入现有的 ModeratorController
import { ModeratorControllerCore } from '../moderator/ModeratorControllerCore';
import { ModeratorAction, ModeratorState, Intent, ModeratorDecision } from '../core/types/moderator.types';
import { ScenarioSchema, PhaseConfig as LegacyPhaseConfig } from '../core/types/scenario.types';

// ============================================
// Action 映射
// ============================================

/**
 * 辩论 Action 参数
 */
export interface DebateSpeakParams {
    content?: string;
    topic?: string;
    targetAgentId?: string;
    tone?: string;
}

/**
 * 将 Intent 转换为通用 Action
 */
export function intentToAction(intent: Intent): Action {
    return {
        actionId: uuidv4(),
        agentId: intent.agentId,
        actionType: intent.type as Action['actionType'],
        params: {
            topic: intent.topic,
            targetAgentId: intent.targetAgentId
        },
        confidence: intent.urgency / 5, // 转换为 0-1
        timestamp: intent.timestamp,
        priority: intent.urgency
    };
}

/**
 * 将通用 Action 转换回 Intent
 */
export function actionToIntent(action: Action): Intent {
    return {
        agentId: action.agentId,
        type: action.actionType as Intent['type'],
        urgency: Math.round(action.confidence * 5),
        topic: action.params.topic as string | undefined,
        targetAgentId: action.params.targetAgentId as string | undefined,
        timestamp: action.timestamp
    };
}

// ============================================
// 辩论世界配置转换
// ============================================

/**
 * 将 ScenarioSchema 转换为 WorldConfig
 */
export function scenarioToWorldConfig(scenario: ScenarioSchema): WorldConfig {
    return {
        worldId: scenario.id,
        worldType: 'debate',
        phases: scenario.flow.phases.map(p => ({
            id: p.id,
            type: p.type,
            name: p.name,
            maxRounds: p.maxRounds,
            rules: {
                allowInterrupt: p.allowInterrupt,
                speakingOrder: p.speakingOrder,
                endCondition: p.endCondition
            },
            endCondition: p.endCondition
        })),
        rules: [],
        terminationConditions: [
            { type: 'max_rounds', params: { maxRounds: 100 } }
        ],
        extensions: {
            scenario, // 保留原始 scenario
            alignment: scenario.alignment,
            moderatorPolicy: scenario.moderatorPolicy
        }
    };
}

// ============================================
// 辩论规则引擎
// ============================================

/**
 * 辩论规则引擎
 * 
 * 包装 ModeratorController 的规则逻辑
 */
export class DebateRuleEngine implements IRuleEngine {
    private controller: ModeratorControllerCore;
    private moderatorState: ModeratorState;

    constructor(scenario: ScenarioSchema, agentIds: string[]) {
        this.controller = new ModeratorControllerCore(scenario);
        this.moderatorState = this.controller.createInitialState(agentIds);
    }

    validateAction(action: Action, worldState: WorldState): ValidationResult {
        // 辩论中，所有 speak/interrupt/question/respond 类型都需要 Controller 批准
        // 这里只做基础验证
        const validTypes = ['speak', 'interrupt', 'question', 'respond', 'pass', 'vote'];

        if (!validTypes.includes(action.actionType)) {
            return {
                isValid: false,
                errors: [`Action type "${action.actionType}" is not valid for debate`],
                warnings: []
            };
        }

        return { isValid: true, errors: [], warnings: [] };
    }

    applyAction(action: Action, worldState: WorldState): ActionResult {
        // 将 Action 转换为 Intent
        const intent = actionToIntent(action);

        // 生成事件
        const event: WorldEvent = {
            eventId: uuidv4(),
            eventType: action.actionType,
            timestamp: Date.now(),
            source: action.agentId,
            content: action.params,
            meta: { actionId: action.actionId }
        };

        return {
            action,
            success: true,
            effects: [],
            events: [event]
        };
    }

    enforceConstraints(worldState: WorldState): WorldStateChange[] {
        // 辩论约束由 Controller 处理
        return [];
    }

    registerRule(): void { }
    getActiveRules(): any[] { return []; }

    /**
     * 获取 ModeratorController 决策
     * 
     * 这是适配器的核心方法
     */
    getModeratorDecision(intents: Intent[], recentEvents: any[]): ModeratorDecision {
        return this.controller.decideNextAction(this.moderatorState, intents, recentEvents);
    }

    /**
     * 更新 Moderator 状态
     */
    updateModeratorState(decision: ModeratorDecision, speakerId?: string): void {
        if (decision.action === ModeratorAction.ALLOW_SPEECH && speakerId) {
            this.moderatorState = this.controller.updateStateAfterSpeech(
                this.moderatorState,
                speakerId
            );
        } else if (decision.action === ModeratorAction.SWITCH_PHASE && decision.nextPhaseId) {
            this.moderatorState = this.controller.updateStateAfterPhaseSwitch(
                this.moderatorState,
                decision.nextPhaseId
            );
        } else if (decision.action === ModeratorAction.WAIT) {
            this.moderatorState = this.controller.updateStateAfterIdle(this.moderatorState);
        }
    }

    getModeratorState(): ModeratorState {
        return this.moderatorState;
    }
}

// ============================================
// Debate World Engine
// ============================================

/**
 * 辩论世界引擎
 * 
 * 这是 ModeratorController 的 WorldEngine 包装器
 */
export class DebateWorldEngine extends BaseWorldEngine {
    readonly name = 'DebateWorldEngine';

    private scenario!: ScenarioSchema;
    private debateRuleEngine!: DebateRuleEngine;
    private agentIds: string[] = [];

    /**
     * 初始化辩论世界
     */
    async initialize(config: WorldConfig): Promise<void> {
        this.config = config;
        this.scenario = config.extensions?.scenario as ScenarioSchema;

        if (!this.scenario) {
            throw new Error('DebateWorldEngine requires a ScenarioSchema in config.extensions.scenario');
        }

        await super.initialize(config);
    }

    /**
     * 注册 Agent 并初始化规则引擎
     */
    initializeAgents(agentIds: string[]): void {
        this.agentIds = agentIds;
        this.debateRuleEngine = new DebateRuleEngine(this.scenario, agentIds);
        this.ruleEngine = this.debateRuleEngine;

        // 注册 Agent 实体
        for (const agentId of agentIds) {
            this.registerEntity({
                id: agentId,
                type: 'agent',
                name: agentId,
                attributes: new Map(),
                status: 'active'
            });
        }
    }

    /**
     * 辩论专用 step
     * 
     * 集成 ModeratorController 决策
     */
    async step(agentActions: Action[]): Promise<ActionResult[]> {
        // 1. 将 Actions 转换为 Intents
        const intents = agentActions
            .filter(a => a.actionType !== 'pass')
            .map(actionToIntent);

        // 2. 获取 Moderator 决策
        const decision = this.debateRuleEngine.getModeratorDecision(intents, []);

        // 3. 根据决策处理
        const results: ActionResult[] = [];

        switch (decision.action) {
            case ModeratorAction.ALLOW_SPEECH:
                if (decision.targetAgentId) {
                    const allowedAction = agentActions.find(
                        a => a.agentId === decision.targetAgentId
                    );
                    if (allowedAction) {
                        const result = this.ruleEngine.applyAction(allowedAction, this.state);
                        results.push(result);
                        this.events.push(...result.events);
                    }
                    this.debateRuleEngine.updateModeratorState(decision, decision.targetAgentId);
                }
                break;

            case ModeratorAction.CALL_AGENT:
                // 记录点名事件
                this.events.push({
                    eventId: uuidv4(),
                    eventType: 'moderator_call',
                    timestamp: Date.now(),
                    source: 'moderator',
                    content: {
                        targetAgentId: decision.targetAgentId,
                        reason: decision.reason
                    }
                });
                this.debateRuleEngine.updateModeratorState(decision);
                break;

            case ModeratorAction.FORCE_SUMMARY:
                this.events.push({
                    eventId: uuidv4(),
                    eventType: 'summary_request',
                    timestamp: Date.now(),
                    source: 'moderator',
                    content: { llmRequestType: decision.llmRequestType }
                });
                break;

            case ModeratorAction.SWITCH_PHASE:
                if (decision.nextPhaseId) {
                    const nextPhase = this.config.phases.find(p => p.id === decision.nextPhaseId);
                    if (nextPhase) {
                        this.advancePhase(nextPhase);
                    }
                    this.debateRuleEngine.updateModeratorState(decision);
                }
                break;

            case ModeratorAction.END_DISCUSSION:
                this.state.isTerminated = true;
                this.state.terminationReason = decision.reason || 'Discussion ended';
                break;

            case ModeratorAction.WAIT:
                this.debateRuleEngine.updateModeratorState(decision);
                break;
        }

        // 更新阶段状态
        const moderatorState = this.debateRuleEngine.getModeratorState();
        this.state.currentPhase.phaseRound = moderatorState.phaseRound;

        return results;
    }

    protected createInitialState(config: WorldConfig): WorldState {
        const firstPhase = config.phases[0];

        return {
            worldId: config.worldId,
            worldType: 'debate',
            currentTime: { tick: 0, round: 0, timeScale: 1 },
            currentPhase: {
                phaseId: firstPhase.id,
                phaseType: firstPhase.type,
                phaseRound: 0,
                phaseMaxRounds: firstPhase.maxRounds,
                startedAt: Date.now(),
                phaseRules: firstPhase.rules
            },
            entities: new Map(),
            relationships: [],
            resources: new Map(),
            globalVars: new Map(),
            ruleStates: new Map(),
            isTerminated: false
        };
    }

    /**
     * 获取当前 Moderator 状态（兼容层）
     */
    getModeratorState(): ModeratorState {
        return this.debateRuleEngine.getModeratorState();
    }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 从 ScenarioSchema 创建 DebateWorldEngine
 */
export function createDebateWorldEngine(scenario: ScenarioSchema, agentIds: string[]): DebateWorldEngine {
    const engine = new DebateWorldEngine();
    const config = scenarioToWorldConfig(scenario);
    engine.initialize(config);
    engine.initializeAgents(agentIds);
    return engine;
}
