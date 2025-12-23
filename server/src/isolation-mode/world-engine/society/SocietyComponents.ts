/**
 * Society Sub-Components
 * 
 * 社会仿真世界的子组件：
 * - SocietyRuleEngine: 社会规则（资源/mood/relationship）
 * - SocietyScheduler: Tick 驱动调度
 * - SocietyArbiter: 同一 tick 并行裁决
 * 
 * 特点：
 * - 无用户干预
 * - 不以对话为中心
 * - Tick 驱动
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
import {
    SocietyWorldState,
    AgentSocialState,
    WorkParams,
    ConsumeParams,
    TalkParams,
    HelpParams,
    ConflictParams,
    WORK_REWARD,
    CONSUME_MOOD_BOOST,
    CONSUME_FAIL_MOOD_PENALTY,
    TALK_FRIENDLY_RELATIONSHIP_BOOST,
    TALK_HOSTILE_RELATIONSHIP_PENALTY,
    HELP_RELATIONSHIP_BOOST,
    CONFLICT_RELATIONSHIP_PENALTY,
    CONFLICT_RESOURCE_LOSS,
    ZERO_RESOURCE_EXIT_THRESHOLD,
    calculateGiniCoefficient,
    // 社会压力常量 (A-6)
    WORK_DIMINISHING_START_TICK,
    WORK_DIMINISHING_RATE,
    WORK_MIN_EFFICIENCY,
    CONSUME_INDULGENCE_THRESHOLD,
    CONSUME_INDULGENCE_COST_MULTIPLIER,
    SHOCK_INTERVAL,
    SHOCK_AGENT_COUNT,
    SHOCK_RESOURCE_LOSS,
    SHOCK_MOOD_LOSS,
    CONFLICT_ESCALATION_THRESHOLD,
    CONFLICT_ESCALATION_PROBABILITY,
    LOW_MOOD_THRESHOLD,
    LOW_MOOD_EXIT_THRESHOLD
} from './SocietyWorldState';

// ============================================
// SocietyRuleEngine
// ============================================

/**
 * 社会规则引擎
 * 
 * 规则：
 * - 资源不能为负
 * - mood 影响 Action 成功概率
 * - relationship 影响 talk/help/conflict 结果
 * - Agent 资源为 0 且多 tick 未改善 → 退出社会
 */
export class SocietyRuleEngine implements IRuleEngine {
    /**
     * 验证 Action 是否合法
     */
    validateAction(action: Action, worldState: SocietyWorldState): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 检查 Agent 存在且活跃
        const agent = worldState.agents.get(action.agentId);
        if (!agent) {
            errors.push(`Agent ${action.agentId} 不存在`);
            return { isValid: false, errors, warnings };
        }

        if (!agent.isActive) {
            errors.push(`Agent ${action.agentId} 已退出社会`);
            return { isValid: false, errors, warnings };
        }

