/**
 * 工作流自定义节点组件
 * 
 * @module components/workflow/nodes
 * @description React Flow 自定义节点类型
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
    Bot, GitBranch, Play, Square, FileInput, FileOutput,
    Zap, Clock, MessageSquare, Code, Database,
    Globe, Repeat, Plug, ArrowLeftRight, Timer, GitMerge, Workflow
} from 'lucide-react';

// ============================================
// 基础节点样式
// ============================================

const baseNodeStyle = "min-w-[180px] rounded-xl shadow-lg border backdrop-blur-sm transition-all hover:shadow-xl";
const handleStyle = { width: 12, height: 12, borderRadius: 6 };

// ============================================
// AI 节点 - 调用 AI 模型
// ============================================

interface AINodeData {
    label: string;
    model?: string;
    provider?: string;
    systemPrompt?: string;
}

export const AINode = memo(({ data, selected }: NodeProps<AINodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-purple-500/90 to-indigo-600/90 border-purple-400/50 ${selected ? 'ring-2 ring-purple-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-purple-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Bot size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || 'AI 节点'}</span>
            </div>
            {data.model && (
                <div className="text-xs text-purple-200 bg-white/10 px-2 py-1 rounded-lg">
                    {data.provider || 'OpenAI'} / {data.model}
                </div>
            )}
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-purple-300" />
    </div>
));

AINode.displayName = 'AINode';

// ============================================
// 条件节点 - 分支逻辑
// ============================================

interface ConditionNodeData {
    label: string;
    condition?: string;
}

export const ConditionNode = memo(({ data, selected }: NodeProps<ConditionNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-amber-500/90 to-orange-600/90 border-amber-400/50 ${selected ? 'ring-2 ring-amber-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-amber-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <GitBranch size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '条件分支'}</span>
            </div>
            {data.condition && (
                <div className="text-xs text-amber-200 bg-white/10 px-2 py-1 rounded-lg font-mono">
                    {data.condition}
                </div>
            )}
        </div>

        <Handle type="source" position={Position.Bottom} id="true" style={{ ...handleStyle, left: '30%' }} className="!bg-green-400" />
        <Handle type="source" position={Position.Bottom} id="false" style={{ ...handleStyle, left: '70%' }} className="!bg-red-400" />
    </div>
));

ConditionNode.displayName = 'ConditionNode';

// ============================================
// 开始节点
// ============================================

interface StartNodeData {
    label: string;
}

export const StartNode = memo(({ data, selected }: NodeProps<StartNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-green-500/90 to-emerald-600/90 border-green-400/50 ${selected ? 'ring-2 ring-green-400' : ''}`}>
        <div className="p-3">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Play size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '开始'}</span>
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-green-300" />
    </div>
));

StartNode.displayName = 'StartNode';

// ============================================
// 结束节点
// ============================================

interface EndNodeData {
    label: string;
}

export const EndNode = memo(({ data, selected }: NodeProps<EndNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-red-500/90 to-rose-600/90 border-red-400/50 ${selected ? 'ring-2 ring-red-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-red-300" />

        <div className="p-3">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Square size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '结束'}</span>
            </div>
        </div>
    </div>
));

EndNode.displayName = 'EndNode';

// ============================================
// 输入节点 - 用户/文件输入
// ============================================

interface InputNodeData {
    label: string;
    inputType?: 'user' | 'file' | 'api';
}

export const InputNode = memo(({ data, selected }: NodeProps<InputNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-cyan-500/90 to-blue-600/90 border-cyan-400/50 ${selected ? 'ring-2 ring-cyan-400' : ''}`}>
        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <FileInput size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '输入'}</span>
            </div>
            <div className="text-xs text-cyan-200">
                {data.inputType === 'file' ? '文件输入' : data.inputType === 'api' ? 'API 输入' : '用户输入'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-cyan-300" />
    </div>
));

InputNode.displayName = 'InputNode';

// ============================================
// 输出节点 - 结果输出
// ============================================

interface OutputNodeData {
    label: string;
    outputType?: 'display' | 'file' | 'api';
}

export const OutputNode = memo(({ data, selected }: NodeProps<OutputNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-teal-500/90 to-green-600/90 border-teal-400/50 ${selected ? 'ring-2 ring-teal-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-teal-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <FileOutput size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '输出'}</span>
            </div>
            <div className="text-xs text-teal-200">
                {data.outputType === 'file' ? '保存文件' : data.outputType === 'api' ? 'API 输出' : '显示结果'}
            </div>
        </div>
    </div>
));

OutputNode.displayName = 'OutputNode';

// ============================================
// 触发器节点 - 定时/事件触发
// ============================================

interface TriggerNodeData {
    label: string;
    triggerType?: 'schedule' | 'event' | 'manual';
    schedule?: string;
}

export const TriggerNode = memo(({ data, selected }: NodeProps<TriggerNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-pink-500/90 to-fuchsia-600/90 border-pink-400/50 ${selected ? 'ring-2 ring-pink-400' : ''}`}>
        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    {data.triggerType === 'schedule' ? <Clock size={16} className="text-white" /> : <Zap size={16} className="text-white" />}
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '触发器'}</span>
            </div>
            <div className="text-xs text-pink-200">
                {data.triggerType === 'schedule' ? data.schedule || '定时触发' : data.triggerType === 'event' ? '事件触发' : '手动触发'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-pink-300" />
    </div>
));

TriggerNode.displayName = 'TriggerNode';

// ============================================
// 代码节点 - 自定义脚本
// ============================================

interface CodeNodeData {
    label: string;
    language?: string;
    code?: string;
}

export const CodeNode = memo(({ data, selected }: NodeProps<CodeNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-slate-600/90 to-slate-800/90 border-slate-500/50 ${selected ? 'ring-2 ring-slate-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-slate-400" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Code size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '代码'}</span>
            </div>
            <div className="text-xs text-slate-300 bg-white/10 px-2 py-1 rounded-lg">
                {data.language || 'JavaScript'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-slate-400" />
    </div>
));

CodeNode.displayName = 'CodeNode';

// ============================================
// HTTP 请求节点
// ============================================

interface HttpNodeData {
    label: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url?: string;
}

export const HttpNode = memo(({ data, selected }: NodeProps<HttpNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-blue-500/90 to-indigo-600/90 border-blue-400/50 ${selected ? 'ring-2 ring-blue-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-blue-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Globe size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || 'HTTP 请求'}</span>
            </div>
            <div className="text-xs text-blue-200 bg-white/10 px-2 py-1 rounded-lg">
                {data.method || 'GET'} {data.url ? data.url.slice(0, 20) + '...' : '请求'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-blue-300" />
    </div>
));

HttpNode.displayName = 'HttpNode';

// ============================================
// 变量节点 - 读写变量
// ============================================

interface VariableNodeData {
    label: string;
    variableName?: string;
    operation?: 'get' | 'set';
}

export const VariableNode = memo(({ data, selected }: NodeProps<VariableNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-violet-500/90 to-purple-700/90 border-violet-400/50 ${selected ? 'ring-2 ring-violet-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-violet-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Database size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '变量'}</span>
            </div>
            <div className="text-xs text-violet-200 bg-white/10 px-2 py-1 rounded-lg">
                {data.operation === 'set' ? '设置' : '读取'}: {data.variableName || 'variable'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-violet-300" />
    </div>
));

VariableNode.displayName = 'VariableNode';

// ============================================
// 循环节点
// ============================================

interface LoopNodeData {
    label: string;
    loopType?: 'for' | 'forEach' | 'while';
    count?: number;
}

export const LoopNode = memo(({ data, selected }: NodeProps<LoopNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-yellow-500/90 to-amber-600/90 border-yellow-400/50 ${selected ? 'ring-2 ring-yellow-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-yellow-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Repeat size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '循环'}</span>
            </div>
            <div className="text-xs text-yellow-200 bg-white/10 px-2 py-1 rounded-lg">
                {data.loopType === 'for' ? `循环 ${data.count || 10} 次` : data.loopType === 'forEach' ? '遍历' : '条件循环'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} id="body" style={{ ...handleStyle, left: '30%' }} className="!bg-yellow-300" />
        <Handle type="source" position={Position.Bottom} id="next" style={{ ...handleStyle, left: '70%' }} className="!bg-green-400" />
    </div>
));

LoopNode.displayName = 'LoopNode';

// ============================================
// MCP 工具节点
// ============================================

interface MCPNodeData {
    label: string;
    mcpId?: string;
    mcpName?: string;
    tool?: string;
}

export const MCPNode = memo(({ data, selected }: NodeProps<MCPNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-emerald-500/90 to-teal-600/90 border-emerald-400/50 ${selected ? 'ring-2 ring-emerald-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-emerald-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Plug size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || 'MCP 工具'}</span>
            </div>
            <div className="text-xs text-emerald-200 bg-white/10 px-2 py-1 rounded-lg">
                {data.mcpName || 'MCP'} / {data.tool || '工具'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-emerald-300" />
    </div>
));

MCPNode.displayName = 'MCPNode';

// ============================================
// 数据转换节点
// ============================================

interface TransformNodeData {
    label: string;
    transformType?: 'json' | 'text' | 'split' | 'merge' | 'filter' | 'map';
}

export const TransformNode = memo(({ data, selected }: NodeProps<TransformNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-orange-500/90 to-red-600/90 border-orange-400/50 ${selected ? 'ring-2 ring-orange-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-orange-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <ArrowLeftRight size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '数据转换'}</span>
            </div>
            <div className="text-xs text-orange-200 bg-white/10 px-2 py-1 rounded-lg">
                {data.transformType === 'json' ? 'JSON 解析' :
                    data.transformType === 'split' ? '分割' :
                        data.transformType === 'merge' ? '合并' :
                            data.transformType === 'filter' ? '过滤' :
                                data.transformType === 'map' ? '映射' : '文本处理'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-orange-300" />
    </div>
));

TransformNode.displayName = 'TransformNode';

// ============================================
// 延迟节点
// ============================================

interface DelayNodeData {
    label: string;
    delay?: number;
    unit?: 'ms' | 's' | 'm';
}

export const DelayNode = memo(({ data, selected }: NodeProps<DelayNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-gray-500/90 to-gray-700/90 border-gray-400/50 ${selected ? 'ring-2 ring-gray-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-gray-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Timer size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '延迟'}</span>
            </div>
            <div className="text-xs text-gray-200 bg-white/10 px-2 py-1 rounded-lg">
                等待 {data.delay || 1}{data.unit === 'ms' ? '毫秒' : data.unit === 'm' ? '分钟' : '秒'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-gray-300" />
    </div>
));

DelayNode.displayName = 'DelayNode';

// ============================================
// 并行节点 - 并行执行多个分支
// ============================================

interface ParallelNodeData {
    label: string;
    branches?: number;
}

export const ParallelNode = memo(({ data, selected }: NodeProps<ParallelNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-sky-500/90 to-blue-700/90 border-sky-400/50 ${selected ? 'ring-2 ring-sky-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-sky-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <GitMerge size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '并行'}</span>
            </div>
            <div className="text-xs text-sky-200 bg-white/10 px-2 py-1 rounded-lg">
                {data.branches || 2} 个并行分支
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} id="branch1" style={{ ...handleStyle, left: '25%' }} className="!bg-sky-300" />
        <Handle type="source" position={Position.Bottom} id="branch2" style={{ ...handleStyle, left: '50%' }} className="!bg-sky-300" />
        <Handle type="source" position={Position.Bottom} id="branch3" style={{ ...handleStyle, left: '75%' }} className="!bg-sky-300" />
    </div>
));

ParallelNode.displayName = 'ParallelNode';

// ============================================
// 子工作流节点
// ============================================

interface SubWorkflowNodeData {
    label: string;
    workflowId?: string;
    workflowName?: string;
}

export const SubWorkflowNode = memo(({ data, selected }: NodeProps<SubWorkflowNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-rose-500/90 to-pink-700/90 border-rose-400/50 ${selected ? 'ring-2 ring-rose-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-rose-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Workflow size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '子工作流'}</span>
            </div>
            <div className="text-xs text-rose-200 bg-white/10 px-2 py-1 rounded-lg">
                {data.workflowName || '选择工作流'}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-rose-300" />
    </div>
));

SubWorkflowNode.displayName = 'SubWorkflowNode';

// ============================================
// 知识库检索节点 (RAG)
// ============================================

interface KnowledgeNodeData {
    label: string;
    query?: string;
    topK?: number;
}

export const KnowledgeNode = memo(({ data, selected }: NodeProps<KnowledgeNodeData>) => (
    <div className={`${baseNodeStyle} bg-gradient-to-br from-blue-500/90 to-cyan-600/90 border-blue-400/50 ${selected ? 'ring-2 ring-blue-400' : ''}`}>
        <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-blue-300" />

        <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-white/20 rounded-lg">
                    <Database size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">{data.label || '知识库检索'}</span>
                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">RAG</span>
            </div>
            <div className="text-xs text-blue-200 bg-white/10 px-2 py-1 rounded-lg">
                {data.query ? `"${data.query.slice(0, 20)}..."` : '语义检索'} · Top {data.topK || 5}
            </div>
        </div>

        <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-blue-300" />
    </div>
));

KnowledgeNode.displayName = 'KnowledgeNode';

// ============================================
// 导出节点类型映射
// ============================================

export const nodeTypes = {
    // 基础节点
    start: StartNode,
    end: EndNode,
    // AI 节点
    ai: AINode,
    // 知识库节点 (RAG)
    knowledge: KnowledgeNode,
    // 控制流节点
    condition: ConditionNode,
    loop: LoopNode,
    parallel: ParallelNode,
    // 数据节点
    input: InputNode,
    output: OutputNode,
    variable: VariableNode,
    transform: TransformNode,
    // 执行节点
    code: CodeNode,
    http: HttpNode,
    mcp: MCPNode,
    // 其他节点
    trigger: TriggerNode,
    delay: DelayNode,
    subworkflow: SubWorkflowNode,
};

export type NodeType = keyof typeof nodeTypes;

