/**
 * Logic World Engine
 * 
 * 严谨推理 / 多 Agent 科研协作 / 相互纠错
 * 
 * 特点：
 * - 世界目标是"正确性"而非"赢"
 * - 推理可验证、可反驳、可接续
 * - 形式化结果优先，自然语言辅助
 */

import { v4 as uuidv4 } from 'uuid';
import {
    IWorldEngine,
    INarrator,
    WorldConfig,
    Action,
    ActionResult,
    WorldEvent,
    Entity
} from '../interfaces';
import {
    LogicWorldState,
    Hypothesis,
    Goal,
    createInitialLogicWorldState
} from './LogicWorldState';
import { LogicRuleEngine, LogicScheduler, LogicArbiter } from './LogicComponents';
import { ILLMProvider } from '../../core/interfaces/ILLMProvider';

// ============================================
// LogicNarrator
// ============================================

/**
 * 逻辑叙述者
 * 
 * 职责：
 * - 输出使用 LaTeX
 * - 不允许口语化
 * - 只解释"为什么被接受 / 拒绝"
 */
export class LogicNarrator implements INarrator {
    private llmProvider?: ILLMProvider;

    constructor(llmProvider?: ILLMProvider) {
        this.llmProvider = llmProvider;
    }

    /**
     * 生成总结（LaTeX 格式）
     */
    async generateSummary(worldState: LogicWorldState, recentEvents: WorldEvent[]): Promise<string> {
        const conclusions = Array.from(worldState.problem.conclusions.values());
        const pendingCount = worldState.problem.pendingProposals.size;
        const goalsProved = Array.from(worldState.problem.goals.values())
            .filter(g => g.status === 'proved').length;
        const totalGoals = worldState.problem.goals.size;

        // 纯 LaTeX 格式，无口语
        let latex = `\\section*{推导进度总结}\n\n`;
        latex += `\\textbf{已接受结论:} ${conclusions.length}\n\n`;
        latex += `\\textbf{待处理提案:} ${pendingCount}\n\n`;
        latex += `\\textbf{目标进度:} ${goalsProved}/${totalGoals}\n\n`;

        if (conclusions.length > 0) {
            latex += `\\subsection*{接受的结论}\n`;
            latex += `\\begin{enumerate}\n`;
            for (const c of conclusions.slice(-5)) {
                latex += `  \\item $${c.latex}$ \\quad (\\text{by } ${c.proposedBy})\n`;
            }
            latex += `\\end{enumerate}\n`;
        }

        return latex;
    }

    /**
     * 叙述事件（LaTeX 格式）
     */
    async narrateEvent(event: WorldEvent): Promise<string> {
        const content = event.content as Record<string, unknown>;

        switch (event.eventType) {
            case 'PROPOSAL':
                return `\\textbf{PROPOSAL:} $${content.latex}$ \\quad \\text{(proposed by ${event.source})}`;

            case 'ACCEPTED':
                return `\\textbf{ACCEPTED:} $${content.latex}$ \\quad \\text{Verified by ${content.verifiedBy}. Derivation rule: ${content.rule}}`;

            case 'REJECTED':
                return `\\textbf{REJECTED:} $${content.latex || 'N/A'}$ \\quad \\text{Reason: ${content.reason || content.reasons}}`;

            case 'CONTRADICTION':
                return `\\textbf{CONTRADICTION:} \\text{Target: ${content.targetId}. Contradiction: } ${content.contradictionReason}`;

            default:
                return `\\textbf{${event.eventType}:} ${JSON.stringify(content)}`;
        }
    }

    async generateOpening(worldState: LogicWorldState): Promise<string> {
        const problem = worldState.problem;
        let latex = `\\section*{问题陈述}\n\n`;
        latex += `$${problem.statement}$\n\n`;

        latex += `\\subsection*{假设}\n`;
        latex += `\\begin{itemize}\n`;
        for (const [id, h] of problem.hypotheses) {
            latex += `  \\item (${id}) $${h.latex}$\n`;
        }
        latex += `\\end{itemize}\n\n`;

        latex += `\\subsection*{目标}\n`;
        latex += `\\begin{itemize}\n`;
        for (const [id, g] of problem.goals) {
            latex += `  \\item (${id}) $${g.latex}$\n`;
        }
        latex += `\\end{itemize}\n`;

        return latex;
    }

    async generateClosing(worldState: LogicWorldState): Promise<string> {
        const problem = worldState.problem;
        let latex = `\\section*{推导结束}\n\n`;

        if (problem.isSolved) {
            latex += `\\textbf{所有目标已证明。}\n\n`;
        } else {
            const openGoals = Array.from(problem.goals.values())
                .filter(g => g.status === 'open');
            latex += `\\textbf{未解决目标: ${openGoals.length}}\n\n`;
        }

        latex += `\\subsection*{完整推导链}\n`;
        latex += `\\begin{enumerate}\n`;
        for (const [id, c] of problem.conclusions) {
            latex += `  \\item (${id}) $${c.latex}$ \\quad [${c.rule}, from: ${c.derivedFrom.join(', ')}]\n`;
        }
        latex += `\\end{enumerate}\n`;

        return latex;
    }

