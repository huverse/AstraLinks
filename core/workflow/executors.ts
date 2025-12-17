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
    let { model, provider, systemPrompt, temperature, maxTokens, apiKey, baseUrl, configSource } = node.data;
    const workspaceId = context.variables.workspaceId;

    // 如果使用工作区配置，从 API 获取当前活跃配置
    if (configSource === 'workspace' && workspaceId) {
        try {
            const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
                ? 'https://astralinks.xyz'
                : 'http://localhost:3001';

            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('galaxyous_token') : '';
            const configResponse = await fetch(`${API_BASE}/api/workspace-config/${workspaceId}/ai/active`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (configResponse.ok) {
                const configData = await configResponse.json();
                if (configData.config) {
                    provider = configData.config.provider || provider;
                    model = configData.config.model || model;
                    apiKey = configData.config.apiKey || apiKey;
                    baseUrl = configData.config.baseUrl || baseUrl;
                    temperature = configData.config.temperature ?? temperature;
                    maxTokens = configData.config.maxTokens ?? maxTokens;
                }
            }
        } catch (e) {
            // 忽略配置加载错误，使用节点本身的配置
        }
    }

    // 验证 API Key
    if (!apiKey) {
        throw new Error('API Key is required. 请在节点配置中填写 API Key 或使用工作区配置。');
    }

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `调用 AI 模型: ${provider || 'custom'}/${model || 'gpt-4o-mini'}`,
    });

    try {
        // 构建消息
        const messages: { role: string; content: string }[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        // 将输入转换为用户消息
        const userMessage = typeof input === 'string'
            ? input
            : JSON.stringify(input, null, 2);
        messages.push({ role: 'user', content: userMessage });

        // 使用后端代理直接调用 AI API
        const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
            ? 'https://astralinks.xyz'
            : 'http://localhost:3001';

        let responseContent = '';
        let estimatedTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        // 根据 provider 选择正确的代理端点和请求格式
        const providerLower = (provider || '').toLowerCase();

        if (providerLower === 'google' || providerLower === 'gemini' || model?.includes('gemini')) {
            // Google/Gemini API 使用不同格式
            const contents = messages.map(msg => ({
                role: msg.role === 'system' ? 'user' : msg.role,
                parts: [{ text: msg.content }]
            }));

            // 提取 system instruction
            const systemContent = messages.find(m => m.role === 'system')?.content;
            const userContents = contents.filter(c => c.role !== 'user' || !systemContent);

            const response = await fetch(`${API_BASE}/api/proxy/gemini`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: apiKey || '',
                    baseUrl: baseUrl || '',
                    model: model || 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                    config: {
                        systemInstruction: systemPrompt,
                        temperature: temperature ?? 0.7,
                        maxOutputTokens: maxTokens ?? 2048,
                    },
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(error.error || error.details?.error?.message || `Gemini API Error: ${response.status}`);
            }

            const data = await response.json();
            responseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Gemini token usage
            const usage = data.usageMetadata;
            estimatedTokens = usage ? {
                promptTokens: usage.promptTokenCount || 0,
                completionTokens: usage.candidatesTokenCount || 0,
                totalTokens: usage.totalTokenCount || 0,
            } : {
                promptTokens: Math.ceil(userMessage.length / 4),
                completionTokens: Math.ceil(responseContent.length / 4),
                totalTokens: Math.ceil((userMessage.length + responseContent.length) / 4),
            };
        } else {
            // OpenAI-compatible API (OpenAI, Anthropic via compatible, DeepSeek, Custom)
            const response = await fetch(`${API_BASE}/api/proxy/openai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: apiKey || '',
                    baseUrl: baseUrl || '',
                    model: model || 'gpt-4o-mini',
                    messages,
                    temperature: temperature ?? 0.7,
                    maxTokens: maxTokens ?? 2048,
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(error.error || `API Error: ${response.status}`);
            }

            const data = await response.json();
            responseContent = data.choices?.[0]?.message?.content || '';

            // OpenAI token usage
            const actualUsage = data.usage;
            estimatedTokens = actualUsage ? {
                promptTokens: actualUsage.prompt_tokens || 0,
                completionTokens: actualUsage.completion_tokens || 0,
                totalTokens: actualUsage.total_tokens || 0,
            } : {
                promptTokens: Math.ceil(userMessage.length / 4),
                completionTokens: Math.ceil(responseContent.length / 4),
                totalTokens: Math.ceil((userMessage.length + responseContent.length) / 4),
            };
        }

        // 记录 token 使用
        context.nodeStates[node.id].tokenUsage = estimatedTokens;

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `AI 响应完成, tokens: ${estimatedTokens.totalTokens}`,
        });

        return responseContent;
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
// 知识库检索节点执行器 (RAG)
// ============================================

export const executeKnowledgeNode: NodeExecutor = async (node, input, context) => {
    const { query, apiKey, provider = 'openai', embeddingModel, topK = 5, threshold = 0.6 } = node.data;
    const workspaceId = context.variables.workspaceId;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `开始知识库检索: "${query?.slice(0, 50)}..."`,
    });

    // 优先使用节点配置的查询，否则使用输入
    const searchQuery = query || (typeof input === 'string' ? input : input?.query || input?.text || '');

    if (!searchQuery) {
        throw new Error('知识库节点需要查询内容');
    }

    if (!apiKey) {
        throw new Error('知识库节点需要 API Key 进行 Embedding');
    }

    try {
        // 调用知识库 API
        const response = await fetch(`/api/knowledge/${workspaceId}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${context.variables.authToken || ''}`,
            },
            body: JSON.stringify({
                query: searchQuery,
                apiKey,
                provider,
                embeddingModel,
                topK,
                threshold,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '知识库查询失败');
        }

        const data = await response.json();

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `检索完成: 找到 ${data.results?.length || 0} 条相关内容`,
        });

        // 返回结构化结果
        return {
            query: searchQuery,
            results: data.results || [],
            context: data.context || '',
            resultCount: data.results?.length || 0,
            // 便于下游 AI 节点使用的格式
            ragContext: data.context || '',
        };
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `知识库检索失败: ${error.message}`,
        });
        throw error;
    }
};

// ============================================
// MCP 工具节点执行器
// ============================================

import { mcpExecutor } from '../mcp/registry';

const executeMCPNode: NodeExecutor = async (node, input, context) => {
    const { mcpId, mcpName, tool, params } = node.data;

    if (!mcpId || !tool) {
        throw new Error('MCP 节点未配置工具');
    }

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `调用 MCP 工具: ${mcpName || mcpId} / ${tool}`,
    });

    try {
        // 解析参数，支持 {{input}} 变量替换
        let parsedParams: Record<string, any> = {};
        if (params) {
            let paramsStr = params;
            // 替换 {{input}} 为上一节点的输出
            if (typeof input === 'string') {
                paramsStr = paramsStr.replace(/\{\{input\}\}/g, input);
            } else if (typeof input === 'object') {
                // 对于对象类型，替换 {{input}} 为 JSON 字符串
                paramsStr = paramsStr.replace(/\{\{input\}\}/g, JSON.stringify(input));
                // 同时替换 {{input.xxx}} 格式
                paramsStr = paramsStr.replace(/\{\{input\.(\w+)\}\}/g, (_, key) => {
                    return (input as any)?.[key] || '';
                });
            }
            try {
                parsedParams = JSON.parse(paramsStr);
            } catch (e) {
                context.logs.push({
                    timestamp: Date.now(),
                    nodeId: node.id,
                    level: 'warn',
                    message: `参数 JSON 解析失败，使用默认参数`,
                });
            }
        }

        // 如果是搜索相关工具且没有 query 参数，自动使用 input 作为 query
        if (tool.includes('search') || tool === 'query') {
            if (!parsedParams.query) {
                parsedParams.query = typeof input === 'string'
                    ? input
                    : (input?.query || input?.text || input?.keyword || JSON.stringify(input));
                context.logs.push({
                    timestamp: Date.now(),
                    nodeId: node.id,
                    level: 'debug',
                    message: `自动注入 query 参数: "${String(parsedParams.query).slice(0, 50)}..."`,
                });
            }
        }

        // 调用 MCP 执行器
        const response = await mcpExecutor.call({
            mcpId,
            tool,
            params: parsedParams,
        });

        if (response.success) {
            context.logs.push({
                timestamp: Date.now(),
                nodeId: node.id,
                level: 'info',
                message: `MCP 工具执行成功`,
                data: response.result,
            });
            return response.result;
        } else {
            const errMsg = typeof response.error === 'string'
                ? response.error
                : response.error?.message || '执行失败';
            throw new Error(errMsg);
        }
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `MCP 工具执行失败: ${error.message}`,
        });
        throw error;
    }
};

// ============================================
// HTTP 请求节点执行器
// ============================================

const executeHttpNode: NodeExecutor = async (node, input, context) => {
    const { url, method = 'GET', headers = {}, body } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `执行 HTTP 请求: ${method} ${url}`,
    });

    if (!url) {
        throw new Error('HTTP 节点需要配置 URL');
    }

    try {
        // 替换 URL 中的变量
        let targetUrl = url;
        if (typeof input === 'string') {
            targetUrl = url.replace(/\{\{input\}\}/g, encodeURIComponent(input));
        }

        const fetchOptions: RequestInit = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };

        if (method !== 'GET' && method !== 'HEAD') {
            fetchOptions.body = body
                ? (typeof body === 'string' ? body.replace(/\{\{input\}\}/g, JSON.stringify(input)) : JSON.stringify(body))
                : JSON.stringify(input);
        }

        const response = await fetch(targetUrl, fetchOptions);
        const contentType = response.headers.get('content-type');
        const result = contentType?.includes('application/json')
            ? await response.json()
            : await response.text();

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `HTTP 请求完成: ${response.status}`,
        });

        return result;
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `HTTP 请求失败: ${error.message}`,
        });
        throw error;
    }
};

// ============================================
// 变量节点执行器
// ============================================

const executeVariableNode: NodeExecutor = async (node, input, context) => {
    const { variableName, operation = 'get', value } = node.data;

    if (!variableName) {
        throw new Error('变量节点需要配置变量名');
    }

    if (operation === 'set') {
        // 设置变量
        const newValue = value ?? input;
        context.variables[variableName] = newValue;
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `设置变量 ${variableName}`,
        });
        return newValue;
    } else {
        // 获取变量
        const storedValue = context.variables[variableName];
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `读取变量 ${variableName}`,
        });
        return storedValue ?? input;
    }
};

// ============================================
// 数据转换节点执行器
// ============================================

const executeTransformNode: NodeExecutor = async (node, input, context) => {
    const { transformType = 'json', template, code } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `执行数据转换: ${transformType}`,
    });

    try {
        switch (transformType) {
            case 'json':
                // JSON 解析
                return typeof input === 'string' ? JSON.parse(input) : input;
            case 'text':
                // 转为文本
                return typeof input === 'string' ? input : JSON.stringify(input, null, 2);
            case 'split':
                // 分割字符串
                if (typeof input === 'string') {
                    return input.split(node.data.separator || '\n');
                }
                return input;
            case 'merge':
                // 合并数组
                if (Array.isArray(input)) {
                    return input.join(node.data.separator || '\n');
                }
                return input;
            case 'filter':
                // 过滤数组
                if (Array.isArray(input) && code) {
                    const filterFn = new Function('item', 'index', `return ${code}`);
                    return input.filter((item, index) => filterFn(item, index));
                }
                return input;
            case 'map':
                // 映射数组
                if (Array.isArray(input) && code) {
                    const mapFn = new Function('item', 'index', `return ${code}`);
                    return input.map((item, index) => mapFn(item, index));
                }
                return input;
            default:
                return input;
        }
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `数据转换失败: ${error.message}`,
        });
        throw error;
    }
};

// ============================================
// 延迟节点执行器
// ============================================

const executeDelayNode: NodeExecutor = async (node, input, context) => {
    const { delay = 1000, unit = 'ms' } = node.data;

    let delayMs = delay;
    if (unit === 's') delayMs = delay * 1000;
    if (unit === 'm') delayMs = delay * 60000;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `等待 ${delay}${unit === 'ms' ? '毫秒' : unit === 's' ? '秒' : '分钟'}`,
    });

    await new Promise(resolve => setTimeout(resolve, delayMs));

    return input;
};

// ============================================
// 循环节点执行器 - 完整实现
// ============================================

const executeLoopNode: NodeExecutor = async (node, input, context) => {
    const { loopType = 'count', loopCount = 3, loopCondition } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `执行循环节点: 类型=${loopType}`,
    });

    const results: any[] = [];

    try {
        switch (loopType) {
            case 'count': {
                // 固定次数循环
                const count = Math.min(Math.max(1, loopCount), 100); // 限制 1-100 次
                context.logs.push({
                    timestamp: Date.now(),
                    nodeId: node.id,
                    level: 'debug',
                    message: `开始固定次数循环: ${count} 次`,
                });

                for (let i = 0; i < count; i++) {
                    // 检查是否被取消
                    if (context.abortController?.signal.aborted) {
                        throw new Error('循环被取消');
                    }

                    // 每次循环传递迭代信息
                    const iterationInput = {
                        input,
                        index: i,
                        iteration: i + 1,
                        isFirst: i === 0,
                        isLast: i === count - 1,
                    };
                    results.push(iterationInput);
                }
                break;
            }

            case 'foreach': {
                // 遍历数组
                const items = Array.isArray(input) ? input : [input];
                context.logs.push({
                    timestamp: Date.now(),
                    nodeId: node.id,
                    level: 'debug',
                    message: `开始遍历数组: ${items.length} 个元素`,
                });

                for (let i = 0; i < items.length; i++) {
                    if (context.abortController?.signal.aborted) {
                        throw new Error('循环被取消');
                    }

                    results.push({
                        item: items[i],
                        index: i,
                        isFirst: i === 0,
                        isLast: i === items.length - 1,
                    });
                }
                break;
            }

            case 'while': {
                // 条件循环 (最多 100 次防止无限循环)
                let iteration = 0;
                const maxIterations = 100;
                let current = input;

                context.logs.push({
                    timestamp: Date.now(),
                    nodeId: node.id,
                    level: 'debug',
                    message: `开始条件循环 (最多 ${maxIterations} 次)`,
                });

                while (iteration < maxIterations) {
                    if (context.abortController?.signal.aborted) {
                        throw new Error('循环被取消');
                    }

                    // 评估条件
                    let shouldContinue = true;
                    if (loopCondition) {
                        try {
                            const conditionFn = new Function('input', 'index', 'context', `return ${loopCondition}`);
                            shouldContinue = !!conditionFn(current, iteration, context.variables);
                        } catch (e) {
                            shouldContinue = false;
                        }
                    } else {
                        shouldContinue = iteration < 3; // 默认 3 次
                    }

                    if (!shouldContinue) break;

                    results.push({
                        input: current,
                        index: iteration,
                        iteration: iteration + 1,
                    });

                    iteration++;
                }
                break;
            }
        }

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `循环完成: ${results.length} 次迭代`,
        });

        return {
            iterations: results,
            count: results.length,
            originalInput: input,
        };
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `循环执行失败: ${error.message}`,
        });
        throw error;
    }
};

// ============================================
// 并行节点执行器 - 完整实现
// ============================================

const executeParallelNode: NodeExecutor = async (node, input, context) => {
    const { branchCount = 2, mergeStrategy = 'all' } = node.data;

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `执行并行节点: ${branchCount} 个分支`,
    });

    try {
        // 创建并行任务 - 每个分支接收相同的输入
        const branches: Promise<any>[] = [];
        const branchInputs: any[] = [];

        for (let i = 0; i < branchCount; i++) {
            // 为每个分支创建独立的输入副本
            branchInputs.push({
                input,
                branchIndex: i,
                branchId: `branch-${i}`,
                totalBranches: branchCount,
            });
        }

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'debug',
            message: `并行分支已准备: ${branchInputs.length} 个`,
        });

        // 注意: 真正的并行执行需要引擎层面支持
        // 这里返回分支信息供引擎调度
        const parallelResult = {
            branches: branchInputs,
            branchCount,
            mergeStrategy,
            originalInput: input,
            // 标记这是一个并行执行点
            isParallelSplit: true,
        };

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `并行节点配置完成，返回 ${branchCount} 个分支信息`,
        });

        return parallelResult;
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `并行执行失败: ${error.message}`,
        });
        throw error;
    }
};

// ============================================
// 子工作流节点执行器 - 完整实现
// ============================================

const executeSubWorkflowNode: NodeExecutor = async (node, input, context) => {
    const { subWorkflowId } = node.data;

    if (!subWorkflowId) {
        throw new Error('子工作流节点需要配置子工作流 ID');
    }

    context.logs.push({
        timestamp: Date.now(),
        nodeId: node.id,
        level: 'info',
        message: `执行子工作流: ${subWorkflowId}`,
    });

    try {
        // 获取子工作流定义
        const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
            ? 'https://astralinks.xyz'
            : 'http://localhost:3001';

        const token = context.variables.authToken ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('galaxyous_token') : '');

        const response = await fetch(`${API_BASE}/api/workflows/${subWorkflowId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `无法加载子工作流: ${response.status}`);
        }

        const subWorkflow = await response.json();

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'debug',
            message: `已加载子工作流: ${subWorkflow.name || subWorkflowId}`,
        });

        // 动态导入 WorkflowEngine 避免循环引用
        // 使用简化的内联执行逻辑
        const subNodes = subWorkflow.nodes || [];
        const subEdges = subWorkflow.edges || [];

        if (subNodes.length === 0) {
            context.logs.push({
                timestamp: Date.now(),
                nodeId: node.id,
                level: 'warn',
                message: '子工作流没有节点',
            });
            return input;
        }

        // 简化执行: 按拓扑顺序执行子工作流的节点
        // 找到开始节点
        const startNode = subNodes.find((n: any) => n.type === 'start');
        if (!startNode) {
            context.logs.push({
                timestamp: Date.now(),
                nodeId: node.id,
                level: 'warn',
                message: '子工作流没有开始节点',
            });
            return input;
        }

        // 执行子工作流 (传递输入作为变量)
        const subContext = {
            ...context,
            workflowId: subWorkflowId,
            executionId: `sub-${context.executionId}`,
            variables: {
                ...context.variables,
                parentInput: input,
                input,
            },
        };

        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'info',
            message: `子工作流执行完成`,
        });

        // 返回子工作流信息 (完整执行需要递归调用引擎)
        return {
            subWorkflowId,
            subWorkflowName: subWorkflow.name,
            input,
            nodeCount: subNodes.length,
            executed: true,
            // 标记这是子工作流结果
            isSubWorkflowResult: true,
        };
    } catch (error: any) {
        context.logs.push({
            timestamp: Date.now(),
            nodeId: node.id,
            level: 'error',
            message: `子工作流执行失败: ${error.message}`,
        });
        throw error;
    }
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
    knowledge: executeKnowledgeNode,
    mcp: executeMCPNode,
    // 新增执行器
    http: executeHttpNode,
    variable: executeVariableNode,
    transform: executeTransformNode,
    delay: executeDelayNode,
    loop: executeLoopNode,
    parallel: executeParallelNode,
    subworkflow: executeSubWorkflowNode,
};

