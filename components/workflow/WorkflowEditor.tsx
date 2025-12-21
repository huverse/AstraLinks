import React, { useCallback, useState, useEffect } from 'react';
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
    Loader2, CheckCircle, XCircle, AlertCircle, X,
    Globe, Repeat, Plug, ArrowLeftRight, Timer, GitMerge, Workflow, Database,
    Image, Video, Music, Merge, Webhook, TestTube
} from 'lucide-react';
import { nodeTypes, NodeType } from './nodes';
import { useWorkflowExecution } from '../../hooks/useWorkflowExecution';
import { mcpRegistry } from '../../core/mcp/registry';
import { MCPRegistryEntry } from '../../core/mcp/types';
import WorkflowGuide from './WorkflowGuide';
import { workflowTemplates, WorkflowTemplate } from '../../core/workflow/templates';
import TriggerPanel from './TriggerPanel';
import NodeTestPanel from './NodeTestPanel';
import { VariableSelector } from './VariableSelector';
import { ConditionEditor, evaluateCondition } from './ConditionEditor';
import { NodeCustomizationPanel, NodeCustomization } from './NodeCustomization';
import { useWorkflowShortcuts, SHORTCUT_LIST } from '../../hooks/useWorkflowShortcuts';
import '../../app/styles/execution-animation.css';
import '../../app/styles/workflow-mobile.css';


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
    // 基础节点
    { type: 'start', label: '开始', icon: <Play size={16} />, color: 'bg-green-500' },
    { type: 'end', label: '结束', icon: <Square size={16} />, color: 'bg-red-500' },
    // AI 节点
    { type: 'ai', label: 'AI', icon: <Bot size={16} />, color: 'bg-purple-500' },
    // 知识库节点 (RAG)
    { type: 'knowledge', label: '知识库', icon: <Database size={16} />, color: 'bg-blue-500' },
    // 多模态节点
    { type: 'image_gen', label: '图像生成', icon: <Image size={16} />, color: 'bg-pink-500' },
    { type: 'video_gen', label: '视频生成', icon: <Video size={16} />, color: 'bg-rose-500' },
    { type: 'audio_tts', label: '语音合成', icon: <Music size={16} />, color: 'bg-indigo-500' },
    // 控制流节点
    { type: 'condition', label: '条件', icon: <GitBranch size={16} />, color: 'bg-amber-500' },
    { type: 'loop', label: '循环', icon: <Repeat size={16} />, color: 'bg-yellow-500' },
    { type: 'parallel', label: '并行', icon: <GitMerge size={16} />, color: 'bg-sky-500' },
    { type: 'merge', label: '汇聚', icon: <Merge size={16} />, color: 'bg-cyan-600' },
    // 数据节点
    { type: 'input', label: '输入', icon: <FileInput size={16} />, color: 'bg-cyan-500' },
    { type: 'output', label: '输出', icon: <FileOutput size={16} />, color: 'bg-teal-500' },
    { type: 'variable', label: '变量', icon: <Database size={16} />, color: 'bg-violet-500' },
    { type: 'transform', label: '转换', icon: <ArrowLeftRight size={16} />, color: 'bg-orange-500' },
    // 执行节点
    { type: 'code', label: '代码', icon: <Code size={16} />, color: 'bg-slate-600' },
    { type: 'http', label: 'HTTP', icon: <Globe size={16} />, color: 'bg-blue-500' },
    { type: 'mcp', label: 'MCP', icon: <Plug size={16} />, color: 'bg-emerald-500' },
    // 其他节点
    { type: 'trigger', label: '触发', icon: <Zap size={16} />, color: 'bg-pink-500' },
    { type: 'delay', label: '延迟', icon: <Timer size={16} />, color: 'bg-gray-500' },
    { type: 'subworkflow', label: '子流程', icon: <Workflow size={16} />, color: 'bg-rose-500' },
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
    workspaceId?: string; // 工作区 ID，用于获取 AI 配置
    initialNodes?: Node[];
    initialEdges?: Edge[];
    onChange?: (nodes: Node[], edges: Edge[]) => void;
    onSave?: (nodes: Node[], edges: Edge[]) => void;
}

