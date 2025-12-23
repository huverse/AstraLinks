/**
 * Society World Engine
 * 
 * 全自治、多 Agent 社会演化仿真
 * 
 * 特点：
 * - 世界在无用户干预下持续运行
 * - Agent 行为不以"对话"为中心
 * - 时间由 Tick 驱动
 * - 社会状态可观察、可回放、可分析
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
    WorldState
} from '../interfaces';
import {
    SocietyWorldState,
    SocialRole,
    createInitialSocietyWorldState
} from './SocietyWorldState';
import { SocietyRuleEngine, SocietyScheduler, SocietyArbiter } from './SocietyComponents';
import { ILLMProvider } from '../../core/interfaces/ILLMProvider';

// ============================================
// SocietyNarrator (可选)
// ============================================

/**
 * 社会叙述者
 * 
 * 职责：
 * - 只能生成"观察性总结"
 * - 不能引导 Agent 行为
 * - 每 N tick 输出一次社会摘要
 */
export class SocietyNarrator implements INarrator {
    private llmProvider?: ILLMProvider;
    private summaryInterval: number;

    constructor(llmProvider?: ILLMProvider, summaryInterval: number = 10) {
        this.llmProvider = llmProvider;
        this.summaryInterval = summaryInterval;
    }

    /**
     * 生成社会摘要
     */
    async generateSummary(worldState: WorldState, recentEvents: WorldEvent[]): Promise<string> {
        const state = worldState as SocietyWorldState;
        const stats = state.statistics;
        const activeAgents = Array.from(state.agents.values()).filter(a => a.isActive);

        let summary = `=== Society Summary (Tick ${state.timeTick}) ===\n`;
        summary += `Active Agents: ${activeAgents.length}/${state.agents.size}\n`;
        summary += `Avg Resources: ${stats.averageResources.toFixed(1)}\n`;
        summary += `Avg Mood: ${stats.averageMood.toFixed(2)}\n`;
        summary += `Gini Coefficient: ${stats.giniCoefficient.toFixed(3)}\n`;
        summary += `Stability Index: ${state.stabilityIndex.toFixed(2)}\n`;
        summary += `Interactions: ${stats.totalInteractions} (Help: ${stats.helpCount}, Conflict: ${stats.conflictCount})\n`;

        if (stats.exitedAgentCount > 0) {
            summary += `Exited Agents: ${stats.exitedAgentCount}\n`;
        }

        return summary;
    }

    async narrateEvent(event: WorldEvent): Promise<string> {
        const content = event.content as Record<string, unknown>;

        switch (event.eventType) {
            case 'TICK_START':
                return `[Tick ${content.tick}] Starting...`;
            case 'TICK_END':
                return `[Tick ${content.tick}] Completed. Active agents: ${content.activeAgentCount}`;
            case 'ACTION_ACCEPTED':
                return `[${event.source}] ${content.actionType} - Success`;
            case 'ACTION_REJECTED':
                return `[${event.source}] ${content.actionType} - Rejected: ${content.reason}`;
            case 'AGENT_EXIT':
                return `[${content.agentId}] Left the society (resources depleted)`;
            default:
                return `[${event.eventType}] ${JSON.stringify(content)}`;
        }
    }

    async generateOpening(worldState: WorldState): Promise<string> {
        const state = worldState as SocietyWorldState;
        const agents = Array.from(state.agents.values());

        return `Society Simulation Started
Agents: ${agents.map(a => `${a.name}(${a.role})`).join(', ')}
Initial Resources: ${agents[0]?.resources || 0}
`;
    }

    async generateClosing(worldState: WorldState): Promise<string> {
        const state = worldState as SocietyWorldState;

        return `Society Simulation Ended
Total Ticks: ${state.timeTick}
Survivors: ${Array.from(state.agents.values()).filter(a => a.isActive).length}
Final Stability: ${state.stabilityIndex.toFixed(2)}
`;
    }

