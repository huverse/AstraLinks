/**
 * Game Sub-Components
 * 
 * 回合制游戏的子组件：
 * - GameRuleEngine: 验证和应用游戏规则
 * - GameScheduler: 管理回合
 * - GameArbiter: 裁决 Action（只允许当前回合 Agent）
 * 
 * 特点：
 * - 不使用任何辩论/语言逻辑
 * - 不使用 Moderator / Narrator
 * - 纯规则驱动
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
    GameWorldState,
    GameAgentState,
    GameActionType,
    PlayCardParams,
    CardType,
    ATTACK_DAMAGE,
    HEAL_AMOUNT
} from './GameWorldState';

// ============================================
// GameRuleEngine
// ============================================

/**
 * 游戏规则引擎
 * 
 * 职责：
 * - 验证 Action 是否合法
 * - 应用卡牌效果
 */
export class GameRuleEngine implements IRuleEngine {
    /**
     * 验证 Action 是否合法
     */
    validateAction(action: Action, worldState: GameWorldState): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 1. 检查是否是当前回合的 Agent
        if (action.agentId !== worldState.game.currentTurnAgentId) {
            errors.push(`不是 ${action.agentId} 的回合，当前回合是 ${worldState.game.currentTurnAgentId}`);
            return { isValid: false, errors, warnings };
        }

        // 2. 检查 Agent 是否存活
        const agentState = worldState.agents.get(action.agentId);
        if (!agentState || !agentState.isAlive) {
            errors.push(`Agent ${action.agentId} 已死亡`);
            return { isValid: false, errors, warnings };
        }

        // 3. 根据 Action 类型检查
        if (action.actionType === 'play_card') {
            const params = action.params as unknown as PlayCardParams;

            // 检查卡牌是否在手牌中
            if (!agentState.hand.includes(params.card)) {
                errors.push(`手牌中没有 ${params.card}`);
                return { isValid: false, errors, warnings };
            }

            // 如果是攻击，检查目标
            if (params.card === 'attack') {
                if (!params.targetAgentId) {
                    errors.push('攻击必须指定目标');
                    return { isValid: false, errors, warnings };
                }

                const targetState = worldState.agents.get(params.targetAgentId);
                if (!targetState) {
                    errors.push(`目标 ${params.targetAgentId} 不存在`);
                    return { isValid: false, errors, warnings };
                }

                if (!targetState.isAlive) {
                    errors.push(`目标 ${params.targetAgentId} 已死亡`);
                    return { isValid: false, errors, warnings };
                }

                if (params.targetAgentId === action.agentId) {
                    errors.push('不能攻击自己');
                    return { isValid: false, errors, warnings };
                }
            }
        }

        return { isValid: true, errors, warnings };
    }

    /**
     * 应用 Action
     */
    applyAction(action: Action, worldState: GameWorldState): ActionResult {
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];

        if (action.actionType === 'pass') {
            return { action, success: true, effects, events };
        }

        if (action.actionType === 'play_card') {
            const params = action.params as unknown as PlayCardParams;
            const agentState = worldState.agents.get(action.agentId)!;

            // 从手牌移除卡牌
            const cardIndex = agentState.hand.indexOf(params.card);
            if (cardIndex >= 0) {
                agentState.hand.splice(cardIndex, 1);
            }

            // 记录出牌事件
            events.push({
                eventId: uuidv4(),
                eventType: 'card_played',
                timestamp: Date.now(),
                source: action.agentId,
                content: { card: params.card, target: params.targetAgentId },
                meta: { actionId: action.actionId }
            });

            // 应用卡牌效果
            switch (params.card) {
                case 'attack':
                    if (params.targetAgentId) {
                        const targetState = worldState.agents.get(params.targetAgentId)!;
                        const oldHp = targetState.hp;
                        targetState.hp = Math.max(0, targetState.hp - ATTACK_DAMAGE);

                        events.push({
                            eventId: uuidv4(),
                            eventType: 'damage_dealt',
                            timestamp: Date.now(),
                            source: action.agentId,
                            content: {
                                target: params.targetAgentId,
                                damage: ATTACK_DAMAGE,
                                oldHp,
                                newHp: targetState.hp
                            }
                        });

                        effects.push({
                            changeType: 'update',
                            entityType: 'agent',
                            entityId: params.targetAgentId,
                            fieldPath: 'hp',
                            oldValue: oldHp,
                            newValue: targetState.hp
                        });

                        // 检查死亡
                        if (targetState.hp <= 0) {
                            targetState.isAlive = false;
                            events.push({
                                eventId: uuidv4(),
                                eventType: 'agent_died',
                                timestamp: Date.now(),
                                source: 'system',
                                content: { agentId: params.targetAgentId }
                            });
                        }
                    }
                    break;

                case 'heal':
                    const oldHp = agentState.hp;
                    agentState.hp = Math.min(agentState.maxHp, agentState.hp + HEAL_AMOUNT);

                    events.push({
                        eventId: uuidv4(),
                        eventType: 'heal_applied',
                        timestamp: Date.now(),
                        source: action.agentId,
                        content: {
                            heal: HEAL_AMOUNT,
                            oldHp,
                            newHp: agentState.hp
                        }
                    });

                    effects.push({
                        changeType: 'update',
                        entityType: 'agent',
                        entityId: action.agentId,
                        fieldPath: 'hp',
                        oldValue: oldHp,
                        newValue: agentState.hp
                    });
                    break;

                case 'draw':
                    // 抽一张随机卡
                    const cards: CardType[] = ['attack', 'heal', 'attack'];
                    const drawnCard = cards[Math.floor(Math.random() * cards.length)];
                    agentState.hand.push(drawnCard);
                    break;
            }
        }

        return { action, success: true, effects, events };
    }

    enforceConstraints(worldState: GameWorldState): WorldStateChange[] {
        // 检查是否有胜者
        const aliveAgents = Array.from(worldState.agents.values()).filter(a => a.isAlive);

        if (aliveAgents.length === 1) {
            worldState.game.winnerId = aliveAgents[0].agentId;
            worldState.game.gamePhase = 'ended';
        } else if (aliveAgents.length === 0) {
            worldState.game.gamePhase = 'ended';
        }

        return [];
    }

    registerRule(rule: Rule): void { }
    getActiveRules(): Rule[] { return []; }
}

