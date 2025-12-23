/**
 * Debate Sub-Components
 * 
 * 辩论世界引擎的子组件：
 * - DebateRuleEngine: 验证和应用规则
 * - DebateScheduler: 管理阶段和时间
 * - DebateArbiter: 裁决 Action 冲突
 */

import { v4 as uuidv4 } from 'uuid';
import {
    IRuleEngine,
    IScheduler,
    IArbiter,
    Action,
    ActionResult,
    WorldStateChange,
    WorldEvent,
    WorldTime,
    PhaseConfig,
    ValidationResult,
    Rule
} from '../interfaces';
import { DebateWorldState, DebatePhaseState, DebateActionType, SpeakParams } from './DebateWorldState';
import { ScenarioSchema, PhaseConfig as LegacyPhaseConfig } from '../../core/types/scenario.types';

// ============================================
// 常量
// ============================================

/** 连续发言最大次数 */
const MAX_CONSECUTIVE_SPEAKS = 2;

/** 插话最小紧急程度 */
const MIN_INTERRUPT_URGENCY = 3;

// ============================================
// DebateRuleEngine
// ============================================

/**
 * 辩论规则引擎
 * 
 * 职责：
 * - 校验 Action 是否合法（如是否能发言）
 * - 约束插话 / 连续发言等
 */
export class DebateRuleEngine implements IRuleEngine {
    private scenario: ScenarioSchema;
    private rules: Map<string, Rule> = new Map();

    constructor(scenario: ScenarioSchema) {
        this.scenario = scenario;
        this.initializeRules();
    }

    /**
     * 初始化内置规则
     */
    private initializeRules(): void {
        // 规则 1：连续发言限制
        this.rules.set('consecutive_speaks', {
            id: 'consecutive_speaks',
            name: '连续发言限制',
            priority: 10,
            condition: (action, state) => action.actionType === 'speak' || action.actionType === 'respond',
            validate: (action, state) => {
                const debateState = state as DebateWorldState;
                const { lastSpeakerId, consecutiveSpeaks } = debateState.debate;

                if (action.agentId === lastSpeakerId && consecutiveSpeaks >= MAX_CONSECUTIVE_SPEAKS) {
                    return {
                        isValid: false,
                        errors: [`Agent ${action.agentId} 已连续发言 ${consecutiveSpeaks} 次，请让其他人发言`],
                        warnings: []
                    };
                }
                return { isValid: true, errors: [], warnings: [] };
            }
        });

        // 规则 2：插话限制
        this.rules.set('interrupt_allowed', {
            id: 'interrupt_allowed',
            name: '插话限制',
            priority: 9,
            condition: (action) => action.actionType === 'interrupt',
            validate: (action, state) => {
                const debateState = state as DebateWorldState;

                if (!debateState.debate.allowInterrupt) {
                    return {
                        isValid: false,
                        errors: ['当前阶段不允许插话'],
                        warnings: []
                    };
                }

                if ((action.priority || 0) < MIN_INTERRUPT_URGENCY) {
                    return {
                        isValid: false,
                        errors: [`插话需要更高的紧急程度（至少 ${MIN_INTERRUPT_URGENCY}）`],
                        warnings: []
                    };
                }

                return { isValid: true, errors: [], warnings: [] };
            }
        });

        // 规则 3：发言者必须是注册的 Agent
        this.rules.set('valid_speaker', {
            id: 'valid_speaker',
            name: '有效发言者',
            priority: 100,
            condition: () => true,
            validate: (action, state) => {
                const debateState = state as DebateWorldState;
                if (!debateState.debate.agentIds.includes(action.agentId)) {
                    return {
                        isValid: false,
                        errors: [`Agent ${action.agentId} 不在参与者列表中`],
                        warnings: []
                    };
                }
                return { isValid: true, errors: [], warnings: [] };
            }
        });
    }

    /**
     * 验证 Action 是否合法
     */
    validateAction(action: Action, worldState: DebateWorldState): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 获取按优先级排序的规则
        const sortedRules = Array.from(this.rules.values())
            .sort((a, b) => b.priority - a.priority);

