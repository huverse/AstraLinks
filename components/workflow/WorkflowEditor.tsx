/**
 * 工作流可视化编辑器
 * 
 * @module components/workflow/WorkflowEditor
 * @description 基于 React Flow 的工作流可视化编辑器，支持执行和状态查看
 */

import React, { useCallback, useState } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Node,
    Edge,
    Connection,
    addEdge,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
    Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
    Bot, GitBranch, Play, Square, FileInput,
    FileOutput, Zap, Code, Save, Trash2, StopCircle,
    Loader2, CheckCircle, XCircle, AlertCircle
} from 'lucide-react';
import { nodeTypes, NodeType } from './nodes';
import { useWorkflowExecution } from '../../hooks/useWorkflowExecution';

// ============================================
// 节点工具栏配置
// ============================================

interface NodeToolItem {
    type: NodeType;
    label: string;
    icon: React.ReactNode;
    color: string;
}

const nodeToolItems: NodeToolItem[] = [
    { type: 'start', label: '开始', icon: <Play size={16} />, color: 'bg-green-500' },
    { type: 'ai', label: 'AI', icon: <Bot size={16} />, color: 'bg-purple-500' },
    { type: 'condition', label: '条件', icon: <GitBranch size={16} />, color: 'bg-amber-500' },
    { type: 'input', label: '输入', icon: <FileInput size={16} />, color: 'bg-cyan-500' },
    { type: 'output', label: '输出', icon: <FileOutput size={16} />, color: 'bg-teal-500' },
    { type: 'trigger', label: '触发', icon: <Zap size={16} />, color: 'bg-pink-500' },
    { type: 'code', label: '代码', icon: <Code size={16} />, color: 'bg-slate-600' },
    { type: 'end', label: '结束', icon: <Square size={16} />, color: 'bg-red-500' },
];

// ============================================
// 默认初始节点
// ============================================

const defaultNodes: Node[] = [
    {
        id: 'start-1',
        type: 'start',
        position: { x: 250, y: 50 },
        data: { label: '开始' },
    },
];

const defaultEdges: Edge[] = [];

// ============================================
// 主编辑器组件
// ============================================

interface WorkflowEditorProps {
    workflowId: string;
    initialNodes?: Node[];
    initialEdges?: Edge[];
    onChange?: (nodes: Node[], edges: Edge[]) => void;
    onSave?: (nodes: Node[], edges: Edge[]) => void;
}