    async generateQuestion(): Promise<string> {
        return ''; // 社会仿真不生成问题
    }

    shouldGenerateSummary(tick: number): boolean {
        return tick > 0 && tick % this.summaryInterval === 0;
    }
}

// ============================================
// SocietyWorldEngine
// ============================================

/**
 * 社会世界引擎
 */
export class SocietyWorldEngine implements IWorldEngine {
    readonly name = 'SocietyWorldEngine';

    private state!: SocietyWorldState;
    private ruleEngine!: SocietyRuleEngine;
    private scheduler!: SocietyScheduler;
    private arbiter!: SocietyArbiter;
    private narrator?: SocietyNarrator;
    private events: WorldEvent[] = [];

    /**
     * 初始化社会世界
     */
    async initialize(config: WorldConfig): Promise<void> {
        const maxTicks = (config.extensions?.maxTicks as number) || -1;

        this.ruleEngine = new SocietyRuleEngine();
        this.scheduler = new SocietyScheduler(maxTicks);
        this.arbiter = new SocietyArbiter();
        this.events = [];
    }

    /**
     * 设置 Narrator
     */
    setNarrator(llmProvider?: ILLMProvider, summaryInterval: number = 10): void {
        this.narrator = new SocietyNarrator(llmProvider, summaryInterval);
    }

    /**
     * 初始化 Agents
     */
    initializeAgents(agentConfigs: { id: string; name: string; role: SocialRole }[]): void {
        this.state = createInitialSocietyWorldState('society-world', agentConfigs);

        // 记录开始事件
        this.events.push({
            eventId: uuidv4(),
            eventType: 'SOCIETY_START',
            timestamp: Date.now(),
            source: 'system',
            content: {
                agentCount: agentConfigs.length,
                agents: agentConfigs.map(a => ({ id: a.id, name: a.name, role: a.role }))
            }
        });
    }