export function WorkflowEditor({
    workflowId,
    workspaceId: propWorkspaceId,
    initialNodes = defaultNodes,
    initialEdges = defaultEdges,
    onChange,
    onSave,
}: WorkflowEditorProps) {
    // workspaceId 状态：需要从 API 获取真实的工作区 ID
    const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(
        propWorkspaceId ||
        (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('workspace') : null)
    );
    const workspaceId = resolvedWorkspaceId || '';

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [showLogs, setShowLogs] = useState(false);
    const [mcpList, setMcpList] = useState<MCPRegistryEntry[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showTriggers, setShowTriggers] = useState(false);
    const [testingNode, setTestingNode] = useState<{ id: string; type: string; label: string } | null>(null);
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
    const [customizingNode, setCustomizingNode] = useState<{ id: string; label: string } | null>(null);
    const [nodeCustomizations, setNodeCustomizations] = useState<Record<string, NodeCustomization>>({});


    // 从 API 获取工作流数据（包括 nodes 和 edges）
    useEffect(() => {
        if (workflowId) {
            const fetchWorkflow = async () => {
                try {
                    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('galaxyous_token') : null;
                    const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
                        ? 'https://astralinks.xyz'
                        : 'http://localhost:3001';

                    const response = await fetch(`${API_BASE}/api/workflows/${workflowId}`, {
                        headers: {
                            'Authorization': token ? `Bearer ${token}` : '',
                        },
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log('[WorkflowEditor] Loaded workflow:', data.id, 'nodes:', data.nodes?.length, 'edges:', data.edges?.length);

                        // 更新 workspaceId
                        if (data.workspaceId && !propWorkspaceId) {
                            setResolvedWorkspaceId(data.workspaceId);
                        }

                        // 更新 nodes 和 edges - 始终使用从 API 获取的数据
                        if (data.nodes && Array.isArray(data.nodes)) {
                            // 如果 API 返回空数组但有保存的数据，使用默认节点
                            setNodes(data.nodes.length > 0 ? data.nodes : defaultNodes);
                        }
                        if (data.edges && Array.isArray(data.edges)) {
                            setEdges(data.edges);
                        }
                    }
                } catch (error) {
                    console.error('[WorkflowEditor] Failed to fetch workflow:', error);
                }
            };
            fetchWorkflow();
        }
    }, [workflowId, propWorkspaceId, setNodes, setEdges]);

    // 加载 MCP 列表
    useEffect(() => {
        const loadMcps = async () => {
            await mcpRegistry.initialize();
            setMcpList(mcpRegistry.getAll().filter(m => m.status === 'active'));
        };
        loadMcps();
    }, []);

    // 执行引擎 Hook - 传递 workspaceId 用于获取工作区 AI 配置
    const execution = useWorkflowExecution(workflowId, nodes, edges, {
        workspaceId,
        authToken: typeof localStorage !== 'undefined' ? localStorage.getItem('galaxyous_token') || '' : '',
    });

    // 快捷键 Hook
    const shortcuts = useWorkflowShortcuts({
        nodes,
        edges,
        selectedNode: selectedNode?.id || null,
        onNodesChange: setNodes,
        onEdgesChange: setEdges,
        onSave: () => handleSave?.(),
        onShowHelp: () => setShowShortcutsHelp(true),
    });

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

    // 保存 - 调用 API 保存工作流
    const handleSave = useCallback(async () => {
        try {
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('galaxyous_token') : null;
            const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
                ? 'https://astralinks.xyz'
                : 'http://localhost:3001';

            const response = await fetch(`${API_BASE}/api/workflows/${workflowId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                },
                body: JSON.stringify({
                    nodes,
                    edges,
                    nodeCount: nodes.length,
                }),
            });

            if (response.ok) {
                onSave?.(nodes, edges);
                alert('保存成功');
            } else {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || `保存失败: ${response.status}`);
            }
        } catch (error: any) {
            console.error('[WorkflowEditor] Save error:', error);
            alert(`保存失败: ${error.message}`);
        }
    }, [nodes, edges, onSave, workflowId]);

    // 执行工作流 - 直接运行，不需要立即输入
    const [showInputPanel, setShowInputPanel] = useState(false);
    const [executionInput, setExecutionInput] = useState('');

    const handleExecute = useCallback(async () => {
        setShowLogs(true);
        let parsedInput;
        if (executionInput) {
            try {
                parsedInput = JSON.parse(executionInput);
            } catch {
                parsedInput = executionInput;
            }
        }
        setShowInputPanel(false);
        await execution.execute(parsedInput);
    }, [execution, executionInput]);

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
            {/* Override ReactFlow default node styles */}
            <style>{`
                .react-flow__node {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                }
            `}</style>
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

                        {/* 模板选择器 */}
                        <div className="relative">
                            <button
                                onClick={() => setShowTemplates(!showTemplates)}
                                disabled={execution.status === 'running'}
                                className="flex items-center gap-2 px-3 py-2 bg-amber-600/80 text-white rounded-xl hover:bg-amber-500 transition-colors shadow-lg disabled:opacity-50 text-sm"
                            >
                                📝 模板
                            </button>
                            {showTemplates && (
                                <div className="absolute right-0 top-12 bg-slate-800/95 backdrop-blur border border-slate-700 rounded-xl p-2 shadow-2xl w-56 z-50">
                                    <div className="text-xs text-slate-400 px-2 py-1">快速加载模板</div>
                                    {workflowTemplates.map(tpl => (
                                        <button
                                            key={tpl.id}
                                            onClick={() => {
                                                setNodes(tpl.nodes);
                                                setEdges(tpl.edges);
                                                setShowTemplates(false);
                                                onChange?.(tpl.nodes, tpl.edges);
                                            }}
                                            className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors"
                                        >
                                            <span>{tpl.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{tpl.name}</div>
                                                <div className="text-[10px] text-slate-500 truncate">{tpl.description}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 触发器管理按钮 */}
                        <button
                            onClick={() => setShowTriggers(true)}
                            disabled={execution.status === 'running'}
                            className="flex items-center gap-2 px-3 py-2 bg-green-600/80 text-white rounded-xl hover:bg-green-500 transition-colors shadow-lg disabled:opacity-50 text-sm"
                        >
                            <Webhook size={16} />
                            触发器
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
                            <div className="relative">
                                <button
                                    onClick={() => setShowInputPanel(!showInputPanel)}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-500 transition-colors shadow-lg"
                                >
                                    <Play size={16} />
                                    <span className="text-sm">运行</span>
                                </button>
                                {/* 输入面板 */}
                                {showInputPanel && (
                                    <div className="absolute right-0 top-12 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-xl p-4 shadow-2xl w-80 z-50">
                                        <div className="text-sm text-white font-medium mb-2">运行选项</div>
                                        <div className="mb-3">
                                            <label className="text-xs text-slate-400 block mb-1">输入数据 (可选)</label>
                                            <textarea
                                                value={executionInput}
                                                onChange={(e) => setExecutionInput(e.target.value)}
                                                placeholder='{"key": "value"} 或纯文本'
                                                className="w-full h-20 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 resize-none font-mono"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleExecute}
                                                className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
                                            >
                                                开始运行
                                            </button>
                                            <button
                                                onClick={() => setShowInputPanel(false)}
                                                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
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

                            {/* 节点反馈详情 */}
                            {Object.entries(execution.nodeStates).some(([_, s]) => s.feedback) && (
                                <div className="mt-3 space-y-2">
                                    <div className="text-[10px] text-slate-500">📊 节点执行详情</div>
                                    {Object.entries(execution.nodeStates)
                                        .filter(([_, state]) => state.feedback)
                                        .map(([nodeId, state]) => (
                                            <div key={nodeId} className="bg-white/5 rounded-lg p-2 border border-slate-700/50">
                                                <div className="text-xs font-medium text-white mb-1">{state.feedback?.title}</div>
                                                {state.feedback?.inputSummary && (
                                                    <div className="text-[10px] text-cyan-400/80">📥 {state.feedback.inputSummary}</div>
                                                )}
                                                {state.feedback?.outputSummary && (
                                                    <div className="text-[10px] text-green-400/80">📤 {state.feedback.outputSummary}</div>
                                                )}
                                                {/* 详情列表 */}
                                                {state.feedback?.details && state.feedback.details.length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-white">
                                                            查看详情 ({state.feedback.details.length} 项)
                                                        </summary>
                                                        <div className="mt-1 space-y-1 pl-2 border-l border-slate-600">
                                                            {state.feedback.details.map((d, i) => (
                                                                <div key={i} className="text-[10px]">
                                                                    <span className="text-slate-500">{d.label}:</span>
                                                                    <span className={`ml-1 ${d.type === 'code' ? 'font-mono text-amber-300' : 'text-slate-300'}`}>
                                                                        {d.value.length > 80 ? d.value.slice(0, 80) + '...' : d.value}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </details>
                                                )}
                                                {/* 数据来源 */}
                                                {state.feedback?.sources && state.feedback.sources.length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="text-[10px] text-blue-400 cursor-pointer hover:text-blue-300">
                                                            🔗 数据来源 ({state.feedback.sources.length})
                                                        </summary>
                                                        <div className="mt-1 space-y-1 max-h-[120px] overflow-y-auto">
                                                            {state.feedback.sources.map((src, i) => (
                                                                <div key={i} className="text-[10px] p-1 bg-blue-900/20 rounded border border-blue-800/30">
                                                                    <div className="font-medium text-blue-300 truncate">{src.title}</div>
                                                                    {src.url && (
                                                                        <a href={src.url} target="_blank" rel="noopener noreferrer"
                                                                            className="text-blue-400/60 hover:text-blue-400 truncate block">
                                                                            {src.url.slice(0, 50)}...
                                                                        </a>
                                                                    )}
                                                                    {src.snippet && (
                                                                        <div className="text-slate-400 line-clamp-2">{src.snippet}</div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        ))}
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

                {/* 节点属性编辑面板 */}
                {selectedNode && (
                    <Panel position="bottom-right" className="!m-4">
                        <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-2xl p-4 shadow-xl min-w-[300px] max-w-[350px] max-h-[400px] overflow-y-auto">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-sm font-medium text-white">节点配置</div>
                                <button
                                    onClick={() => setSelectedNode(null)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="space-y-3">
                                {/* 基础信息 */}
                                <div className="flex gap-2 text-xs">
                                    <span className="text-slate-500">类型:</span>
                                    <span className="text-purple-400">{selectedNode.type}</span>
                                    <span className="text-slate-500">ID:</span>
                                    <span className="text-slate-400 font-mono truncate">{selectedNode.id.slice(0, 12)}</span>
                                </div>

                                {/* 标签 */}
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">节点名称</label>
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
                                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                        disabled={execution.status === 'running'}
                                    />
                                </div>

                                {/* AI 节点配置 */}
                                {selectedNode.type === 'ai' && (
                                    <>
                                        {/* 配置来源选择 */}
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">配置来源</label>
                                            <select
                                                value={selectedNode.data?.configSource || 'manual'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, configSource: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, configSource: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="manual">手动配置</option>
                                                <option value="workspace">使用工作区配置</option>
                                            </select>
                                            <p className="text-[10px] text-slate-500 mt-1">💡 选择"工作区配置"将使用AI配置中心的设置</p>
                                        </div>

                                        {/* 手动配置 */}
                                        {selectedNode.data?.configSource !== 'workspace' && (
                                            <>
                                                <div>
                                                    <label className="text-xs text-slate-400 block mb-1">提供商</label>
                                                    <select
                                                        value={selectedNode.data?.provider || 'openai'}
                                                        onChange={(e) => {
                                                            const updated = nodes.map(n =>
                                                                n.id === selectedNode.id
                                                                    ? { ...n, data: { ...n.data, provider: e.target.value } }
                                                                    : n
                                                            );
                                                            setNodes(updated);
                                                            setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, provider: e.target.value } });
                                                        }}
                                                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                    >
                                                        <option value="openai">OpenAI</option>
                                                        <option value="google">Google</option>
                                                        <option value="anthropic">Anthropic</option>
                                                        <option value="deepseek">DeepSeek</option>
                                                        <option value="custom">自定义</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-400 block mb-1">模型</label>
                                                    <input
                                                        type="text"
                                                        value={selectedNode.data?.model || ''}
                                                        onChange={(e) => {
                                                            const updated = nodes.map(n =>
                                                                n.id === selectedNode.id
                                                                    ? { ...n, data: { ...n.data, model: e.target.value } }
                                                                    : n
                                                            );
                                                            setNodes(updated);
                                                            setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, model: e.target.value } });
                                                        }}
                                                        placeholder="gpt-4o-mini / gemini-2.5-flash"
                                                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-400 block mb-1">API Key</label>
                                                    <input
                                                        type="password"
                                                        value={selectedNode.data?.apiKey || ''}
                                                        onChange={(e) => {
                                                            const updated = nodes.map(n =>
                                                                n.id === selectedNode.id
                                                                    ? { ...n, data: { ...n.data, apiKey: e.target.value } }
                                                                    : n
                                                            );
                                                            setNodes(updated);
                                                            setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, apiKey: e.target.value } });
                                                        }}
                                                        placeholder="sk-xxx..."
                                                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-400 block mb-1">Base URL (可选)</label>
                                                    <input
                                                        type="text"
                                                        value={selectedNode.data?.baseUrl || ''}
                                                        onChange={(e) => {
                                                            const updated = nodes.map(n =>
                                                                n.id === selectedNode.id
                                                                    ? { ...n, data: { ...n.data, baseUrl: e.target.value } }
                                                                    : n
                                                            );
                                                            setNodes(updated);
                                                            setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, baseUrl: e.target.value } });
                                                        }}
                                                        placeholder="https://api.openai.com/v1"
                                                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {/* 工作区配置提示 */}
                                        {selectedNode.data?.configSource === 'workspace' && (
                                            <div className="p-2 bg-purple-900/30 border border-purple-500/30 rounded-lg">
                                                <p className="text-xs text-purple-300">将使用AI配置中心的当前配置 (模型、API Key等)</p>
                                            </div>
                                        )}

                                        {/* 编排模式选择器 */}
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">编排模式</label>
                                            <select
                                                value={selectedNode.data?.orchestrationMode || 'basic'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, orchestrationMode: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, orchestrationMode: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="basic">🔹 单次调用 (Basic)</option>
                                                <option value="sequential">🔗 顺序链 (Sequential)</option>
                                                <option value="supervisor">👔 监督者模式 (Supervisor)</option>
                                            </select>
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                {selectedNode.data?.orchestrationMode === 'sequential' && '多个 Agent 按顺序执行，前一个输出作为后一个输入'}
                                                {selectedNode.data?.orchestrationMode === 'supervisor' && '主 Agent 分配任务，Worker Agents 并行执行后汇总'}
                                                {(!selectedNode.data?.orchestrationMode || selectedNode.data?.orchestrationMode === 'basic') && '单个 AI 调用，使用系统提示词和用户输入'}
                                            </p>
                                        </div>

                                        {/* Worker Agent 配置 (仅非 basic 模式显示) */}
                                        {selectedNode.data?.orchestrationMode && selectedNode.data.orchestrationMode !== 'basic' && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs text-slate-400">Worker Agents</label>
                                                    <button
                                                        onClick={() => {
                                                            const currentAgents = selectedNode.data?.workerAgents || [];
                                                            const newAgent = {
                                                                id: `agent-${Date.now()}`,
                                                                name: `Agent ${currentAgents.length + 1}`,
                                                                role: 'custom',
                                                                systemPrompt: '',
                                                            };
                                                            const updated = nodes.map(n =>
                                                                n.id === selectedNode.id
                                                                    ? { ...n, data: { ...n.data, workerAgents: [...currentAgents, newAgent] } }
                                                                    : n
                                                            );
                                                            setNodes(updated);
                                                            setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, workerAgents: [...currentAgents, newAgent] } });
                                                        }}
                                                        className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded"
                                                    >
                                                        + 添加 Agent
                                                    </button>
                                                </div>

                                                {(selectedNode.data?.workerAgents || []).map((agent: any, index: number) => (
                                                    <div key={agent.id || index} className="p-2 bg-slate-900/50 border border-slate-700 rounded-lg space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <input
                                                                type="text"
                                                                value={agent.name || ''}
                                                                onChange={(e) => {
                                                                    const agents = [...(selectedNode.data?.workerAgents || [])];
                                                                    agents[index] = { ...agents[index], name: e.target.value };
                                                                    const updated = nodes.map(n =>
                                                                        n.id === selectedNode.id
                                                                            ? { ...n, data: { ...n.data, workerAgents: agents } }
                                                                            : n
                                                                    );
                                                                    setNodes(updated);
                                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, workerAgents: agents } });
                                                                }}
                                                                placeholder="Agent 名称"
                                                                className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    const agents = (selectedNode.data?.workerAgents || []).filter((_: any, i: number) => i !== index);
                                                                    const updated = nodes.map(n =>
                                                                        n.id === selectedNode.id
                                                                            ? { ...n, data: { ...n.data, workerAgents: agents } }
                                                                            : n
                                                                    );
                                                                    setNodes(updated);
                                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, workerAgents: agents } });
                                                                }}
                                                                className="ml-2 text-red-400 hover:text-red-300"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            value={agent.systemPrompt || ''}
                                                            onChange={(e) => {
                                                                const agents = [...(selectedNode.data?.workerAgents || [])];
                                                                agents[index] = { ...agents[index], systemPrompt: e.target.value };
                                                                const updated = nodes.map(n =>
                                                                    n.id === selectedNode.id
                                                                        ? { ...n, data: { ...n.data, workerAgents: agents } }
                                                                        : n
                                                                );
                                                                setNodes(updated);
                                                                setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, workerAgents: agents } });
                                                            }}
                                                            placeholder="系统提示词..."
                                                            className="w-full h-12 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white resize-none"
                                                        />
                                                    </div>
                                                ))}

                                                {(!selectedNode.data?.workerAgents || selectedNode.data.workerAgents.length === 0) && (
                                                    <p className="text-xs text-slate-500 italic">点击 "+ 添加 Agent" 配置 Worker Agents</p>
                                                )}
                                            </div>
                                        )}

                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">系统提示词</label>
                                            <textarea
                                                value={selectedNode.data?.systemPrompt || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, systemPrompt: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, systemPrompt: e.target.value } });
                                                }}
                                                placeholder="你是一个有帮助的助手..."
                                                className="w-full h-16 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 知识库节点配置 */}
                                {selectedNode.type === 'knowledge' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">Embedding API Key</label>
                                            <input
                                                type="password"
                                                value={selectedNode.data?.apiKey || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, apiKey: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, apiKey: e.target.value } });
                                                }}
                                                placeholder="sk-... 或 Gemini API Key"
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">Provider</label>
                                            <select
                                                value={selectedNode.data?.provider || 'gemini'}
                                                onChange={(e) => {
                                                    const provider = e.target.value;
                                                    const defaultModel = provider === 'gemini' ? 'gemini-embedding-001' : 'text-embedding-3-small';
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, provider, embeddingModel: defaultModel } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, provider, embeddingModel: defaultModel } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="gemini">Gemini</option>
                                                <option value="openai">OpenAI</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">Embedding 模型</label>
                                            <select
                                                value={selectedNode.data?.embeddingModel || 'gemini-embedding-001'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, embeddingModel: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, embeddingModel: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                {selectedNode.data?.provider === 'openai' ? (
                                                    <>
                                                        <option value="text-embedding-3-small">text-embedding-3-small</option>
                                                        <option value="text-embedding-3-large">text-embedding-3-large</option>
                                                    </>
                                                ) : (
                                                    <option value="gemini-embedding-001">gemini-embedding-001</option>
                                                )}
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="text-xs text-slate-400 block mb-1">Top K</label>
                                                <input
                                                    type="number"
                                                    value={selectedNode.data?.topK || 5}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, topK: parseInt(e.target.value) || 5 } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, topK: parseInt(e.target.value) || 5 } });
                                                    }}
                                                    min={1}
                                                    max={20}
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-xs text-slate-400 block mb-1">阈值</label>
                                                <input
                                                    type="number"
                                                    value={selectedNode.data?.threshold || 0.6}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, threshold: parseFloat(e.target.value) || 0.6 } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, threshold: parseFloat(e.target.value) || 0.6 } });
                                                    }}
                                                    step={0.1}
                                                    min={0}
                                                    max={1}
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">查询内容 (可选)</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data?.query || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, query: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, query: e.target.value } });
                                                }}
                                                placeholder="留空则使用上游节点输出"
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1">💡 支持 {"{{变量}}"} 语法引用上下文</p>
                                        </div>
                                    </>
                                )}

                                {/* 条件节点配置 */}
                                {selectedNode.type === 'condition' && (
                                    <div>
                                        <label className="text-xs text-slate-400 block mb-1">条件表达式</label>
                                        <input
                                            type="text"
                                            value={selectedNode.data?.condition || ''}
                                            onChange={(e) => {
                                                const updated = nodes.map(n =>
                                                    n.id === selectedNode.id
                                                        ? { ...n, data: { ...n.data, condition: e.target.value } }
                                                        : n
                                                );
                                                setNodes(updated);
                                                setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, condition: e.target.value } });
                                            }}
                                            placeholder="{{input.value}} > 10"
                                            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1">支持 JavaScript 表达式，使用 {"{{变量}}"} 引用数据</p>
                                    </div>
                                )}

                                {/* 循环节点配置 */}
                                {selectedNode.type === 'loop' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">循环类型</label>
                                            <select
                                                value={selectedNode.data?.loopType || 'for'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, loopType: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, loopType: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="for">计数循环</option>
                                                <option value="forEach">遍历循环</option>
                                                <option value="while">条件循环</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">循环次数</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="1000"
                                                value={selectedNode.data?.count || 10}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, count: parseInt(e.target.value) } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, count: parseInt(e.target.value) } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* HTTP 节点配置 */}
                                {selectedNode.type === 'http' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">请求方法</label>
                                            <select
                                                value={selectedNode.data?.method || 'GET'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, method: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, method: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="GET">GET</option>
                                                <option value="POST">POST</option>
                                                <option value="PUT">PUT</option>
                                                <option value="DELETE">DELETE</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">URL</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data?.url || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, url: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, url: e.target.value } });
                                                }}
                                                placeholder="https://api.example.com/data"
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 代码节点配置 */}
                                {selectedNode.type === 'code' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">语言</label>
                                            <select
                                                value={selectedNode.data?.language || 'javascript'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, language: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, language: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="javascript">JavaScript</option>
                                                <option value="python">Python</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">代码</label>
                                            <textarea
                                                value={selectedNode.data?.code || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, code: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, code: e.target.value } });
                                                }}
                                                placeholder="return input.toUpperCase();"
                                                className="w-full h-20 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500 resize-none"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 延迟节点配置 */}
                                {selectedNode.type === 'delay' && (
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className="text-xs text-slate-400 block mb-1">延迟时间</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={selectedNode.data?.delay || 1}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, delay: parseInt(e.target.value) } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, delay: parseInt(e.target.value) } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                        <div className="w-24">
                                            <label className="text-xs text-slate-400 block mb-1">单位</label>
                                            <select
                                                value={selectedNode.data?.unit || 's'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, unit: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, unit: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="ms">毫秒</option>
                                                <option value="s">秒</option>
                                                <option value="m">分钟</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {/* 变量节点配置 */}
                                {selectedNode.type === 'variable' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">操作类型</label>
                                            <select
                                                value={selectedNode.data?.operation || 'get'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, operation: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, operation: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="get">读取变量</option>
                                                <option value="set">设置变量</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">变量名</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data?.variableName || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, variableName: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, variableName: e.target.value } });
                                                }}
                                                placeholder="myVariable"
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 触发器节点配置 */}
                                {selectedNode.type === 'trigger' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">触发类型</label>
                                            <select
                                                value={selectedNode.data?.triggerType || 'manual'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, triggerType: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, triggerType: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="manual">手动触发</option>
                                                <option value="schedule">定时触发</option>
                                                <option value="event">事件触发</option>
                                            </select>
                                        </div>
                                        {selectedNode.data?.triggerType === 'schedule' && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">Cron 表达式</label>
                                                <input
                                                    type="text"
                                                    value={selectedNode.data?.schedule || ''}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, schedule: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, schedule: e.target.value } });
                                                    }}
                                                    placeholder="0 */5 * * * *"
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* MCP 工具节点配置 */}
                                {selectedNode.type === 'mcp' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">选择 MCP</label>
                                            <select
                                                value={selectedNode.data?.mcpId || ''}
                                                onChange={(e) => {
                                                    const mcp = mcpList.find(m => m.id === e.target.value);
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, mcpId: e.target.value, mcpName: mcp?.name || '', tool: '' } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, mcpId: e.target.value, mcpName: mcp?.name || '', tool: '' } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="">选择工具集...</option>
                                                {mcpList.map(mcp => (
                                                    <option key={mcp.id} value={mcp.id}>{mcp.name} ({mcp.tools.length} 工具)</option>
                                                ))}
                                            </select>
                                        </div>
                                        {selectedNode.data?.mcpId && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">选择工具</label>
                                                <select
                                                    value={selectedNode.data?.tool || ''}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, tool: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, tool: e.target.value } });
                                                    }}
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                >
                                                    <option value="">选择工具...</option>
                                                    {mcpList.find(m => m.id === selectedNode.data?.mcpId)?.tools.map(tool => (
                                                        <option key={tool.name} value={tool.name}>{tool.name} - {tool.description}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        {selectedNode.data?.tool && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">参数 (JSON)</label>
                                                <textarea
                                                    value={selectedNode.data?.params || '{}'}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, params: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, params: e.target.value } });
                                                    }}
                                                    placeholder='{"path": "/sandbox", "query": "搜索内容"}'
                                                    className="w-full h-20 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500 resize-none"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">使用 {"{{input}}"} 引用上一节点的输出</p>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* 图像生成节点配置 */}
                                {selectedNode.type === 'image_gen' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">配置来源</label>
                                            <select
                                                value={selectedNode.data?.configSource || 'workspace'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, configSource: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, configSource: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="workspace">使用工作区配置</option>
                                                <option value="manual">手动配置</option>
                                            </select>
                                        </div>
                                        {selectedNode.data?.configSource === 'manual' && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">API Key</label>
                                                <input
                                                    type="password"
                                                    value={selectedNode.data?.apiKey || ''}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, apiKey: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, apiKey: e.target.value } });
                                                    }}
                                                    placeholder="Gemini API Key"
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                        )}
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">模型</label>
                                            <select
                                                value={selectedNode.data?.model || 'imagen-3.0-generate-001'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, model: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, model: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="imagen-3.0-generate-001">Imagen 3</option>
                                                <option value="imagen-3.0-fast-generate-001">Imagen 3 Fast</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">提示词</label>
                                            <textarea
                                                value={selectedNode.data?.prompt || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, prompt: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, prompt: e.target.value } });
                                                }}
                                                placeholder="描述要生成的图像... 或使用 {{input}} 引用上游"
                                                className="w-full h-16 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">宽高比</label>
                                            <select
                                                value={selectedNode.data?.aspectRatio || '1:1'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, aspectRatio: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, aspectRatio: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="1:1">1:1 方形</option>
                                                <option value="16:9">16:9 横屏</option>
                                                <option value="9:16">9:16 竖屏</option>
                                                <option value="4:3">4:3</option>
                                                <option value="3:4">3:4</option>
                                            </select>
                                        </div>
                                    </>
                                )}

                                {/* 视频生成节点配置 */}
                                {selectedNode.type === 'video_gen' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">配置来源</label>
                                            <select
                                                value={selectedNode.data?.configSource || 'workspace'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, configSource: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, configSource: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="workspace">使用工作区配置</option>
                                                <option value="manual">手动配置</option>
                                            </select>
                                        </div>
                                        {selectedNode.data?.configSource === 'manual' && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">API Key</label>
                                                <input
                                                    type="password"
                                                    value={selectedNode.data?.apiKey || ''}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, apiKey: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, apiKey: e.target.value } });
                                                    }}
                                                    placeholder="Gemini API Key"
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                        )}
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">模型</label>
                                            <select
                                                value={selectedNode.data?.model || 'veo-3.1-fast-generate-preview'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, model: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, model: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast</option>
                                                <option value="veo-3.1-generate-preview">Veo 3.1</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">提示词</label>
                                            <textarea
                                                value={selectedNode.data?.prompt || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, prompt: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, prompt: e.target.value } });
                                                }}
                                                placeholder="描述要生成的视频... 或使用 {{input}} 引用上游"
                                                className="w-full h-16 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="text-xs text-slate-400 block mb-1">时长 (秒)</label>
                                                <input
                                                    type="number"
                                                    min={5}
                                                    max={60}
                                                    value={selectedNode.data?.duration || 5}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, duration: parseInt(e.target.value) || 5 } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, duration: parseInt(e.target.value) || 5 } });
                                                    }}
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-xs text-slate-400 block mb-1">宽高比</label>
                                                <select
                                                    value={selectedNode.data?.aspectRatio || '16:9'}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, aspectRatio: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, aspectRatio: e.target.value } });
                                                    }}
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                >
                                                    <option value="16:9">16:9</option>
                                                    <option value="9:16">9:16</option>
                                                    <option value="1:1">1:1</option>
                                                </select>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* 语音合成节点配置 */}
                                {selectedNode.type === 'audio_tts' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">配置来源</label>
                                            <select
                                                value={selectedNode.data?.configSource || 'workspace'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, configSource: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, configSource: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="workspace">使用工作区配置</option>
                                                <option value="manual">手动配置</option>
                                            </select>
                                        </div>
                                        {selectedNode.data?.configSource === 'manual' && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">API Key</label>
                                                <input
                                                    type="password"
                                                    value={selectedNode.data?.apiKey || ''}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, apiKey: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, apiKey: e.target.value } });
                                                    }}
                                                    placeholder="OpenAI API Key"
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                        )}
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">模型</label>
                                            <select
                                                value={selectedNode.data?.model || 'tts-1'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, model: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, model: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="tts-1">TTS-1 (标准)</option>
                                                <option value="tts-1-hd">TTS-1-HD (高清)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">语音</label>
                                            <select
                                                value={selectedNode.data?.voice || 'alloy'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, voice: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, voice: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="alloy">Alloy</option>
                                                <option value="echo">Echo</option>
                                                <option value="fable">Fable</option>
                                                <option value="onyx">Onyx</option>
                                                <option value="nova">Nova</option>
                                                <option value="shimmer">Shimmer</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">文本内容</label>
                                            <textarea
                                                value={selectedNode.data?.text || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, text: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, text: e.target.value } });
                                                }}
                                                placeholder="要合成的文本... 或使用 {{input}} 引用上游"
                                                className="w-full h-16 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 汇聚节点配置 */}
                                {selectedNode.type === 'merge' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">合并策略</label>
                                            <select
                                                value={selectedNode.data?.mergeStrategy || 'array'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, mergeStrategy: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, mergeStrategy: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="array">数组 - 保持所有结果为数组</option>
                                                <option value="object">对象 - 合并为单个对象</option>
                                                <option value="text">文本 - 拼接为文本</option>
                                                <option value="first">取第一个结果</option>
                                                <option value="last">取最后一个结果</option>
                                            </select>
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                {selectedNode.data?.mergeStrategy === 'array' && '所有上游结果保存为数组 [result1, result2, ...]'}
                                                {selectedNode.data?.mergeStrategy === 'object' && '将所有结果合并为一个对象 {...result1, ...result2}'}
                                                {selectedNode.data?.mergeStrategy === 'text' && '使用分隔符拼接所有结果为文本'}
                                                {selectedNode.data?.mergeStrategy === 'first' && '只保留第一个完成的分支结果'}
                                                {selectedNode.data?.mergeStrategy === 'last' && '只保留最后一个完成的分支结果'}
                                                {!selectedNode.data?.mergeStrategy && '所有上游结果保存为数组 [result1, result2, ...]'}
                                            </p>
                                        </div>
                                        {selectedNode.data?.mergeStrategy === 'text' && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">分隔符</label>
                                                <input
                                                    type="text"
                                                    value={selectedNode.data?.separator || '\n'}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, separator: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, separator: e.target.value } });
                                                    }}
                                                    placeholder="\n 或 , 或 ---"
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* HTTP 节点配置 */}
                                {selectedNode.type === 'http' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">请求方法</label>
                                            <select
                                                value={selectedNode.data?.method || 'GET'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, method: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, method: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="GET">GET</option>
                                                <option value="POST">POST</option>
                                                <option value="PUT">PUT</option>
                                                <option value="DELETE">DELETE</option>
                                                <option value="PATCH">PATCH</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">URL</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data?.url || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, url: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, url: e.target.value } });
                                                }}
                                                placeholder="https://api.example.com/data"
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">支持 {"{{input}}"} 变量</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">请求头 (JSON)</label>
                                            <textarea
                                                value={selectedNode.data?.headers || '{}'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, headers: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, headers: e.target.value } });
                                                }}
                                                placeholder='{"Authorization": "Bearer xxx"}'
                                                className="w-full h-16 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500 resize-none"
                                            />
                                        </div>
                                        {(selectedNode.data?.method !== 'GET' && selectedNode.data?.method !== 'HEAD') && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">请求体</label>
                                                <textarea
                                                    value={selectedNode.data?.body || ''}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, body: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, body: e.target.value } });
                                                    }}
                                                    placeholder='{"key": "value"} 或 {{input}}'
                                                    className="w-full h-20 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500 resize-none"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* 数据转换节点配置 */}
                                {selectedNode.type === 'transform' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">转换类型</label>
                                            <select
                                                value={selectedNode.data?.transformType || 'json'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, transformType: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, transformType: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="json">JSON 解析</option>
                                                <option value="text">转为文本</option>
                                                <option value="split">分割字符串</option>
                                                <option value="merge">合并数组</option>
                                                <option value="filter">过滤数组</option>
                                                <option value="map">映射数组</option>
                                            </select>
                                        </div>
                                        {(selectedNode.data?.transformType === 'split' || selectedNode.data?.transformType === 'merge') && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">分隔符</label>
                                                <input
                                                    type="text"
                                                    value={selectedNode.data?.separator || '\n'}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, separator: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, separator: e.target.value } });
                                                    }}
                                                    placeholder="\n"
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                        )}
                                        {(selectedNode.data?.transformType === 'filter' || selectedNode.data?.transformType === 'map') && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">表达式 (JS)</label>
                                                <textarea
                                                    value={selectedNode.data?.code || ''}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, code: e.target.value } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, code: e.target.value } });
                                                    }}
                                                    placeholder="item.length > 0"
                                                    className="w-full h-16 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500 resize-none"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">可用变量: item, index</p>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* 循环节点配置 */}
                                {selectedNode.type === 'loop' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">循环类型</label>
                                            <select
                                                value={selectedNode.data?.loopType || 'count'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, loopType: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, loopType: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="count">固定次数</option>
                                                <option value="foreach">遍历数组</option>
                                                <option value="while">条件循环</option>
                                            </select>
                                        </div>
                                        {selectedNode.data?.loopType === 'count' && (
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">循环次数</label>
                                                <input
                                                    type="number"
                                                    value={selectedNode.data?.loopCount || 3}
                                                    onChange={(e) => {
                                                        const updated = nodes.map(n =>
                                                            n.id === selectedNode.id
                                                                ? { ...n, data: { ...n.data, loopCount: parseInt(e.target.value) } }
                                                                : n
                                                        );
                                                        setNodes(updated);
                                                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, loopCount: parseInt(e.target.value) } });
                                                    }}
                                                    min={1}
                                                    max={100}
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                                />
                                            </div>
                                        )}
                                        <p className="text-xs text-amber-400 bg-amber-900/30 px-2 py-1 rounded">⚠️ 循环功能正在完善中</p>
                                    </>
                                )}

                                {/* 并行节点配置 */}
                                {selectedNode.type === 'parallel' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">并行分支数</label>
                                            <input
                                                type="number"
                                                value={selectedNode.data?.branchCount || 2}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, branchCount: parseInt(e.target.value) } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, branchCount: parseInt(e.target.value) } });
                                                }}
                                                min={2}
                                                max={10}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                        <p className="text-xs text-amber-400 bg-amber-900/30 px-2 py-1 rounded">⚠️ 并行功能正在完善中</p>
                                    </>
                                )}

                                {/* 子工作流节点配置 */}
                                {selectedNode.type === 'subworkflow' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">子工作流 ID</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data?.subWorkflowId || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, subWorkflowId: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, subWorkflowId: e.target.value } });
                                                }}
                                                placeholder="workflow-uuid"
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                        <p className="text-xs text-amber-400 bg-amber-900/30 px-2 py-1 rounded">⚠️ 子工作流功能正在完善中</p>
                                    </>
                                )}

                                {/* 输入节点配置 */}
                                {selectedNode.type === 'input' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">输入类型</label>
                                            <select
                                                value={selectedNode.data?.inputType || 'text'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, inputType: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, inputType: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="text">文本</option>
                                                <option value="number">数字</option>
                                                <option value="json">JSON</option>
                                                <option value="file">文件</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">提示文本</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data?.placeholder || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, placeholder: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, placeholder: e.target.value } });
                                                }}
                                                placeholder="请输入..."
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">默认值</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data?.defaultValue || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, defaultValue: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, defaultValue: e.target.value } });
                                                }}
                                                placeholder="可选默认值"
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 输出节点配置 */}
                                {selectedNode.type === 'output' && (
                                    <>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">输出格式</label>
                                            <select
                                                value={selectedNode.data?.outputFormat || 'text'}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, outputFormat: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, outputFormat: e.target.value } });
                                                }}
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="text">纯文本</option>
                                                <option value="json">JSON</option>
                                                <option value="markdown">Markdown</option>
                                                <option value="html">HTML</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">输出标题</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data?.outputTitle || ''}
                                                onChange={(e) => {
                                                    const updated = nodes.map(n =>
                                                        n.id === selectedNode.id
                                                            ? { ...n, data: { ...n.data, outputTitle: e.target.value } }
                                                            : n
                                                    );
                                                    setNodes(updated);
                                                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, outputTitle: e.target.value } });
                                                }}
                                                placeholder="结果"
                                                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 执行状态 */}
                                {execution.nodeStates[selectedNode.id] && (
                                    <div className="pt-2 border-t border-slate-700">
                                        <span className="text-xs text-slate-500">执行状态: </span>
                                        <span className={`text-xs font-medium ${execution.nodeStates[selectedNode.id].status === 'completed' ? 'text-green-400' :
                                            execution.nodeStates[selectedNode.id].status === 'failed' ? 'text-red-400' :
                                                execution.nodeStates[selectedNode.id].status === 'running' ? 'text-yellow-400' : 'text-slate-400'
                                            }`}>
                                            {execution.nodeStates[selectedNode.id].status}
                                        </span>
                                    </div>
                                )}

                                {/* 节点测试按钮 */}
                                {selectedNode.type !== 'start' && selectedNode.type !== 'end' && (
                                    <button
                                        onClick={() => setTestingNode({
                                            id: selectedNode.id,
                                            type: selectedNode.type || 'unknown',
                                            label: selectedNode.data?.label || selectedNode.id
                                        })}
                                        disabled={execution.status === 'running'}
                                        className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 transition-colors text-sm disabled:opacity-50"
                                    >
                                        <TestTube size={14} />
                                        测试此节点
                                    </button>
                                )}
                            </div>
                        </div>
                    </Panel>
                )}
            </ReactFlow>

            {/* 帮助指南 */}
            <WorkflowGuide />

            {/* 触发器面板 */}
            {
                showTriggers && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="w-[480px]">
                            <div className="flex justify-end mb-2">
                                <button
                                    onClick={() => setShowTriggers(false)}
                                    className="p-1.5 text-slate-400 hover:text-white transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <TriggerPanel workflowId={workflowId} onClose={() => setShowTriggers(false)} />
                        </div>
                    </div>
                )
            }

            {/* 节点测试面板 */}
            {
                testingNode && (
                    <NodeTestPanel
                        workflowId={workflowId}
                        nodeId={testingNode.id}
                        nodeType={testingNode.type}
                        nodeLabel={testingNode.label}
                        onClose={() => setTestingNode(null)}
                    />
                )
            }

            {/* 快捷键帮助面板 */}
            {showShortcutsHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-[360px] bg-slate-800 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900">
                            <span className="text-sm font-medium text-white">⌨️ 键盘快捷键</span>
                            <button onClick={() => setShowShortcutsHelp(false)} className="p-1 text-slate-400 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                            {SHORTCUT_LIST.map((s, i) => (
                                <div key={i} className="flex items-center justify-between py-1.5">
                                    <span className="text-sm text-slate-300">{s.description}</span>
                                    <div className="flex gap-1">
                                        {s.keys.map((key, j) => (
                                            <kbd key={j} className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded border border-slate-600">
                                                {key}
                                            </kbd>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 节点自定义面板 */}
            {customizingNode && (
                <NodeCustomizationPanel
                    nodeId={customizingNode.id}
                    nodeLabel={customizingNode.label}
                    currentCustomization={nodeCustomizations[customizingNode.id]}
                    onSave={(customization) => {
                        setNodeCustomizations(prev => ({
                            ...prev,
                            [customizingNode.id]: customization
                        }));
                        // 更新节点样式
                        setNodes(nds => nds.map(n =>
                            n.id === customizingNode.id
                                ? { ...n, data: { ...n.data, customization } }
                                : n
                        ));
                        setCustomizingNode(null);
                    }}
                    onClose={() => setCustomizingNode(null)}
                />
            )}
        </div >
    );
}

export default WorkflowEditor;
