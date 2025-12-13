/**
 * 工作流可视化编辑器
 * 
 * @module components/workflow/WorkflowEditor
 * @description 基于 React Flow 的工作流可视化编辑器
 */

import React, { useCallback, useMemo, useState } from 'react';
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
    Plus, Bot, GitBranch, Play, Square, FileInput,
    FileOutput, Zap, Code, Save, Undo, Redo, Trash2, ZoomIn, ZoomOut
} from 'lucide-react';
import { nodeTypes, NodeType } from './nodes';

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

    // MiniMap 节点颜色
    const nodeColor = useCallback((node: Node) => {
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
    }, []);

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
                        {selectedNode && (
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
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition-colors shadow-lg"
                        >
                            <Save size={16} />
                            <span className="text-sm">保存</span>
                        </button>
                    </div>
                </Panel>

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
                                    />
                                </div>
                            </div>
                        </div>
                    </Panel>
                )}
            </ReactFlow>
        </div>
    );
}

export default WorkflowEditor;
