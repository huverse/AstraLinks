/**
 * 数据库节点
 * 
 * @module components/workflow/nodes/DatabaseNode
 * @description 执行 MySQL/PostgreSQL 查询的工作流节点
 */

import React, { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Database, Play, Loader2, CheckCircle, XCircle, Settings, Eye, EyeOff } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface DatabaseNodeData {
    label?: string;
    dbType?: 'mysql' | 'postgresql';
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    query?: string;
    timeout?: number;
    // 执行状态
    status?: 'idle' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
    duration?: number;
}

// ============================================
// API 辅助函数
// ============================================

const getApiBase = () => {
    if (typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz') {
        return 'https://astralinks.xyz';
    }
    return 'http://localhost:3001';
};

const getToken = () => {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('galaxyous_token');
    }
    return null;
};

// ============================================
// 组件
// ============================================

function DatabaseNode({ id, data, selected }: NodeProps<DatabaseNodeData>) {
    const [showPassword, setShowPassword] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // 测试连接
    const handleTestConnection = useCallback(async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const response = await fetch(`${getApiBase()}/api/database/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`,
                },
                body: JSON.stringify({
                    type: data.dbType || 'mysql',
                    host: data.host || 'localhost',
                    port: data.port || (data.dbType === 'postgresql' ? 5432 : 3306),
                    database: data.database,
                    username: data.username,
                    password: data.password,
                }),
            });

            const result = await response.json();
            setTestResult({
                success: response.ok,
                message: response.ok ? '连接成功' : (result.error || '连接失败'),
            });
        } catch (err: any) {
            setTestResult({
                success: false,
                message: err.message || '连接测试失败',
            });
        } finally {
            setTesting(false);
        }
    }, [data]);

    const status = data.status || 'idle';

    return (
        <div className={`
            relative bg-slate-800 rounded-xl border-2 shadow-lg min-w-[280px]
            ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-white/10'}
            ${status === 'running' ? 'border-blue-500 animate-pulse' : ''}
            ${status === 'completed' ? 'border-green-500' : ''}
            ${status === 'failed' ? 'border-red-500' : ''}
        `}>
            {/* 输入句柄 */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-slate-800"
            />

            {/* 头部 */}
            <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <Database size={16} className="text-white" />
                </div>
                <div className="flex-1">
                    <div className="font-medium text-white text-sm">{data.label || '数据库查询'}</div>
                    <div className="text-xs text-slate-400">
                        {data.dbType === 'postgresql' ? 'PostgreSQL' : 'MySQL'}
                        {data.host && ` · ${data.host}`}
                    </div>
                </div>
                {status === 'running' && <Loader2 size={16} className="text-blue-400 animate-spin" />}
                {status === 'completed' && <CheckCircle size={16} className="text-green-400" />}
                {status === 'failed' && <XCircle size={16} className="text-red-400" />}
            </div>

            {/* 配置区 */}
            <div className="p-3 space-y-2">
                {/* 数据库类型 */}
                <div className="flex gap-2">
                    <button
                        className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${data.dbType !== 'postgresql'
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                    >
                        MySQL
                    </button>
                    <button
                        className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${data.dbType === 'postgresql'
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                    >
                        PostgreSQL
                    </button>
                </div>

                {/* 连接信息 */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <input
                        type="text"
                        placeholder="主机地址"
                        defaultValue={data.host || 'localhost'}
                        className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                        type="number"
                        placeholder="端口"
                        defaultValue={data.port || 3306}
                        className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                </div>

                <input
                    type="text"
                    placeholder="数据库名"
                    defaultValue={data.database}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />

                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="text"
                        placeholder="用户名"
                        defaultValue={data.username}
                        className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="密码"
                            defaultValue={data.password}
                            className="w-full px-2 py-1.5 pr-8 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                            {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                    </div>
                </div>

                {/* SQL 查询 */}
                <textarea
                    placeholder="SELECT * FROM users WHERE id = {{input.userId}}"
                    defaultValue={data.query}
                    rows={3}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono resize-none"
                />

                {/* 测试连接按钮 */}
                <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                >
                    {testing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    <span>测试连接</span>
                </button>

                {/* 测试结果 */}
                {testResult && (
                    <div className={`px-2 py-1.5 rounded-lg text-xs ${testResult.success
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                        {testResult.message}
                    </div>
                )}

                {/* 执行结果预览 */}
                {data.result && (
                    <div className="p-2 bg-slate-900 rounded-lg">
                        <div className="text-xs text-slate-400 mb-1">
                            查询结果 ({Array.isArray(data.result) ? data.result.length : 1} 行)
                        </div>
                        <pre className="text-xs text-emerald-400 font-mono overflow-auto max-h-20">
                            {JSON.stringify(data.result, null, 2).slice(0, 200)}
                            {JSON.stringify(data.result).length > 200 && '...'}
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
                className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-slate-800"
            />
        </div>
    );
}

export default memo(DatabaseNode);
