/**
 * Node Executors - 节点执行器
 * 各类型节点的执行实现
 */

import axios from 'axios';
import {
    WorkflowNode,
    RunContext,
    NodeExecutionResult,
    INodeExecutor,
    NodeType
} from '../types';
import { adapterRegistry } from '../../adapters';

// 通用路径取值函数
const getValueByPath = (obj: Record<string, unknown>, path: string): unknown => {
    const keys = path.split('.');
    let current: unknown = obj;
    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = (current as Record<string, unknown>)[key];
        } else {
            return undefined;
        }
    }
    return current;
};

// 执行器注册表
export class NodeExecutorRegistry {
    private executors: Map<NodeType, INodeExecutor> = new Map();

    constructor() {
        this.registerDefaults();
    }

    private registerDefaults(): void {
        this.register('start', new StartNodeExecutor());
        this.register('end', new EndNodeExecutor());
        this.register('ai_chat', new AIChatNodeExecutor());
        this.register('ai_completion', new AICompletionNodeExecutor());
        this.register('code', new CodeNodeExecutor());
        this.register('http', new HTTPNodeExecutor());
        this.register('condition', new ConditionNodeExecutor());
        this.register('transform', new TransformNodeExecutor());
        this.register('delay', new DelayNodeExecutor());
        this.register('validator', new ValidatorNodeExecutor());
    }

    register(type: NodeType, executor: INodeExecutor): void {
        this.executors.set(type, executor);
    }

    getExecutor(type: NodeType): INodeExecutor | undefined {
        return this.executors.get(type);
    }
}

// Start 节点
class StartNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        return {
            success: true,
            output: context.variables,
            latencyMs: 0
        };
    }
}

// End 节点
class EndNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        // 收集所有输出
        const output = node.config.outputMapping
            ? this.mapOutput(node.config.outputMapping as Record<string, string>, context)
            : context.nodeOutputs;

        return {
            success: true,
            output,
            latencyMs: 0
        };
    }

    private mapOutput(mapping: Record<string, string>, context: RunContext): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, path] of Object.entries(mapping)) {
            result[key] = getValueByPath(context.nodeOutputs, path);
        }
        return result;
    }
}

// AI Chat 节点
class AIChatNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        const startTime = Date.now();
        const config = node.config as {
            providerId?: string;
            credentialId?: string;
            model?: string;
            systemPrompt?: string;
            userPrompt?: string;
            temperature?: number;
            maxTokens?: number;
            inputMapping?: Record<string, string>;
        };

        // 解析 prompt 模板
        const systemPrompt = this.interpolateTemplate(config.systemPrompt ?? '', context);
        const userPrompt = this.interpolateTemplate(config.userPrompt ?? '', context);

        // 获取 AI 适配器
        const adapter = await adapterRegistry.createAdapter(
            1, // TODO: 从上下文获取用户 ID
            config.providerId ?? 'openai',
            config.credentialId
        );

        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system' as const, content: systemPrompt });
        }
        messages.push({ role: 'user' as const, content: userPrompt });

        const result = await adapter.chat(messages, {
            model: config.model,
            temperature: config.temperature,
            maxTokens: config.maxTokens
        });

        return {
            success: true,
            output: {
                text: result.text,
                tokens: result.tokens,
                finishReason: result.finishReason
            },
            tokensUsed: result.tokens.total,
            latencyMs: Date.now() - startTime
        };
    }

    private interpolateTemplate(template: string, context: RunContext): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = getValueByPath({ ...context.variables, ...context.nodeOutputs }, path.trim());
            return String(value ?? '');
        });
    }
}

// AI Completion 节点 (简单补全，无对话历史)
class AICompletionNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        const startTime = Date.now();
        const config = node.config as {
            providerId?: string;
            credentialId?: string;
            model?: string;
            prompt?: string;
            temperature?: number;
            maxTokens?: number;
        };

        const prompt = this.interpolateTemplate(config.prompt ?? '', context);

        const adapter = await adapterRegistry.createAdapter(
            1,
            config.providerId ?? 'openai',
            config.credentialId
        );

        const result = await adapter.chat(
            [{ role: 'user', content: prompt }],
            { model: config.model, temperature: config.temperature, maxTokens: config.maxTokens }
        );

        return {
            success: true,
            output: result.text,
            tokensUsed: result.tokens.total,
            latencyMs: Date.now() - startTime
        };
    }

    private interpolateTemplate(template: string, context: RunContext): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = getValueByPath({ ...context.variables, ...context.nodeOutputs }, path.trim());
            return String(value ?? '');
        });
    }
}

// Code 节点
class CodeNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        const startTime = Date.now();
        const config = node.config as {
            language?: string;
            code?: string;
            inputMapping?: Record<string, string>;
        };

        // 安全执行 JavaScript（基础沙箱）
        // 注意：生产环境应使用 Docker/gVisor 沙箱
        const code = config.code ?? '';

        try {
            // 创建受限执行环境
            const inputs = this.resolveInputs(config.inputMapping ?? {}, context);
            const func = new Function('inputs', 'context', `
                "use strict";
                ${code}
            `);

            const output = func(inputs, {
                variables: context.variables,
                nodeOutputs: context.nodeOutputs
            });

            return {
                success: true,
                output,
                latencyMs: Date.now() - startTime
            };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Code execution failed',
                latencyMs: Date.now() - startTime
            };
        }
    }

    private resolveInputs(mapping: Record<string, string>, context: RunContext): Record<string, unknown> {
        const inputs: Record<string, unknown> = {};
        for (const [key, path] of Object.entries(mapping)) {
            inputs[key] = getValueByPath({ ...context.variables, ...context.nodeOutputs }, path);
        }
        return inputs;
    }

}