        switch (action.actionType) {
            case 'work':
                return this.validateWork(action, agent);
            case 'consume':
                return this.validateConsume(action, agent);
            case 'talk':
                return this.validateTalk(action, agent, worldState);
            case 'help':
                return this.validateHelp(action, agent, worldState);
            case 'conflict':
                return this.validateConflict(action, agent, worldState);
            case 'idle':
                return { isValid: true, errors: [], warnings: [] };
            default:
                errors.push(`未知的 Action 类型: ${action.actionType}`);
                return { isValid: false, errors, warnings };
        }
    }

    private validateWork(action: Action, agent: AgentSocialState): ValidationResult {
        const params = action.params as unknown as WorkParams;
        const errors: string[] = [];

        if (params.intensity < 1 || params.intensity > 3) {
            errors.push('工作强度必须在 1-3 之间');
            return { isValid: false, errors, warnings: [] };
        }

        return { isValid: true, errors: [], warnings: [] };
    }

    private validateConsume(action: Action, agent: AgentSocialState): ValidationResult {
        const params = action.params as unknown as ConsumeParams;
        const warnings: string[] = [];

        if (params.amount > agent.resources) {
            warnings.push('资源不足，将消耗全部可用资源');
        }

        return { isValid: true, errors: [], warnings };
    }

    private validateTalk(action: Action, agent: AgentSocialState, state: SocietyWorldState): ValidationResult {
        const params = action.params as unknown as TalkParams;
        const errors: string[] = [];

        const target = state.agents.get(params.targetAgentId);
        if (!target) {
            errors.push(`目标 ${params.targetAgentId} 不存在`);
            return { isValid: false, errors, warnings: [] };
        }

        if (!target.isActive) {
            errors.push(`目标 ${params.targetAgentId} 已退出社会`);
            return { isValid: false, errors, warnings: [] };
        }

        return { isValid: true, errors: [], warnings: [] };
    }

    private validateHelp(action: Action, agent: AgentSocialState, state: SocietyWorldState): ValidationResult {
        const params = action.params as unknown as HelpParams;
        const errors: string[] = [];

        if (params.amount <= 0) {
            errors.push('帮助资源量必须大于 0');
            return { isValid: false, errors, warnings: [] };
        }

        if (params.amount > agent.resources) {
            errors.push(`资源不足：需要 ${params.amount}，当前 ${agent.resources}`);
            return { isValid: false, errors, warnings: [] };
        }

        const target = state.agents.get(params.targetAgentId);
        if (!target || !target.isActive) {
            errors.push(`目标 ${params.targetAgentId} 不存在或已退出`);
            return { isValid: false, errors, warnings: [] };
        }

        return { isValid: true, errors: [], warnings: [] };
    }

    private validateConflict(action: Action, agent: AgentSocialState, state: SocietyWorldState): ValidationResult {
        const params = action.params as unknown as ConflictParams;
        const errors: string[] = [];

        if (params.intensity < 1 || params.intensity > 3) {
            errors.push('冲突强度必须在 1-3 之间');
            return { isValid: false, errors, warnings: [] };
        }

        const target = state.agents.get(params.targetAgentId);
        if (!target || !target.isActive) {
            errors.push(`目标 ${params.targetAgentId} 不存在或已退出`);
            return { isValid: false, errors, warnings: [] };
        }

        return { isValid: true, errors: [], warnings: [] };
    }

    /**
     * 应用 Action
     */
    applyAction(action: Action, worldState: SocietyWorldState): ActionResult {
        const agent = worldState.agents.get(action.agentId)!;
        agent.lastActionTick = worldState.timeTick;

        switch (action.actionType) {
            case 'work':
                return this.applyWork(action, agent, worldState);
            case 'consume':
                return this.applyConsume(action, agent, worldState);
            case 'talk':
                return this.applyTalk(action, agent, worldState);
            case 'help':
                return this.applyHelp(action, agent, worldState);
            case 'conflict':
                return this.applyConflict(action, agent, worldState);
            case 'idle':
                return { action, success: true, effects: [], events: [] };
            default:
                return { action, success: false, failureReason: '未知 Action', effects: [], events: [] };
        }
    }

    private applyWork(action: Action, agent: AgentSocialState, state: SocietyWorldState): ActionResult {
        const params = action.params as unknown as WorkParams;
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];

        // 角色加成
        const roleBonus = agent.role === 'worker' ? 1.5 : 1.0;

        // [A-6] 生存压力: 工作收益随 timeTick 递减
        let efficiencyPenalty = 1.0;
        if (state.timeTick > WORK_DIMINISHING_START_TICK) {
            const ticksOver = state.timeTick - WORK_DIMINISHING_START_TICK;
            efficiencyPenalty = Math.max(WORK_MIN_EFFICIENCY, 1.0 - ticksOver * WORK_DIMINISHING_RATE);
        }

        // 情绪影响成功概率
        const successRate = 0.7 + agent.mood * 0.3;
        const success = Math.random() < successRate;

        if (success) {
            const baseReward = WORK_REWARD[params.intensity - 1];
            const reward = Math.floor(baseReward * roleBonus * efficiencyPenalty);
            const oldResources = agent.resources;
            agent.resources += reward;

            effects.push({
                changeType: 'update',
                entityType: 'agent',
                entityId: agent.agentId,
                fieldPath: 'resources',
                oldValue: oldResources,
                newValue: agent.resources
            });

            events.push({
                eventId: uuidv4(),
                eventType: 'ACTION_ACCEPTED',
                timestamp: Date.now(),
                source: agent.agentId,
                content: {
                    actionType: 'work',
                    intensity: params.intensity,
                    reward,
                    efficiency: efficiencyPenalty,
                    newResources: agent.resources
                }
            });
        } else {
            events.push({
                eventId: uuidv4(),
                eventType: 'ACTION_REJECTED',
                timestamp: Date.now(),
                source: agent.agentId,
                content: {
                    actionType: 'work',
                    reason: '工作失败（情绪低落）'
                }
            });
        }

        return { action, success, effects, events };
    }

    private applyConsume(action: Action, agent: AgentSocialState, state: SocietyWorldState): ActionResult {
        const params = action.params as unknown as ConsumeParams;
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];

        // [A-6] 生存压力: 情绪过高时消耗成本增加
        let actualCost = params.amount;
        if (agent.mood > CONSUME_INDULGENCE_THRESHOLD) {
            actualCost = Math.floor(params.amount * CONSUME_INDULGENCE_COST_MULTIPLIER);
        }

        const actualConsume = Math.min(actualCost, agent.resources);
        const oldResources = agent.resources;
        const oldMood = agent.mood;

        agent.resources -= actualConsume;

        if (actualConsume >= actualCost) {
            // 消耗成功，情绪提升
            agent.mood = Math.min(1.0, agent.mood + CONSUME_MOOD_BOOST);
        } else {
            // 资源不足，情绪下降
            agent.mood = Math.max(-1.0, agent.mood + CONSUME_FAIL_MOOD_PENALTY);
        }

        effects.push({
            changeType: 'update',
            entityType: 'agent',
            entityId: agent.agentId,
            fieldPath: 'resources',
            oldValue: oldResources,
            newValue: agent.resources
        });

        effects.push({
            changeType: 'update',
            entityType: 'agent',
            entityId: agent.agentId,
            fieldPath: 'mood',
            oldValue: oldMood,
            newValue: agent.mood
        });

        events.push({
            eventId: uuidv4(),
            eventType: 'ACTION_ACCEPTED',
            timestamp: Date.now(),
            source: agent.agentId,
            content: {
                actionType: 'consume',
                requested: params.amount,
                actualCost,
                actual: actualConsume,
                indulgencePenalty: actualCost > params.amount,
                newResources: agent.resources,
                newMood: agent.mood
            }
        });

        return { action, success: true, effects, events };
    }

    private applyTalk(action: Action, agent: AgentSocialState, state: SocietyWorldState): ActionResult {
        const params = action.params as unknown as TalkParams;
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];

        const target = state.agents.get(params.targetAgentId)!;
        const roleBonus = agent.role === 'leader' ? 1.5 : 1.0;

        // 获取当前关系
        const oldRelationship = agent.relationships.get(params.targetAgentId) || 0;
        let relationshipDelta = 0;

        // [A-6] 冲突升级机制: hostile talk + 低关系 = 可能升级为冲突
        let escalatedToConflict = false;
        if (params.talkType === 'hostile' && oldRelationship < CONFLICT_ESCALATION_THRESHOLD) {
            if (Math.random() < CONFLICT_ESCALATION_PROBABILITY) {
                escalatedToConflict = true;

                // 直接造成冲突后果
                const loss = CONFLICT_RESOURCE_LOSS[0];  // 最低强度
                const agentLoss = Math.min(agent.resources, loss);
                const targetLoss = Math.min(target.resources, loss);
                agent.resources -= agentLoss;
                target.resources -= targetLoss;

                // 关系更大幅度下降
                relationshipDelta = CONFLICT_RELATIONSHIP_PENALTY;
                agent.mood = Math.max(-1.0, agent.mood - 0.2);
                target.mood = Math.max(-1.0, target.mood - 0.25);

                state.statistics.conflictCount++;

                events.push({
                    eventId: uuidv4(),
                    eventType: 'CONFLICT_ESCALATION',
                    timestamp: Date.now(),
                    source: agent.agentId,
                    content: {
                        trigger: 'hostile_talk',
                        targetAgentId: params.targetAgentId,
                        oldRelationship,
                        agentLoss,
                        targetLoss,
                        reason: `关系已恶化 (${oldRelationship.toFixed(2)})，对话升级为冲突`
                    }
                });
            }
        }

        if (!escalatedToConflict) {
            switch (params.talkType) {
                case 'friendly':
                    relationshipDelta = TALK_FRIENDLY_RELATIONSHIP_BOOST * roleBonus;
                    agent.mood = Math.min(1.0, agent.mood + 0.05);
                    target.mood = Math.min(1.0, target.mood + 0.05);
                    break;
                case 'hostile':
                    relationshipDelta = TALK_HOSTILE_RELATIONSHIP_PENALTY;
                    agent.mood = Math.max(-1.0, agent.mood - 0.05);
                    target.mood = Math.max(-1.0, target.mood - 0.1);
                    break;
                case 'neutral':
                default:
                    relationshipDelta = 0.02;
                    break;
            }
        }

        // 更新双方关系（对称）
        const newRelationship = Math.max(-1.0, Math.min(1.0, oldRelationship + relationshipDelta));
        agent.relationships.set(params.targetAgentId, newRelationship);
        target.relationships.set(agent.agentId, newRelationship);

        state.statistics.totalInteractions++;

        events.push({
            eventId: uuidv4(),
            eventType: 'ACTION_ACCEPTED',
            timestamp: Date.now(),
            source: agent.agentId,
            content: {
                actionType: 'talk',
                target: params.targetAgentId,
                talkType: params.talkType,
                oldRelationship,
                newRelationship,
                escalatedToConflict
            }
        });

        return { action, success: true, effects, events };
    }

    private applyHelp(action: Action, agent: AgentSocialState, state: SocietyWorldState): ActionResult {
        const params = action.params as unknown as HelpParams;
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];

        const target = state.agents.get(params.targetAgentId)!;
        const roleBonus = agent.role === 'helper' ? 1.2 : 1.0;

        // 转移资源
        const oldAgentResources = agent.resources;
        const oldTargetResources = target.resources;
        agent.resources -= params.amount;
        target.resources += params.amount;

        // 更新关系
        const oldRelationship = agent.relationships.get(params.targetAgentId) || 0;
        const relationshipBoost = HELP_RELATIONSHIP_BOOST * roleBonus;
        const newRelationship = Math.min(1.0, oldRelationship + relationshipBoost);
        agent.relationships.set(params.targetAgentId, newRelationship);
        target.relationships.set(agent.agentId, newRelationship);

        // 更新情绪
        agent.mood = Math.min(1.0, agent.mood + 0.1);
        target.mood = Math.min(1.0, target.mood + 0.15);

        state.statistics.helpCount++;
        state.statistics.totalInteractions++;

        effects.push({
            changeType: 'transfer',
            entityType: 'agent',
            entityId: agent.agentId,
            fieldPath: 'resources',
            oldValue: oldAgentResources,
            newValue: agent.resources
        });

        events.push({
            eventId: uuidv4(),
            eventType: 'ACTION_ACCEPTED',
            timestamp: Date.now(),
            source: agent.agentId,
            content: {
                actionType: 'help',
                target: params.targetAgentId,
                amount: params.amount,
                relationshipChange: relationshipBoost
            }
        });

        return { action, success: true, effects, events };
    }

    private applyConflict(action: Action, agent: AgentSocialState, state: SocietyWorldState): ActionResult {
        const params = action.params as unknown as ConflictParams;
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];

        const target = state.agents.get(params.targetAgentId)!;

        // 双方都有资源损失
        const loss = CONFLICT_RESOURCE_LOSS[params.intensity - 1];
        const agentLoss = Math.min(agent.resources, loss);
        const targetLoss = Math.min(target.resources, loss);

        agent.resources -= agentLoss;
        target.resources -= targetLoss;

        // 关系大幅下降
        const oldRelationship = agent.relationships.get(params.targetAgentId) || 0;
        const relationshipPenalty = CONFLICT_RELATIONSHIP_PENALTY * params.intensity;
        const newRelationship = Math.max(-1.0, oldRelationship + relationshipPenalty);
        agent.relationships.set(params.targetAgentId, newRelationship);
        target.relationships.set(agent.agentId, newRelationship);

        // 情绪下降
        agent.mood = Math.max(-1.0, agent.mood - 0.15);
        target.mood = Math.max(-1.0, target.mood - 0.2);

        state.statistics.conflictCount++;
        state.statistics.totalInteractions++;

        events.push({
            eventId: uuidv4(),
            eventType: 'ACTION_ACCEPTED',
            timestamp: Date.now(),
            source: agent.agentId,
            content: {
                actionType: 'conflict',
                target: params.targetAgentId,
                intensity: params.intensity,
                agentLoss,
                targetLoss,
                newRelationship
            }
        });

        return { action, success: true, effects, events };
    }

    /**
     * 强制执行约束
     */
    enforceConstraints(worldState: SocietyWorldState): WorldStateChange[] {
        const changes: WorldStateChange[] = [];
        const shockEvents: any[] = [];

        // [A-6] 随机冲击事件
        if (worldState.timeTick > 0 && worldState.timeTick % SHOCK_INTERVAL === 0) {
            const activeAgents = Array.from(worldState.agents.values()).filter(a => a.isActive);
            if (activeAgents.length > 0) {
                const shockCount = Math.min(SHOCK_AGENT_COUNT, activeAgents.length);
                const shuffled = activeAgents.sort(() => Math.random() - 0.5);
                const targets = shuffled.slice(0, shockCount);

                for (const target of targets) {
                    const resourceLoss = SHOCK_RESOURCE_LOSS[0] + Math.random() * (SHOCK_RESOURCE_LOSS[1] - SHOCK_RESOURCE_LOSS[0]);
                    const moodLoss = SHOCK_MOOD_LOSS[0] + Math.random() * (SHOCK_MOOD_LOSS[1] - SHOCK_MOOD_LOSS[0]);

                    const oldResources = target.resources;
                    const oldMood = target.mood;

                    target.resources = Math.max(0, target.resources - Math.floor(resourceLoss));
                    target.mood = Math.max(-1.0, target.mood - moodLoss);

                    shockEvents.push({
                        agentId: target.agentId,
                        agentName: target.name,
                        resourceLoss: Math.floor(resourceLoss),
                        moodLoss: parseFloat(moodLoss.toFixed(2)),
                        oldResources,
                        newResources: target.resources,
                        oldMood,
                        newMood: target.mood
                    });
                }
            }
        }

        // 保存冲击事件到 globalVars 以便 WorldEngine 获取
        if (shockEvents.length > 0) {
            worldState.globalVars.set('pendingShockEvents', shockEvents);
        }

        for (const [agentId, agent] of worldState.agents) {
            if (!agent.isActive) continue;

            let exitReason: string | null = null;

            // 检查资源为0
            if (agent.resources <= 0) {
                agent.zeroResourceTicks++;

                if (agent.zeroResourceTicks >= ZERO_RESOURCE_EXIT_THRESHOLD) {
                    exitReason = `资源耗尽 (连续 ${agent.zeroResourceTicks} tick)`;
                }
            } else {
                agent.zeroResourceTicks = 0;
            }

            // [A-6] 检查低情绪
            if (agent.mood < LOW_MOOD_THRESHOLD) {
                agent.lowMoodTicks++;

                if (agent.lowMoodTicks >= LOW_MOOD_EXIT_THRESHOLD) {
                    exitReason = `情绪崩溃 (mood=${agent.mood.toFixed(2)} 持续 ${agent.lowMoodTicks} tick)`;
                }
            } else {
                agent.lowMoodTicks = 0;
            }

            // 执行退出
            if (exitReason) {
                agent.isActive = false;
                worldState.statistics.exitedAgentCount++;

                changes.push({
                    changeType: 'update',
                    entityType: 'agent',
                    entityId: agentId,
                    fieldPath: 'isActive',
                    oldValue: true,
                    newValue: false
                });

                // 保存退出原因
                worldState.globalVars.set(`exitReason_${agentId}`, exitReason);
            }

            // 确保 mood 在范围内
            agent.mood = Math.max(-1.0, Math.min(1.0, agent.mood));
        }

        // 更新统计
        this.updateStatistics(worldState);

        return changes;
    }

    private updateStatistics(state: SocietyWorldState): void {
        const activeAgents = Array.from(state.agents.values()).filter(a => a.isActive);

        if (activeAgents.length === 0) {
            state.stabilityIndex = 0;
            return;
        }

        const resources = activeAgents.map(a => a.resources);
        const moods = activeAgents.map(a => a.mood);

        state.statistics.averageResources = resources.reduce((a, b) => a + b, 0) / activeAgents.length;
        state.statistics.averageMood = moods.reduce((a, b) => a + b, 0) / activeAgents.length;
        state.statistics.giniCoefficient = calculateGiniCoefficient(resources);

        // 稳定性指数 = 平均情绪 * (1 - 基尼系数)
        state.stabilityIndex = Math.max(0, (state.statistics.averageMood + 1) / 2 * (1 - state.statistics.giniCoefficient));
    }

    registerRule(rule: Rule): void { }
    getActiveRules(): Rule[] { return []; }
}

