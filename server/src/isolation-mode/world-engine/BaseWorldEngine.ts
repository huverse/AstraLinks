/**
 * Base World Engine 实现
 * 
 * 提供 IWorldEngine 的基础实现
 * 可被继承和扩展
 */

import { v4 as uuidv4 } from 'uuid';
import {
    IWorldEngine,
    IRuleEngine,
    IScheduler,
    IArbiter,
    WorldConfig,
    WorldState,
    WorldTime,
    PhaseState,
    PhaseConfig,
    Action,
    ActionResult,
    WorldEvent,
    WorldStateChange,
    Entity,
    ValidationResult
} from './interfaces';

// ============================================
// 默认调度器
// ============================================

export class DefaultScheduler implements IScheduler {
    private config: WorldConfig;
    private time: WorldTime;
    private phaseOrder: string[];

    constructor(config: WorldConfig) {
        this.config = config;
        this.time = config.initialTime || { tick: 0, round: 0, timeScale: 1 };
        this.phaseOrder = config.phases.map(p => p.id);
    }

    nextTick(): WorldTime {
        this.time.tick++;
        return { ...this.time };
    }

    currentTime(): WorldTime {
        return { ...this.time };
    }

    advanceRound(): void {
        this.time.round++;
    }

    shouldAdvancePhase(worldState: WorldState): boolean {
        const { currentPhase } = worldState;
        return currentPhase.phaseRound >= currentPhase.phaseMaxRounds;
    }

    getNextPhase(currentPhaseId: string): PhaseConfig | null {
        const currentIndex = this.phaseOrder.indexOf(currentPhaseId);
        if (currentIndex === -1 || currentIndex >= this.phaseOrder.length - 1) {
            return null;
        }
        return this.config.phases[currentIndex + 1];
    }

    shouldTerminate(worldState: WorldState): boolean {
        for (const condition of this.config.terminationConditions) {
            switch (condition.type) {
                case 'max_rounds':
                    if (this.time.round >= (condition.params.maxRounds as number)) {
                        return true;
                    }
                    break;
                case 'goal_reached':
                    // 由具体实现判断
                    break;
            }
        }
        return false;
    }

    setTimeScale(scale: number): void {
        this.time.timeScale = scale;
    }
}

// ============================================
// 默认仲裁器
// ============================================

export class DefaultArbiter implements IArbiter {
    resolveConflicts(actions: Action[], worldState: WorldState): Action[] {
        // 默认策略：按优先级和置信度排序，同一 Agent 只保留最高优先级 Action
        const prioritized = this.prioritizeActions(actions);

        const agentActions = new Map<string, Action>();
        for (const action of prioritized) {
            if (!agentActions.has(action.agentId)) {
                agentActions.set(action.agentId, action);
            }
        }

        return Array.from(agentActions.values());
    }

    prioritizeActions(actions: Action[]): Action[] {
        return [...actions].sort((a, b) => {
            // 先按优先级排序
            const priorityA = a.priority || 5;
            const priorityB = b.priority || 5;
            if (priorityB !== priorityA) return priorityB - priorityA;

            // 再按置信度排序
            return b.confidence - a.confidence;
        });
    }

    checkConflict(action1: Action, action2: Action, worldState: WorldState): boolean {
        // 默认：同一目标的 Action 冲突
        if (action1.target && action2.target) {
            return action1.target.id === action2.target.id;
        }
        return false;
    }
}

// ============================================
// 默认规则引擎
// ============================================

export class DefaultRuleEngine implements IRuleEngine {
    private rules: Map<string, any> = new Map();

    validateAction(action: Action, worldState: WorldState): ValidationResult {
        // 默认：所有 Action 合法
        return { isValid: true, errors: [], warnings: [] };
    }

    applyAction(action: Action, worldState: WorldState): ActionResult {
        // 默认：生成一个事件
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
        // 默认：无约束强制
        return [];
    }

    registerRule(rule: any): void {
        this.rules.set(rule.id, rule);
    }

    getActiveRules(): any[] {
        return Array.from(this.rules.values());
    }
}

