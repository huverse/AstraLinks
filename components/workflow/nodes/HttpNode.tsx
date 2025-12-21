/**
 * HTTP 请求节点增强版
 * 
 * @module components/workflow/nodes/HttpNode
 * @description 增强的 HTTP 请求节点，支持认证、模板解析、响应处理
 */

import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Globe, ChevronDown, Loader2, CheckCircle, XCircle, Key, Lock, Copy, Check } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface HttpNodeData {
    label?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url?: string;
    headers?: Record<string, string>;
    body?: string;
    bodyType?: 'json' | 'form' | 'raw';
    // 认证配置
    authType?: 'none' | 'bearer' | 'basic' | 'apikey';
    authToken?: string;
    authUsername?: string;
    authPassword?: string;
    authKeyName?: string;
    authKeyValue?: string;
    authKeyLocation?: 'header' | 'query';
    // 响应处理
    responseType?: 'json' | 'text' | 'auto';
    extractPath?: string; // JSONPath 提取
    timeout?: number;
    // 执行状态
    status?: 'idle' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
    statusCode?: number;
    duration?: number;
}

// ============================================
// 常量
// ============================================

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
const METHOD_COLORS: Record<string, string> = {
    GET: 'bg-green-500',
    POST: 'bg-blue-500',
    PUT: 'bg-orange-500',
    DELETE: 'bg-red-500',
    PATCH: 'bg-purple-500',
};

const AUTH_TYPES = [
    { value: 'none', label: '无认证' },
    { value: 'bearer', label: 'Bearer Token' },
    { value: 'basic', label: 'Basic Auth' },
    { value: 'apikey', label: 'API Key' },
] as const;

// ============================================
// 组件
// ============================================

