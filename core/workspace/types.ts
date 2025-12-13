/**
 * Workspace 系统核心类型定义
 * 
 * @module core/workspace/types
 * @description 定义 Workspace、Workflow、Execution 等核心数据结构
 */

// ============================================
// Workspace 类型
// ============================================

export type WorkspaceType = 'WORKFLOW' | 'PROJECT' | 'TASK' | 'SANDBOX';

export interface WorkspaceIsolation {
    contextIsolated: boolean;      // 上下文隔离 (不共享对话历史)
    fileIsolated: boolean;         // 文件隔离 (独立文件空间)
    resourceLimits?: {
        maxTokens: number;
        maxExecutionTime: number;    // 秒
        maxConcurrentTasks: number;
    };
}

export interface Workspace {
    id: string;
    name: string;
    type: WorkspaceType;
    ownerId: string;

    // 隔离配置
    isolation: WorkspaceIsolation;

    // 元数据
    description?: string;
    tags: string[];
    icon?: string;                 // emoji 或图标名

    // 时间戳
    createdAt: number;
    updatedAt: number;
}

// ============================================
// Workspace 配置
// ============================================

export interface ModelConfig {
    id: string;
    name: string;

    // 连接配置
    provider: 'GEMINI' | 'OPENAI' | 'ANTHROPIC' | 'CUSTOM';
    apiKey: string;                // 加密存储
    baseUrl?: string;
    modelName: string;

    // 参数
    temperature?: number;
    maxTokens?: number;
    topP?: number;

    // 动态参数
    dynamicParams?: Record<string, any>;

    // 标记
    isDefault: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface WorkspaceConfig {
    id: string;
    workspaceId: string;

    // 模型配置
    modelConfigs: ModelConfig[];
    defaultModelId?: string;

    // MCP 配置
    enabledMCPs: string[];
    mcpOverrides?: Record<string, any>;

    // 功能开关
    features: {
        promptOptimization: boolean;
        autoSave: boolean;
        versionHistory: boolean;
    };

    updatedAt: number;
}

// ============================================
// Workspace 文件
// ============================================

export type FileType = 'INPUT' | 'OUTPUT' | 'INTERMEDIATE' | 'CONFIG';

export interface WorkspaceFile {
    id: string;
    workspaceId: string;

    name: string;
    path: string;                  // 相对路径
    type: FileType;
    mimeType: string;
    size: number;
    storageUrl: string;            // 本地路径或 OSS URL

    createdAt: number;
}

// ============================================
// 工作流定义
// ============================================

export type NodeType =
    | 'INPUT'
    | 'OUTPUT'
    | 'AI'
    | 'TOOL'
    | 'CONDITION'
    | 'HUMAN_REVIEW'
    | 'LOOP'
    | 'MERGE';

export interface WorkflowNode {
    id: string;
    type: NodeType;
    position: { x: number; y: number };
    data: Record<string, any>;     // 节点特定数据
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
}

export interface Workflow {
    id: string;
    workspaceId: string;

    name: string;
    description?: string;
    version: number;

    // 图结构
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];

    // 全局变量
    variables: Record<string, any>;

    // 标记
    isTemplate: boolean;

    // 元数据
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

// ============================================
// 工作流版本
// ============================================

export interface WorkflowVersion {
    id: string;
    workflowId: string;
    version: number;

    // 快照
    snapshot: {
        nodes: WorkflowNode[];
        edges: WorkflowEdge[];
        variables: Record<string, any>;
    };

    // 变更说明
    changeLog?: string;
    isAutoSave: boolean;

    createdBy: string;
    createdAt: number;
}

// ============================================
// 工作流执行
// ============================================

export type ExecutionStatus =
    | 'QUEUED'
    | 'RUNNING'
    | 'PAUSED'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED';

export type NodeExecutionStatus =
    | 'PENDING'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'SKIPPED';

export interface NodeExecutionState {
    status: NodeExecutionStatus;
    input?: any;
    output?: any;
    startedAt?: number;
    completedAt?: number;
    error?: string;
    retryCount: number;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface WorkflowExecution {
    id: string;
    workspaceId: string;
    workflowId: string;
    workflowVersion: number;

    // 状态
    status: ExecutionStatus;
    progress: number;              // 0-100
    currentNodeId?: string;

    // 输入输出
    input?: Record<string, any>;
    output?: Record<string, any>;

    // 节点状态
    nodeStates: Record<string, NodeExecutionState>;

    // 资源使用
    tokenUsage: TokenUsage;
    estimatedCost?: number;

    // 时间
    startedAt?: number;
    completedAt?: number;
    createdAt: number;
}

// ============================================
// 执行日志
// ============================================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface ExecutionLog {
    id: string;
    executionId: string;
    nodeId?: string;

    level: LogLevel;
    message: string;
    data?: any;

    createdAt: number;
}

// ============================================
// 默认配置
// ============================================

export const DEFAULT_ISOLATION: Record<WorkspaceType, WorkspaceIsolation> = {
    WORKFLOW: {
        contextIsolated: true,
        fileIsolated: true
    },
    PROJECT: {
        contextIsolated: false,
        fileIsolated: true
    },
    TASK: {
        contextIsolated: true,
        fileIsolated: false
    },
    SANDBOX: {
        contextIsolated: true,
        fileIsolated: true,
        resourceLimits: {
            maxTokens: 100000,
            maxExecutionTime: 300,
            maxConcurrentTasks: 1
        }
    },
};

export const DEFAULT_WORKSPACE_FEATURES = {
    promptOptimization: false,
    autoSave: true,
    versionHistory: true,
};
