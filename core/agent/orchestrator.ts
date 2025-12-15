/**
 * 多 Agent 编排器
 * 
 * @module core/agent/orchestrator
 * @description 多 Agent 协作调度
 */

import { v4 as uuidv4 } from 'uuid';
import { Agent, AgentResult, OrchestrationTask, OrchestrationMode } from './types';
import { executeAgent, ExecuteOptions } from './executor';

// ============================================
// 编排器
// ============================================

export interface OrchestratorOptions extends ExecuteOptions {
    mode?: OrchestrationMode;
    onAgentStart?: (agent: Agent, index: number) => void;
    onAgentComplete?: (agent: Agent, result: AgentResult) => void;
    onTaskComplete?: (task: OrchestrationTask) => void;
}

/**
 * 创建并执行协作任务
 */
export async function runOrchestration(
    taskName: string,
    agents: Agent[],
    input: any,
    options: OrchestratorOptions
): Promise<OrchestrationTask> {
    const { mode = 'sequential', onAgentStart, onAgentComplete, onTaskComplete } = options;

    const task: OrchestrationTask = {
        id: uuidv4(),
        name: taskName,
        mode,
        agents,
        input,
        status: 'running',
        results: [],
        startTime: Date.now(),
    };

    try {
        switch (mode) {
            case 'sequential':
                await runSequential(task, options, onAgentStart, onAgentComplete);
                break;
            case 'parallel':
                await runParallel(task, options, onAgentStart, onAgentComplete);
                break;
            case 'supervisor':
                await runSupervisor(task, options, onAgentStart, onAgentComplete);
                break;
        }

        task.status = 'completed';
        task.endTime = Date.now();

        // 汇总最终输出
        task.finalOutput = summarizeResults(task);

        onTaskComplete?.(task);
    } catch (error: any) {
        task.status = 'failed';
        task.endTime = Date.now();
        task.finalOutput = { error: error.message };
    }

    return task;
}

// ============================================
// 顺序执行模式
// ============================================

async function runSequential(
    task: OrchestrationTask,
    options: OrchestratorOptions,
    onAgentStart?: (agent: Agent, index: number) => void,
    onAgentComplete?: (agent: Agent, result: AgentResult) => void
): Promise<void> {
    let currentInput = task.input;

    for (let i = 0; i < task.agents.length; i++) {
        const agent = task.agents[i];
        onAgentStart?.(agent, i);

        // 如果不是第一个 Agent，使用上一个的输出作为输入
        const agentInput = i === 0
            ? currentInput
            : formatChainInput(currentInput, task.results[i - 1]);

        const result = await executeAgent(agent, agentInput, options);
        task.results.push(result);

        onAgentComplete?.(agent, result);

        // 更新当前输入为这个 Agent 的输出
        currentInput = result.output;

        // 如果 Agent 失败，中断执行
        if (result.status === 'failed') {
            throw new Error(`Agent "${agent.name}" failed: ${result.error}`);
        }
    }
}

// ============================================
// 并行执行模式
// ============================================

async function runParallel(
    task: OrchestrationTask,
    options: OrchestratorOptions,
    onAgentStart?: (agent: Agent, index: number) => void,
    onAgentComplete?: (agent: Agent, result: AgentResult) => void
): Promise<void> {
    const promises = task.agents.map(async (agent, index) => {
        onAgentStart?.(agent, index);
        const result = await executeAgent(agent, task.input, options);
        onAgentComplete?.(agent, result);
        return result;
    });

    task.results = await Promise.all(promises);
}

// ============================================
// 监督者模式 (简化版)
// ============================================

async function runSupervisor(
    task: OrchestrationTask,
    options: OrchestratorOptions,
    onAgentStart?: (agent: Agent, index: number) => void,
    onAgentComplete?: (agent: Agent, result: AgentResult) => void
): Promise<void> {
    // 监督者模式: 第一个 Agent 是监督者，负责分配任务
    if (task.agents.length < 2) {
        throw new Error('Supervisor mode requires at least 2 agents');
    }

    const [supervisor, ...workers] = task.agents;

    // 1. 监督者分析任务
    onAgentStart?.(supervisor, 0);
    const supervisorInput = `你需要将以下任务分配给团队成员执行。
团队成员: ${workers.map(w => `${w.name} (${w.description})`).join(', ')}

任务: ${typeof task.input === 'string' ? task.input : JSON.stringify(task.input)}

请为每个团队成员制定具体的子任务说明。格式:
${workers.map(w => `[${w.name}]: 子任务说明`).join('\n')}`;

    const supervisorResult = await executeAgent(supervisor, supervisorInput, options);
    task.results.push(supervisorResult);
    onAgentComplete?.(supervisor, supervisorResult);

    if (supervisorResult.status === 'failed') {
        throw new Error('Supervisor failed');
    }

    // 2. 解析监督者的任务分配
    const assignments = parseAssignments(supervisorResult.output, workers);

    // 3. 并行执行工作者任务
    const workerPromises = workers.map(async (worker, index) => {
        onAgentStart?.(worker, index + 1);
        const workerInput = assignments[worker.name] || task.input;
        const result = await executeAgent(worker, workerInput, options);
        onAgentComplete?.(worker, result);
        return result;
    });

    const workerResults = await Promise.all(workerPromises);
    task.results.push(...workerResults);
}

// ============================================
// 辅助函数
// ============================================

function formatChainInput(originalInput: any, previousResult: AgentResult): string {
    return `原始任务: ${typeof originalInput === 'string' ? originalInput : JSON.stringify(originalInput)}

---

前一个 Agent 的工作结果:
${previousResult.output}

---

请基于以上信息继续你的工作。`;
}

function parseAssignments(supervisorOutput: string, workers: Agent[]): Record<string, string> {
    const assignments: Record<string, string> = {};

    for (const worker of workers) {
        const regex = new RegExp(`\\[${worker.name}\\][:\\s]*([\\s\\S]*?)(?=\\[|$)`, 'i');
        const match = supervisorOutput.match(regex);
        if (match) {
            assignments[worker.name] = match[1].trim();
        }
    }

    return assignments;
}

function summarizeResults(task: OrchestrationTask): any {
    if (task.results.length === 0) {
        return null;
    }

    // 对于顺序模式，返回最后一个 Agent 的输出
    if (task.mode === 'sequential') {
        return task.results[task.results.length - 1].output;
    }

    // 对于并行/监督者模式，返回所有结果的汇总
    return {
        summary: task.results.map(r => ({
            agent: task.agents.find(a => a.id === r.agentId)?.name,
            status: r.status,
            output: r.output,
        })),
        totalTokens: task.results.reduce((sum, r) => sum + r.tokensUsed, 0),
        totalDuration: (task.endTime || Date.now()) - (task.startTime || Date.now()),
    };
}
