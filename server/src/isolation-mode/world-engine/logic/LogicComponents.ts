/**
 * Logic Sub-Components
 * 
 * 严谨推理世界的子组件：
 * - LogicRuleEngine: 逻辑一致性检查、推导验证
 * - LogicScheduler: 回合管理
 * - LogicArbiter: 处理多 Agent 推导
 * 
 * 特点：
 * - 世界目标是"正确性"
 * - 推理可验证、可反驳
 * - 错误推导被拒绝并记录原因
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
    LogicWorldState,
    Conclusion,
    Refutation,
    DeriveParams,
    RefuteParams,
    ExtendParams,
    AcceptParams,
    DerivationRule
} from './LogicWorldState';

// ============================================
// LogicRuleEngine
// ============================================

/**
 * 逻辑规则引擎
 * 
 * 职责：
 * - 检查逻辑一致性
 * - 验证是否基于已有假设
 * - 拒绝错误推导并记录原因
 */
export class LogicRuleEngine implements IRuleEngine {
    /**
     * 验证 Action 是否合法
     */
    validateAction(action: Action, worldState: LogicWorldState): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 检查 Agent 是否是研究员
        if (!worldState.researchers.has(action.agentId)) {
            errors.push(`Agent ${action.agentId} 不是注册的研究员`);
            return { isValid: false, errors, warnings };
        }