// ============================================
// Base World Engine
// ============================================

/**
 * 基础世界引擎
 * 
 * 提供通用的 step() 循环实现
 */
export abstract class BaseWorldEngine implements IWorldEngine {
    abstract readonly name: string;

    protected config!: WorldConfig;
    protected state!: WorldState;
    protected scheduler!: IScheduler;
    protected arbiter!: IArbiter;
    protected ruleEngine!: IRuleEngine;
    protected events: WorldEvent[] = [];

    async initialize(config: WorldConfig): Promise<void> {
        this.config = config;
        this.scheduler = this.createScheduler(config);
        this.arbiter = this.createArbiter();
        this.ruleEngine = this.createRuleEngine();
        this.state = this.createInitialState(config);
        this.events = [];
    }

    /**
     * 核心 step 循环
     * 
     * 1. 仲裁冲突
     * 2. 验证 Actions
     * 3. 应用 Actions
     * 4. 强制约束
     * 5. 检查阶段推进
     * 6. 检查终止条件
     */
    async step(agentActions: Action[]): Promise<ActionResult[]> {
        // 1. 仲裁冲突
        const resolvedActions = this.arbiter.resolveConflicts(agentActions, this.state);

        // 2. 验证并应用 Actions
        const results: ActionResult[] = [];
        for (const action of resolvedActions) {
            const validation = this.ruleEngine.validateAction(action, this.state);

            if (!validation.isValid) {
                results.push({
                    action,
                    success: false,
                    failureReason: validation.errors.join('; '),
                    effects: [],
                    events: []
                });
                continue;
            }

            const result = this.ruleEngine.applyAction(action, this.state);
            results.push(result);

            // 记录事件
            for (const event of result.events) {
                this.events.push(event);
            }

            // 应用效果
            this.applyEffects(result.effects);
        }

        // 3. 强制约束
        const constraintChanges = this.ruleEngine.enforceConstraints(this.state);
        this.applyEffects(constraintChanges);

        // 4. 推进时间
        this.scheduler.nextTick();
        this.state.currentPhase.phaseRound++;

        // 5. 检查阶段推进
        if (this.scheduler.shouldAdvancePhase(this.state)) {
            const nextPhase = this.scheduler.getNextPhase(this.state.currentPhase.phaseId);
            if (nextPhase) {
                this.advancePhase(nextPhase);
            } else {
                this.state.isTerminated = true;
                this.state.terminationReason = 'All phases completed';
            }
        }

        // 6. 检查终止条件
        if (!this.state.isTerminated && this.scheduler.shouldTerminate(this.state)) {
            this.state.isTerminated = true;
            this.state.terminationReason = 'Termination condition met';
        }

        return results;
    }

    getWorldState(): WorldState {
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
        this.state = this.createInitialState(this.config);
        this.events = [];
    }

    // ============================================
    // 可覆盖的工厂方法
    // ============================================

    protected createScheduler(config: WorldConfig): IScheduler {
        return new DefaultScheduler(config);
    }

    protected createArbiter(): IArbiter {
        return new DefaultArbiter();
    }

    protected createRuleEngine(): IRuleEngine {
        return new DefaultRuleEngine();
    }

    protected abstract createInitialState(config: WorldConfig): WorldState;

    // ============================================
    // 辅助方法
    // ============================================

    protected applyEffects(effects: WorldStateChange[]): void {
        for (const effect of effects) {
            // 由具体实现处理
        }
    }

    protected advancePhase(nextPhase: PhaseConfig): void {
        this.state.currentPhase = {
            phaseId: nextPhase.id,
            phaseType: nextPhase.type,
            phaseRound: 0,
            phaseMaxRounds: nextPhase.maxRounds,
            startedAt: Date.now(),
            phaseRules: nextPhase.rules
        };

        // 记录阶段切换事件
        this.events.push({
            eventId: uuidv4(),
            eventType: 'phase_switch',
            timestamp: Date.now(),
            source: 'system',
            content: {
                toPhaseId: nextPhase.id
            }
        });
    }
}
