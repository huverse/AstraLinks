/**
 * 沙箱环境面板
 * 
 * @module components/workspace/SandboxPanel
 * @description 工作区代码沙箱 - 在线代码执行和调试
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Code, Play, Save, History, Trash2, Copy, Check, Clock,
    AlertCircle, ChevronDown, Plus, FileCode, Zap
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface CodeExecution {
    id: string;
    name?: string;
    language: 'javascript' | 'python';
    code: string;
    input?: any;
    output?: string;
    error?: string;
    execution_time_ms: number;
    status: 'success' | 'error' | 'timeout';
    created_at: string;
}

interface CodeSnippet {
    id: string;
    name: string;
    description?: string;
    language: 'javascript' | 'python';
    code: string;
    is_template: boolean;
    created_at: string;
}

interface SandboxPanelProps {
    workspaceId: string;
}

// 预置模板
const CODE_TEMPLATES = {
    javascript: [
        { name: '基础示例', code: '// 输入变量可通过 input 访问\nconsole.log("Hello World!");\nconsole.log("Input:", input);\n\n// 返回值会显示在输出中\nreturn { success: true, message: "Done" };' },
        { name: '数据处理', code: '// 处理数组数据\nconst data = input || [1, 2, 3, 4, 5];\n\nconst result = data\n  .filter(x => x > 2)\n  .map(x => x * 2);\n\nconsole.log("处理结果:", result);\nreturn result;' },
        { name: 'JSON 解析', code: '// 解析和转换 JSON\nconst jsonStr = input || \'{"name": "test", "value": 123}\';\n\ntry {\n  const data = JSON.parse(jsonStr);\n  console.log("解析成功:", data);\n  return data;\n} catch (e) {\n  console.error("解析失败:", e.message);\n  return null;\n}' },
    ],
    python: [
        { name: '基础示例', code: '# Python 代码需要通过工作流节点执行\nprint("Hello from Python!")\n\n# 输入数据\ndata = input or {}\nprint(f"Input: {data}")\n\n# 返回结果\nresult = {"status": "success"}\nprint(result)' },
    ],
};

// ============================================
// 代码编辑器组件 
// ============================================

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language: string;
    readOnly?: boolean;
}

function CodeEditor({ value, onChange, language, readOnly }: CodeEditorProps) {
    return (
        <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            readOnly={readOnly}
            className="w-full h-full font-mono text-sm bg-slate-950 text-green-400 p-4 rounded-xl border border-white/10 focus:outline-none focus:border-purple-500 resize-none"
            placeholder={`// 输入 ${language === 'javascript' ? 'JavaScript' : 'Python'} 代码...`}
            spellCheck={false}
        />
    );
}

// ============================================
// 执行历史卡片
// ============================================

interface HistoryCardProps {
    execution: CodeExecution;
    onRestore: () => void;
}

function HistoryCard({ execution, onRestore }: HistoryCardProps) {
    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className={`p-2 rounded-lg border cursor-pointer hover:bg-white/5 transition-colors ${execution.status === 'success' ? 'border-green-500/30' :
                execution.status === 'error' ? 'border-red-500/30' : 'border-yellow-500/30'
            }`} onClick={onRestore}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white font-medium truncate">
                    {execution.name || '未命名'}
                </span>
                <span className={`text-[10px] ${execution.status === 'success' ? 'text-green-400' :
                        execution.status === 'error' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                    {execution.status === 'success' ? '✓' : execution.status === 'error' ? '✗' : '⏱'}
                </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatTime(execution.created_at)}
                </span>
                <span>{execution.execution_time_ms}ms</span>
            </div>
        </div>
    );
}

// ============================================
// 主组件
// ============================================

export function SandboxPanel({ workspaceId }: SandboxPanelProps) {
    const [code, setCode] = useState(CODE_TEMPLATES.javascript[0].code);
    const [language, setLanguage] = useState<'javascript' | 'python'>('javascript');
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [error, setError] = useState('');
    const [running, setRunning] = useState(false);
    const [execTime, setExecTime] = useState<number | null>(null);
    const [history, setHistory] = useState<CodeExecution[]>([]);
    const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [snippetName, setSnippetName] = useState('');
    const [copied, setCopied] = useState(false);

    const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
        ? 'https://astralinks.xyz'
        : 'http://localhost:3001';

    // 获取历史记录
    const fetchHistory = useCallback(async () => {
        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/sandbox/history?limit=10`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            if (response.ok) {
                const data = await response.json();
                setHistory(data.executions || []);
            }
        } catch (err) {
            console.error('Failed to fetch history:', err);
        }
    }, [workspaceId, API_BASE]);

    // 获取代码片段
    const fetchSnippets = useCallback(async () => {
        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/sandbox/snippets`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            if (response.ok) {
                const data = await response.json();
                setSnippets(data.snippets || []);
            }
        } catch (err) {
            console.error('Failed to fetch snippets:', err);
        }
    }, [workspaceId, API_BASE]);

    useEffect(() => {
        fetchHistory();
        fetchSnippets();
    }, [fetchHistory, fetchSnippets]);

    // 执行代码
    const handleRun = async () => {
        if (!code.trim() || running) return;

        setRunning(true);
        setOutput('');
        setError('');
        setExecTime(null);

        try {
            const token = localStorage.getItem('galaxyous_token');
            let inputData = null;
            if (input.trim()) {
                try {
                    inputData = JSON.parse(input);
                } catch {
                    inputData = input;
                }
            }

            const response = await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/sandbox/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    code,
                    language,
                    input: inputData,
                    name: snippetName || undefined,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setOutput(data.output || '(无输出)');
            } else {
                setError(data.error || '执行失败');
            }
            setExecTime(data.executionTime);

            // 刷新历史
            fetchHistory();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setRunning(false);
        }
    };

    // 保存代码片段
    const handleSaveSnippet = async () => {
        if (!code.trim() || !snippetName.trim()) {
            alert('请输入代码和名称');
            return;
        }

        try {
            const token = localStorage.getItem('galaxyous_token');
            await fetch(`${API_BASE}/api/workspace-projects/${workspaceId}/sandbox/snippets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    name: snippetName,
                    language,
                    code,
                }),
            });

            fetchSnippets();
            alert('保存成功！');
        } catch (err: any) {
            alert('保存失败: ' + err.message);
        }
    };

    // 复制输出
    const handleCopy = async () => {
        await navigator.clipboard.writeText(output || error);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // 加载模板
    const loadTemplate = (template: { name: string; code: string }) => {
        setCode(template.code);
        setSnippetName(template.name);
        setShowTemplates(false);
    };

    // 从历史恢复
    const restoreFromHistory = (execution: CodeExecution) => {
        setCode(execution.code);
        setLanguage(execution.language);
        setSnippetName(execution.name || '');
        setShowHistory(false);
    };

    return (
        <div className="h-full flex flex-col bg-slate-900/50 rounded-xl border border-white/10">
            {/* 头部 */}
            <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <Code size={20} className="text-purple-400" />
                        <span className="font-medium text-white">代码沙箱</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* 语言选择 */}
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as 'javascript' | 'python')}
                            className="px-2 py-1 bg-slate-800 border border-white/10 rounded-lg text-xs text-white focus:outline-none"
                        >
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                        </select>

                        {/* 模板 */}
                        <div className="relative">
                            <button
                                onClick={() => setShowTemplates(!showTemplates)}
                                className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg text-xs text-slate-400 hover:bg-white/10"
                            >
                                <FileCode size={12} /> 模板 <ChevronDown size={12} />
                            </button>
                            {showTemplates && (
                                <div className="absolute right-0 top-8 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-10 min-w-[150px] overflow-hidden">
                                    {CODE_TEMPLATES[language].map((t, i) => (
                                        <button
                                            key={i}
                                            onClick={() => loadTemplate(t)}
                                            className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/10"
                                        >
                                            {t.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 历史 */}
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                }`}
                        >
                            <History size={14} />
                        </button>
                    </div>
                </div>

                {/* 名称输入 */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={snippetName}
                        onChange={e => setSnippetName(e.target.value)}
                        placeholder="代码片段名称..."
                        className="flex-1 px-3 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <button
                        onClick={handleSaveSnippet}
                        className="px-3 py-1.5 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10 transition-colors"
                        title="保存代码片段"
                    >
                        <Save size={14} />
                    </button>
                </div>
            </div>

            {/* 主内容区 */}
            <div className="flex-1 flex overflow-hidden">
                {/* 代码编辑区 */}
                <div className="flex-1 flex flex-col p-4 overflow-hidden">
                    {/* 代码输入 */}
                    <div className="flex-1 mb-3 min-h-0">
                        <CodeEditor
                            value={code}
                            onChange={setCode}
                            language={language}
                        />
                    </div>

                    {/* 输入参数 */}
                    <div className="mb-3">
                        <label className="text-xs text-slate-500 mb-1 block">输入参数 (JSON 或字符串)</label>
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder='{"key": "value"} 或 纯文本'
                            className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                        />
                    </div>

                    {/* 运行按钮 */}
                    <button
                        onClick={handleRun}
                        disabled={running || !code.trim()}
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {running ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                执行中...
                            </>
                        ) : (
                            <>
                                <Play size={16} /> 运行
                            </>
                        )}
                    </button>

                    {/* 输出区 */}
                    {(output || error) && (
                        <div className={`mt-3 p-3 rounded-xl ${error ? 'bg-red-900/30 border border-red-800' : 'bg-slate-800/50 border border-white/10'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    {error ? (
                                        <AlertCircle size={14} className="text-red-400" />
                                    ) : (
                                        <Zap size={14} className="text-green-400" />
                                    )}
                                    <span className={`text-xs font-medium ${error ? 'text-red-400' : 'text-green-400'}`}>
                                        {error ? '错误' : '输出'}
                                    </span>
                                    {execTime !== null && (
                                        <span className="text-[10px] text-slate-500">({execTime}ms)</span>
                                    )}
                                </div>
                                <button
                                    onClick={handleCopy}
                                    className="p-1 text-slate-500 hover:text-white transition-colors"
                                >
                                    {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                </button>
                            </div>
                            <pre className={`text-xs font-mono whitespace-pre-wrap ${error ? 'text-red-300' : 'text-slate-300'}`}>
                                {error || output}
                            </pre>
                        </div>
                    )}
                </div>

                {/* 历史侧边栏 */}
                {showHistory && (
                    <div className="w-48 border-l border-white/10 p-3 overflow-y-auto">
                        <h4 className="text-xs font-medium text-slate-400 mb-2">执行历史</h4>
                        {history.length === 0 ? (
                            <p className="text-xs text-slate-500">暂无记录</p>
                        ) : (
                            <div className="space-y-2">
                                {history.map(exec => (
                                    <HistoryCard
                                        key={exec.id}
                                        execution={exec}
                                        onRestore={() => restoreFromHistory(exec)}
                                    />
                                ))}
                            </div>
                        )}

                        {snippets.length > 0 && (
                            <>
                                <h4 className="text-xs font-medium text-slate-400 mt-4 mb-2">已保存片段</h4>
                                <div className="space-y-2">
                                    {snippets.map(snippet => (
                                        <button
                                            key={snippet.id}
                                            onClick={() => {
                                                setCode(snippet.code);
                                                setLanguage(snippet.language);
                                                setSnippetName(snippet.name);
                                            }}
                                            className="w-full p-2 text-left rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                                        >
                                            <div className="text-xs text-white font-medium truncate">{snippet.name}</div>
                                            <div className="text-[10px] text-slate-500">{snippet.language}</div>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default SandboxPanel;
