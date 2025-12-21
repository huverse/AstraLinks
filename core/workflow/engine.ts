/**
 * 工作流执行引擎 - 调度器
 * 
 * @module core/workflow/engine
 * @description 工作流执行调度和状态管理
 */

import { Node, Edge } from 'reactflow';
import {
    ExecutionContext,
    NodeExecutionState,
    ExecutionLog,
    nodeExecutors
} from './executors';
import { resolveDeep, VariableContext } from './variableResolver';

// ============================================
// 执行状态
// ============================================

export type WorkflowExecutionStatus =
    | 'idle'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface WorkflowExecutionResult {
    executionId: string;
    status: WorkflowExecutionStatus;
    output?: any;
    error?: string;
    nodeStates: Record<string, NodeExecutionState>;
    logs: ExecutionLog[];
    totalTokens: number;
    duration: number;
}

// ============================================
// 工作流执行引擎
// ============================================

export class WorkflowEngine {
    private nodes: Node[];
    private edges: Edge[];
    private context: ExecutionContext;
    private status: WorkflowExecutionStatus = 'idle';
    private visitedNodes: Set<string> = new Set();
    private onStatusChange?: (status: WorkflowExecutionStatus, nodeId?: string) => void;
    private onLogAdd?: (log: ExecutionLog) => void;

    constructor(
        workflowId: string,
        nodes: Node[],
        edges: Edge[],
        variables: Record<string, any> = {},
        callbacks?: {
            onStatusChange?: (status: WorkflowExecutionStatus, nodeId?: string) => void;
            onLogAdd?: (log: ExecutionLog) => void;
        }
    ) {
        this.nodes = nodes;
        this.edges = edges;
        this.onStatusChange = callbacks?.onStatusChange;
        this.onLogAdd = callbacks?.onLogAdd;

        // 初始化执行上下文
        this.context = {
            workflowId,
            executionId: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            variables,
            nodeStates: {},
            logs: [],
            startTime: 0,
            abortController: new AbortController(),
        };

        // 初始化所有节点状态
        for (const node of nodes) {
            this.context.nodeStates[node.id] = {
                status: 'pending',
            };
        }
    }

    /**
     * 获取执行 ID
     */
    get executionId(): string {
        return this.context.executionId;
    }

    /**
     * 获取当前状态
     */
    get currentStatus(): WorkflowExecutionStatus {
        return this.status;
    }

    /**
     * 获取执行日志
     */
    get logs(): ExecutionLog[] {
        return this.context.logs;
    }

    /**
     * 添加日志
     */
    private addLog(log: ExecutionLog): void {
        this.context.logs.push(log);
        this.onLogAdd?.(log);
    }

    /**
     * 更新状态
     */
    private setStatus(status: WorkflowExecutionStatus, nodeId?: string): void {
        this.status = status;
        this.onStatusChange?.(status, nodeId);
    }

    /**
     * 查找开始节点
     */
    private findStartNodes(): Node[] {
        // 找没有入边的节点，或者类型为 start/trigger 的节点
        const targetIds = new Set(this.edges.map(e => e.target));
        return this.nodes.filter(n =>
            n.type === 'start' ||
            n.type === 'trigger' ||
            !targetIds.has(n.id)
        );
    }

    /**
     * 查找下一个节点
     */
    private findNextNodes(nodeId: string, branch?: string): Node[] {
        const outEdges = this.edges.filter(e => {
            if (e.source !== nodeId) return false;
            // 如果指定了分支，只返回匹配的边
            if (branch && e.sourceHandle) {
                return e.sourceHandle === branch;
            }
            return true;
        });

        return outEdges
            .map(e => this.nodes.find(n => n.id === e.target))
            .filter((n): n is Node => n !== undefined);
    }

    /**
     * 执行单个节点
     */
    private async executeNode(node: Node, input: any): Promise<any> {
        const nodeType = node.type || 'unknown';
        const executor = nodeExecutors[nodeType];

        if (!executor) {
            throw new Error(`未知的节点类型: ${nodeType}`);
        }

        // 构建变量上下文用于解析 {{xxx}} 引用
        const variableContext: VariableContext = {
            input: this.context.variables.input,
            variables: this.context.variables,
            nodeOutputs: this.getNodeOutputs(),
            env: typeof process !== 'undefined' ? process.env as Record<string, string> : {},
        };

        // 解析节点配置中的变量引用
        const resolvedData = resolveDeep(node.data, variableContext);
        const resolvedNode = { ...node, data: resolvedData };

        // 更新节点状态为运行中
        this.context.nodeStates[node.id] = {
            ...this.context.nodeStates[node.id],
            status: 'running',
            input,
            startTime: Date.now(),
        };
        this.setStatus('running', node.id);

        try {
            // 检查是否被取消
            if (this.context.abortController?.signal.aborted) {
                throw new Error('执行已取消');
            }

            // 使用解析后的节点执行
            const output = await executor(resolvedNode, input, this.context);

            // 更新节点状态为完成
            this.context.nodeStates[node.id] = {
                ...this.context.nodeStates[node.id],
                status: 'completed',
                output,
                endTime: Date.now(),
            };

            return output;
        } catch (error: any) {
            // 更新节点状态为失败
            this.context.nodeStates[node.id] = {
                ...this.context.nodeStates[node.id],
                status: 'failed',
                error: error.message,
                endTime: Date.now(),
            };

            throw error;
        }
    }

