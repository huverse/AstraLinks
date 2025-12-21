/**
 * 变量解析器
 * 
 * @module core/workflow/variableResolver
 * @description 解析工作流中的变量引用，支持多种语法
 * 
 * 支持的语法:
 * - {{nodeId.output}} - 引用节点输出
 * - {{nodeId.output.field}} - 引用节点输出的字段
 * - {{variables.xxx}} - 引用全局变量
 * - {{input}} - 引用工作流输入
 * - {{input.field}} - 引用工作流输入的字段
 */

// ============================================
// 类型定义
// ============================================

export interface VariableContext {
    input?: any;                              // 工作流输入
    variables?: Record<string, any>;          // 全局变量
    nodeOutputs?: Record<string, any>;        // 各节点输出 { nodeId: output }
    env?: Record<string, string>;             // 环境变量
}

export interface ParsedVariable {
    raw: string;           // 原始字符串 {{xxx}}
    path: string[];        // 解析后的路径 ['nodeId', 'output', 'field']
    type: 'node' | 'variable' | 'input' | 'env';
    nodeId?: string;       // 如果是节点引用，节点ID
}

export interface AvailableVariable {
    label: string;         // 显示名称
    value: string;         // 插入值 {{xxx}}
    type: 'node' | 'variable' | 'input' | 'env';
    nodeId?: string;
    description?: string;
}

// ============================================
// 变量解析正则
// ============================================

// 匹配 {{xxx}} 格式
const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

// ============================================
// 解析单个变量
// ============================================

export function parseVariable(match: string): ParsedVariable {
    // 移除 {{ 和 }}
    const content = match.slice(2, -2).trim();
    const parts = content.split('.');

    let type: ParsedVariable['type'] = 'node';
    let nodeId: string | undefined;

    if (parts[0] === 'input') {
        type = 'input';
    } else if (parts[0] === 'variables') {
        type = 'variable';
    } else if (parts[0] === 'env') {
        type = 'env';
    } else {
        // 假设是节点ID
        type = 'node';
        nodeId = parts[0];
    }

    return {
        raw: match,
        path: parts,
        type,
        nodeId
    };
}

// ============================================
// 从上下文获取值
// ============================================

function getValueFromPath(obj: any, path: string[]): any {
    if (obj === undefined || obj === null) return undefined;

    let current = obj;
    for (const key of path) {
        if (current === undefined || current === null) return undefined;
        if (typeof current !== 'object') return undefined;
        current = current[key];
    }
    return current;
}

export function resolveVariable(parsed: ParsedVariable, context: VariableContext): any {
    const { path, type, nodeId } = parsed;

    switch (type) {
        case 'input':
            // {{input}} 或 {{input.field}}
            if (path.length === 1) {
                return context.input;
            }
            return getValueFromPath(context.input, path.slice(1));

        case 'variable':
            // {{variables.xxx}} 或 {{variables.xxx.field}}
            if (path.length === 1) {
                return context.variables;
            }
            return getValueFromPath(context.variables, path.slice(1));

        case 'env':
            // {{env.XXX}}
            if (path.length === 1) {
                return context.env;
            }
            const envKey = path[1];
            return context.env?.[envKey] ?? process?.env?.[envKey];

        case 'node':
            // {{nodeId.output}} 或 {{nodeId.output.field}}
            if (!nodeId || !context.nodeOutputs) return undefined;
            const nodeOutput = context.nodeOutputs[nodeId];
            if (path.length === 1) {
                return nodeOutput;
            }
            return getValueFromPath(nodeOutput, path.slice(1));

        default:
            return undefined;
    }
}

// ============================================
// 解析并替换字符串中的所有变量
// ============================================

export function resolveVariables(template: string, context: VariableContext): string {
    if (!template || typeof template !== 'string') {
        return template;
    }

    return template.replace(VARIABLE_PATTERN, (match) => {
        try {
            const parsed = parseVariable(match);
            const value = resolveVariable(parsed, context);

            // 如果值是对象或数组，转为JSON字符串
            if (value !== undefined && value !== null) {
                if (typeof value === 'object') {
                    return JSON.stringify(value);
                }
                return String(value);
            }

            // 未找到变量，保留原始引用
            return match;
        } catch (e) {
            console.warn('[VariableResolver] Failed to resolve:', match, e);
            return match;
        }
    });
}

// ============================================
// 解析任意值中的变量（递归处理对象和数组）
// ============================================