        switch (action.actionType) {
            case 'derive':
                return this.validateDerive(action, worldState);
            case 'refute':
                return this.validateRefute(action, worldState);
            case 'extend':
                return this.validateExtend(action, worldState);
            case 'accept':
                return this.validateAccept(action, worldState);
            case 'pass':
                return { isValid: true, errors: [], warnings: [] };
            default:
                errors.push(`未知的 Action 类型: ${action.actionType}`);
                return { isValid: false, errors, warnings };
        }
    }

    /**
     * 验证 derive Action
     */
    private validateDerive(action: Action, state: LogicWorldState): ValidationResult {
        const params = action.params as unknown as DeriveParams;
        const errors: string[] = [];
        const warnings: string[] = [];

        // 检查结论不为空
        if (!params.conclusion || params.conclusion.trim() === '') {
            errors.push('结论不能为空');
            return { isValid: false, errors, warnings };
        }

        // 检查前提存在
        if (!params.premises || params.premises.length === 0) {
            errors.push('必须指定至少一个前提');
            return { isValid: false, errors, warnings };
        }

        // 检查前提是否存在于假设或已接受的结论中
        for (const premiseId of params.premises) {
            const inHypotheses = state.problem.hypotheses.has(premiseId);
            const inConclusions = state.problem.conclusions.has(premiseId);

            if (!inHypotheses && !inConclusions) {
                errors.push(`前提 "${premiseId}" 不存在于假设集或已接受的结论中`);
            }
        }

        if (errors.length > 0) {
            return { isValid: false, errors, warnings };
        }

        // 检查推导规则有效性（简化验证）
        const ruleValid = this.validateDerivationRule(params.rule, params.premises, state);
        if (!ruleValid.isValid) {
            return ruleValid;
        }

        return { isValid: true, errors, warnings };
    }

    /**
     * 验证推导规则（简化版）
     */
    private validateDerivationRule(
        rule: DerivationRule,
        premises: string[],
        state: LogicWorldState
    ): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        switch (rule) {
            case 'modus_ponens':
                // 需要 A 和 A→B
                if (premises.length < 2) {
                    warnings.push('Modus ponens 通常需要两个前提 (A 和 A→B)');
                }
                break;
            case 'conjunction':
                // 需要 A 和 B
                if (premises.length < 2) {
                    warnings.push('合取规则通常需要两个前提');
                }
                break;
            case 'definition':
            case 'algebraic':
            case 'substitution':
                // 这些规则较宽松
                break;
            default:
                // 允许自定义规则
                break;
        }

        return { isValid: true, errors, warnings };
    }

    /**
     * 验证 refute Action
     */
    private validateRefute(action: Action, state: LogicWorldState): ValidationResult {
        const params = action.params as unknown as RefuteParams;
        const errors: string[] = [];

        // 检查目标存在
        const targetInConclusions = state.problem.conclusions.has(params.targetId);
        const targetInPending = state.problem.pendingProposals.has(params.targetId);

        if (!targetInConclusions && !targetInPending) {
            errors.push(`目标 "${params.targetId}" 不存在`);
            return { isValid: false, errors, warnings: [] };
        }

        // 检查反驳理由不为空
        if (!params.reason || params.reason.trim() === '') {
            errors.push('反驳理由不能为空');
            return { isValid: false, errors, warnings: [] };
        }

        return { isValid: true, errors: [], warnings: [] };
    }

    /**
     * 验证 extend Action
     */
    private validateExtend(action: Action, state: LogicWorldState): ValidationResult {
        const params = action.params as unknown as ExtendParams;
        const errors: string[] = [];

        // 检查基础结论存在
        if (!state.problem.conclusions.has(params.baseConclusionId)) {
            errors.push(`基础结论 "${params.baseConclusionId}" 不存在于已接受的结论中`);
            return { isValid: false, errors, warnings: [] };
        }

        // 检查扩展不为空
        if (!params.extension || params.extension.trim() === '') {
            errors.push('扩展结论不能为空');
            return { isValid: false, errors, warnings: [] };
        }

        return { isValid: true, errors: [], warnings: [] };
    }

    /**
     * 验证 accept Action
     */
    private validateAccept(action: Action, state: LogicWorldState): ValidationResult {
        const params = action.params as unknown as AcceptParams;
        const errors: string[] = [];

        // 检查提案存在
        if (!state.problem.pendingProposals.has(params.proposalId)) {
            errors.push(`提案 "${params.proposalId}" 不存在于待处理列表中`);
            return { isValid: false, errors, warnings: [] };
        }

        return { isValid: true, errors: [], warnings: [] };
    }

    /**
     * 应用 Action
     */
    applyAction(action: Action, worldState: LogicWorldState): ActionResult {
        switch (action.actionType) {
            case 'derive':
                return this.applyDerive(action, worldState);
            case 'refute':
                return this.applyRefute(action, worldState);
            case 'extend':
                return this.applyExtend(action, worldState);
            case 'accept':
                return this.applyAccept(action, worldState);
            case 'pass':
                return { action, success: true, effects: [], events: [] };
            default:
                return { action, success: false, failureReason: '未知 Action', effects: [], events: [] };
        }
    }

    /**
     * 应用 derive
     */
    private applyDerive(action: Action, state: LogicWorldState): ActionResult {
        const params = action.params as unknown as DeriveParams;
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];

        // 创建结论
        const conclusionId = `C-${uuidv4().slice(0, 8)}`;
        const conclusion: Conclusion = {
            id: conclusionId,
            latex: params.conclusion,
            description: params.explanation,
            derivedFrom: params.premises,
            rule: params.rule,
            proposedBy: action.agentId,
            status: 'pending'
        };

        // 添加到待处理提案
        state.problem.pendingProposals.set(conclusionId, conclusion);

        // 生成 PROPOSAL 事件
        events.push({
            eventId: uuidv4(),
            eventType: 'PROPOSAL',
            timestamp: Date.now(),
            source: action.agentId,
            content: {
                proposalId: conclusionId,
                latex: params.conclusion,
                premises: params.premises,
                rule: params.rule,
                explanation: params.explanation
            },
            meta: { actionId: action.actionId }
        });

        return { action, success: true, effects, events };
    }

    /**
     * 应用 refute
     */
    private applyRefute(action: Action, state: LogicWorldState): ActionResult {
        const params = action.params as unknown as RefuteParams;
        const events: WorldEvent[] = [];

        // 创建反驳
        const refutationId = `R-${uuidv4().slice(0, 8)}`;
        const refutation: Refutation = {
            id: refutationId,
            targetId: params.targetId,
            type: params.type,
            reason: params.reason,
            proposedBy: action.agentId,
            status: 'pending'
        };

        state.problem.refutations.set(refutationId, refutation);

        // 如果目标在待处理提案中，设为拒绝
        const pendingProposal = state.problem.pendingProposals.get(params.targetId);
        if (pendingProposal) {
            pendingProposal.status = 'rejected';
            pendingProposal.rejectionReason = params.reason;
            state.problem.pendingProposals.delete(params.targetId);

            // 更新提出者的统计
            const proposer = state.researchers.get(pendingProposal.proposedBy);
            if (proposer) {
                proposer.rejectedProposals++;
            }

            // 更新反驳者的统计
            const refuter = state.researchers.get(action.agentId);
            if (refuter) {
                refuter.successfulRefutations++;
            }

            events.push({
                eventId: uuidv4(),
                eventType: 'REJECTED',
                timestamp: Date.now(),
                source: 'system',
                content: {
                    proposalId: params.targetId,
                    latex: pendingProposal.latex,
                    reason: params.reason,
                    refutedBy: action.agentId,
                    refutationType: params.type
                }
            });
        }

        // 如果是矛盾类型
        if (params.type === 'contradiction') {
            events.push({
                eventId: uuidv4(),
                eventType: 'CONTRADICTION',
                timestamp: Date.now(),
                source: action.agentId,
                content: {
                    targetId: params.targetId,
                    contradictionReason: params.reason
                }
            });
        } else {
            events.push({
                eventId: uuidv4(),
                eventType: 'REFUTATION',
                timestamp: Date.now(),
                source: action.agentId,
                content: {
                    refutationId,
                    targetId: params.targetId,
                    type: params.type,
                    reason: params.reason
                }
            });
        }

        return { action, success: true, effects: [], events };
    }

    /**
     * 应用 extend
     */
    private applyExtend(action: Action, state: LogicWorldState): ActionResult {
        const params = action.params as unknown as ExtendParams;

        // 转换为 derive
        const deriveParams: DeriveParams = {
            conclusion: params.extension,
            premises: [params.baseConclusionId],
            rule: params.rule
        };

        return this.applyDerive(
            { ...action, params: deriveParams as unknown as Record<string, unknown> },
            state
        );
    }

    /**
     * 应用 accept
     */
    private applyAccept(action: Action, state: LogicWorldState): ActionResult {
        const params = action.params as unknown as AcceptParams;
        const events: WorldEvent[] = [];
        const effects: WorldStateChange[] = [];

        const proposal = state.problem.pendingProposals.get(params.proposalId);
        if (!proposal) {
            return { action, success: false, failureReason: '提案不存在', effects: [], events: [] };
        }

        // 更新状态
        proposal.status = 'accepted';
        proposal.verifiedAt = Date.now();
        proposal.verifiedBy = action.agentId;

        // 移动到已接受结论
        state.problem.conclusions.set(proposal.id, proposal);
        state.problem.pendingProposals.delete(params.proposalId);

        // 更新提出者的贡献
        const proposer = state.researchers.get(proposal.proposedBy);
        if (proposer) {
            proposer.contributions.push(proposal.id);
        }

        // 检查是否证明了某个目标
        for (const [goalId, goal] of state.problem.goals) {
            if (goal.status === 'open' && this.matchesGoal(proposal.latex, goal.latex)) {
                goal.status = 'proved';
                goal.proofConclusionId = proposal.id;

                events.push({
                    eventId: uuidv4(),
                    eventType: 'GOAL_PROVED',
                    timestamp: Date.now(),
                    source: 'system',
                    content: {
                        goalId,
                        goalLatex: goal.latex,
                        proofConclusionId: proposal.id
                    }
                });
            }
        }

        // 生成 ACCEPTED 事件
        events.push({
            eventId: uuidv4(),
            eventType: 'ACCEPTED',
            timestamp: Date.now(),
            source: 'system',
            content: {
                conclusionId: proposal.id,
                latex: proposal.latex,
                derivedFrom: proposal.derivedFrom,
                rule: proposal.rule,
                proposedBy: proposal.proposedBy,
                verifiedBy: action.agentId,
                verificationNote: params.verificationNote
            }
        });

        effects.push({
            changeType: 'create',
            entityType: 'conclusion',
            entityId: proposal.id,
            newValue: proposal
        });

        return { action, success: true, effects, events };
    }

    /**
     * 简单匹配目标（实际需要更复杂的逻辑等价判断）
     */
    private matchesGoal(conclusionLatex: string, goalLatex: string): boolean {
        // 简化实现：字符串匹配
        return conclusionLatex.trim() === goalLatex.trim();
    }

    enforceConstraints(worldState: LogicWorldState): WorldStateChange[] {
        // 检查是否所有目标都已证明
        const allGoalsProved = Array.from(worldState.problem.goals.values())
            .every(g => g.status === 'proved');

        if (allGoalsProved && worldState.problem.goals.size > 0) {
            worldState.problem.isSolved = true;
        }

        return [];
    }

    registerRule(rule: Rule): void { }
    getActiveRules(): Rule[] { return []; }
}