// ============================================
// GameScheduler
// ============================================

/**
 * 游戏调度器
 * 
 * 管理回合推进
 */
export class GameScheduler implements IScheduler {
    private time: WorldTime;
    private maxTurns: number;

    constructor(maxTurns: number) {
        this.time = { tick: 0, round: 0, timeScale: 1 };
        this.maxTurns = maxTurns;
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

    shouldAdvancePhase(worldState: GameWorldState): boolean {
        // 游戏只有一个阶段 'playing'
        return false;
    }

    getNextPhase(): PhaseConfig | null {
        return null;
    }

    shouldTerminate(worldState: GameWorldState): boolean {
        // 游戏结束条件：
        // 1. 只剩一个存活
        // 2. 达到最大回合
        if (worldState.game.gamePhase === 'ended') {
            return true;
        }
        if (worldState.game.totalTurns >= this.maxTurns) {
            return true;
        }
        return false;
    }

    setTimeScale(scale: number): void {
        this.time.timeScale = scale;
    }

    /**
     * 推进到下一个回合
     */
    advanceTurn(worldState: GameWorldState): void {
        const { turnOrder, turnIndex } = worldState.game;

        // 找到下一个存活的 Agent
        let nextIndex = (turnIndex + 1) % turnOrder.length;
        let attempts = 0;

        while (attempts < turnOrder.length) {
            const nextAgentId = turnOrder[nextIndex];
            const agentState = worldState.agents.get(nextAgentId);

            if (agentState && agentState.isAlive) {
                worldState.game.turnIndex = nextIndex;
                worldState.game.currentTurnAgentId = nextAgentId;
                worldState.game.totalTurns++;
                return;
            }

            nextIndex = (nextIndex + 1) % turnOrder.length;
            attempts++;
        }

        // 没有存活的 Agent
        worldState.game.gamePhase = 'ended';
    }
}

// ============================================
// GameArbiter
// ============================================

/**
 * 游戏仲裁器
 * 
 * 只允许当前回合 Agent 的 Action
 */
export class GameArbiter implements IArbiter {
    /**
     * 解决冲突
     * 
     * 游戏规则：只有当前回合的 Agent 可以行动
     */
    resolveConflicts(actions: Action[], worldState: GameWorldState): Action[] {
        const currentAgentId = worldState.game.currentTurnAgentId;

        // 只保留当前回合 Agent 的 Action
        const validActions = actions.filter(a => a.agentId === currentAgentId);

        // 如果有多个，取第一个（或优先级最高的）
        if (validActions.length > 1) {
            return [this.prioritizeActions(validActions)[0]];
        }

        return validActions;
    }

    prioritizeActions(actions: Action[]): Action[] {
        return [...actions].sort((a, b) => {
            // 按 priority 排序
            const priorityA = a.priority || 5;
            const priorityB = b.priority || 5;
            if (priorityB !== priorityA) return priorityB - priorityA;

            // play_card 优先于 pass
            if (a.actionType === 'play_card' && b.actionType !== 'play_card') return -1;
            if (b.actionType === 'play_card' && a.actionType !== 'play_card') return 1;

            return b.confidence - a.confidence;
        });
    }

    checkConflict(action1: Action, action2: Action, worldState: GameWorldState): boolean {
        // 同一 Agent 的多个 Action 冲突
        return action1.agentId === action2.agentId;
    }
}
