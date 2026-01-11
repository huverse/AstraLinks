/**
 * DAG Runner - DAG 工作流执行器
 * 支持拓扑排序、并行执行、条件分支
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import {
    WorkflowGraph,
    WorkflowNode,
    WorkflowEdge,
    RunContext,
    RunStatus,
    NodeStatus,
    NodeExecutionResult,
    WorkflowRun,
    NodeRun
} from './types';
import { NodeExecutorRegistry } from './executors';

export class DAGRunner {
    private graph: WorkflowGraph;
    private nodeMap: Map<string, WorkflowNode>;
    private inDegree: Map<string, number>;
    private adjacency: Map<string, string[]>;
    private reverseAdjacency: Map<string, string[]>;
    private executorRegistry: NodeExecutorRegistry;
    private isCancelled: boolean = false;
    private isPaused: boolean = false;
    private runId: string;
    private eventEmitter?: (event: string, data: unknown) => void;

    constructor(
        graph: WorkflowGraph,
        runId: string,
        eventEmitter?: (event: string, data: unknown) => void
    ) {
        this.graph = graph;
        this.runId = runId;
        this.eventEmitter = eventEmitter;
        this.executorRegistry = new NodeExecutorRegistry();
        this.nodeMap = new Map();
        this.inDegree = new Map();
        this.adjacency = new Map();
        this.reverseAdjacency = new Map();
        this.buildGraphStructure();
    }

    // 构建图结构
    private buildGraphStructure(): void {
        for (const node of this.graph.nodes) {
            this.nodeMap.set(node.id, node);
            this.inDegree.set(node.id, 0);
            this.adjacency.set(node.id, []);
            this.reverseAdjacency.set(node.id, []);
        }

        for (const edge of this.graph.edges) {
            const targets = this.adjacency.get(edge.source);
            if (targets) targets.push(edge.target);

            const sources = this.reverseAdjacency.get(edge.target);
            if (sources) sources.push(edge.source);

            const currentDegree = this.inDegree.get(edge.target);
            if (currentDegree !== undefined) {
                this.inDegree.set(edge.target, currentDegree + 1);
            }
        }
    }

    // 获取起始节点
    private getStartNodes(): string[] {
        const startNodes: string[] = [];
        for (const [nodeId, degree] of this.inDegree) {
            if (degree === 0) {
                startNodes.push(nodeId);
            }
        }
        return startNodes;
    }

    // 检查节点是否可执行（所有前置节点已完成）
    private canExecuteNode(nodeId: string, completedNodes: Set<string>): boolean {
        const predecessors = this.reverseAdjacency.get(nodeId);
        if (!predecessors) return true;
        return predecessors.every(pred => completedNodes.has(pred));
    }

    // 获取下一批可执行的节点
    private getNextExecutableNodes(
        completedNodes: Set<string>,
        runningNodes: Set<string>,
        skippedNodes: Set<string>
    ): string[] {
        const executable: string[] = [];

        for (const [nodeId] of this.nodeMap) {
            if (completedNodes.has(nodeId) || runningNodes.has(nodeId) || skippedNodes.has(nodeId)) {
                continue;
            }

            const predecessors = this.reverseAdjacency.get(nodeId);
            if (!predecessors || predecessors.length === 0) {
                executable.push(nodeId);
                continue;
            }

            const allPredecessorsDone = predecessors.every(
                pred => completedNodes.has(pred) || skippedNodes.has(pred)
            );
            if (allPredecessorsDone) {
                executable.push(nodeId);
            }
        }

        return executable;
    }

    // 执行单个节点
    private async executeNode(
        nodeId: string,
        context: RunContext
    ): Promise<NodeExecutionResult> {
        const node = this.nodeMap.get(nodeId);
        if (!node) {
            return { success: false, error: `Node not found: ${nodeId}`, latencyMs: 0 };
        }

        const startTime = Date.now();
        const nodeRunId = crypto.randomUUID();

        // 记录节点开始
        await this.recordNodeStart(nodeRunId, nodeId, node.type);
        this.emit('node:started', { runId: this.runId, nodeId, nodeType: node.type });

        // 获取执行器
        const executor = this.executorRegistry.getExecutor(node.type);
        if (!executor) {
            const error = `No executor for node type: ${node.type}`;
            await this.recordNodeEnd(nodeRunId, 'failed', null, error, 0, Date.now() - startTime);
            return { success: false, error, latencyMs: Date.now() - startTime };
        }

        // 执行节点（支持重试）
        let result: NodeExecutionResult;
        let retryCount = 0;
        const maxRetries = node.retryConfig?.maxRetries ?? 0;

        while (retryCount <= maxRetries) {
            if (this.isCancelled) {
                result = { success: false, error: 'Workflow cancelled', latencyMs: Date.now() - startTime };
                break;
            }

            while (this.isPaused) {
                await this.sleep(1000);
                if (this.isCancelled) break;
            }

            try {
                result = await executor.execute(node, context);

                if (result.success) {
                    context.nodeOutputs[nodeId] = result.output;
                    context.metadata.totalTokens += result.tokensUsed ?? 0;
                    break;
                }

                if (retryCount < maxRetries) {
                    const delay = (node.retryConfig?.retryDelay ?? 1000) *
                        Math.pow(node.retryConfig?.backoffMultiplier ?? 2, retryCount);
                    await this.sleep(delay);
                    retryCount++;
                } else {
                    break;
                }
            } catch (err) {
                result = {
                    success: false,
                    error: err instanceof Error ? err.message : 'Unknown error',
                    latencyMs: Date.now() - startTime
                };

                if (retryCount < maxRetries) {
                    retryCount++;
                    await this.sleep(node.retryConfig?.retryDelay ?? 1000);
                } else {
                    break;
                }
            }
        }

        result!.latencyMs = Date.now() - startTime;

        // 记录节点结束
        await this.recordNodeEnd(
            nodeRunId,
            result!.success ? 'completed' : 'failed',
            result!.output,
            result!.error,
            result!.tokensUsed ?? 0,
            result!.latencyMs,
            retryCount
        );

        this.emit(result!.success ? 'node:completed' : 'node:failed', {
            runId: this.runId,
            nodeId,
            output: result!.output,
            error: result!.error,
            latencyMs: result!.latencyMs
        });

        return result!;
    }

    // 处理条件分支
    private evaluateConditions(
        nodeId: string,
        context: RunContext,
        result: NodeExecutionResult
    ): string[] {
        const node = this.nodeMap.get(nodeId);
        if (!node || node.type !== 'condition') {
            return this.adjacency.get(nodeId) ?? [];
        }

        // 根据 result.nextNodes 返回下一个节点
        if (result.nextNodes && result.nextNodes.length > 0) {
            return result.nextNodes;
        }

        // 默认返回所有后继节点
        return this.adjacency.get(nodeId) ?? [];
    }

    // 主执行循环
    async run(context: RunContext): Promise<{ success: boolean; output?: unknown; error?: string }> {
        const completedNodes = new Set<string>();
        const runningNodes = new Set<string>();
        const skippedNodes = new Set<string>();
        const failedNodes = new Set<string>();

        // 从起始节点开始
        let executableNodes = this.getStartNodes();

        while (executableNodes.length > 0 || runningNodes.size > 0) {
            if (this.isCancelled) {
                return { success: false, error: 'Workflow cancelled' };
            }

            while (this.isPaused && !this.isCancelled) {
                await this.sleep(1000);
            }

            // 并行执行所有可执行节点
            const execPromises = executableNodes.map(async nodeId => {
                runningNodes.add(nodeId);
                const result = await this.executeNode(nodeId, context);
                runningNodes.delete(nodeId);

                if (result.success) {
                    completedNodes.add(nodeId);
                    context.metadata.executedNodes.push(nodeId);

                    // 处理条件分支
                    const nextNodes = this.evaluateConditions(nodeId, context, result);
                    const allSuccessors = this.adjacency.get(nodeId) ?? [];

                    // 标记未被选中的分支为 skipped
                    for (const succ of allSuccessors) {
                        if (!nextNodes.includes(succ)) {
                            skippedNodes.add(succ);
                        }
                    }
                } else {
                    failedNodes.add(nodeId);
                    context.metadata.errors.push({
                        nodeId,
                        error: result.error ?? 'Unknown error',
                        time: Date.now()
                    });
                }

                return { nodeId, result };
            });

            await Promise.all(execPromises);

            // 检查是否有失败节点且无法继续
            if (failedNodes.size > 0) {
                // 检查是否所有剩余节点都依赖于失败节点
                const remainingNodes = [...this.nodeMap.keys()].filter(
                    id => !completedNodes.has(id) && !failedNodes.has(id) && !skippedNodes.has(id)
                );

                const canContinue = remainingNodes.some(id => {
                    const preds = this.reverseAdjacency.get(id) ?? [];
                    return preds.every(p => completedNodes.has(p) || skippedNodes.has(p));
                });

                if (!canContinue && remainingNodes.length > 0) {
                    return {
                        success: false,
                        error: `Workflow failed at nodes: ${[...failedNodes].join(', ')}`
                    };
                }
            }

            // 获取下一批可执行节点
            executableNodes = this.getNextExecutableNodes(completedNodes, runningNodes, skippedNodes);
        }

        // 检查是否有失败
        if (failedNodes.size > 0) {
            return {
                success: false,
                error: `Workflow completed with failures: ${[...failedNodes].join(', ')}`
            };
        }

        // 获取最终输出（从 end 节点或最后完成的节点）
        const endNode = this.graph.nodes.find(n => n.type === 'end');
        const outputNodeId = endNode?.id ?? [...completedNodes].pop();
        const output = outputNodeId ? context.nodeOutputs[outputNodeId] : context.nodeOutputs;

        return { success: true, output };
    }

    // 取消执行
    cancel(): void {
        this.isCancelled = true;
    }

    // 暂停执行
    pause(): void {
        this.isPaused = true;
    }

    // 恢复执行
    resume(): void {
        this.isPaused = false;
    }

    // 辅助方法
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private emit(event: string, data: unknown): void {
        if (this.eventEmitter) {
            this.eventEmitter(event, data);
        }
    }

    private async recordNodeStart(
        nodeRunId: string,
        nodeId: string,
        nodeType: string
    ): Promise<void> {
        await pool.execute(
            `INSERT INTO workflow_node_runs (id, run_id, node_id, node_type, status, started_at)
             VALUES (?, ?, ?, ?, 'running', NOW())`,
            [nodeRunId, this.runId, nodeId, nodeType]
        );
    }

    private async recordNodeEnd(
        nodeRunId: string,
        status: NodeStatus,
        output: unknown,
        error: string | undefined,
        tokensUsed: number,
        latencyMs: number,
        retryCount: number = 0
    ): Promise<void> {
        await pool.execute(
            `UPDATE workflow_node_runs
             SET status = ?, output_json = ?, error_message = ?,
                 tokens_used = ?, latency_ms = ?, retry_count = ?, completed_at = NOW()
             WHERE id = ?`,
            [status, output ? JSON.stringify(output) : null, error, tokensUsed, latencyMs, retryCount, nodeRunId]
        );
    }
}
