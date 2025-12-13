/**
 * 工作流执行引擎 - 节点执行器
 * 
 * @module core/workflow/executors
 * @description 各类节点的执行逻辑
 */

import { Node, Edge } from 'reactflow';

// ============================================
// 执行上下文
// ============================================

export interface ExecutionContext {
    workflowId: string;
    executionId: string;
    variables: Record<string, any>;
    nodeStates: Record<string, NodeExecutionState>;
    logs: ExecutionLog[];
    startTime: number;
    abortController?: AbortController;
}

export interface NodeExecutionState {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    input?: any;
    output?: any;
    error?: string;
    startTime?: number;
    endTime?: number;
    tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface ExecutionLog {
    timestamp: number;
    nodeId?: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    data?: any;
}

// ============================================
// 节点执行器基类
// ============================================

export type NodeExecutor = (
    node: Node,
    input: any,
    context: ExecutionContext
) => Promise<any>;

// ============================================
// 开始节点执行器
// ============================================

export const executeStartNode: NodeExecutor = async (node, input, context) => {
    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: '工作流开始执行',
    });

    // 开始节点直接透传输入或使用初始变量
    return input || context.variables.input || {};
};

// ============================================
// 结束节点执行器
// ============================================

export const executeEndNode: NodeExecutor = async (node, input, context) => {
    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: '工作流执行完成',
        data: { output: input },
    });

    // 存储最终输出
    context.variables.output = input;
    return input;
};

// ============================================
// AI 节点执行器
// ============================================

export const executeAINode: NodeExecutor = async (node, input, context) => {
    const { model, provider, systemPrompt, temperature, maxTokens } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `调用 AI 模型: ${provider || 'OpenAI'}/${model || 'gpt-4'}`,
    });

    try {
        // 构建消息
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        // 将输入转换为用户消息
        const userMessage = typeof input === 'string'
            ? input
            : JSON.stringify(input, null, 2);
        messages.push({ role: 'user', content: userMessage });

        // TODO: 实际调用 AI API
        // 这里是模拟执行
        await new Promise(resolve => setTimeout(resolve, 1000));

        const response = {
            content: `[AI模拟响应] 收到输入: ${userMessage.slice(0, 100)}...`,
            model: model || 'gpt-4',
            usage: {
                promptTokens: Math.floor(userMessage.length / 4),
                completionTokens: 50,
                totalTokens: Math.floor(userMessage.length / 4) + 50,
            },
        };

        // 记录 token 使用
        context.nodeStates[node.id].tokenUsage = response.usage;

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `AI 响应完成, tokens: ${response.usage.totalTokens}`,
        });

        return response.content;
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `AI 调用失败: ${error.message}`,
        });
        throw error;
    }
};

// ============================================
// 条件节点执行器
// ============================================

export const executeConditionNode: NodeExecutor = async (node, input, context) => {
    const { condition } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `评估条件: ${condition || '(无条件)'}`,
    });

    let result = false;

    try {
        if (condition) {
            // 简单的条件评估 (生产环境应使用沙箱)
            // 支持 input 变量和 context.variables
            const evalContext = {
                input,
                ...context.variables,
            };

            // 安全的条件评估 (基础逻辑)
            if (condition === 'true' || condition === '1') {
                result = true;
            } else if (condition === 'false' || condition === '0') {
                result = false;
            } else if (condition.includes('input')) {
                // 简单的输入检查
                result = !!input && input !== '' && input !== null;
            } else {
                // 默认根据输入的真值判断
                result = !!input;
            }
        } else {
            result = !!input;
        }

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `条件结果: ${result ? 'true' : 'false'}`,
        });

        // 返回带有分支标识的结果
        return { value: input, branch: result ? 'true' : 'false' };
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `条件评估失败: ${error.message}`,
        });
        return { value: input, branch: 'false' };
    }
};

// ============================================
// 输入节点执行器
// ============================================

export const executeInputNode: NodeExecutor = async (node, input, context) => {
    const { inputType, variableName } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `读取输入: ${inputType || 'user'}`,
    });

    // 从上下文变量中获取输入
    const value = variableName
        ? context.variables[variableName]
        : context.variables.input || input;

    return value;
};

// ============================================
// 输出节点执行器
// ============================================

export const executeOutputNode: NodeExecutor = async (node, input, context) => {
    const { outputType, variableName } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `输出结果: ${outputType || 'display'}`,
        data: { output: input },
    });

    // 存储到变量
    if (variableName) {
        context.variables[variableName] = input;
    }

    return input;
};

// ============================================
// 代码节点执行器
// ============================================

export const executeCodeNode: NodeExecutor = async (node, input, context) => {
    const { code, language } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `执行代码: ${language || 'javascript'}`,
    });

    if (!code) {
        return input;
    }

    try {
        // 简单的 JavaScript 执行 (生产环境应使用 isolated-vm 沙箱)
        // 创建安全的执行环境
        const safeContext = {
            input,
            variables: { ...context.variables },
            console: {
                log: (...args: any[]) => {
                    context.logs.push({
                        timestamp: Date.now(),
                        nodeId: node.id,
                        level: 'debug',
                        message: args.map(a => String(a)).join(' '),
                    });
                },
            },
        };

        // 包装代码为函数
        const wrappedCode = `
      (function(input, variables, console) {
        ${code}
        return input;
      })(input, variables, console)
    `;

        // 执行 (注意: 这不是安全的沙箱执行)
        // eslint-disable-next-line no-new-func
        const fn = new Function('input', 'variables', 'console', `return ${wrappedCode}`);
        const result = fn(safeContext.input, safeContext.variables, safeContext.console);

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: '代码执行完成',
        });

        return result;
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `代码执行失败: ${error.message}`,
        });
        throw error;
    }
};

// ============================================
// 触发器节点执行器
// ============================================

export const executeTriggerNode: NodeExecutor = async (node, input, context) => {
    const { triggerType, schedule } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `触发器激活: ${triggerType || 'manual'}`,
    });

    // 触发器节点主要用于启动流程，透传输入
    return input || context.variables.triggerData || {};
};

// ============================================
// 执行器映射
// ============================================

export const nodeExecutors: Record<string, NodeExecutor> = {
    start: executeStartNode,
    end: executeEndNode,
    ai: executeAINode,
    condition: executeConditionNode,
    input: executeInputNode,
    output: executeOutputNode,
    code: executeCodeNode,
    trigger: executeTriggerNode,
};