export function resolveDeep(value: any, context: VariableContext): any {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        // 如果整个字符串就是一个变量引用，返回原始类型
        const fullMatch = value.match(/^\{\{([^}]+)\}\}$/);
        if (fullMatch) {
            const parsed = parseVariable(value);
            const resolved = resolveVariable(parsed, context);
            return resolved !== undefined ? resolved : value;
        }
        // 否则做字符串替换
        return resolveVariables(value, context);
    }

    if (Array.isArray(value)) {
        return value.map(item => resolveDeep(item, context));
    }

    if (typeof value === 'object') {
        const result: Record<string, any> = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = resolveDeep(val, context);
        }
        return result;
    }

    return value;
}

// ============================================
// 提取字符串中的所有变量引用
// ============================================

export function extractVariables(template: string): ParsedVariable[] {
    if (!template || typeof template !== 'string') {
        return [];
    }

    const variables: ParsedVariable[] = [];
    let match;

    const pattern = new RegExp(VARIABLE_PATTERN.source, 'g');
    while ((match = pattern.exec(template)) !== null) {
        variables.push(parseVariable(match[0]));
    }

    return variables;
}

// ============================================
// 生成可用变量列表（用于UI选择器）
// ============================================

export function getAvailableVariables(
    nodes: Array<{ id: string; type: string; data: { label?: string } }>,
    currentNodeId: string,
    variables?: Record<string, any>
): AvailableVariable[] {
    const available: AvailableVariable[] = [];

    // 1. 工作流输入
    available.push({
        label: '工作流输入',
        value: '{{input}}',
        type: 'input',
        description: '整个工作流的输入数据'
    });

    // 2. 全局变量
    if (variables) {
        for (const key of Object.keys(variables)) {
            available.push({
                label: `变量: ${key}`,
                value: `{{variables.${key}}}`,
                type: 'variable',
                description: `全局变量 ${key}`
            });
        }
    }

    // 3. 前置节点输出
    for (const node of nodes) {
        // 跳过当前节点和开始节点
        if (node.id === currentNodeId) continue;
        if (node.type === 'start') continue;

        const label = node.data?.label || node.type;

        // 基础输出
        available.push({
            label: `${label} 输出`,
            value: `{{${node.id}}}`,
            type: 'node',
            nodeId: node.id,
            description: `节点 "${label}" 的输出`
        });

        // 根据节点类型添加常用字段
        if (node.type === 'ai') {
            available.push({
                label: `${label} → 文本`,
                value: `{{${node.id}.text}}`,
                type: 'node',
                nodeId: node.id,
                description: 'AI 回复文本'
            });
            available.push({
                label: `${label} → tokens`,
                value: `{{${node.id}.usage.total_tokens}}`,
                type: 'node',
                nodeId: node.id,
                description: 'Token 消耗'
            });
        }

        if (node.type === 'http') {
            available.push({
                label: `${label} → 数据`,
                value: `{{${node.id}.data}}`,
                type: 'node',
                nodeId: node.id,
                description: 'HTTP 响应数据'
            });
            available.push({
                label: `${label} → 状态码`,
                value: `{{${node.id}.status}}`,
                type: 'node',
                nodeId: node.id,
                description: 'HTTP 状态码'
            });
        }

        if (node.type === 'code') {
            available.push({
                label: `${label} → 结果`,
                value: `{{${node.id}.result}}`,
                type: 'node',
                nodeId: node.id,
                description: '代码执行结果'
            });
        }

        if (node.type === 'input') {
            available.push({
                label: `${label} → 值`,
                value: `{{${node.id}.value}}`,
                type: 'node',
                nodeId: node.id,
                description: '用户输入值'
            });
        }
    }

    // 4. 常用环境变量
    available.push({
        label: '环境: NODE_ENV',
        value: '{{env.NODE_ENV}}',
        type: 'env',
        description: '运行环境'
    });

    return available;
}

// ============================================
// 验证变量引用是否有效
// ============================================

export function validateVariable(
    parsed: ParsedVariable,
    nodes: Array<{ id: string }>,
    variables?: Record<string, any>
): { valid: boolean; error?: string } {
    switch (parsed.type) {
        case 'input':
            return { valid: true };

        case 'variable':
            if (parsed.path.length < 2) {
                return { valid: false, error: '变量名不能为空' };
            }
            const varName = parsed.path[1];
            if (variables && !(varName in variables)) {
                return { valid: false, error: `变量 "${varName}" 不存在` };
            }
            return { valid: true };

        case 'env':
            return { valid: true }; // 环境变量在运行时检查

        case 'node':
            if (!parsed.nodeId) {
                return { valid: false, error: '节点ID不能为空' };
            }
            const nodeExists = nodes.some(n => n.id === parsed.nodeId);
            if (!nodeExists) {
                return { valid: false, error: `节点 "${parsed.nodeId}" 不存在` };
            }
            return { valid: true };

        default:
            return { valid: false, error: '未知变量类型' };
    }
}