// ============================================
// LogicScheduler
// ============================================

/**
 * 逻辑调度器
 */
export class LogicScheduler implements IScheduler {
    private time: WorldTime;
    private maxRounds: number;

    constructor(maxRounds: number) {
        this.time = { tick: 0, round: 0, timeScale: 1 };
        this.maxRounds = maxRounds;
    }

    nextTick(): WorldTime {
        this.time.tick++;
        return { ...this.time };
    }

    advanceRound(worldState: LogicWorldState): void {
        this.time.round++;
        worldState.discussion.currentRound++;
    }

    currentTime(): WorldTime {
        return { ...this.time };
    }

    shouldAdvancePhase(): boolean {
        return false;
    }

    getNextPhase(): PhaseConfig | null {
        return null;
    }

    shouldTerminate(worldState: LogicWorldState): boolean {
        // 终止条件：问题已解决 或 达到最大回合
        if (worldState.problem.isSolved) {
            return true;
        }
        if (worldState.discussion.currentRound >= this.maxRounds) {
            return true;
        }
        return false;
    }

    setTimeScale(scale: number): void {
        this.time.timeScale = scale;
    }
}

// ============================================
// LogicArbiter
// ============================================

/**
 * 逻辑仲裁器
 * 
 * 处理多 Agent 同时提交推导的情况
 */