export function WorkflowEditor({
    workflowId,
    initialNodes = defaultNodes,
    initialEdges = defaultEdges,
    onChange,
    onSave,
}: WorkflowEditorProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [showLogs, setShowLogs] = useState(false);

    // 执行引擎 Hook
    const execution = useWorkflowExecution(workflowId, nodes, edges);

    // 连接边回调
    const onConnect = useCallback(
        (connection: Connection) => {
            const newEdges = addEdge({
                ...connection,
                animated: true,
                style: { stroke: '#64748b', strokeWidth: 2 },
            }, edges);
            setEdges(newEdges);
            onChange?.(nodes, newEdges);
        },
        [edges, nodes, onChange, setEdges]
    );

    // 添加新节点
    const addNode = useCallback((type: NodeType) => {
        const newNode: Node = {
            id: `${type}-${Date.now()}`,
            type,
            position: {
                x: Math.random() * 300 + 100,
                y: Math.random() * 200 + 100
            },
            data: {
                label: nodeToolItems.find(n => n.type === type)?.label || type
            },
        };
        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        onChange?.(newNodes, edges);
    }, [nodes, edges, onChange, setNodes]);

    // 删除选中节点
    const deleteSelectedNode = useCallback(() => {
        if (selectedNode) {
            const newNodes = nodes.filter(n => n.id !== selectedNode.id);
            const newEdges = edges.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id);
            setNodes(newNodes);
            setEdges(newEdges);
            setSelectedNode(null);
            onChange?.(newNodes, newEdges);
        }
    }, [selectedNode, nodes, edges, onChange, setNodes, setEdges]);

    // 节点点击
    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
    }, []);

    // 面板点击取消选中
    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
    }, []);

    // 保存
    const handleSave = useCallback(() => {
        onSave?.(nodes, edges);
    }, [nodes, edges, onSave]);

    // 执行工作流
    const handleExecute = useCallback(async () => {
        const input = prompt('输入数据 (可选, JSON格式):');
        let parsedInput;
        if (input) {
            try {
                parsedInput = JSON.parse(input);
            } catch {
                parsedInput = input;
            }
        }
        setShowLogs(true);
        await execution.execute(parsedInput);
    }, [execution]);

    // MiniMap 节点颜色
    const nodeColor = useCallback((node: Node) => {
        // 如果有执行状态，根据状态显示颜色
        const state = execution.nodeStates[node.id];
        if (state) {
            switch (state.status) {
                case 'running': return '#eab308'; // yellow
                case 'completed': return '#22c55e'; // green
                case 'failed': return '#ef4444'; // red
                case 'skipped': return '#6b7280'; // gray
            }
        }

        switch (node.type) {
            case 'ai': return '#8b5cf6';
            case 'condition': return '#f59e0b';
            case 'start': return '#22c55e';
            case 'end': return '#ef4444';
            case 'input': return '#06b6d4';
            case 'output': return '#14b8a6';
            case 'trigger': return '#ec4899';
            case 'code': return '#475569';
            default: return '#64748b';
        }
    }, [execution.nodeStates]);

    // 获取状态图标
    const getStatusIcon = () => {
        switch (execution.status) {
            case 'running':
                return <Loader2 size={16} className="animate-spin text-yellow-400" />;
            case 'completed':
                return <CheckCircle size={16} className="text-green-400" />;
            case 'failed':
                return <XCircle size={16} className="text-red-400" />;
            case 'cancelled':
                return <AlertCircle size={16} className="text-orange-400" />;
            default:
                return null;
        }
    };

    return (
        <div className="h-full w-full bg-slate-950 relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                fitView
                snapToGrid
                snapGrid={[15, 15]}
                defaultEdgeOptions={{
                    animated: true,
                    style: { stroke: '#64748b', strokeWidth: 2 },
                }}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    color="#334155"
                />

                <Controls
                    className="!bg-slate-800 !border-slate-700 !rounded-xl !shadow-xl"
                    showZoom
                    showFitView
                    showInteractive
                />

                <MiniMap
                    className="!bg-slate-800 !border-slate-700 !rounded-xl"
                    nodeColor={nodeColor}
                    maskColor="rgba(0, 0, 0, 0.7)"
                />

                {/* 节点工具栏 */}
                <Panel position="top-left" className="!m-4">
                    <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-2xl p-2 shadow-xl">
                        <div className="text-xs text-slate-400 px-2 py-1 mb-1">添加节点</div>
                        <div className="grid grid-cols-4 gap-1">
                            {nodeToolItems.map(item => (
                                <button
                                    key={item.type}
                                    onClick={() => addNode(item.type)}
                                    className={`flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/10 transition-colors group`}
                                    title={item.label}
                                    disabled={execution.status === 'running'}
                                >
                                    <div className={`p-2 ${item.color} rounded-lg text-white group-hover:scale-110 transition-transform`}>
                                        {item.icon}
                                    </div>
                                    <span className="text-[10px] text-slate-400">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </Panel>

                {/* 操作工具栏 */}
                <Panel position="top-right" className="!m-4">
                    <div className="flex gap-2">
                        {selectedNode && execution.status !== 'running' && (
                            <button
                                onClick={deleteSelectedNode}
                                className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors shadow-lg"
                            >
                                <Trash2 size={16} />
                                <span className="text-sm">删除</span>
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={execution.status === 'running'}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-colors shadow-lg disabled:opacity-50"
                        >
                            <Save size={16} />
                            <span className="text-sm">保存</span>
                        </button>
                        {execution.status === 'running' ? (
                            <button
                                onClick={execution.cancel}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors shadow-lg"
                            >
                                <StopCircle size={16} />
                                <span className="text-sm">停止</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleExecute}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-500 transition-colors shadow-lg"
                            >
                                <Play size={16} />
                                <span className="text-sm">运行</span>
                            </button>
                        )}
                    </div>
                </Panel>

                {/* 执行状态面板 */}
                {execution.status !== 'idle' && (
                    <Panel position="bottom-left" className="!m-4">
                        <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-2xl p-4 shadow-xl min-w-[280px] max-w-[400px]">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    {getStatusIcon()}
                                    <span className="text-sm font-medium text-white">
                                        {execution.status === 'running' ? '执行中...' :
                                            execution.status === 'completed' ? '执行完成' :
                                                execution.status === 'failed' ? '执行失败' :
                                                    execution.status === 'cancelled' ? '已取消' : ''}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowLogs(!showLogs)}
                                    className="text-xs text-slate-400 hover:text-white"
                                >
                                    {showLogs ? '隐藏日志' : '显示日志'}
                                </button>
                            </div>

                            {/* 统计信息 */}
                            <div className="grid grid-cols-3 gap-2 text-center mb-3">
                                <div className="bg-white/5 rounded-lg p-2">
                                    <div className="text-xs text-slate-500">时长</div>
                                    <div className="text-sm text-white font-mono">{(execution.duration / 1000).toFixed(1)}s</div>
                                </div>
                                <div className="bg-white/5 rounded-lg p-2">
                                    <div className="text-xs text-slate-500">Tokens</div>
                                    <div className="text-sm text-white font-mono">{execution.totalTokens}</div>
                                </div>
                                <div className="bg-white/5 rounded-lg p-2">
                                    <div className="text-xs text-slate-500">节点</div>
                                    <div className="text-sm text-white font-mono">
                                        {Object.values(execution.nodeStates).filter(s => s.status === 'completed').length}/{nodes.length}
                                    </div>
                                </div>
                            </div>

                            {/* 日志 */}
                            {showLogs && (
                                <div className="max-h-[200px] overflow-y-auto bg-black/30 rounded-lg p-2">
                                    {execution.logs.length === 0 ? (
                                        <p className="text-xs text-slate-500 text-center py-2">暂无日志</p>
                                    ) : (
                                        execution.logs.map((log, i) => (
                                            <div key={i} className={`text-xs py-0.5 font-mono ${log.level === 'error' ? 'text-red-400' :
                                                    log.level === 'warn' ? 'text-yellow-400' :
                                                        log.level === 'info' ? 'text-blue-400' : 'text-slate-400'
                                                }`}>
                                                <span className="text-slate-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                                {log.nodeId && <span className="text-purple-400"> [{log.nodeId}]</span>}
                                                {' '}{log.message}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* 错误信息 */}
                            {execution.error && (
                                <div className="mt-2 p-2 bg-red-900/30 border border-red-800 rounded-lg">
                                    <p className="text-xs text-red-400">{execution.error}</p>
                                </div>
                            )}

                            {/* 输出结果 */}
                            {execution.status === 'completed' && execution.output && (
                                <div className="mt-2 p-2 bg-green-900/30 border border-green-800 rounded-lg">
                                    <div className="text-[10px] text-green-500 mb-1">输出结果:</div>
                                    <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap break-all max-h-[100px] overflow-auto">
                                        {typeof execution.output === 'string' ? execution.output : JSON.stringify(execution.output, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </Panel>
                )}

                {/* 选中节点信息 */}
                {selectedNode && (
                    <Panel position="bottom-right" className="!m-4">
                        <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-2xl p-4 shadow-xl min-w-[200px]">
                            <div className="text-xs text-slate-400 mb-2">节点属性</div>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-[10px] text-slate-500">ID</span>
                                    <p className="text-xs text-white font-mono">{selectedNode.id}</p>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-500">类型</span>
                                    <p className="text-xs text-white">{selectedNode.type}</p>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-500">标签</span>
                                    <input
                                        type="text"
                                        value={selectedNode.data?.label || ''}
                                        onChange={(e) => {
                                            const updated = nodes.map(n =>
                                                n.id === selectedNode.id
                                                    ? { ...n, data: { ...n.data, label: e.target.value } }
                                                    : n
                                            );
                                            setNodes(updated);
                                            setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, label: e.target.value } });
                                        }}
                                        className="w-full mt-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
                                        disabled={execution.status === 'running'}
                                    />
                                </div>
                                {/* 节点执行状态 */}
                                {execution.nodeStates[selectedNode.id] && (
                                    <div>
                                        <span className="text-[10px] text-slate-500">执行状态</span>
                                        <p className={`text-xs font-medium ${execution.nodeStates[selectedNode.id].status === 'completed' ? 'text-green-400' :
                                                execution.nodeStates[selectedNode.id].status === 'failed' ? 'text-red-400' :
                                                    execution.nodeStates[selectedNode.id].status === 'running' ? 'text-yellow-400' : 'text-slate-400'
                                            }`}>
                                            {execution.nodeStates[selectedNode.id].status}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Panel>
                )}
            </ReactFlow>
        </div>
    );
}

export default WorkflowEditor;