    /**
     * 获取所有已完成节点的输出 (用于变量解析)
     */
    private getNodeOutputs(): Record<string, any> {
        const outputs: Record<string, any> = {};
        for (const [nodeId, state] of Object.entries(this.context.nodeStates)) {
            if (state.status === 'completed' && state.output !== undefined) {
                outputs[nodeId] = state.output;
            }
        }
        return outputs;
    }


    /**
     * 递归执行节点链
     */
    private async executeNodeChain(node: Node, input: any): Promise<any> {
        // 循环检测
        if (this.visitedNodes.has(node.id)) {
            throw new Error(`检测到工作流循环: 节点 ${node.id} 被重复访问`);
        }
        this.visitedNodes.add(node.id);

        // 执行当前节点
        const output = await this.executeNode(node, input);

        // 如果是结束节点，停止执行
        if (node.type === 'end') {
            return output;
        }

        // 查找下一个节点
        let nextNodes: Node[];

        if (node.type === 'condition' && output && typeof output === 'object' && 'branch' in output) {
            // 条件节点根据分支选择下一个节点
            nextNodes = this.findNextNodes(node.id, output.branch);
            // 使用原始值继续执行
            input = output.value;
        } else {
            nextNodes = this.findNextNodes(node.id);
            input = output;
        }

        if (nextNodes.length === 0) {
            // 没有后续节点，返回当前输出
            return output;
        }

        // 如果有多个后续节点，并行执行
        if (nextNodes.length > 1) {
            const results = await Promise.all(
                nextNodes.map(n => this.executeNodeChain(n, input))
            );
            return results;
        }

        // 单个后续节点，继续执行
        return this.executeNodeChain(nextNodes[0], input);
    }

    /**
     * 执行工作流
     */
    async execute(input?: any): Promise<WorkflowExecutionResult> {
        this.context.startTime = Date.now();
        this.context.variables.input = input;

        this.addLog({
            timestamp: Date.now(),
            level: 'info',
            message: `开始执行工作流: ${this.context.workflowId}`,
        });

        this.setStatus('running');

        try {
            // 找到开始节点
            const startNodes = this.findStartNodes();

            if (startNodes.length === 0) {
                throw new Error('未找到开始节点');
            }

            // 从开始节点执行
            let finalOutput: any;

            if (startNodes.length > 1) {
                // 多个起始节点并行执行
                const results = await Promise.all(
                    startNodes.map(n => this.executeNodeChain(n, input))
                );
                finalOutput = results;
            } else {
                finalOutput = await this.executeNodeChain(startNodes[0], input);
            }

            this.setStatus('completed');

            this.addLog({
                timestamp: Date.now(),
                level: 'info',
                message: '工作流执行完成',
                data: { output: finalOutput },
            });

            return this.getResult(finalOutput);
        } catch (error: any) {
            this.setStatus('failed');

            this.addLog({
                timestamp: Date.now(),
                level: 'error',
                message: `工作流执行失败: ${error.message}`,
            });

            return this.getResult(undefined, error.message);
        }
    }

    /**
     * 取消执行
     */
    cancel(): void {
        this.context.abortController?.abort();
        this.setStatus('cancelled');

        this.addLog({
            timestamp: Date.now(),
            level: 'warn',
            message: '工作流执行已取消',
        });
    }

    /**
     * 获取执行结果
     */
    private getResult(output?: any, error?: string): WorkflowExecutionResult {
        // 计算总 token 使用量
        let totalTokens = 0;
        for (const state of Object.values(this.context.nodeStates)) {
            if (state.tokenUsage) {
                totalTokens += state.tokenUsage.totalTokens;
            }
        }

        return {
            executionId: this.context.executionId,
            status: this.status,
            output,
            error,
            nodeStates: this.context.nodeStates,
            logs: this.context.logs,
            totalTokens,
            duration: Date.now() - this.context.startTime,
        };
    }
}

// ============================================
// 便捷执行函数
// ============================================

export async function runWorkflow(
    workflowId: string,
    nodes: Node[],
    edges: Edge[],
    input?: any,
    variables?: Record<string, any>,
    callbacks?: {
        onStatusChange?: (status: WorkflowExecutionStatus, nodeId?: string) => void;
        onLogAdd?: (log: ExecutionLog) => void;
    }
): Promise<WorkflowExecutionResult> {
    const engine = new WorkflowEngine(workflowId, nodes, edges, variables, callbacks);
    return engine.execute(input);
}