        for (const rule of sortedRules) {
            if (rule.condition(action, worldState) && rule.validate) {
                const result = rule.validate(action, worldState);
                errors.push(...result.errors);
                warnings.push(...result.warnings);

                // 高优先级规则失败则直接返回
                if (!result.isValid && rule.priority >= 50) {
                    return { isValid: false, errors, warnings };
                }
            }
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    /**
     * 应用 Action 到世界状态
     * 
     * 返回产生的事件和状态变化
     */
    applyAction(action: Action, worldState: DebateWorldState): ActionResult {
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];
        const params = action.params as SpeakParams;

        // 根据 Action 类型生成事件
        switch (action.actionType as DebateActionType) {
            case 'speak':
            case 'respond':
            case 'question':
                events.push({
                    eventId: uuidv4(),
                    eventType: 'speech',
                    timestamp: Date.now(),
                    source: action.agentId,
                    content: params.content || '',
                    meta: {
                        actionId: action.actionId,
                        actionType: action.actionType,
                        topic: params.topic,
                        tone: params.tone,
                        targetAgentId: params.targetAgentId
                    }
                });

                // 状态变化
                effects.push({
                    changeType: 'update',
                    entityType: 'debate_state',
                    entityId: 'debate',
                    fieldPath: 'lastSpeakerId',
                    oldValue: worldState.debate.lastSpeakerId,
                    newValue: action.agentId
                });
                break;

            case 'interrupt':
                events.push({
                    eventId: uuidv4(),
                    eventType: 'speech',
                    timestamp: Date.now(),
                    source: action.agentId,
                    content: params.content || '',
                    meta: {
                        actionId: action.actionId,
                        actionType: 'interrupt',
                        isInterrupt: true
                    }
                });
                break;

            case 'pass':
                // pass 不生成可见事件
                break;

            case 'vote':
                events.push({
                    eventId: uuidv4(),
                    eventType: 'vote',
                    timestamp: Date.now(),
                    source: action.agentId,
                    content: action.params,
                    meta: { actionId: action.actionId }
                });
                break;
        }

        return {
            action,
            success: true,
            effects,
            events
        };
    }

    /**
     * 强制约束检查
     */
    enforceConstraints(worldState: DebateWorldState): WorldStateChange[] {
        const changes: WorldStateChange[] = [];

        // 检查发言平衡
        const policy = this.scenario.moderatorPolicy;
        if (policy.balanceCheck?.enabled) {
            const totalSpeaks = Array.from(worldState.debate.speakCounts.values())
                .reduce((a, b) => a + b, 0);

            if (totalSpeaks > 0) {
                for (const [agentId, count] of worldState.debate.speakCounts) {
                    const ratio = count / totalSpeaks;
                    if (ratio > policy.balanceCheck.maxSpeakRatio) {
                        // 记录警告，但不强制改变
                        console.warn(`[DebateRuleEngine] Agent ${agentId} 发言占比 ${ratio.toFixed(2)} 超过阈值`);
                    }
                }
            }
        }

        return changes;
    }

    registerRule(rule: Rule): void {
        this.rules.set(rule.id, rule);
    }

    getActiveRules(): Rule[] {
        return Array.from(this.rules.values());
    }
}

// ============================================
// DebateScheduler
// ============================================

/**
 * 辩论调度器
 * 
 * 职责：
 * - 管理 phase 流转
 * - 控制 max_rounds
 * - 触发阶段结束
 */
export class DebateScheduler implements IScheduler {
    private scenario: ScenarioSchema;
    private time: WorldTime;
    private phaseOrder: string[];

    constructor(scenario: ScenarioSchema) {
        this.scenario = scenario;
        this.time = { tick: 0, round: 0, timeScale: 1 };
        this.phaseOrder = scenario.flow.phases.map(p => p.id);
    }

    nextTick(): WorldTime {
        this.time.tick++;
        return { ...this.time };
    }

