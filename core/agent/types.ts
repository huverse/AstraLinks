/**
 * Agent 类型定义
 * 
 * @module core/agent/types
 * @description 多 Agent 协作系统类型
 */

// ============================================
// Agent 定义
// ============================================

/** Agent 角色模板 */
export type AgentRole = 'researcher' | 'writer' | 'reviewer' | 'analyst' | 'custom';

/** Agent 定义 */
export interface Agent {
    id: string;
    name: string;
    role: AgentRole;
    description: string;
    systemPrompt: string;
    model?: string;
    provider?: string;
    temperature?: number;
    tools?: string[];  // 可用的 MCP 工具
}

/** Agent 执行状态 */
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'completed' | 'failed';

/** Agent 执行结果 */
export interface AgentResult {
    agentId: string;
    status: AgentStatus;
    input: any;
    output: any;
    error?: string;
    tokensUsed: number;
    duration: number;
}

// ============================================
// 多 Agent 协作
// ============================================

/** 协作模式 */
export type OrchestrationMode = 'sequential' | 'parallel' | 'supervisor';

/** 协作任务 */
export interface OrchestrationTask {
    id: string;
    name: string;
    mode: OrchestrationMode;
    agents: Agent[];
    input: any;
    status: 'pending' | 'running' | 'completed' | 'failed';
    results: AgentResult[];
    finalOutput?: any;
    startTime?: number;
    endTime?: number;
}

// ============================================
// 预设 Agent 模板
// ============================================

export const PRESET_AGENTS: Omit<Agent, 'id'>[] = [
    {
        name: '研究员',
        role: 'researcher',
        description: '负责搜索和收集信息，整理研究资料',
        systemPrompt: `你是一名专业的研究员。你的职责是：
1. 深入分析用户给出的主题
2. 整理关键信息和数据点
3. 提供全面的背景知识
4. 列出重要的参考来源

请以结构化的方式呈现研究结果，包括：
- 主题概述
- 关键发现
- 数据和事实
- 趋势分析
- 建议的深入研究方向`,
        temperature: 0.3,
    },
    {
        name: '写手',
        role: 'writer',
        description: '负责将研究内容转化为高质量文章',
        systemPrompt: `你是一名专业的内容写手。你的职责是：
1. 将研究资料转化为流畅的文章
2. 确保内容准确、逻辑清晰
3. 使用恰当的写作风格
4. 保持内容的可读性和吸引力

请根据给定的素材，撰写一篇结构完整的文章，包括：
- 引人入胜的开头
- 清晰的段落组织
- 有力的论证
- 精彩的结尾`,
        temperature: 0.7,
    },
    {
        name: '审核员',
        role: 'reviewer',
        description: '负责审核内容质量，提出改进建议',
        systemPrompt: `你是一名严谨的内容审核员。你的职责是：
1. 检查内容的准确性和完整性
2. 评估写作质量和逻辑性
3. 指出潜在的问题和改进点
4. 给出具体的修改建议

请提供详细的审核报告，包括：
- 整体评分 (1-10)
- 优点列表
- 需要改进的地方
- 具体的修改建议
- 最终结论`,
        temperature: 0.2,
    },
    {
        name: '数据分析师',
        role: 'analyst',
        description: '负责分析数据，提取洞察',
        systemPrompt: `你是一名数据分析师。你的职责是：
1. 分析给定的数据或信息
2. 提取关键指标和趋势
3. 发现隐藏的模式
4. 提供数据驱动的建议

请提供分析报告，包括：
- 数据概览
- 关键指标
- 趋势分析
- 异常发现
- 可操作的建议`,
        temperature: 0.3,
    },
];

// ============================================
// 默认配置
// ============================================

export const DEFAULT_AGENT_CONFIG = {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.5,
    maxTokens: 4096,
};
