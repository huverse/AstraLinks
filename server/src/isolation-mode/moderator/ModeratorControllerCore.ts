/**
 * Moderator Controller Core
 * 
 * 系统级控制组件，不是普通 Agent，也不是 LLM Prompt。
 * 
 * ============================================
 * 设计说明
 * ============================================
 * 
 * Moderator Controller 的职责是：
 * 1. 决定"现在是谁可以说话"
 * 2. 决定"是否要打断 / 点名 / 拉偏架"
 * 3. 决定"是否该总结 / 切换阶段 / 结束讨论"
 * 
 * 特性：
 * - 确定性的（deterministic）
 * - 可测试的
 * - 不依赖 LLM 的推理能力
 * 
 * ============================================
 * 状态机运行流程（ASCII）
 * ============================================
 * 
 *                  ┌─────────────┐
 *                  │ NOT_STARTED │
 *                  └──────┬──────┘
 *                         │ startSession()
 *                         ▼
 *                  ┌─────────────┐
 *             ┌────│   OPENING   │
 *             │    └──────┬──────┘
 *             │           │ phaseRound >= maxRounds
 *             │           ▼
 *             │    ┌─────────────────┐
 *             │    │ FREE_DISCUSSION │◄────────────┐
 *             │    └───────┬─────────┘             │
 *             │            │                       │ rollback
 *             │            ▼                       │
 *             │    ┌─────────────────┐             │
 *             │    │ FOCUSED_CONFLICT│─────────────┤
 *             │    └───────┬─────────┘             │
 *             │            │                       │
 *             │            ▼                       │
 *             │    ┌─────────────┐                 │
 *             │    │ CONVERGENCE │─────────────────┘
 *             │    └──────┬──────┘
 *             │           │
 *             │           ▼
 *             │    ┌─────────────┐
 *             └───►│   CLOSING   │
 *                  └──────┬──────┘
 *                         │
 *                         ▼
 *                  ┌─────────────┐
 *                  │    ENDED    │
 *                  └─────────────┘
 */

import {
    ModeratorState,
    ModeratorDecision,
    ModeratorAction,
    Intent,
    Phase,
    DiscussionHealth,
    PhaseTransition
} from '../core/types/moderator.types';
import { Event, EventType } from '../core/types/event.types';
import { PhaseConfig, ScenarioSchema, InterventionLevel } from '../core/types/scenario.types';

// ============================================
// 常量
// ============================================

/** 默认冷场阈值（轮次） */
const DEFAULT_COLD_THRESHOLD = 3;

/** 发言失衡阈值（单人占比超过此值视为过热） */
const DEFAULT_IMBALANCE_THRESHOLD = 0.6;

/** 连续发言最大次数 */
const MAX_CONSECUTIVE_SPEAKS = 2;

// ============================================
// Moderator Controller Core 实现
// ============================================

/**
 * 主持人控制器核心
 * 
 * 这是一个纯函数式的决策引擎，
 * 输入状态 + 意图 + 事件 → 输出决策
 */
export class ModeratorControllerCore {
    private scenario: ScenarioSchema;
    private phaseMap: Map<string, PhaseConfig>;
    private phaseOrder: string[];

    constructor(scenario: ScenarioSchema) {
        this.scenario = scenario;
        this.phaseMap = new Map();
        this.phaseOrder = [];

        // 构建 phase 映射
        for (const phase of scenario.flow.phases) {
            this.phaseMap.set(phase.id, phase);
            this.phaseOrder.push(phase.id);
        }
    }

    // ============================================
    // 核心决策方法
    // ============================================

    /**
     * 决定下一步动作
     * 
     * 这是 Moderator Controller 的核心方法。
     * 完全确定性，不依赖 LLM。
     * 
     * @param state 当前主持人状态
     * @param intents 当前轮 Agent 提交的发言意图
     * @param recentEvents 最近的事件（来自 Event Log）
     * @returns 主持人决策
     */
    decideNextAction(
        state: ModeratorState,
        intents: Intent[],
        recentEvents: Event[]
    ): ModeratorDecision {
        // 1. 检查是否需要切换阶段或结束
        const phaseDecision = this.checkPhaseTransition(state);
        if (phaseDecision) {
            return phaseDecision;
        }

        // 2. 检查讨论健康度（冷场/过热）
        const health = this.analyzeHealth(state, recentEvents);

        // 2a. 处理冷场
        if (health.isCold) {
            return this.handleColdDiscussion(state, health);
        }

        // 2b. 处理过热
        if (health.isOverheated) {
            return this.handleOverheatedDiscussion(state, health);
        }

        // 3. 处理发言意图
        if (intents.length > 0) {
            return this.processIntents(state, intents);
        }

        // 4. 根据干预级别决定主动行为
        if (state.interventionLevel >= 2 && state.idleRounds >= 1) {
            // 中高度干预：主动引导
            return this.proactiveIntervention(state);
        }

        // 5. 无需操作
        return { action: ModeratorAction.WAIT };
    }

