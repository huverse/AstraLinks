/**
 * 知识库管理组件
 * 
 * @module components/workspace/KnowledgeBase
 * @description 工作区知识库文档管理和 RAG 查询
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    BookOpen, Upload, Trash2, Search, FileText,
    Loader2, CheckCircle, AlertCircle, X, HelpCircle
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface KnowledgeDocument {
    id: string;
    name: string;
    type: string;
    chunk_count: number;
    created_at: string;
}

interface QueryResult {
    content: string;
    score: number;
    documentId: string;
}

// ============================================
// 知识库面板组件
// ============================================

interface KnowledgeBasePanelProps {
    workspaceId: string;
    onClose: () => void;
}

export default function KnowledgeBasePanel({ workspaceId, onClose }: KnowledgeBasePanelProps) {
    const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [querying, setQuerying] = useState(false);

    const [newDocName, setNewDocName] = useState('');
    const [newDocContent, setNewDocContent] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [provider, setProvider] = useState<'openai' | 'gemini' | 'custom'>('openai');
    const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');
    const [baseUrl, setBaseUrl] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Embedding 模型预设 (2025 年最新)
    const EMBEDDING_MODELS = {
        openai: [
            { value: 'text-embedding-3-small', label: 'text-embedding-3-small (推荐, 1536 dims, $0.02/1M)' },
            { value: 'text-embedding-3-large', label: 'text-embedding-3-large (高精度, 3072 dims, $0.13/1M)' },
        ],
        gemini: [
            { value: 'gemini-embedding-001', label: 'gemini-embedding-001 (2025 最新, 250+ 语言, MMTEB #1)' },
        ],
        custom: [],
    };

    const [queryText, setQueryText] = useState('');
    const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
    const [queryContext, setQueryContext] = useState('');

    const [activeTab, setActiveTab] = useState<'documents' | 'query'>('documents');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // 加载配置
    useEffect(() => {
        const saved = localStorage.getItem('rag_api_key');
        const savedProvider = localStorage.getItem('rag_provider') as 'openai' | 'gemini' | 'custom';
        const savedModel = localStorage.getItem('rag_embedding_model');
        const savedBaseUrl = localStorage.getItem('rag_base_url');
        if (saved) setApiKey(saved);
        if (savedProvider) setProvider(savedProvider);
        // 确保 embeddingModel 与 provider 匹配
        if (savedModel && savedProvider) {
            // 验证模型与 provider 匹配
            if (savedProvider === 'gemini' && !savedModel.includes('gemini')) {
                // Provider 是 Gemini 但模型不是 Gemini，重置
                setEmbeddingModel('gemini-embedding-001');
            } else if (savedProvider === 'openai' && !savedModel.includes('embedding-3')) {
                // Provider 是 OpenAI 但模型不是 OpenAI，重置
                setEmbeddingModel('text-embedding-3-small');
            } else {
                setEmbeddingModel(savedModel);
            }
        } else if (savedProvider === 'gemini') {
            setEmbeddingModel('gemini-embedding-001');
        }
        if (savedBaseUrl) setBaseUrl(savedBaseUrl);
    }, []);

    // 加载文档列表
    const loadDocuments = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`/api/knowledge/${workspaceId}/documents`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setDocuments(data.documents || []);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);

    // 上传文档
    const handleUpload = async () => {
        if (!newDocContent.trim() || !apiKey.trim()) {
            setError('请填写文档内容和 API Key');
            return;
        }

        // 保存配置
        localStorage.setItem('rag_api_key', apiKey);
        localStorage.setItem('rag_provider', provider);
        localStorage.setItem('rag_embedding_model', embeddingModel);
        localStorage.setItem('rag_base_url', baseUrl);

        setUploading(true);
        setError(null);

        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`/api/knowledge/${workspaceId}/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: newDocName || `文档_${Date.now()}`,
                    content: newDocContent,
                    type: 'txt',
                    apiKey,
                    provider,
                    embeddingModel,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setSuccess(`文档已处理，生成 ${data.chunkCount} 个块`);
                setNewDocName('');
                setNewDocContent('');
                loadDocuments();
            } else {
                const data = await response.json();
                setError(data.error || '上传失败');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploading(false);
        }
    };

    // 删除文档
    const handleDelete = async (docId: string) => {
        if (!confirm('确定删除此文档？')) return;

        try {
            const token = localStorage.getItem('galaxyous_token');
            await fetch(`/api/knowledge/${workspaceId}/documents/${docId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            loadDocuments();
        } catch (e: any) {
            setError(e.message);
        }
    };

    // RAG 查询
    const handleQuery = async () => {
        if (!queryText.trim() || !apiKey.trim()) {
            setError('请填写查询内容和 API Key');
            return;
        }

        setQuerying(true);
        setError(null);
        setQueryResults([]);

        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`/api/knowledge/${workspaceId}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    query: queryText,
                    apiKey,
                    provider,
                    embeddingModel,
                    topK: 5,
                    threshold: 0.6,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setQueryResults(data.results || []);
                setQueryContext(data.context || '');
            } else {
                const data = await response.json();
                setError(data.error || '查询失败');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setQuerying(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <BookOpen size={20} className="text-blue-400" />
                        知识库
                        <span className="text-xs bg-blue-600/50 px-2 py-0.5 rounded">RAG</span>
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10">
                    <button
                        onClick={() => setActiveTab('documents')}
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'documents' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400'}`}
                    >
                        📄 文档管理
                    </button>
                    <button
                        onClick={() => setActiveTab('query')}
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'query' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400'}`}
                    >
                        🔍 智能查询
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {/* 错误/成功提示 */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
                        </div>
                    )}
                    {success && (
                        <div className="mb-4 p-3 bg-green-900/30 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
                            <CheckCircle size={16} />
                            {success}
                            <button onClick={() => setSuccess(null)} className="ml-auto"><X size={14} /></button>
                        </div>
                    )}

                    {/* API 配置 */}
                    <div className="mb-4 p-3 bg-white/5 rounded-lg space-y-3">
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="block text-xs text-slate-400 mb-1">Embedding API Key</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="OpenAI / Gemini / 自定义 API Key"
                                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Provider</label>
                                <select
                                    value={provider}
                                    onChange={e => {
                                        const p = e.target.value as 'openai' | 'gemini' | 'custom';
                                        setProvider(p);
                                        // 切换 provider 时自动选择默认模型
                                        if (p === 'openai') setEmbeddingModel('text-embedding-3-small');
                                        else if (p === 'gemini') setEmbeddingModel('gemini-embedding-001');
                                    }}
                                    className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                >
                                    <option value="openai">OpenAI</option>
                                    <option value="gemini">Gemini</option>
                                    <option value="custom">自定义</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Embedding 模型</label>
                                {provider === 'custom' ? (
                                    <input
                                        type="text"
                                        value={embeddingModel}
                                        onChange={e => setEmbeddingModel(e.target.value)}
                                        placeholder="模型名称"
                                        className="w-40 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                    />
                                ) : (
                                    <select
                                        value={embeddingModel}
                                        onChange={e => setEmbeddingModel(e.target.value)}
                                        className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                    >
                                        {EMBEDDING_MODELS[provider].map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* 高级设置折叠 */}
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                        >
                            {showAdvanced ? '▼' : '▶'} 高级设置
                        </button>

                        {showAdvanced && (
                            <div className="pt-2 border-t border-white/10">
                                <label className="block text-xs text-slate-400 mb-1">Base URL (可选)</label>
                                <input
                                    type="text"
                                    value={baseUrl}
                                    onChange={e => setBaseUrl(e.target.value)}
                                    placeholder={provider === 'openai' ? 'https://api.openai.com/v1' : provider === 'gemini' ? 'https://generativelanguage.googleapis.com' : '自定义 Embedding API 端点'}
                                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                />
                                <p className="text-xs text-slate-500 mt-1">留空使用默认端点，或填入自定义 API 代理地址</p>
                            </div>
                        )}
                    </div>

                    {activeTab === 'documents' && (
                        <div className="space-y-4">
                            {/* 上传区域 */}
                            <div className="p-4 bg-white/5 rounded-xl border border-dashed border-white/20">
                                <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                                    <Upload size={16} /> 添加文档
                                </h3>

                                {/* PDF 文件上传 */}
                                <div className="mb-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                                    <label className="block text-xs text-blue-300 mb-2">📄 上传 PDF 文件</label>
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            if (!apiKey.trim()) {
                                                setError('请先填写 API Key');
                                                return;
                                            }

                                            localStorage.setItem('rag_api_key', apiKey);
                                            localStorage.setItem('rag_provider', provider);

                                            setUploading(true);
                                            setError(null);

                                            try {
                                                // 读取文件为 Base64
                                                const reader = new FileReader();
                                                reader.onload = async () => {
                                                    const base64 = (reader.result as string).split(',')[1];

                                                    const token = localStorage.getItem('galaxyous_token');
                                                    const response = await fetch(`/api/knowledge/${workspaceId}/documents/pdf`, {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            'Authorization': `Bearer ${token}`,
                                                        },
                                                        body: JSON.stringify({
                                                            name: file.name,
                                                            fileBase64: base64,
                                                            apiKey,
                                                            provider,
                                                            embeddingModel,
                                                        }),
                                                    });

                                                    if (response.ok) {
                                                        const data = await response.json();
                                                        setSuccess(`PDF 已处理，生成 ${data.chunkCount} 个块`);
                                                        loadDocuments();
                                                    } else {
                                                        const data = await response.json();
                                                        setError(data.error || 'PDF 上传失败');
                                                    }
                                                    setUploading(false);
                                                };
                                                reader.onerror = () => {
                                                    setError('文件读取失败');
                                                    setUploading(false);
                                                };
                                                reader.readAsDataURL(file);
                                            } catch (e: any) {
                                                setError(e.message);
                                                setUploading(false);
                                            }
                                        }}
                                        className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                                    />
                                </div>

                                {/* 文本内容上传 */}
                                <div className="text-xs text-slate-400 mb-2">或者粘贴文本内容：</div>
                                <input
                                    type="text"
                                    value={newDocName}
                                    onChange={e => setNewDocName(e.target.value)}
                                    placeholder="文档名称 (可选)"
                                    className="w-full px-3 py-2 mb-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
                                />
                                <textarea
                                    value={newDocContent}
                                    onChange={e => setNewDocContent(e.target.value)}
                                    placeholder="粘贴文档内容..."
                                    className="w-full h-24 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm resize-none"
                                />
                                <button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                    {uploading ? '处理中...' : '上传文本'}
                                </button>
                            </div>

                            {/* 文档列表 */}
                            <div>
                                <h3 className="text-sm font-medium text-white mb-2">已上传文档 ({documents.length})</h3>
                                {loading ? (
                                    <div className="text-center py-8 text-slate-400">
                                        <Loader2 className="animate-spin mx-auto mb-2" />
                                        加载中...
                                    </div>
                                ) : documents.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400">
                                        <HelpCircle className="mx-auto mb-2" />
                                        暂无文档，请上传 PDF 或文本
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {documents.map(doc => (
                                            <div key={doc.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                                                <div className="flex items-center gap-3">
                                                    <FileText size={16} className={doc.type === 'pdf' ? 'text-red-400' : 'text-blue-400'} />
                                                    <div>
                                                        <p className="text-sm text-white">{doc.name}</p>
                                                        <p className="text-xs text-slate-400">
                                                            {doc.type === 'pdf' ? '📄 PDF' : '📝 文本'} · {doc.chunk_count} 块
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDelete(doc.id)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'query' && (
                        <div className="space-y-4">
                            {/* 查询输入 */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">输入问题</label>
                                <textarea
                                    value={queryText}
                                    onChange={e => setQueryText(e.target.value)}
                                    placeholder="在这里输入你的问题，系统会从知识库中检索相关内容..."
                                    className="w-full h-24 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white resize-none"
                                />
                                <button
                                    onClick={handleQuery}
                                    disabled={querying}
                                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {querying ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                                    {querying ? '检索中...' : '语义检索'}
                                </button>
                            </div>

                            {/* 查询结果 */}
                            {queryResults.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-medium text-white mb-2">检索结果 ({queryResults.length})</h3>
                                    <div className="space-y-2">
                                        {queryResults.map((result, i) => (
                                            <div key={i} className="p-3 bg-white/5 rounded-lg">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs bg-blue-600/50 px-2 py-0.5 rounded">
                                                        相似度: {(result.score * 100).toFixed(1)}%
                                                    </span>
                                                </div>
                                                <p className="text-sm text-white whitespace-pre-wrap">{result.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 上下文 */}
                            {queryContext && (
                                <div>
                                    <h3 className="text-sm font-medium text-white mb-2">生成的上下文 (可用于 AI 对话)</h3>
                                    <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                                        <pre className="text-sm text-green-300 whitespace-pre-wrap">{queryContext}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
