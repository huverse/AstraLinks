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
    Zap, Clock, MessageSquare, Code, Database
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
// 导出节点类型映射
// ============================================

export const nodeTypes = {
    ai: AINode,
    condition: ConditionNode,
    start: StartNode,
    end: EndNode,
    input: InputNode,
    output: OutputNode,
    trigger: TriggerNode,
    code: CodeNode,
};

export type NodeType = keyof typeof nodeTypes;