    // ============================================
    // 阶段管理
    // ============================================

    /**
     * 检查是否需要阶段切换
     */
    private checkPhaseTransition(state: ModeratorState): ModeratorDecision | null {
        const currentPhase = this.phaseMap.get(state.currentPhaseId);
        if (!currentPhase) {
            return null;
        }

        // 检查是否达到最大轮次
        if (state.phaseRound >= currentPhase.maxRounds) {
            // 先看是否需要生成总结
            if (currentPhase.forceSummary) {
                return {
                    action: ModeratorAction.FORCE_SUMMARY,
                    llmRequestType: 'summary',
                    metadata: {
                        reason: 'phase_end',
                        phaseId: state.currentPhaseId
                    }
                };
            }

            // 切换到下一阶段
            const nextPhaseId = this.getNextPhaseId(state.currentPhaseId);
            if (nextPhaseId) {
                return {
                    action: ModeratorAction.SWITCH_PHASE,
                    nextPhaseId,
                    metadata: { reason: 'max_rounds' }
                };
            } else {
                // 没有下一阶段，结束讨论
                return {
                    action: ModeratorAction.END_DISCUSSION,
                    reason: 'All phases completed'
                };
            }
        }

        return null;
    }

    /**
     * 获取下一个阶段 ID
     */
    private getNextPhaseId(currentPhaseId: string): string | null {
        const currentIndex = this.phaseOrder.indexOf(currentPhaseId);
        if (currentIndex === -1 || currentIndex >= this.phaseOrder.length - 1) {
            return null;
        }
        return this.phaseOrder[currentIndex + 1];
    }

    // ============================================
    // 健康度分析
    // ============================================

    /**
     * 分析讨论健康度
     */
    private analyzeHealth(state: ModeratorState, recentEvents: Event[]): DiscussionHealth {
        const totalSpeaks = Array.from(state.speakCounts.values()).reduce((a, b) => a + b, 0);

        // 计算发言失衡程度
        let maxSpeaks = 0;
        let overheatedAgentId: string | undefined;

        state.speakCounts.forEach((count, agentId) => {
            if (count > maxSpeaks) {
                maxSpeaks = count;
                overheatedAgentId = agentId;
            }
        });

        const imbalanceScore = totalSpeaks > 0 ? maxSpeaks / totalSpeaks : 0;
        const isOverheated = imbalanceScore > DEFAULT_IMBALANCE_THRESHOLD && maxSpeaks > 2;

        // 检查冷场
        const isCold = state.idleRounds >= state.coldThreshold;

        return {
            isCold,
            isOverheated,
            overheatedAgentId: isOverheated ? overheatedAgentId : undefined,
            coldRounds: state.idleRounds,
            imbalanceScore
        };
    }

    /**
     * 处理冷场
     */
    private handleColdDiscussion(
        state: ModeratorState,
        health: DiscussionHealth
    ): ModeratorDecision {
        const { interventionLevel, agentIds, speakCounts } = state;

        // 找出发言最少的 Agent
        let leastSpeaker: string | null = null;
        let minSpeaks = Infinity;

        for (const agentId of agentIds) {
            const count = speakCounts.get(agentId) || 0;
            if (count < minSpeaks) {
                minSpeaks = count;
                leastSpeaker = agentId;
            }
        }

        switch (interventionLevel) {
            case 0:
                // 不干预：继续等待
                return { action: ModeratorAction.WAIT };

            case 1:
                // 低度干预：只在严重冷场时点名
                if (health.coldRounds >= state.coldThreshold * 2) {
                    return {
                        action: ModeratorAction.CALL_AGENT,
                        targetAgentId: leastSpeaker || agentIds[0],
                        reason: '讨论似乎停滞了，请发表您的看法'
                    };
                }
                return { action: ModeratorAction.WAIT };

            case 2:
                // 中度干预：点名发言最少的人
                return {
                    action: ModeratorAction.CALL_AGENT,
                    targetAgentId: leastSpeaker || agentIds[0],
                    reason: '请发表您的观点'
                };

            case 3:
                // 高度干预：主动提出引导问题
                return {
                    action: ModeratorAction.PROMPT_QUESTION,
                    llmRequestType: 'question',
                    metadata: {
                        coldRounds: health.coldRounds,
                        targetAgentId: leastSpeaker
                    }
                };

            default:
                return { action: ModeratorAction.WAIT };
        }
    }

