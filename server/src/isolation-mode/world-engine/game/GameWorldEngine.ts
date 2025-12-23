/**
 * Game World Engine
 * 
 * 最小可运行的回合制游戏引擎
 * 
 * 特点：
 * - 不复用任何辩论逻辑
 * - 不使用 Moderator / Narrator
 * - 纯规则驱动
 * - Agent 只产生 Action，不产生自然语言
 */

import { v4 as uuidv4 } from 'uuid';
import {
    IWorldEngine,
    WorldConfig,
    Action,
    ActionResult,
    WorldEvent,
    Entity
} from '../interfaces';
import {
    GameWorldState,
    createInitialGameWorldState,
    DEFAULT_MAX_TURNS
} from './GameWorldState';
import { GameRuleEngine, GameScheduler, GameArbiter } from './GameComponents';

// ============================================
// GameWorldEngine
// ============================================

/**
 * 游戏世界引擎
 */
export class GameWorldEngine implements IWorldEngine {
    readonly name = 'GameWorldEngine';

    private state!: GameWorldState;
    private ruleEngine!: GameRuleEngine;
    private scheduler!: GameScheduler;
    private arbiter!: GameArbiter;
    private events: WorldEvent[] = [];

    /**
     * 初始化游戏世界
     */
    async initialize(config: WorldConfig): Promise<void> {
        const maxTurns = (config.extensions?.maxTurns as number) || DEFAULT_MAX_TURNS;

        this.ruleEngine = new GameRuleEngine();
        this.scheduler = new GameScheduler(maxTurns);
        this.arbiter = new GameArbiter();
        this.events = [];
    }

    /**
     * 初始化 Agents
     */
    initializeAgents(agentIds: string[]): void {
        this.state = createInitialGameWorldState('game-world', agentIds);

        // 记录游戏开始事件
        this.events.push({
            eventId: uuidv4(),
            eventType: 'game_start',
            timestamp: Date.now(),
            source: 'system',
            content: {
                agentIds,
                initialHp: Array.from(this.state.agents.values()).map(a => ({
                    agentId: a.agentId,
                    hp: a.hp
                }))
            }
        });

        // 记录第一个回合开始
        this.events.push({
            eventId: uuidv4(),
            eventType: 'turn_start',
            timestamp: Date.now(),
            source: 'system',
            content: {
                turn: 1,
                agentId: this.state.game.currentTurnAgentId
            }
        });
    }

    /**
     * 核心 step 循环
     * 
     * Action → Event 执行流程：
     * 
     * 1. Arbiter 筛选：只保留当前回合 Agent 的 Action
     * 2. RuleEngine 验证：检查规则合法性
     * 3. RuleEngine 应用：应用卡牌效果
     * 4. 约束检查：胜负判定
     * 5. 回合推进
     * 6. 终止检查
     */
    async step(agentActions: Action[]): Promise<ActionResult[]> {
        const results: ActionResult[] = [];

        // ========================================
        // 1. Arbiter 筛选
        // ========================================
        const resolvedActions = this.arbiter.resolveConflicts(agentActions, this.state);

        // 拒绝非当前回合的 Action
        for (const action of agentActions) {
            if (!resolvedActions.includes(action)) {
                const rejectedEvent: WorldEvent = {
                    eventId: uuidv4(),
                    eventType: 'action_rejected',
                    timestamp: Date.now(),
                    source: action.agentId,
                    content: {
                        actionId: action.actionId,
                        reason: `不是 ${action.agentId} 的回合`
                    }
                };
                this.events.push(rejectedEvent);

                results.push({
                    action,
                    success: false,
                    failureReason: `不是 ${action.agentId} 的回合`,
                    effects: [],
                    events: [rejectedEvent]
                });
            }
        }

        // ========================================
        // 2 & 3. RuleEngine 验证 + 应用
        // ========================================
        for (const action of resolvedActions) {
            const validation = this.ruleEngine.validateAction(action, this.state);

            if (!validation.isValid) {
                const rejectedEvent: WorldEvent = {
                    eventId: uuidv4(),
                    eventType: 'action_rejected',
                    timestamp: Date.now(),
                    source: action.agentId,
                    content: {
                        actionId: action.actionId,
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

            // 应用 Action
            const result = this.ruleEngine.applyAction(action, this.state);
            results.push(result);

            for (const event of result.events) {
                this.events.push(event);
            }
        }

        // ========================================
        // 4. 约束检查（胜负判定）
        // ========================================
        this.ruleEngine.enforceConstraints(this.state);

        // ========================================
        // 5. 回合推进
        // ========================================
        if (!this.state.isTerminated && this.state.game.gamePhase === 'playing') {
            // 记录回合结束
            this.events.push({
                eventId: uuidv4(),
                eventType: 'turn_end',
                timestamp: Date.now(),
                source: 'system',
                content: {
                    agentId: this.state.game.currentTurnAgentId,
                    turn: this.state.game.totalTurns + 1
                }
            });

            // 推进到下一回合
            this.scheduler.advanceTurn(this.state);
            this.scheduler.nextTick();

            // 记录新回合开始
            if (this.state.game.gamePhase === 'playing') {
                this.events.push({
                    eventId: uuidv4(),
                    eventType: 'turn_start',
                    timestamp: Date.now(),
                    source: 'system',
                    content: {
                        turn: this.state.game.totalTurns + 1,
                        agentId: this.state.game.currentTurnAgentId
                    }
                });
            }
        }

        // ========================================
        // 6. 终止检查
        // ========================================
        if (this.scheduler.shouldTerminate(this.state) || this.state.game.gamePhase === 'ended') {
            this.state.isTerminated = true;
            this.state.terminationReason = this.state.game.winnerId
                ? `${this.state.game.winnerId} 获胜`
                : '游戏结束';

            this.events.push({
                eventId: uuidv4(),
                eventType: 'game_end',
                timestamp: Date.now(),
                source: 'system',
                content: {
                    winnerId: this.state.game.winnerId,
                    totalTurns: this.state.game.totalTurns,
                    finalState: Array.from(this.state.agents.values()).map(a => ({
                        agentId: a.agentId,
                        hp: a.hp,
                        isAlive: a.isAlive
                    }))
                }
            });
        }

        return results;
    }

    getWorldState(): GameWorldState {
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
     * 获取当前回合 Agent
     */
    getCurrentTurnAgent(): string {
        return this.state.game.currentTurnAgentId;
    }

    /**
     * 获取 Agent 状态
     */
    getAgentState(agentId: string) {
        return this.state.agents.get(agentId);
    }

    /**
     * 获取所有存活 Agent
     */
    getAliveAgents(): string[] {
        return Array.from(this.state.agents.values())
            .filter(a => a.isAlive)
            .map(a => a.agentId);
    }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建游戏世界引擎
 */
export async function createGameWorldEngine(
    agentIds: string[],
    maxTurns: number = DEFAULT_MAX_TURNS
): Promise<GameWorldEngine> {
    const engine = new GameWorldEngine();

    await engine.initialize({
        worldId: 'game-world',
        worldType: 'game',
        phases: [],
        rules: [],
        terminationConditions: [],
        extensions: { maxTurns }
    });

    engine.initializeAgents(agentIds);

    return engine;
}