    advanceRound(): void {
        this.time.round++;
    }

    currentTime(): WorldTime {
        return { ...this.time };
    }

    /**
     * 检查是否应该推进阶段
     */
    shouldAdvancePhase(worldState: DebateWorldState): boolean {
        const currentPhase = this.getCurrentPhaseConfig(worldState.currentPhase.phaseId);
        if (!currentPhase) return false;

        const phaseState = worldState.currentPhase as DebatePhaseState;

        // 检查 max_rounds
        if (phaseState.phaseRound >= currentPhase.maxRounds) {
            return true;
        }

        // 检查阶段结束条件
        switch (currentPhase.endCondition) {
            case 'timeout':
                if (currentPhase.timeout) {
                    const elapsed = (Date.now() - phaseState.startedAt) / 1000;
                    return elapsed >= currentPhase.timeout;
                }
                break;
            case 'consensus':
                // 需要外部判断，这里返回 false
                break;
        }

        return false;
    }

    /**
     * 获取下一个阶段
     */
    getNextPhase(currentPhaseId: string): PhaseConfig | null {
        const currentIndex = this.phaseOrder.indexOf(currentPhaseId);
        if (currentIndex === -1 || currentIndex >= this.phaseOrder.length - 1) {
            return null;
        }

        const nextPhaseConfig = this.scenario.flow.phases[currentIndex + 1];
        return this.legacyPhaseToPhaseConfig(nextPhaseConfig);
    }

    /**
     * 检查是否应该终止
     */
    shouldTerminate(worldState: DebateWorldState): boolean {
        // 所有阶段完成
        const currentIndex = this.phaseOrder.indexOf(worldState.currentPhase.phaseId);
        if (currentIndex === this.phaseOrder.length - 1) {
            const currentPhase = worldState.currentPhase as DebatePhaseState;
            if (currentPhase.phaseRound >= currentPhase.phaseMaxRounds) {
                return true;
            }
        }

        // 全局超时
        if (this.scenario.flow.globalTimeout) {
            const elapsed = Date.now() - (worldState.globalVars.get('startedAt') as number || 0);
            if (elapsed / 1000 >= this.scenario.flow.globalTimeout) {
                return true;
            }
        }

        return false;
    }

    setTimeScale(scale: number): void {
        this.time.timeScale = scale;
    }

    /**
     * 获取当前阶段配置
     */
    private getCurrentPhaseConfig(phaseId: string): LegacyPhaseConfig | undefined {
        return this.scenario.flow.phases.find(p => p.id === phaseId);
    }

    /**
     * 转换旧阶段配置
     */
    private legacyPhaseToPhaseConfig(legacy: LegacyPhaseConfig): PhaseConfig {
        return {
            id: legacy.id,
            type: legacy.type,
            name: legacy.name,
            maxRounds: legacy.maxRounds,
            rules: {
                allowInterrupt: legacy.allowInterrupt,
                speakingOrder: legacy.speakingOrder,
                maxTokensPerSpeech: legacy.maxTokensPerSpeech,
                forceSummary: legacy.forceSummary
            },
            endCondition: legacy.endCondition
        };
    }

    /**
     * 创建阶段状态
     */
    createPhaseState(phaseConfig: LegacyPhaseConfig): DebatePhaseState {
        return {
            phaseId: phaseConfig.id,
            phaseType: phaseConfig.type,
            phaseRound: 0,
            phaseMaxRounds: phaseConfig.maxRounds,
            startedAt: Date.now(),
            phaseRules: {
                allowInterrupt: phaseConfig.allowInterrupt,
                speakingOrder: phaseConfig.speakingOrder
            },
            forceSummary: phaseConfig.forceSummary || false,
            generateOpening: phaseConfig.generateOpening || false,
            maxTokensPerSpeech: phaseConfig.maxTokensPerSpeech
        };
    }
}

// ============================================
// DebateArbiter
// ============================================

/**
 * 辩论仲裁器
 * 
 * 职责：
 * - 在多个 speak / interrupt Action 中裁决
 * - 返回被执行的 Action 列表
 */