    /**
     * 处理过热
     */
    private handleOverheatedDiscussion(
        state: ModeratorState,
        health: DiscussionHealth
    ): ModeratorDecision {
        if (state.interventionLevel >= 1) {
            return {
                action: ModeratorAction.WARN_AGENT,
                targetAgentId: health.overheatedAgentId,
                reason: '请给其他参与者发言的机会'
            };
        }
        return { action: ModeratorAction.WAIT };
    }

    // ============================================
    // 发言意图处理
    // ============================================

    /**
     * 处理发言意图
     */
    private processIntents(state: ModeratorState, intents: Intent[]): ModeratorDecision {
        // 按优先级和紧急程度排序
        const sortedIntents = [...intents].sort((a, b) => {
            // 插话优先级更高（如果允许）
            if (a.type === 'interrupt' && b.type !== 'interrupt') {
                return state.allowInterrupt ? -1 : 1;
            }
            // 按紧急程度排序
            return b.urgency - a.urgency;
        });

        // 根据发言顺序模式处理
        switch (state.speakingOrder) {
            case 'round-robin':
                return this.processRoundRobin(state, sortedIntents);

            case 'free':
                return this.processFreeOrder(state, sortedIntents);

            case 'moderated':
                return this.processModerated(state, sortedIntents);

            default:
                return this.processFreeOrder(state, sortedIntents);
        }
    }

    /**
     * 轮流发言模式
     */
    private processRoundRobin(state: ModeratorState, intents: Intent[]): ModeratorDecision {
        const { agentIds, roundRobinIndex, lastSpeakerId, consecutiveSpeaks } = state;

        // 计算下一个应该发言的 Agent
        const expectedSpeakerId = agentIds[roundRobinIndex % agentIds.length];

        // 查找期望发言者的意图
        const expectedIntent = intents.find(i => i.agentId === expectedSpeakerId);

        if (expectedIntent) {
            // 期望发言者有意图，允许发言
            return {
                action: ModeratorAction.ALLOW_SPEECH,
                targetAgentId: expectedSpeakerId
            };
        }

        // 期望发言者没有提交意图
        // 如果有其他人提交了插话意图且允许插话
        const interruptIntent = intents.find(i => i.type === 'interrupt' && state.allowInterrupt);
        if (interruptIntent && interruptIntent.urgency >= 4) {
            return {
                action: ModeratorAction.ALLOW_SPEECH,
                targetAgentId: interruptIntent.agentId,
                metadata: { isInterrupt: true }
            };
        }

        // 点名期望发言者
        return {
            action: ModeratorAction.CALL_AGENT,
            targetAgentId: expectedSpeakerId,
            reason: '轮到您发言了'
        };
    }

    /**
     * 自由发言模式
     */
    private processFreeOrder(state: ModeratorState, intents: Intent[]): ModeratorDecision {
        const { lastSpeakerId, consecutiveSpeaks } = state;

        // 过滤掉连续发言过多的 Agent
        const eligibleIntents = intents.filter(i => {
            if (i.agentId === lastSpeakerId && consecutiveSpeaks >= MAX_CONSECUTIVE_SPEAKS) {
                return false;
            }
            return true;
        });

        if (eligibleIntents.length === 0) {
            // 没有合格的意图
            if (intents.length > 0) {
                // 有意图但被过滤（连续发言过多）
                return {
                    action: ModeratorAction.REJECT_SPEECH,
                    targetAgentId: intents[0].agentId,
                    reason: '请让其他人先发言'
                };
            }
            return { action: ModeratorAction.WAIT };
        }

        // 选择紧急程度最高的意图
        const selectedIntent = eligibleIntents[0];

        // 处理插话
        if (selectedIntent.type === 'interrupt') {
            if (!state.allowInterrupt) {
                return {
                    action: ModeratorAction.REJECT_SPEECH,
                    targetAgentId: selectedIntent.agentId,
                    reason: '当前阶段不允许插话'
                };
            }
            if (selectedIntent.urgency < 3) {
                return {
                    action: ModeratorAction.REJECT_SPEECH,
                    targetAgentId: selectedIntent.agentId,
                    reason: '插话需要更高的紧急程度'
                };
            }
        }

        return {
            action: ModeratorAction.ALLOW_SPEECH,
            targetAgentId: selectedIntent.agentId
        };
    }

