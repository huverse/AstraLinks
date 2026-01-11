/**
 * Agent Runner - Agent 工作流执行器
 * 支持规划-执行-验证循环，自我纠错
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import {
    WorkflowGraph,
    RunContext,
    AgentConfig,
    RunStatus
} from './types';
import { adapterRegistry } from '../adapters';
import { ChatMessage, ToolDefinition } from '../adapters/types';

interface AgentStep {
    id: string;
    type: 'plan' | 'execute' | 'verify' | 'correct';
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    input?: unknown;
    output?: unknown;
    error?: string;
}

interface AgentPlan {
    goal: string;
    steps: Array<{
        id: string;
        action: string;
        tool?: string;
        parameters?: Record<string, unknown>;
        dependsOn?: string[];
    }>;
    reasoning: string;
}

export class AgentRunner {
    private config: AgentConfig;
    private runId: string;
    private graph: WorkflowGraph;
    private eventEmitter?: (event: string, data: unknown) => void;
    private isCancelled: boolean = false;
    private isPaused: boolean = false;
    private iterations: number = 0;
    private conversationHistory: ChatMessage[] = [];

    constructor(
        graph: WorkflowGraph,
        config: AgentConfig,
        runId: string,
        eventEmitter?: (event: string, data: unknown) => void
    ) {
        this.graph = graph;
        this.config = config;
        this.runId = runId;
        this.eventEmitter = eventEmitter;
    }

    async run(context: RunContext): Promise<{ success: boolean; output?: unknown; error?: string }> {
        const systemPrompt = this.buildSystemPrompt();
        this.conversationHistory = [{ role: 'system', content: systemPrompt }];

        // 初始化用户目标
        const userGoal = context.variables.goal as string ?? 'Complete the workflow';
        this.conversationHistory.push({ role: 'user', content: userGoal });

        while (this.iterations < this.config.maxIterations) {
            if (this.isCancelled) {
                return { success: false, error: 'Agent cancelled' };
            }

            while (this.isPaused && !this.isCancelled) {
                await this.sleep(1000);
            }

            this.iterations++;
            this.emit('agent:iteration', { runId: this.runId, iteration: this.iterations });

            // 1. 规划阶段
            this.emit('agent:planning', { runId: this.runId });
            const plan = await this.plan(context);

            if (!plan) {
                return { success: false, error: 'Failed to create plan' };
            }

            // 检查是否需要人工审批
            if (this.config.requireApproval) {
                this.emit('agent:awaiting_approval', { runId: this.runId, plan });
                // 等待审批（实际实现需要暂停并等待用户输入）
                // 这里简化处理，直接继续
            }

            // 2. 执行阶段
            this.emit('agent:executing', { runId: this.runId, plan });
            const executionResult = await this.execute(plan, context);

            if (!executionResult.success) {
                if (this.config.selfCorrection && this.iterations < this.config.maxIterations) {
                    // 3. 自我纠错
                    this.emit('agent:correcting', {
                        runId: this.runId,
                        error: executionResult.error
                    });

                    this.conversationHistory.push({
                        role: 'user',
                        content: `The previous execution failed: ${executionResult.error}. Please analyze the error and try a different approach.`
                    });

                    continue;
                }

                return { success: false, error: executionResult.error };
            }

            // 4. 验证阶段
            this.emit('agent:verifying', { runId: this.runId });
            const verificationResult = await this.verify(plan, executionResult.output, context);

            if (verificationResult.success) {
                return {
                    success: true,
                    output: {
                        plan,
                        result: executionResult.output,
                        verification: verificationResult.output,
                        iterations: this.iterations
                    }
                };
            }

            // 验证失败，进入纠错循环
            if (this.config.selfCorrection && this.iterations < this.config.maxIterations) {
                this.conversationHistory.push({
                    role: 'user',
                    content: `Verification failed: ${verificationResult.error}. Please review and fix the issues.`
                });
                continue;
            }

            return { success: false, error: verificationResult.error };
        }

        return { success: false, error: 'Max iterations reached' };
    }

    private async plan(context: RunContext): Promise<AgentPlan | null> {
        const adapter = await adapterRegistry.createAdapter(
            1, // TODO: 用户 ID 从上下文获取
            'openai',
            undefined,
            { defaultModel: this.config.plannerModel }
        );

        const planPrompt = `
Analyze the goal and create a detailed execution plan.

Available tools: ${this.config.tools.join(', ')}

Respond in JSON format:
{
  "goal": "<restate the goal>",
  "reasoning": "<your analysis>",
  "steps": [
    {
      "id": "step_1",
      "action": "<action description>",
      "tool": "<tool name if applicable>",
      "parameters": {},
      "dependsOn": []
    }
  ]
}
`;

        this.conversationHistory.push({ role: 'user', content: planPrompt });

        const result = await adapter.chat(this.conversationHistory, {
            temperature: 0.7,
            maxTokens: 2000
        });

        context.metadata.totalTokens += result.tokens.total;
        this.conversationHistory.push({ role: 'assistant', content: result.text });

        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]) as AgentPlan;
            }
        } catch {
            // JSON 解析失败
        }

        return null;
    }

    private async execute(
        plan: AgentPlan,
        context: RunContext
    ): Promise<{ success: boolean; output?: unknown; error?: string }> {
        const adapter = await adapterRegistry.createAdapter(
            1,
            'openai',
            undefined,
            { defaultModel: this.config.executorModel }
        );

        const stepOutputs: Record<string, unknown> = {};

        for (const step of plan.steps) {
            if (this.isCancelled) {
                return { success: false, error: 'Cancelled' };
            }

            // 检查依赖
            if (step.dependsOn) {
                for (const dep of step.dependsOn) {
                    if (stepOutputs[dep] === undefined) {
                        return { success: false, error: `Dependency not met: ${dep}` };
                    }
                }
            }

            // 执行步骤
            if (step.tool) {
                // 工具调用
                const toolResult = await this.executeTool(
                    step.tool,
                    step.parameters ?? {},
                    context
                );

                if (!toolResult.success) {
                    return { success: false, error: `Step ${step.id} failed: ${toolResult.error}` };
                }

                stepOutputs[step.id] = toolResult.output;
            } else {
                // AI 推理步骤
                const execPrompt = `
Execute step: ${step.action}

Previous results:
${JSON.stringify(stepOutputs, null, 2)}

Context variables:
${JSON.stringify(context.variables, null, 2)}

Provide the result in JSON format.
`;

                const result = await adapter.chat(
                    [...this.conversationHistory, { role: 'user', content: execPrompt }],
                    { temperature: 0.3, maxTokens: 1500 }
                );

                context.metadata.totalTokens += result.tokens.total;

                try {
                    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        stepOutputs[step.id] = JSON.parse(jsonMatch[0]);
                    } else {
                        stepOutputs[step.id] = result.text;
                    }
                } catch {
                    stepOutputs[step.id] = result.text;
                }
            }
        }

        return { success: true, output: stepOutputs };
    }

    private async verify(
        plan: AgentPlan,
        executionOutput: unknown,
        context: RunContext
    ): Promise<{ success: boolean; output?: unknown; error?: string }> {
        const adapter = await adapterRegistry.createAdapter(
            1,
            'openai',
            undefined,
            { defaultModel: this.config.verifierModel }
        );

        const verifyPrompt = `
Verify the execution result against the original goal.

Original goal: ${plan.goal}

Plan steps:
${JSON.stringify(plan.steps, null, 2)}

Execution result:
${JSON.stringify(executionOutput, null, 2)}

Respond in JSON format:
{
  "success": true/false,
  "issues": ["<issue 1>", "<issue 2>"],
  "suggestions": ["<suggestion 1>"],
  "confidence": 0.0-1.0
}
`;

        const result = await adapter.chat(
            [{ role: 'user', content: verifyPrompt }],
            { temperature: 0.2, maxTokens: 1000 }
        );

        context.metadata.totalTokens += result.tokens.total;

        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const verification = JSON.parse(jsonMatch[0]) as {
                    success: boolean;
                    issues?: string[];
                    suggestions?: string[];
                    confidence?: number;
                };

                if (verification.success) {
                    return { success: true, output: verification };
                } else {
                    return {
                        success: false,
                        error: verification.issues?.join('; ') ?? 'Verification failed',
                        output: verification
                    };
                }
            }
        } catch {
            // JSON 解析失败
        }

        return { success: false, error: 'Verification parse error' };
    }

    private async executeTool(
        toolName: string,
        parameters: Record<string, unknown>,
        context: RunContext
    ): Promise<{ success: boolean; output?: unknown; error?: string }> {
        // TODO: 实现工具执行
        // 这里应该调用 MCP 系统或内置工具
        return {
            success: true,
            output: { tool: toolName, params: parameters, result: 'Tool executed' }
        };
    }

    private buildSystemPrompt(): string {
        return `You are an AI agent designed to accomplish complex tasks through planning, execution, and verification.

Your capabilities:
- Break down complex goals into actionable steps
- Execute steps using available tools
- Verify results and self-correct if needed

Available tools: ${this.config.tools.join(', ')}

Always respond in structured JSON format when asked.
Be thorough in your planning and verification.
If something fails, analyze the root cause before retrying.`;
    }

    cancel(): void {
        this.isCancelled = true;
    }

    pause(): void {
        this.isPaused = true;
    }

    resume(): void {
        this.isPaused = false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private emit(event: string, data: unknown): void {
        if (this.eventEmitter) {
            this.eventEmitter(event, data);
        }
    }
}