export class LogicArbiter implements IArbiter {
    /**
     * 解决冲突
     * 
     * 逻辑世界允许多个 Agent 同时提交不同的推导
     * 只需确保同一 Agent 不提交多个 Action
     */
    resolveConflicts(actions: Action[], worldState: LogicWorldState): Action[] {
        // 过滤 pass
        const activeActions = actions.filter(a => a.actionType !== 'pass');

        // 每个 Agent 只保留一个 Action
        const agentActions = new Map<string, Action>();
        for (const action of activeActions) {
            if (!agentActions.has(action.agentId)) {
                agentActions.set(action.agentId, action);
            }
        }

        return Array.from(agentActions.values());
    }

    prioritizeActions(actions: Action[]): Action[] {
        return [...actions].sort((a, b) => {
            // accept 优先级最高（验证结论）
            if (a.actionType === 'accept' && b.actionType !== 'accept') return -1;
            if (b.actionType === 'accept' && a.actionType !== 'accept') return 1;

            // refute 次之（发现错误）
            if (a.actionType === 'refute' && b.actionType !== 'refute') return -1;
            if (b.actionType === 'refute' && a.actionType !== 'refute') return 1;

            // 其他按置信度
            return b.confidence - a.confidence;
        });
    }

    checkConflict(action1: Action, action2: Action): boolean {
        // 同一 Agent 的 Action 冲突
        return action1.agentId === action2.agentId;
    }
}