export class DebateArbiter implements IArbiter {
    /**
     * 解决冲突
     * 
     * 辩论规则：
     * 1. 每轮只允许一个 Agent 发言
     * 2. interrupt 优先级高于 speak
     * 3. 同类型按 urgency/priority 排序
     */
    resolveConflicts(actions: Action[], worldState: DebateWorldState): Action[] {
        if (actions.length === 0) return [];

        // 过滤掉 pass
        const activeActions = actions.filter(a => a.actionType !== 'pass');
        if (activeActions.length === 0) return [];

        // 按优先级排序
        const prioritized = this.prioritizeActions(activeActions);

        // 过滤掉连续发言过多的 Agent
        const { lastSpeakerId, consecutiveSpeaks } = worldState.debate;
        const eligible = prioritized.filter(a => {
            if (a.agentId === lastSpeakerId && consecutiveSpeaks >= MAX_CONSECUTIVE_SPEAKS) {
                return false;
            }
            return true;
        });

        // 根据 speakingOrder 决定返回谁
        switch (worldState.debate.speakingOrder) {
            case 'round-robin':
                return this.resolveRoundRobin(eligible, worldState);
            case 'moderated':
                return this.resolveModerated(eligible, worldState);
            case 'free':
            default:
                // 返回优先级最高的
                return eligible.length > 0 ? [eligible[0]] : [];
        }
    }

    /**
     * 按优先级排序
     */
    prioritizeActions(actions: Action[]): Action[] {
        return [...actions].sort((a, b) => {
            // interrupt 优先
            if (a.actionType === 'interrupt' && b.actionType !== 'interrupt') return -1;
            if (b.actionType === 'interrupt' && a.actionType !== 'interrupt') return 1;

            // 按 priority 排序
            const priorityA = a.priority || 5;
            const priorityB = b.priority || 5;
            if (priorityB !== priorityA) return priorityB - priorityA;

            // 按 confidence 排序
            return b.confidence - a.confidence;
        });
    }

    /**
     * 检查两个 Action 是否冲突
     */
    checkConflict(action1: Action, action2: Action, worldState: DebateWorldState): boolean {
        // 辩论中，所有发言类 Action 互相冲突
        const speakActions: DebateActionType[] = ['speak', 'interrupt', 'respond', 'question'];
        return speakActions.includes(action1.actionType as DebateActionType) &&
            speakActions.includes(action2.actionType as DebateActionType);
    }

    /**
     * 轮流发言
     */
    private resolveRoundRobin(actions: Action[], worldState: DebateWorldState): Action[] {
        const { agentIds, roundRobinIndex } = worldState.debate;
        const expectedSpeakerId = agentIds[roundRobinIndex % agentIds.length];

        // 查找期望发言者的 Action
        const expectedAction = actions.find(a => a.agentId === expectedSpeakerId);
        if (expectedAction) {
            return [expectedAction];
        }

        // 允许高优先级 interrupt
        const interruptAction = actions.find(
            a => a.actionType === 'interrupt' &&
                (a.priority || 0) >= 4 &&
                worldState.debate.allowInterrupt
        );
        if (interruptAction) {
            return [interruptAction];
        }

        // 没有合适的
        return [];
    }

    /**
     * 主持人控制模式
     */
    private resolveModerated(actions: Action[], worldState: DebateWorldState): Action[] {
        const { agentIds, speakCounts, lastSpeakerId, consecutiveSpeaks } = worldState.debate;

        // 优先让发言次数少的人发言
        let selectedAction: Action | null = null;
        let minSpeaks = Infinity;

        for (const action of actions) {
            const count = speakCounts.get(action.agentId) || 0;

            // 有 Action 意图的人优先
            const adjustedCount = count - 0.5;

            if (adjustedCount < minSpeaks) {
                minSpeaks = adjustedCount;
                selectedAction = action;
            }
        }

        return selectedAction ? [selectedAction] : [];
    }
}