    /**
     * 核心 step 循环 (每个 Tick)
     * 
     * 1. TICK_START 事件
     * 2. Arbiter 筛选（每个 Agent 一个 Action）
     * 3. RuleEngine 验证和应用（并行）
     * 4. 约束检查（Agent 退出）
     * 5. Tick 推进
     * 6. TICK_END 事件
     * 7. 可选：社会摘要
     */
    async step(agentActions: Action[]): Promise<ActionResult[]> {
        const results: ActionResult[] = [];

        // 1. TICK_START
        this.events.push({
            eventId: uuidv4(),
            eventType: 'TICK_START',
            timestamp: Date.now(),
            source: 'system',
            content: { tick: this.state.timeTick + 1 }
        });

        // 2. Arbiter 筛选
        const resolvedActions = this.arbiter.resolveConflicts(agentActions, this.state);

        // 3. RuleEngine 验证和应用（并行处理）
        for (const action of resolvedActions) {
            const validation = this.ruleEngine.validateAction(action, this.state);

            if (!validation.isValid) {
                const rejectedEvent: WorldEvent = {
                    eventId: uuidv4(),
                    eventType: 'ACTION_REJECTED',
                    timestamp: Date.now(),
                    source: action.agentId,
                    content: {
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

            const result = this.ruleEngine.applyAction(action, this.state);
            results.push(result);

            for (const event of result.events) {
                this.events.push(event);
            }
        }

        // 4. 约束检查
        const constraintChanges = this.ruleEngine.enforceConstraints(this.state);

        // 记录 Agent 退出事件
        for (const change of constraintChanges) {
            if (change.fieldPath === 'isActive' && change.newValue === false) {
                this.events.push({
                    eventId: uuidv4(),
                    eventType: 'AGENT_EXIT',
                    timestamp: Date.now(),
                    source: 'system',
                    content: {
                        agentId: change.entityId,
                        reason: 'resources_depleted'
                    }
                });
            }
        }

        // 5. Tick 推进
        this.scheduler.advanceTick(this.state);

        // 6. TICK_END
        const activeAgentCount = Array.from(this.state.agents.values()).filter(a => a.isActive).length;
        this.events.push({
            eventId: uuidv4(),
            eventType: 'TICK_END',
            timestamp: Date.now(),
            source: 'system',
            content: {
                tick: this.state.timeTick,
                activeAgentCount,
                stabilityIndex: this.state.stabilityIndex
            }
        });

        // 7. STATE_DELTA 摘要
        this.events.push({
            eventId: uuidv4(),
            eventType: 'STATE_DELTA',
            timestamp: Date.now(),
            source: 'system',
            content: {
                tick: this.state.timeTick,
                averageResources: this.state.statistics.averageResources,
                averageMood: this.state.statistics.averageMood,
                giniCoefficient: this.state.statistics.giniCoefficient,
                stabilityIndex: this.state.stabilityIndex
            }
        });

        // 8. 终止检查
        if (this.scheduler.shouldTerminate(this.state)) {
            this.state.isTerminated = true;
            this.state.terminationReason = activeAgentCount === 0
                ? '所有 Agent 已退出社会'
                : '达到最大 Tick 数';

            this.events.push({
                eventId: uuidv4(),
                eventType: 'SOCIETY_END',
                timestamp: Date.now(),
                source: 'system',
                content: {
                    totalTicks: this.state.timeTick,
                    finalActiveCount: activeAgentCount,
                    statistics: this.state.statistics,
                    reason: this.state.terminationReason
                }
            });
        }

        return results;
    }

    getWorldState(): SocietyWorldState {
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
    }

    // ============================================
    // 便捷方法
    // ============================================

    /**
     * 获取当前 Tick
     */
    getCurrentTick(): number {
        return this.state.timeTick;
    }

    /**
     * 获取 Agent 状态
     */
    getAgentState(agentId: string) {
        return this.state.agents.get(agentId);
    }

    /**
     * 获取活跃 Agents
     */
    getActiveAgents() {
        return Array.from(this.state.agents.values()).filter(a => a.isActive);
    }

    /**
     * 获取统计信息
     */
    getStatistics() {
        return this.state.statistics;
    }

    /**
     * 获取稳定性指数
     */
    getStabilityIndex(): number {
        return this.state.stabilityIndex;
    }

    /**
     * 生成社会摘要（如果 Narrator 可用）
     */
    async generateSummary(): Promise<string | null> {
        if (this.narrator && this.narrator.shouldGenerateSummary(this.state.timeTick)) {
            return await this.narrator.generateSummary(this.state, this.events.slice(-20));
        }
        return null;
    }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建社会世界引擎
 */
export async function createSocietyWorldEngine(
    agentConfigs: { id: string; name: string; role: SocialRole }[],
    maxTicks: number = -1,
    llmProvider?: ILLMProvider
): Promise<SocietyWorldEngine> {
    const engine = new SocietyWorldEngine();

    await engine.initialize({
        worldId: 'society-world',
        worldType: 'social_sim',
        phases: [],
        rules: [],
        terminationConditions: [],
        extensions: { maxTicks }
    });

    if (llmProvider) {
        engine.setNarrator(llmProvider);
    }

    engine.initializeAgents(agentConfigs);

    return engine;
}

/**
 * 创建默认 5 Agent 社会
 */
export async function createDefaultSociety(maxTicks: number = 100): Promise<SocietyWorldEngine> {
    const agents: { id: string; name: string; role: SocialRole }[] = [
        { id: 'agent-1', name: 'Alice', role: 'worker' },
        { id: 'agent-2', name: 'Bob', role: 'merchant' },
        { id: 'agent-3', name: 'Carol', role: 'leader' },
        { id: 'agent-4', name: 'David', role: 'helper' },
        { id: 'agent-5', name: 'Eve', role: 'neutral' }
    ];

    return createSocietyWorldEngine(agents, maxTicks);
}