    async generateQuestion(worldState: LogicWorldState, context: Record<string, unknown>): Promise<string> {
        // 在逻辑世界中不使用引导问题
        return '';
    }
}

// ============================================
// LogicWorldEngine
// ============================================

/**
 * 逻辑世界引擎
 */
export class LogicWorldEngine implements IWorldEngine {
    readonly name = 'LogicWorldEngine';

    private state!: LogicWorldState;
    private ruleEngine!: LogicRuleEngine;
    private scheduler!: LogicScheduler;
    private arbiter!: LogicArbiter;
    private narrator?: LogicNarrator;
    private events: WorldEvent[] = [];

    /**
     * 初始化逻辑世界
     */
    async initialize(config: WorldConfig): Promise<void> {
        const maxRounds = (config.extensions?.maxRounds as number) || 50;

        this.ruleEngine = new LogicRuleEngine();
        this.scheduler = new LogicScheduler(maxRounds);
        this.arbiter = new LogicArbiter();
        this.events = [];
    }

    /**
     * 设置 Narrator
     */
    setNarrator(llmProvider?: ILLMProvider): void {
        this.narrator = new LogicNarrator(llmProvider);
    }

    /**
     * 初始化问题和研究员
     */
    initializeProblem(
        problemId: string,
        problemStatement: string,
        hypotheses: Hypothesis[],
        goals: Goal[],
        researcherIds: string[]
    ): void {
        this.state = createInitialLogicWorldState(
            'logic-world',
            problemId,
            problemStatement,
            hypotheses,
            goals,
            researcherIds
        );

        // 记录开始事件
        this.events.push({
            eventId: uuidv4(),
            eventType: 'PROBLEM_START',
            timestamp: Date.now(),
            source: 'system',
            content: {
                problemId,
                statement: problemStatement,
                hypothesisCount: hypotheses.length,
                goalCount: goals.length,
                researcherIds
            }
        });
    }

    /**
     * 核心 step 循环
     * 
     * 逻辑世界允许多个 Agent 同时提交不同的推导
     */
    async step(agentActions: Action[]): Promise<ActionResult[]> {
        const results: ActionResult[] = [];

        // 1. Arbiter 筛选（每个 Agent 最多一个 Action）
        const resolvedActions = this.arbiter.resolveConflicts(agentActions, this.state);

        // 排序：accept > refute > derive
        const prioritized = this.arbiter.prioritizeActions(resolvedActions);

        // 2. 逐个验证和应用
        for (const action of prioritized) {
            const validation = this.ruleEngine.validateAction(action, this.state);

            if (!validation.isValid) {
                // 记录拒绝事件
                const rejectedEvent: WorldEvent = {
                    eventId: uuidv4(),
                    eventType: 'REJECTED',
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

            // 应用 Action
            const result = this.ruleEngine.applyAction(action, this.state);
            results.push(result);

            for (const event of result.events) {
                this.events.push(event);
            }
        }

        // 3. 约束检查（检查是否所有目标已证明）
        this.ruleEngine.enforceConstraints(this.state);

        // 4. 回合推进
        this.scheduler.advanceRound(this.state);
        this.scheduler.nextTick();

        // 5. 终止检查
        if (this.scheduler.shouldTerminate(this.state)) {
            this.state.isTerminated = true;
            this.state.terminationReason = this.state.problem.isSolved
                ? '所有目标已证明'
                : '达到最大回合数';

            this.events.push({
                eventId: uuidv4(),
                eventType: 'PROBLEM_END',
                timestamp: Date.now(),
                source: 'system',
                content: {
                    isSolved: this.state.problem.isSolved,
                    totalRounds: this.state.discussion.currentRound,
                    conclusionCount: this.state.problem.conclusions.size,
                    reason: this.state.terminationReason
                }
            });
        }

        return results;
    }

    getWorldState(): LogicWorldState {
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
     * 获取问题状态
     */
    getProblemState() {
        return this.state.problem;
    }

    /**
     * 获取所有已接受的结论
     */
    getAcceptedConclusions() {
        return Array.from(this.state.problem.conclusions.values());
    }

    /**
     * 获取所有待处理提案
     */
    getPendingProposals() {
        return Array.from(this.state.problem.pendingProposals.values());
    }

    /**
     * 获取推导链（用于复原）
     */
    getDerivationChain() {
        return this.getAcceptedConclusions().map(c => ({
            id: c.id,
            latex: c.latex,
            derivedFrom: c.derivedFrom,
            rule: c.rule,
            proposedBy: c.proposedBy
        }));
    }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建逻辑世界引擎
 */
export async function createLogicWorldEngine(
    problemId: string,
    problemStatement: string,
    hypotheses: Hypothesis[],
    goals: Goal[],
    researcherIds: string[],
    llmProvider?: ILLMProvider
): Promise<LogicWorldEngine> {
    const engine = new LogicWorldEngine();

    await engine.initialize({
        worldId: 'logic-world',
        worldType: 'logic' as any,
        phases: [],
        rules: [],
        terminationConditions: [],
        extensions: { maxRounds: 50 }
    });

    if (llmProvider) {
        engine.setNarrator(llmProvider);
    }

    engine.initializeProblem(problemId, problemStatement, hypotheses, goals, researcherIds);

    return engine;
}