    /**
     * 主持人控制模式
     */
    private processModerated(state: ModeratorState, intents: Intent[]): ModeratorDecision {
        const { agentIds, speakCounts, lastSpeakerId, consecutiveSpeaks } = state;

        // 主持人主动选择发言者
        // 策略：优先让发言次数少的人发言

        let selectedAgentId: string | null = null;
        let minSpeaks = Infinity;

        for (const agentId of agentIds) {
            // 排除连续发言过多的人
            if (agentId === lastSpeakerId && consecutiveSpeaks >= MAX_CONSECUTIVE_SPEAKS) {
                continue;
            }

            const count = speakCounts.get(agentId) || 0;

            // 优先考虑有发言意图的人
            const hasIntent = intents.some(i => i.agentId === agentId);
            const adjustedCount = hasIntent ? count - 0.5 : count;

            if (adjustedCount < minSpeaks) {
                minSpeaks = adjustedCount;
                selectedAgentId = agentId;
            }
        }

        if (selectedAgentId) {
            const hasIntent = intents.some(i => i.agentId === selectedAgentId);
            if (hasIntent) {
                return {
                    action: ModeratorAction.ALLOW_SPEECH,
                    targetAgentId: selectedAgentId
                };
            } else {
                return {
                    action: ModeratorAction.CALL_AGENT,
                    targetAgentId: selectedAgentId,
                    reason: '请发表您的看法'
                };
            }
        }

        return { action: ModeratorAction.WAIT };
    }

    // ============================================
    // 主动干预
    // ============================================

    /**
     * 主动干预（高干预级别时使用）
     */
    private proactiveIntervention(state: ModeratorState): ModeratorDecision {
        const { interventionLevel, agentIds, speakCounts, lastSpeakerId } = state;

        if (interventionLevel >= 3) {
            // 高度干预：主动提问
            return {
                action: ModeratorAction.PROMPT_QUESTION,
                llmRequestType: 'question',
                metadata: { intent: 'proactive_guide' }
            };
        }

        // 中度干预：点名发言最少的人
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

        if (leastSpeaker) {
            return {
                action: ModeratorAction.CALL_AGENT,
                targetAgentId: leastSpeaker,
                reason: '请分享您的观点'
            };
        }

        return { action: ModeratorAction.WAIT };
    }

    // ============================================
    // 状态工厂方法
    // ============================================

    /**
     * 创建初始状态
     */
    createInitialState(agentIds: string[]): ModeratorState {
        const firstPhase = this.scenario.flow.phases[0];
        const policy = this.scenario.moderatorPolicy;

        return {
            currentPhaseId: firstPhase.id,
            currentPhaseType: firstPhase.type,
            phaseRound: 0,
            totalRounds: 0,
            lastSpeakerId: null,
            consecutiveSpeaks: 0,
            idleRounds: 0,
            pendingIntents: [],
            interventionLevel: policy.interventionLevel,
            phaseMaxRounds: firstPhase.maxRounds,
            allowInterrupt: firstPhase.allowInterrupt,
            speakingOrder: firstPhase.speakingOrder,
            coldThreshold: policy.maxIdleRounds,
            speakCounts: new Map(agentIds.map(id => [id, 0])),
            agentIds,
            roundRobinIndex: 0,
            phaseStartedAt: Date.now(),
            lastSpeakAt: null
        };
    }

    /**
     * 更新状态（发言后）
     */
    updateStateAfterSpeech(state: ModeratorState, speakerId: string): ModeratorState {
        const newSpeakCounts = new Map(state.speakCounts);
        newSpeakCounts.set(speakerId, (newSpeakCounts.get(speakerId) || 0) + 1);

        return {
            ...state,
            lastSpeakerId: speakerId,
            consecutiveSpeaks: speakerId === state.lastSpeakerId
                ? state.consecutiveSpeaks + 1
                : 1,
            idleRounds: 0,
            speakCounts: newSpeakCounts,
            roundRobinIndex: state.speakingOrder === 'round-robin'
                ? state.roundRobinIndex + 1
                : state.roundRobinIndex,
            totalRounds: state.totalRounds + 1,
            phaseRound: state.phaseRound + 1,
            lastSpeakAt: Date.now()
        };
    }

    /**
     * 更新状态（空闲轮次）
     */
    updateStateAfterIdle(state: ModeratorState): ModeratorState {
        return {
            ...state,
            idleRounds: state.idleRounds + 1
        };
    }

    /**
     * 更新状态（阶段切换后）
     */
    updateStateAfterPhaseSwitch(state: ModeratorState, newPhaseId: string): ModeratorState {
        const newPhase = this.phaseMap.get(newPhaseId);
        if (!newPhase) {
            throw new Error(`Phase not found: ${newPhaseId}`);
        }

        return {
            ...state,
            currentPhaseId: newPhaseId,
            currentPhaseType: newPhase.type,
            phaseRound: 0,
            phaseMaxRounds: newPhase.maxRounds,
            allowInterrupt: newPhase.allowInterrupt,
            speakingOrder: newPhase.speakingOrder,
            phaseStartedAt: Date.now(),
            idleRounds: 0
        };
    }
}
