/**
 * Workflow Engine Types
 * 工作流引擎类型定义
 */

// 工作流类型
export type WorkflowType = 'dag' | 'agent';

// 工作流运行状态
export type RunStatus = 'pending' | 'planning' | 'running' | 'verifying' | 'fixing' | 'paused' | 'completed' | 'failed' | 'cancelled';

// 节点运行状态
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// 节点类型
export type NodeType =
    | 'start'
    | 'end'
    | 'ai_chat'        // AI 对话节点
    | 'ai_completion'  // AI 补全节点
    | 'code'           // 代码执行节点
    | 'http'           // HTTP 请求节点
    | 'mcp'            // MCP 工具节点
    | 'condition'      // 条件分支
    | 'loop'           // 循环节点
    | 'parallel'       // 并行节点
    | 'merge'          // 合并节点
    | 'delay'          // 延迟节点
    | 'transform'      // 数据转换
    | 'validator'      // 数据验证
    | 'subworkflow'    // 子工作流
    | 'agent_plan'     // Agent 规划
    | 'agent_execute'  // Agent 执行
    | 'agent_verify';  // Agent 验证

// 验证模式
export type ValidationMode = 'strict' | 'balanced' | 'fast';

// 节点定义
export interface WorkflowNode {
    id: string;
    type: NodeType;
    label: string;
    config: Record<string, unknown>;
    position?: { x: number; y: number };
    retryConfig?: {
        maxRetries: number;
        retryDelay: number;
        backoffMultiplier?: number;
    };
    timeout?: number;
}

// 边定义（节点连接）
export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    condition?: string;  // 条件表达式（用于条件分支）
    label?: string;
}

// 工作流图
export interface WorkflowGraph {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

// Agent 配置
export interface AgentConfig {
    plannerModel: string;       // 规划器模型
    executorModel: string;      // 执行器模型
    verifierModel: string;      // 验证器模型
    maxIterations: number;      // 最大迭代次数
    selfCorrection: boolean;    // 自我纠错
    requireApproval: boolean;   // 需要人工审批
    tools: string[];            // 可用工具列表
}

// 协作模型配置
export interface CollaborationModel {
    role: string;
    modelId: string;
    systemPrompt?: string;
}

// 工作流定义
export interface WorkflowDefinition {
    id: string;
    name: string;
    description?: string;
    type: WorkflowType;
    graph: WorkflowGraph;
    agentConfig?: AgentConfig;
    collaborationModels?: CollaborationModel[];
    validationMode: ValidationMode;
    globalContext?: Record<string, unknown>;
    variables?: Record<string, unknown>;
}

// 工作流版本
export interface WorkflowVersion {
    id: string;
    workflowId: string;
    version: number;
    graph: WorkflowGraph;
    isActive: boolean;
    isDraft: boolean;
    createdBy: number;
    createdAt: Date;
    publishedAt?: Date;
}

// 运行上下文
export interface RunContext {
    variables: Record<string, unknown>;  // 全局变量
    nodeOutputs: Record<string, unknown>;  // 节点输出缓存
    metadata: {
        startTime: number;
        currentNode?: string;
        executedNodes: string[];
        totalTokens: number;
        errors: Array<{ nodeId: string; error: string; time: number }>;
    };
}

// 工作流运行实例
export interface WorkflowRun {
    id: string;
    workflowId: string;
    versionId: string;
    userId: number;
    status: RunStatus;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    context: RunContext;
    currentNodeId?: string;
    totalTokens: number;
    errorMessage?: string;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
}

// 节点运行记录
export interface NodeRun {
    id: string;
    runId: string;
    nodeId: string;
    nodeType: NodeType;
    status: NodeStatus;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    tokensUsed: number;
    latencyMs?: number;
    retryCount: number;
    errorMessage?: string;
    startedAt?: Date;
    completedAt?: Date;
}

// 节点执行结果
export interface NodeExecutionResult {
    success: boolean;
    output?: unknown;
    error?: string;
    tokensUsed?: number;
    latencyMs: number;
    nextNodes?: string[];  // 下一个要执行的节点（条件分支用）
}

// 节点执行器接口
export interface INodeExecutor {
    execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult>;
    canExecute(node: WorkflowNode): boolean;
}

// 工作流事件
export type WorkflowEventType =
    | 'run:started'
    | 'run:completed'
    | 'run:failed'
    | 'run:cancelled'
    | 'node:started'
    | 'node:completed'
    | 'node:failed'
    | 'node:skipped'
    | 'agent:planning'
    | 'agent:executing'
    | 'agent:verifying'
    | 'agent:correcting';

export interface WorkflowEvent {
    type: WorkflowEventType;
    runId: string;
    nodeId?: string;
    data?: Record<string, unknown>;
    timestamp: number;
}
