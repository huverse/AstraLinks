/**
 * 多模型对比面板
 * 
 * @module components/workflow/ModelComparePanel
 * @description 并排展示多个 AI 模型的输出结果，用于对比和选择最佳答案
 */

import React, { useState, useCallback } from 'react';
import { Bot, Play, Loader2, Check, Copy, ThumbsUp, X, Sparkles } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface ModelConfig {
    id: string;
    name: string;
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
}

export interface ModelResult {
    modelId: string;
    modelName: string;
    content: string;
    tokenCount: number;
    duration: number;
    error?: string;
    isLoading: boolean;
}

export interface ModelComparePanelProps {
    isOpen: boolean;
    onClose: () => void;
    models: ModelConfig[];
    systemPrompt?: string;
    onSelectResult?: (result: ModelResult) => void;
}

// ============================================
// API 基础 URL
// ============================================

const getApiBase = () => {
    if (typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz') {
        return 'https://astralinks.xyz';
    }
    return 'http://localhost:3001';
};

// ============================================
// 单个模型调用
// ============================================

async function callModel(
    input: string,
    config: ModelConfig,
    systemPrompt?: string
): Promise<{ content: string; tokenCount: number; duration: number }> {
    const startTime = Date.now();
    const API_BASE = getApiBase();

    const providerLower = config.provider.toLowerCase();

    if (providerLower === 'gemini' || providerLower === 'google') {
        const response = await fetch(`${API_BASE}/api/proxy/gemini`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: config.apiKey,
                baseUrl: config.baseUrl,
                model: config.model || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: input }] }],
                config: {
                    systemInstruction: systemPrompt,
                    temperature: 0.7,
                    maxOutputTokens: 2048,
                },
            }),
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const tokenCount = data.usageMetadata?.totalTokenCount || Math.ceil(content.length / 4);

        return { content, tokenCount, duration: Date.now() - startTime };
    } else {
        // OpenAI 兼容
        const messages: { role: string; content: string }[] = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: input });

        const response = await fetch(`${API_BASE}/api/proxy/openai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: config.apiKey,
                baseUrl: config.baseUrl,
                model: config.model || 'gpt-4o-mini',
                messages,
                temperature: 0.7,
                maxTokens: 2048,
            }),
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const tokenCount = data.usage?.total_tokens || Math.ceil(content.length / 4);

        return { content, tokenCount, duration: Date.now() - startTime };
    }
}

// ============================================
// 组件
// ============================================

export function ModelComparePanel({
    isOpen,
    onClose,
    models,
    systemPrompt,
    onSelectResult,
}: ModelComparePanelProps) {
    const [input, setInput] = useState('');
    const [results, setResults] = useState<ModelResult[]>([]);
    const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCompare = useCallback(async () => {
        if (!input.trim() || models.length === 0) return;

        // 初始化结果
        const initialResults: ModelResult[] = models.map(m => ({
            modelId: m.id,
            modelName: `${m.provider} / ${m.model}`,
            content: '',
            tokenCount: 0,
            duration: 0,
            isLoading: true,
        }));
        setResults(initialResults);

        // 并行调用所有模型
        const promises = models.map(async (model, index) => {
            try {
                const result = await callModel(input, model, systemPrompt);
                setResults(prev => prev.map((r, i) =>
                    i === index ? { ...r, ...result, isLoading: false } : r
                ));
            } catch (error: any) {
                setResults(prev => prev.map((r, i) =>
                    i === index ? { ...r, error: error.message, isLoading: false } : r
                ));
            }
        });

        await Promise.allSettled(promises);
    }, [input, models, systemPrompt]);

    const handleCopy = (content: string, id: string) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleSelect = (result: ModelResult) => {
        setSelectedResultId(result.modelId);
        onSelectResult?.(result);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                {/* 头部 */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Sparkles className="text-purple-400" size={20} />
                        <h2 className="text-lg font-bold text-white">多模型对比</h2>
                        <span className="text-xs text-slate-500 ml-2">
                            {models.length} 个模型
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* 输入区 */}
                <div className="p-4 border-b border-white/10 shrink-0">
                    <div className="flex gap-3">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="输入问题或提示词..."
                            className="flex-1 h-24 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 resize-none focus:outline-none focus:border-purple-500"
                        />
                        <button
                            onClick={handleCompare}
                            disabled={!input.trim() || models.length === 0}
                            className="px-6 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl flex items-center gap-2 transition-colors"
                        >
                            <Play size={18} />
                            <span>开始对比</span>
                        </button>
                    </div>
                </div>

                {/* 结果区 */}
                <div className="flex-1 overflow-hidden p-4">
                    {results.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-500">
                            <div className="text-center">
                                <Bot size={48} className="mx-auto mb-3 opacity-50" />
                                <p>配置模型并输入问题开始对比</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-4 h-full overflow-auto" style={{
                            gridTemplateColumns: `repeat(${Math.min(results.length, 3)}, 1fr)`
                        }}>
                            {results.map((result) => (
                                <div
                                    key={result.modelId}
                                    className={`bg-white/5 rounded-xl border overflow-hidden flex flex-col ${selectedResultId === result.modelId
                                            ? 'border-green-500/50 ring-2 ring-green-500/30'
                                            : 'border-white/10'
                                        }`}
                                >
                                    {/* 模型头 */}
                                    <div className="p-3 border-b border-white/10 flex items-center justify-between bg-white/5">
                                        <div className="flex items-center gap-2">
                                            <Bot size={16} className="text-purple-400" />
                                            <span className="font-medium text-white text-sm">
                                                {result.modelName}
                                            </span>
                                        </div>
                                        {result.isLoading ? (
                                            <Loader2 size={16} className="animate-spin text-purple-400" />
                                        ) : result.error ? (
                                            <span className="text-xs text-red-400">错误</span>
                                        ) : (
                                            <span className="text-xs text-slate-400">
                                                {result.tokenCount} tokens · {(result.duration / 1000).toFixed(1)}s
                                            </span>
                                        )}
                                    </div>

                                    {/* 内容 */}
                                    <div className="flex-1 p-3 overflow-auto text-sm text-slate-300 whitespace-pre-wrap">
                                        {result.isLoading ? (
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <Loader2 size={14} className="animate-spin" />
                                                <span>生成中...</span>
                                            </div>
                                        ) : result.error ? (
                                            <div className="text-red-400">{result.error}</div>
                                        ) : (
                                            result.content || '(空响应)'
                                        )}
                                    </div>

                                    {/* 操作按钮 */}
                                    {!result.isLoading && !result.error && (
                                        <div className="p-2 border-t border-white/10 flex gap-2">
                                            <button
                                                onClick={() => handleCopy(result.content, result.modelId)}
                                                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                            >
                                                {copiedId === result.modelId ? (
                                                    <>
                                                        <Check size={14} className="text-green-400" />
                                                        <span>已复制</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy size={14} />
                                                        <span>复制</span>
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleSelect(result)}
                                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg transition-colors ${selectedResultId === result.modelId
                                                        ? 'bg-green-600 text-white'
                                                        : 'text-slate-400 hover:text-white hover:bg-white/10'
                                                    }`}
                                            >
                                                <ThumbsUp size={14} />
                                                <span>选择</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ModelComparePanel;
