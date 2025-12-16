/**
 * 工作流模板库
 * 
 * @module core/workflow/templates
 * @description 预设工作流模板
 */

import { Node, Edge } from 'reactflow';

// ============================================
// 类型定义
// ============================================

export interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    category: 'ai' | 'data' | 'automation' | 'integration';
    icon: string;
    nodes: Node[];
    edges: Edge[];
}

// ============================================
// 模板列表
// ============================================

export const workflowTemplates: WorkflowTemplate[] = [
    // ============================================
    // AI 写作助手
    // ============================================
    {
        id: 'ai-writer',
        name: 'AI 写作助手',
        description: '输入主题，自动生成结构化文章',
        category: 'ai',
        icon: '✍️',
        nodes: [
            {
                id: 'start-1',
                type: 'start',
                position: { x: 250, y: 50 },
                data: { label: '开始' },
            },
            {
                id: 'input-1',
                type: 'input',
                position: { x: 250, y: 150 },
                data: { label: '输入主题', placeholder: '请输入文章主题...' },
            },
            {
                id: 'ai-outline',
                type: 'ai',
                position: { x: 250, y: 280 },
                data: {
                    label: '生成大纲',
                    model: 'gpt-4o-mini',
                    systemPrompt: '你是一个写作助手。请根据用户提供的主题，生成一个详细的文章大纲，包含 3-5 个主要章节。',
                },
            },
            {
                id: 'ai-content',
                type: 'ai',
                position: { x: 250, y: 410 },
                data: {
                    label: '撰写正文',
                    model: 'gpt-4o-mini',
                    systemPrompt: '你是一个专业作家。请根据提供的大纲，撰写完整的文章内容。确保内容充实、逻辑清晰。',
                },
            },
            {
                id: 'output-1',
                type: 'output',
                position: { x: 250, y: 540 },
                data: { label: '文章输出', format: 'markdown' },
            },
            {
                id: 'end-1',
                type: 'end',
                position: { x: 250, y: 640 },
                data: { label: '结束' },
            },
        ],
        edges: [
            { id: 'e1', source: 'start-1', target: 'input-1', animated: true },
            { id: 'e2', source: 'input-1', target: 'ai-outline', animated: true },
            { id: 'e3', source: 'ai-outline', target: 'ai-content', animated: true },
            { id: 'e4', source: 'ai-content', target: 'output-1', animated: true },
            { id: 'e5', source: 'output-1', target: 'end-1', animated: true },
        ],
    },

    // ============================================
    // 智能问答
    // ============================================
    {
        id: 'smart-qa',
        name: '智能问答',
        description: '结合知识库的 RAG 问答系统',
        category: 'ai',
        icon: '🤖',
        nodes: [
            {
                id: 'start-1',
                type: 'start',
                position: { x: 250, y: 50 },
                data: { label: '开始' },
            },
            {
                id: 'input-1',
                type: 'input',
                position: { x: 250, y: 150 },
                data: { label: '用户问题' },
            },
            {
                id: 'knowledge-1',
                type: 'knowledge',
                position: { x: 250, y: 280 },
                data: { label: '知识库检索', topK: 5 },
            },
            {
                id: 'ai-answer',
                type: 'ai',
                position: { x: 250, y: 410 },
                data: {
                    label: 'AI 回答',
                    model: 'gpt-4o-mini',
                    systemPrompt: '你是一个知识助手。请根据检索到的参考资料回答用户的问题。如果资料不足，请如实说明。',
                },
            },
            {
                id: 'output-1',
                type: 'output',
                position: { x: 250, y: 540 },
                data: { label: '答案输出' },
            },
            {
                id: 'end-1',
                type: 'end',
                position: { x: 250, y: 640 },
                data: { label: '结束' },
            },
        ],
        edges: [
            { id: 'e1', source: 'start-1', target: 'input-1', animated: true },
            { id: 'e2', source: 'input-1', target: 'knowledge-1', animated: true },
            { id: 'e3', source: 'knowledge-1', target: 'ai-answer', animated: true },
            { id: 'e4', source: 'ai-answer', target: 'output-1', animated: true },
            { id: 'e5', source: 'output-1', target: 'end-1', animated: true },
        ],
    },

    // ============================================
    // 数据处理流水线
    // ============================================
    {
        id: 'data-pipeline',
        name: '数据处理流水线',
        description: 'API 数据获取 → 转换 → 存储',
        category: 'data',
        icon: '🔄',
        nodes: [
            {
                id: 'start-1',
                type: 'start',
                position: { x: 250, y: 50 },
                data: { label: '开始' },
            },
            {
                id: 'http-1',
                type: 'http',
                position: { x: 250, y: 150 },
                data: {
                    label: '获取数据',
                    method: 'GET',
                    url: 'https://api.example.com/data',
                },
            },
            {
                id: 'transform-1',
                type: 'transform',
                position: { x: 250, y: 280 },
                data: {
                    label: '数据转换',
                    expression: 'input.data.map(item => ({ id: item.id, value: item.value * 2 }))',
                },
            },
            {
                id: 'code-1',
                type: 'code',
                position: { x: 250, y: 410 },
                data: {
                    label: '数据验证',
                    language: 'javascript',
                    code: 'if (input.length === 0) throw new Error("数据为空"); return input;',
                },
            },
            {
                id: 'output-1',
                type: 'output',
                position: { x: 250, y: 540 },
                data: { label: '处理结果', format: 'json' },
            },
            {
                id: 'end-1',
                type: 'end',
                position: { x: 250, y: 640 },
                data: { label: '结束' },
            },
        ],
        edges: [
            { id: 'e1', source: 'start-1', target: 'http-1', animated: true },
            { id: 'e2', source: 'http-1', target: 'transform-1', animated: true },
            { id: 'e3', source: 'transform-1', target: 'code-1', animated: true },
            { id: 'e4', source: 'code-1', target: 'output-1', animated: true },
            { id: 'e5', source: 'output-1', target: 'end-1', animated: true },
        ],
    },

    // ============================================
    // MCP 工具调用
    // ============================================
    {
        id: 'mcp-tools',
        name: 'MCP 工具调用',
        description: '使用 MCP 工具执行任务 (搜索/代码/文件)',
        category: 'integration',
        icon: '🔌',
        nodes: [
            {
                id: 'start-1',
                type: 'start',
                position: { x: 250, y: 50 },
                data: { label: '开始' },
            },
            {
                id: 'input-1',
                type: 'input',
                position: { x: 250, y: 150 },
                data: { label: '搜索关键词' },
            },
            {
                id: 'mcp-search',
                type: 'mcp',
                position: { x: 250, y: 280 },
                data: {
                    label: '网页搜索',
                    mcpId: 'mcp-web-search',
                    tool: 'search',
                    params: '{"query": "{{input}}"}',
                },
            },
            {
                id: 'ai-analyze',
                type: 'ai',
                position: { x: 250, y: 410 },
                data: {
                    label: '分析结果',
                    model: 'gpt-4o-mini',
                    systemPrompt: '分析以下搜索结果，提取关键信息并总结。',
                },
            },
            {
                id: 'output-1',
                type: 'output',
                position: { x: 250, y: 540 },
                data: { label: '搜索报告' },
            },
            {
                id: 'end-1',
                type: 'end',
                position: { x: 250, y: 640 },
                data: { label: '结束' },
            },
        ],
        edges: [
            { id: 'e1', source: 'start-1', target: 'input-1', animated: true },
            { id: 'e2', source: 'input-1', target: 'mcp-search', animated: true },
            { id: 'e3', source: 'mcp-search', target: 'ai-analyze', animated: true },
            { id: 'e4', source: 'ai-analyze', target: 'output-1', animated: true },
            { id: 'e5', source: 'output-1', target: 'end-1', animated: true },
        ],
    },

    // ============================================
    // 条件分支示例
    // ============================================
    {
        id: 'condition-branch',
        name: '条件分支',
        description: '根据条件执行不同的处理逻辑',
        category: 'automation',
        icon: '🔀',
        nodes: [
            {
                id: 'start-1',
                type: 'start',
                position: { x: 300, y: 50 },
                data: { label: '开始' },
            },
            {
                id: 'input-1',
                type: 'input',
                position: { x: 300, y: 150 },
                data: { label: '输入数字' },
            },
            {
                id: 'condition-1',
                type: 'condition',
                position: { x: 300, y: 280 },
                data: {
                    label: '数字判断',
                    condition: '{{input}} > 50',
                },
            },
            {
                id: 'ai-high',
                type: 'ai',
                position: { x: 100, y: 410 },
                data: {
                    label: '高值处理',
                    systemPrompt: '输入是一个高值数字，请给出投资建议。',
                },
            },
            {
                id: 'ai-low',
                type: 'ai',
                position: { x: 500, y: 410 },
                data: {
                    label: '低值处理',
                    systemPrompt: '输入是一个低值数字，请给出储蓄建议。',
                },
            },
            {
                id: 'output-1',
                type: 'output',
                position: { x: 300, y: 540 },
                data: { label: '建议输出' },
            },
            {
                id: 'end-1',
                type: 'end',
                position: { x: 300, y: 640 },
                data: { label: '结束' },
            },
        ],
        edges: [
            { id: 'e1', source: 'start-1', target: 'input-1', animated: true },
            { id: 'e2', source: 'input-1', target: 'condition-1', animated: true },
            { id: 'e3', source: 'condition-1', target: 'ai-high', sourceHandle: 'true', animated: true },
            { id: 'e4', source: 'condition-1', target: 'ai-low', sourceHandle: 'false', animated: true },
            { id: 'e5', source: 'ai-high', target: 'output-1', animated: true },
            { id: 'e6', source: 'ai-low', target: 'output-1', animated: true },
            { id: 'e7', source: 'output-1', target: 'end-1', animated: true },
        ],
    },
];

// ============================================
// 模板获取函数
// ============================================

export function getTemplateById(id: string): WorkflowTemplate | undefined {
    return workflowTemplates.find(t => t.id === id);
}

export function getTemplatesByCategory(category: WorkflowTemplate['category']): WorkflowTemplate[] {
    return workflowTemplates.filter(t => t.category === category);
}