// HTTP 节点
class HTTPNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        const startTime = Date.now();
        const config = node.config as {
            url?: string;
            method?: string;
            headers?: Record<string, string>;
            body?: unknown;
            timeout?: number;
        };

        const url = this.interpolateTemplate(config.url ?? '', context);
        const method = (config.method ?? 'GET').toUpperCase();
        const headers = this.interpolateHeaders(config.headers ?? {}, context);
        const body = this.interpolateBody(config.body, context);

        try {
            const response = await axios({
                url,
                method,
                headers,
                data: body,
                timeout: config.timeout ?? 30000
            });

            return {
                success: true,
                output: {
                    status: response.status,
                    headers: response.headers,
                    data: response.data
                },
                latencyMs: Date.now() - startTime
            };
        } catch (err) {
            const axiosErr = err as { response?: { status: number; data: unknown } };
            return {
                success: false,
                error: err instanceof Error ? err.message : 'HTTP request failed',
                output: axiosErr.response ? {
                    status: axiosErr.response.status,
                    data: axiosErr.response.data
                } : undefined,
                latencyMs: Date.now() - startTime
            };
        }
    }

    private interpolateTemplate(template: string, context: RunContext): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = getValueByPath({ ...context.variables, ...context.nodeOutputs }, path.trim());
            return String(value ?? '');
        });
    }

    private interpolateHeaders(headers: Record<string, string>, context: RunContext): Record<string, string> {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(headers)) {
            result[key] = this.interpolateTemplate(value, context);
        }
        return result;
    }

    private interpolateBody(body: unknown, context: RunContext): unknown {
        if (typeof body === 'string') {
            return this.interpolateTemplate(body, context);
        }
        if (typeof body === 'object' && body !== null) {
            return JSON.parse(this.interpolateTemplate(JSON.stringify(body), context));
        }
        return body;
    }
}

// Condition 节点
class ConditionNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        const config = node.config as {
            conditions?: Array<{ expression: string; targetNodeId: string }>;
            defaultTargetNodeId?: string;
        };

        const conditions = config.conditions ?? [];

        for (const cond of conditions) {
            try {
                const result = this.evaluateExpression(cond.expression, context);
                if (result) {
                    return {
                        success: true,
                        output: { matched: cond.expression },
                        nextNodes: [cond.targetNodeId],
                        latencyMs: 0
                    };
                }
            } catch {
                // 表达式求值失败，继续下一个
            }
        }

        // 默认分支
        return {
            success: true,
            output: { matched: 'default' },
            nextNodes: config.defaultTargetNodeId ? [config.defaultTargetNodeId] : [],
            latencyMs: 0
        };
    }

    private evaluateExpression(expression: string, context: RunContext): boolean {
        const func = new Function('variables', 'nodeOutputs', `
            "use strict";
            return (${expression});
        `);
        return Boolean(func(context.variables, context.nodeOutputs));
    }
}

// Transform 节点
class TransformNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        const config = node.config as {
            transformCode?: string;
            inputMapping?: Record<string, string>;
        };

        try {
            const inputs = this.resolveInputs(config.inputMapping ?? {}, context);
            const func = new Function('inputs', 'context', `
                "use strict";
                ${config.transformCode ?? 'return inputs;'}
            `);

            const output = func(inputs, {
                variables: context.variables,
                nodeOutputs: context.nodeOutputs
            });

            return {
                success: true,
                output,
                latencyMs: 0
            };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Transform failed',
                latencyMs: 0
            };
        }
    }

    private resolveInputs(mapping: Record<string, string>, context: RunContext): Record<string, unknown> {
        const inputs: Record<string, unknown> = {};
        for (const [key, path] of Object.entries(mapping)) {
            inputs[key] = getValueByPath({ ...context.variables, ...context.nodeOutputs }, path);
        }
        return inputs;
    }

}

// Delay 节点
class DelayNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode): Promise<NodeExecutionResult> {
        const config = node.config as { delayMs?: number };
        const delayMs = config.delayMs ?? 1000;

        await new Promise(resolve => setTimeout(resolve, delayMs));

        return {
            success: true,
            output: { delayed: delayMs },
            latencyMs: delayMs
        };
    }
}

// Validator 节点
class ValidatorNodeExecutor implements INodeExecutor {
    canExecute(): boolean {
        return true;
    }

    async execute(node: WorkflowNode, context: RunContext): Promise<NodeExecutionResult> {
        const config = node.config as {
            validations?: Array<{
                field: string;
                rule: string;
                message?: string;
            }>;
        };

        const validations = config.validations ?? [];
        const errors: string[] = [];

        for (const validation of validations) {
            const value = getValueByPath(
                { ...context.variables, ...context.nodeOutputs },
                validation.field
            );

            const isValid = this.checkRule(value, validation.rule);
            if (!isValid) {
                errors.push(validation.message ?? `Validation failed for ${validation.field}`);
            }
        }

        if (errors.length > 0) {
            return {
                success: false,
                error: errors.join('; '),
                output: { errors },
                latencyMs: 0
            };
        }

        return {
            success: true,
            output: { valid: true },
            latencyMs: 0
        };
    }

    private checkRule(value: unknown, rule: string): boolean {
        switch (rule) {
            case 'required':
                return value !== undefined && value !== null && value !== '';
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                // 自定义规则表达式
                try {
                    const func = new Function('value', `"use strict"; return (${rule});`);
                    return Boolean(func(value));
                } catch {
                    return false;
                }
        }
    }

}