function HttpNode({ id, data, selected }: NodeProps<HttpNodeData>) {
    const [showAuth, setShowAuth] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [copied, setCopied] = useState(false);

    const method = data.method || 'GET';
    const status = data.status || 'idle';

    const handleCopyResult = () => {
        if (data.result) {
            navigator.clipboard.writeText(JSON.stringify(data.result, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className={`
            relative bg-slate-800 rounded-xl border-2 shadow-lg min-w-[300px]
            ${selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-white/10'}
            ${status === 'running' ? 'border-blue-500 animate-pulse' : ''}
            ${status === 'completed' ? 'border-green-500' : ''}
            ${status === 'failed' ? 'border-red-500' : ''}
        `}>
            {/* 输入句柄 */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-3 !h-3 !bg-blue-500 !border-2 !border-slate-800"
            />

            {/* 头部 */}
            <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                    <Globe size={16} className="text-white" />
                </div>
                <div className="flex-1">
                    <div className="font-medium text-white text-sm">{data.label || 'HTTP 请求'}</div>
                    <div className="text-xs text-slate-400 truncate max-w-[200px]">
                        {data.url || '配置请求 URL'}
                    </div>
                </div>
                {status === 'running' && <Loader2 size={16} className="text-blue-400 animate-spin" />}
                {status === 'completed' && (
                    <div className="flex items-center gap-1">
                        <CheckCircle size={16} className="text-green-400" />
                        {data.statusCode && (
                            <span className="text-xs text-green-400">{data.statusCode}</span>
                        )}
                    </div>
                )}
                {status === 'failed' && <XCircle size={16} className="text-red-400" />}
            </div>

            {/* 配置区 */}
            <div className="p-3 space-y-2">
                {/* 方法和 URL */}
                <div className="flex gap-2">
                    <select
                        className={`px-2 py-1.5 ${METHOD_COLORS[method]} text-white text-xs font-bold rounded-lg focus:outline-none cursor-pointer`}
                        defaultValue={method}
                    >
                        {METHODS.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="https://api.example.com/endpoint"
                        defaultValue={data.url}
                        className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                </div>

                {/* 认证配置折叠区 */}
                <div className="bg-white/5 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowAuth(!showAuth)}
                        className="w-full px-2 py-1.5 flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
                    >
                        <div className="flex items-center gap-1">
                            <Key size={12} />
                            <span>认证配置</span>
                            {data.authType && data.authType !== 'none' && (
                                <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">
                                    {AUTH_TYPES.find(a => a.value === data.authType)?.label}
                                </span>
                            )}
                        </div>
                        <ChevronDown size={12} className={`transition-transform ${showAuth ? 'rotate-180' : ''}`} />
                    </button>

                    {showAuth && (
                        <div className="p-2 border-t border-white/10 space-y-2">
                            <select
                                className="w-full px-2 py-1.5 bg-slate-700 border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                                defaultValue={data.authType || 'none'}
                            >
                                {AUTH_TYPES.map(auth => (
                                    <option key={auth.value} value={auth.value}>{auth.label}</option>
                                ))}
                            </select>

                            {data.authType === 'bearer' && (
                                <input
                                    type="password"
                                    placeholder="Bearer Token"
                                    defaultValue={data.authToken}
                                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none"
                                />
                            )}

                            {data.authType === 'basic' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        placeholder="用户名"
                                        defaultValue={data.authUsername}
                                        className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none"
                                    />
                                    <input
                                        type="password"
                                        placeholder="密码"
                                        defaultValue={data.authPassword}
                                        className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none"
                                    />
                                </div>
                            )}

                            {data.authType === 'apikey' && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            placeholder="Key 名称"
                                            defaultValue={data.authKeyName || 'X-API-Key'}
                                            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none"
                                        />
                                        <input
                                            type="password"
                                            placeholder="Key 值"
                                            defaultValue={data.authKeyValue}
                                            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button className={`flex-1 py-1 text-[10px] rounded ${data.authKeyLocation !== 'query' ? 'bg-blue-500 text-white' : 'bg-white/5 text-slate-400'}`}>
                                            Header
                                        </button>
                                        <button className={`flex-1 py-1 text-[10px] rounded ${data.authKeyLocation === 'query' ? 'bg-blue-500 text-white' : 'bg-white/5 text-slate-400'}`}>
                                            Query
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 请求体 (POST/PUT/PATCH) */}
                {['POST', 'PUT', 'PATCH'].includes(method) && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">请求体</span>
                            <div className="flex gap-1">
                                {(['json', 'form', 'raw'] as const).map(type => (
                                    <button
                                        key={type}
                                        className={`px-2 py-0.5 text-[10px] rounded ${(data.bodyType || 'json') === type
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-white/5 text-slate-400'
                                            }`}
                                    >
                                        {type.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <textarea
                            placeholder='{"key": "value"}'
                            defaultValue={data.body}
                            rows={2}
                            className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 font-mono resize-none focus:outline-none focus:border-blue-500"
                        />
                    </div>
                )}

                {/* 响应提取 */}
                <input
                    type="text"
                    placeholder="响应提取路径 (如: data.items[0].name)"
                    defaultValue={data.extractPath}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />

                {/* 执行结果预览 */}
                {data.result && (
                    <div className="p-2 bg-slate-900 rounded-lg relative">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-xs text-slate-400">
                                响应 {data.statusCode && `(${data.statusCode})`}
                                {data.duration && ` · ${data.duration}ms`}
                            </div>
                            <button
                                onClick={handleCopyResult}
                                className="p-1 text-slate-400 hover:text-white transition-colors"
                            >
                                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                            </button>
                        </div>
                        <pre className="text-xs text-blue-400 font-mono overflow-auto max-h-20">
                            {typeof data.result === 'string'
                                ? data.result.slice(0, 200)
                                : JSON.stringify(data.result, null, 2).slice(0, 200)}
                            {(typeof data.result === 'string' ? data.result.length : JSON.stringify(data.result).length) > 200 && '...'}
                        </pre>
                    </div>
                )}

                {/* 错误信息 */}
                {data.error && (
                    <div className="px-2 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs">
                        {data.error}
                    </div>
                )}
            </div>

            {/* 输出句柄 */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-blue-500 !border-2 !border-slate-800"
            />
        </div>
    );
}

export default memo(HttpNode);
