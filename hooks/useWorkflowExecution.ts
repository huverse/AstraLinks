/**
 * 工作流执行 React Hook
 * 
 * @module hooks/useWorkflowExecution
 * @description 工作流执行状态管理和控制
 */

import { useState, useCallback, useRef } from 'react';
import { Node, Edge } from 'reactflow';
import {
    WorkflowEngine,
    WorkflowExecutionResult,
    WorkflowExecutionStatus,
    ExecutionLog,
    NodeExecutionState
} from '../core/workflow';

export interface UseWorkflowExecutionReturn {
    /** 当前执行状态 */
    status: WorkflowExecutionStatus;
    /** 执行 ID */
    executionId: string | null;
    /** 节点状态 */
    nodeStates: Record<string, NodeExecutionState>;
    /** 执行日志 */
    logs: ExecutionLog[];
    /** 当前执行的节点 ID */
    currentNodeId: string | null;
    /** 最终输出 */
    output: any;
    /** 错误信息 */
    error: string | null;
    /** 总 token 使用量 */
    totalTokens: number;
    /** 执行时长 (ms) */
    duration: number;
    /** 开始执行 */
    execute: (input?: any) => Promise<WorkflowExecutionResult>;
    /** 取消执行 */
    cancel: () => void;
    /** 重置状态 */
    reset: () => void;
}

export function useWorkflowExecution(
    workflowId: string,
    nodes: Node[],
    edges: Edge[],
    variables?: Record<string, any>
): UseWorkflowExecutionReturn {
    const [status, setStatus] = useState<WorkflowExecutionStatus>('idle');
    const [executionId, setExecutionId] = useState<string | null>(null);
    const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
    const [output, setOutput] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [totalTokens, setTotalTokens] = useState(0);
    const [duration, setDuration] = useState(0);

    const engineRef = useRef<WorkflowEngine | null>(null);

    const execute = useCallback(async (input?: any): Promise<WorkflowExecutionResult> => {
        // 重置状态
        setStatus('running');
        setError(null);
        setOutput(null);
        setLogs([]);
        setNodeStates({});
        setTotalTokens(0);
        setDuration(0);

        // 创建执行引擎
        const engine = new WorkflowEngine(
            workflowId,
            nodes,
            edges,
            variables,
            {
                onStatusChange: (newStatus, nodeId) => {
                    setStatus(newStatus);
                    if (nodeId) {
                        setCurrentNodeId(nodeId);
                    }
                },
                onLogAdd: (log) => {
                    setLogs(prev => [...prev, log]);
                },
            }
        );

        engineRef.current = engine;
        setExecutionId(engine.executionId);

        // 执行工作流
        const result = await engine.execute(input);

        // 更新最终状态
        setStatus(result.status);
        setNodeStates(result.nodeStates);
        setOutput(result.output);
        setError(result.error || null);
        setTotalTokens(result.totalTokens);
        setDuration(result.duration);
        setCurrentNodeId(null);

        return result;
    }, [workflowId, nodes, edges, variables]);

    const cancel = useCallback(() => {
        engineRef.current?.cancel();
        setStatus('cancelled');
        setCurrentNodeId(null);
    }, []);

    const reset = useCallback(() => {
        setStatus('idle');
        setExecutionId(null);
        setNodeStates({});
        setLogs([]);
        setCurrentNodeId(null);
        setOutput(null);
        setError(null);
        setTotalTokens(0);
        setDuration(0);
        engineRef.current = null;
    }, []);

    return {
        status,
        executionId,
        nodeStates,
        logs,
        currentNodeId,
        output,
        error,
        totalTokens,
        duration,
        execute,
        cancel,
        reset,
    };
}

export default useWorkflowExecution;
