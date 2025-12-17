/**
 * MCP 工具面板组件
 * 
 * @module components/workspace/MCPPanel
 * @description 在工作区中调用 MCP 工具 (文件系统、代码执行、Web 搜索)
 */

import React, { useState, useEffect } from 'react';
import {
    X, Plug, FolderOpen, Code, Globe, Play, Loader2,
    CheckCircle, XCircle, Copy, File, Folder, Terminal,
    ShoppingBag, Upload
} from 'lucide-react';
import { mcpRegistry, mcpExecutor } from '../../core/mcp/registry';
import { MCPRegistryEntry } from '../../core/mcp/types';
import MCPMarketplace from '../MCPMarketplace';
import MCPUpload from '../MCPUpload';

interface MCPPanelProps {
    workspaceId: string;
    onClose: () => void;
}

export default function MCPPanel({ workspaceId, onClose }: MCPPanelProps) {
    const [mcps, setMcps] = useState<MCPRegistryEntry[]>([]);
    const [selectedMcp, setSelectedMcp] = useState<MCPRegistryEntry | null>(null);
    const [selectedTool, setSelectedTool] = useState<string>('');
    const [params, setParams] = useState<Record<string, string>>({});
    const [executing, setExecuting] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [showMarketplace, setShowMarketplace] = useState(false);
    const [showUpload, setShowUpload] = useState(false);

    // 加载 MCP 列表
    useEffect(() => {
        const loadMcps = async () => {
            await mcpRegistry.initialize();
            const all = mcpRegistry.getAll().filter(m => m.status === 'active');
            setMcps(all);
        };
        loadMcps();
    }, []);

    // MCP 图标映射
    const getMcpIcon = (id: string) => {
        switch (id) {
            case 'filesystem': return <FolderOpen size={18} className="text-blue-400" />;
            case 'code-executor': return <Terminal size={18} className="text-green-400" />;
            case 'web-search': return <Globe size={18} className="text-orange-400" />;
            default: return <Plug size={18} className="text-purple-400" />;
        }
    };

    // 获取工具参数描述
    const getToolParams = (mcp: MCPRegistryEntry, toolName: string) => {
        const tool = mcp.tools.find(t => t.name === toolName) as any;
        if (!tool) return {};

        // 支持两种格式：
        // 1. inputSchema.properties (标准 JSON Schema 格式)
        // 2. parameters 数组 (BUILTIN_MCPS 格式)
        if (tool.inputSchema?.properties) {
            return tool.inputSchema.properties;
        }

        if (tool.parameters && Array.isArray(tool.parameters)) {
            // 将 parameters 数组转换为 properties 对象格式
            const props: Record<string, any> = {};
            for (const param of tool.parameters) {
                props[param.name] = {
                    type: param.type || 'string',
                    description: param.description || param.name,
                    required: param.required,
                    enum: param.enum,
                    default: param.default,
                };
            }
            return props;
        }

        return {};
    };

    // 执行工具
    const executeTool = async () => {
        if (!selectedMcp || !selectedTool) return;

        setExecuting(true);
        setError(null);
        setResult(null);

        try {
            const response = await mcpExecutor.call({
                mcpId: selectedMcp.id,
                tool: selectedTool,
                params: Object.fromEntries(
                    Object.entries(params).map(([k, v]) => {
                        try { return [k, JSON.parse(v)]; }
                        catch { return [k, v]; }
                    })
                ),
            });

            if (response.success) {
                setResult(response.result);
            } else {
                const errMsg = typeof response.error === 'string' ? response.error : response.error?.message || '执行失败';
                setError(errMsg);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setExecuting(false);
        }
    };

    // 复制结果
    const copyResult = () => {
        if (result) {
            navigator.clipboard.writeText(JSON.stringify(result, null, 2));
        }
    };

    // 显示市场或上传时的处理
    if (showMarketplace) {
        return <MCPMarketplace onClose={() => setShowMarketplace(false)} />;
    }
    if (showUpload) {
        return <MCPUpload onClose={() => setShowUpload(false)} />;
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Plug size={20} className="text-purple-400" />
                        MCP 工具调用
                        <span className="text-xs bg-purple-600/50 px-2 py-0.5 rounded">{mcps.length} 个可用</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowMarketplace(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-colors"
                        >
                            <ShoppingBag size={14} />
                            市场
                        </button>
                        <button
                            onClick={() => setShowUpload(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-colors"
                        >
                            <Upload size={14} />
                            上传
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-white ml-2">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 grid grid-cols-3 gap-4">
                    {/* MCP 列表 */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-slate-400 mb-2">选择工具</h3>
                        {mcps.map(mcp => (
                            <button
                                key={mcp.id}
                                onClick={() => {
                                    setSelectedMcp(mcp);
                                    setSelectedTool('');
                                    setParams({});
                                    setResult(null);
                                }}
                                className={`w-full p-3 rounded-lg text-left transition-all ${selectedMcp?.id === mcp.id
                                    ? 'bg-purple-600/30 border border-purple-500/50'
                                    : 'bg-white/5 hover:bg-white/10 border border-transparent'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    {getMcpIcon(mcp.id)}
                                    <div>
                                        <div className="text-sm font-medium text-white">{mcp.name}</div>
                                        <div className="text-xs text-slate-400">{mcp.tools.length} 个工具</div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* 工具选择和参数 */}
                    <div className="space-y-4">
                        {selectedMcp ? (
                            <>
                                <div>
                                    <h3 className="text-sm font-medium text-slate-400 mb-2">工具</h3>
                                    <div className="space-y-1">
                                        {selectedMcp.tools.map(tool => (
                                            <button
                                                key={tool.name}
                                                onClick={() => {
                                                    setSelectedTool(tool.name);
                                                    setParams({});
                                                    setResult(null);
                                                }}
                                                className={`w-full p-2 rounded-lg text-left text-sm ${selectedTool === tool.name
                                                    ? 'bg-blue-600/30 border border-blue-500/50'
                                                    : 'bg-white/5 hover:bg-white/10'
                                                    }`}
                                            >
                                                <div className="font-medium text-white">{tool.name}</div>
                                                <div className="text-xs text-slate-400">{tool.description}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {selectedTool && (
                                    <div>
                                        <h3 className="text-sm font-medium text-slate-400 mb-2">参数</h3>
                                        <div className="space-y-2">
                                            {Object.entries(getToolParams(selectedMcp, selectedTool)).map(([key, schema]: [string, any]) => (
                                                <div key={key}>
                                                    <label className="block text-xs text-slate-400 mb-1">
                                                        {key} {schema.type && <span className="text-slate-500">({schema.type})</span>}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={params[key] || ''}
                                                        onChange={e => setParams({ ...params, [key]: e.target.value })}
                                                        placeholder={schema.description || key}
                                                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        <button
                                            onClick={executeTool}
                                            disabled={executing}
                                            className="mt-3 w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg text-white font-medium flex items-center justify-center gap-2 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50"
                                        >
                                            {executing ? (
                                                <><Loader2 size={16} className="animate-spin" /> 执行中...</>
                                            ) : (
                                                <><Play size={16} /> 执行</>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center text-slate-500 py-10">
                                ← 选择一个工具
                            </div>
                        )}
                    </div>

                    {/* 结果显示 */}
                    <div className="bg-black/30 rounded-xl p-3 overflow-auto">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium text-slate-400">执行结果</h3>
                            {result && (
                                <button onClick={copyResult} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                                    <Copy size={12} /> 复制
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                                <XCircle size={16} />
                                {error}
                            </div>
                        )}

                        {result && (
                            <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                                <div className="flex items-center gap-2 text-green-400 text-sm mb-2">
                                    <CheckCircle size={16} /> 成功
                                </div>
                                <pre className="text-xs text-slate-300 overflow-auto max-h-[400px] whitespace-pre-wrap">
                                    {JSON.stringify(result, null, 2)}
                                </pre>
                            </div>
                        )}

                        {!error && !result && (
                            <div className="text-center text-slate-500 py-10 text-sm">
                                选择工具并执行后,结果将显示在这里
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