// ============================================
// SocietyScheduler
// ============================================

/**
 * 社会调度器
 * 
 * Tick 驱动，无"谁先说话"
 */
export class SocietyScheduler implements IScheduler {
    private time: WorldTime;
    private maxTicks: number;

    constructor(maxTicks: number = -1) {
        this.time = { tick: 0, round: 0, timeScale: 1 };
        this.maxTicks = maxTicks;
    }

    nextTick(): WorldTime {
        this.time.tick++;
        return { ...this.time };
    }

    currentTime(): WorldTime {
        return { ...this.time };
    }

    shouldAdvancePhase(): boolean {
        return false; // 社会仿真只有一个阶段
    }

    getNextPhase(): PhaseConfig | null {
        return null;
    }

    shouldTerminate(worldState: SocietyWorldState): boolean {
        // 终止条件：所有 Agent 退出 或 达到最大 tick
        const activeCount = Array.from(worldState.agents.values()).filter(a => a.isActive).length;

        if (activeCount === 0) {
            return true;
        }

        if (this.maxTicks > 0 && worldState.timeTick >= this.maxTicks) {
            return true;
        }

        return false;
    }

    setTimeScale(scale: number): void {
        this.time.timeScale = scale;
    }

    /**
     * 推进 tick
     */
    advanceTick(worldState: SocietyWorldState): void {
        worldState.timeTick++;
        this.time.tick = worldState.timeTick;

        // 环境资源再生
        worldState.globalResources.environmentPool += worldState.globalResources.regenerationRate;
    }
}

// ============================================
// SocietyArbiter
// ============================================

/**
 * 社会仲裁器
 * 
 * 同一 tick 内并行裁决，不存在"谁先说话"
 */
export class SocietyArbiter implements IArbiter {
    /**
     * 解决冲突
     * 
     * 社会仿真允许同一 tick 所有 Agent 同时行动
     * 只需确保同一 Agent 不提交多个 Action
     */
    resolveConflicts(actions: Action[], worldState: SocietyWorldState): Action[] {
        // 每个 Agent 只保留一个 Action (非 idle)
        const agentActions = new Map<string, Action>();

        for (const action of actions) {
            const existing = agentActions.get(action.agentId);
            if (!existing || (existing.actionType === 'idle' && action.actionType !== 'idle')) {
                agentActions.set(action.agentId, action);
            }
        }

        return Array.from(agentActions.values());
    }

    prioritizeActions(actions: Action[]): Action[] {
        // 社会仿真不需要优先级排序，所有 Action 并行处理
        return actions;
    }

    checkConflict(action1: Action, action2: Action): boolean {
        // 同一 Agent 的 Action 冲突
        return action1.agentId === action2.agentId;
    }
}
