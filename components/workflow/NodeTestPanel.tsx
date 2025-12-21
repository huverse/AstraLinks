/**
 * 节点测试面板
 * 
 * @module components/workflow/NodeTestPanel
 * @description 单节点调试和测试执行
 */

import React, { useState, useCallback } from 'react';
import {
    Play,
    X,
    Loader2,
    CheckCircle,
    XCircle,
    Clock,
    Code,
    FileJson
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface NodeTestPanelProps {
    workflowId: string;
    nodeId: string;
    nodeType: string;
    nodeLabel: string;
    onClose: () => void;
}

interface TestResult {
    success: boolean;
    output?: any;
    error?: string;
    logs: Array<{ timestamp: number; level: string; message: string }>;
    duration: number;
    tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// ============================================
// API 辅助函数
// ============================================

const getApiBase = () => {
    return typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
        ? 'https://astralinks.xyz'
        : 'http://localhost:3001';
};

const getAuthHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('galaxyous_token') : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
    };
};

// ============================================
// 主组件
// ============================================

export function NodeTestPanel({
    workflowId,
    nodeId,
    nodeType,
    nodeLabel,
    onClose
}: NodeTestPanelProps) {
    const [inputJson, setInputJson] = useState('{\n  "query": "测试输入"\n}');
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<TestResult | null>(null);
    const [activeTab, setActiveTab] = useState<'input' | 'output' | 'logs'>('input');

    // 验证 JSON
    const validateJson = useCallback((json: string): boolean => {
        try {
            JSON.parse(json);
            return true;
        } catch {
            return false;
        }
    }, []);

    const isValidJson = validateJson(inputJson);

    // 执行测试
    const runTest = async () => {
        if (!isValidJson) {
            alert('输入数据不是有效的 JSON');
            return;
        }

        setTesting(true);
        setResult(null);

        try {
            const response = await fetch(
                `${getApiBase()}/api/workflows/${workflowId}/nodes/${nodeId}/test`,
                {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        input: JSON.parse(inputJson)
                    }),
                }
            );

            const data = await response.json();
            setResult(data);
            setActiveTab('output');
        } catch (error: any) {
            setResult({
                success: false,
                error: error.message,
                logs: [],
                duration: 0
            });
        } finally {
            setTesting(false);
        }
    };

    // 格式化 JSON 显示
    const formatJson = (obj: any): string => {
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(obj);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-[600px] max-h-[80vh] bg-slate-800 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col">
                {/* 头部 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
                            <Play size={16} className="text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-white">测试节点</h3>
                            <p className="text-[10px] text-slate-400">
                                {nodeLabel} ({nodeType})
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* 标签页 */}
                <div className="flex border-b border-slate-700">
                    {(['input', 'output', 'logs'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 px-4 py-2 text-sm transition-colors ${activeTab === tab
                                    ? 'text-white border-b-2 border-purple-500 bg-slate-800'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                        >
                            {tab === 'input' && '📥 输入'}
                            {tab === 'output' && '📤 输出'}
                            {tab === 'logs' && '📋 日志'}
                            {tab === 'output' && result && (
                                <span className={`ml-1 ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                                    {result.success ? '✓' : '✗'}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* 内容区 */}
                <div className="flex-1 overflow-hidden">
                    {/* 输入 */}
                    {activeTab === 'input' && (
                        <div className="h-full flex flex-col">
                            <div className="p-3 border-b border-slate-700 bg-slate-900/50">
                                <p className="text-xs text-slate-400">
                                    💡 输入 JSON 格式的测试数据，将作为节点的 input 参数
                                </p>
                            </div>
                            <div className="flex-1 p-3">
                                <textarea
                                    value={inputJson}
                                    onChange={(e) => setInputJson(e.target.value)}
                                    className={`w-full h-48 px-3 py-2 bg-slate-900 border rounded-lg text-sm text-white font-mono resize-none focus:outline-none ${isValidJson ? 'border-slate-600 focus:border-purple-500' : 'border-red-500'
                                        }`}
                                    placeholder='{"key": "value"}'
                                />
                                {!isValidJson && (
                                    <p className="mt-1 text-xs text-red-400">JSON 格式无效</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 输出 */}
                    {activeTab === 'output' && (
                        <div className="h-full overflow-auto p-3">
                            {!result ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                                    <FileJson size={32} className="mb-2 opacity-50" />
                                    <p className="text-sm">点击运行按钮执行测试</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* 状态 */}
                                    <div className={`flex items-center gap-2 p-2 rounded-lg ${result.success ? 'bg-green-600/20' : 'bg-red-600/20'
                                        }`}>
                                        {result.success ? (
                                            <CheckCircle size={16} className="text-green-400" />
                                        ) : (
                                            <XCircle size={16} className="text-red-400" />
                                        )}
                                        <span className={`text-sm ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                                            {result.success ? '执行成功' : '执行失败'}
                                        </span>
                                        <span className="text-xs text-slate-400 ml-auto">
                                            <Clock size={12} className="inline mr-1" />
                                            {result.duration}ms
                                        </span>
                                    </div>

                                    {/* 错误 */}
                                    {result.error && (
                                        <div className="p-3 bg-red-900/20 border border-red-600/30 rounded-lg">
                                            <p className="text-xs text-red-400 font-mono">{result.error}</p>
                                        </div>
                                    )}

                                    {/* 输出 */}
                                    {result.output && (
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">输出结果</label>
                                            <pre className="p-3 bg-slate-900 rounded-lg text-xs text-green-400 font-mono overflow-auto max-h-48">
                                                {formatJson(result.output)}
                                            </pre>
                                        </div>
                                    )}

                                    {/* Token 使用 */}
                                    {result.tokenUsage && (
                                        <div className="flex gap-4 text-xs text-slate-400">
                                            <span>Prompt: {result.tokenUsage.promptTokens}</span>
                                            <span>Completion: {result.tokenUsage.completionTokens}</span>
                                            <span>Total: {result.tokenUsage.totalTokens}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 日志 */}
                    {activeTab === 'logs' && (
                        <div className="h-full overflow-auto p-3">
                            {!result || result.logs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                                    <Code size={32} className="mb-2 opacity-50" />
                                    <p className="text-sm">暂无日志</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {result.logs.map((log, i) => (
                                        <div
                                            key={i}
                                            className={`flex items-start gap-2 p-2 rounded text-xs font-mono ${log.level === 'error' ? 'bg-red-900/20 text-red-400' :
                                                    log.level === 'warn' ? 'bg-amber-900/20 text-amber-400' :
                                                        log.level === 'debug' ? 'bg-slate-800 text-slate-400' :
                                                            'bg-slate-800 text-slate-300'
                                                }`}
                                        >
                                            <span className="text-slate-500 shrink-0">
                                                {new Date(log.timestamp).toLocaleTimeString()}
                                            </span>
                                            <span className={`shrink-0 uppercase ${log.level === 'error' ? 'text-red-400' :
                                                    log.level === 'warn' ? 'text-amber-400' :
                                                        'text-slate-500'
                                                }`}>
                                                [{log.level}]
                                            </span>
                                            <span className="break-all">{log.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 底部 */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 bg-slate-900">
                    <p className="text-[10px] text-slate-500">
                        节点 ID: {nodeId}
                    </p>
                    <button
                        onClick={runTest}
                        disabled={testing || !isValidJson}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {testing ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                执行中...
                            </>
                        ) : (
                            <>
                                <Play size={14} />
                                运行测试
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default NodeTestPanel;
