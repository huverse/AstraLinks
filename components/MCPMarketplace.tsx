/**
 * MCP 市场组件
 * 
 * @module components/MCPMarketplace
 * @description 用户端 MCP 市场浏览和安装界面
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, Download, Check, Plug, ExternalLink,
    ChevronRight, Star, RefreshCw, AlertCircle, X, Upload
} from 'lucide-react';
import { authFetch } from '../utils/api';
import MCPUpload from './MCPUpload';

// ============================================
// 类型定义
// ============================================

interface MCPServer {
    qualifiedName: string;
    displayName: string;
    description?: string;
    homepage?: string;
    useCount?: number;
    isDeployed?: boolean;
    isVerified?: boolean;
    tools?: Array<{ name: string; description?: string }>;
}

interface InstalledMCP {
    mcp_id: string;
    mcp_name: string;
    mcp_description?: string;
    source: string;
    installed_at: string;
    enabled: boolean;
}

// ============================================
// API 辅助函数
// ============================================

const getToken = () => localStorage.getItem('galaxyous_token');

const fetchAPI = async <T = any>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const token = getToken();
    return authFetch<T>(endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`, token, options);
};

// ============================================
// MCP 卡片组件
// ============================================

function MCPCard({
    server,
    isInstalled,
    onInstall,
    onUninstall,
    installing
}: {
    server: MCPServer;
    isInstalled: boolean;
    onInstall: () => void;
    onUninstall: () => void;
    installing: boolean;
}) {
    return (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:border-purple-500/50 transition-all group">
            <div className="flex items-start gap-3">
                <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-xl">
                    <Plug size={20} className="text-purple-400" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white truncate">
                            {server.displayName}
                        </h3>
                        {server.isVerified && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                                <Check size={10} /> 已验证
                            </span>
                        )}
                    </div>

                    <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                        {server.description || '暂无描述'}
                    </p>

                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                        {server.useCount !== undefined && (
                            <span className="flex items-center gap-1">
                                <Star size={12} /> {server.useCount.toLocaleString()}
                            </span>
                        )}
                        {server.tools && server.tools.length > 0 && (
                            <span>{server.tools.length} 工具</span>
                        )}
                    </div>
                </div>

                <div className="shrink-0">
                    {isInstalled ? (
                        <button
                            onClick={onUninstall}
                            disabled={installing}
                            className="px-3 py-1.5 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        >
                            已安装
                        </button>
                    ) : (
                        <button
                            onClick={onInstall}
                            disabled={installing}
                            className="px-3 py-1.5 bg-purple-500/20 text-purple-400 text-sm rounded-lg hover:bg-purple-500/30 transition-colors flex items-center gap-1"
                        >
                            {installing ? (
                                <RefreshCw size={14} className="animate-spin" />
                            ) : (
                                <Download size={14} />
                            )}
                            安装
                        </button>
                    )}
                </div>
            </div>

            {server.homepage && (
                <a
                    href={server.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-purple-400 transition-colors"
                >
                    <ExternalLink size={12} />
                    查看详情
                    <ChevronRight size={12} />
                </a>
            )}
        </div>
    );
}

// ============================================
// 我的 MCP 列表
// ============================================

function InstalledMCPList({
    mcps,
    onToggle,
    onUninstall,
}: {
    mcps: InstalledMCP[];
    onToggle: (id: string, enabled: boolean) => void;
    onUninstall: (id: string) => void;
}) {
    if (mcps.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <Plug size={40} className="mx-auto mb-3 opacity-50" />
                <p>暂未安装任何 MCP</p>
                <p className="text-sm mt-1">从市场中探索并安装 MCP 工具</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {mcps.map(mcp => (
                <div key={mcp.mcp_id} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
                    <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <Plug size={18} className="text-emerald-400" />
                    </div>

                    <div className="flex-1">
                        <div className="font-medium text-white">{mcp.mcp_name}</div>
                        <div className="text-xs text-slate-400">
                            {mcp.source === 'marketplace' ? 'Smithery 市场' : '用户上传'}
                        </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={mcp.enabled}
                            onChange={(e) => onToggle(mcp.mcp_id, e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-purple-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                    </label>

                    <button
                        onClick={() => onUninstall(mcp.mcp_id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ============================================
// 主组件
// ============================================

export default function MCPMarketplace({ onClose }: { onClose?: () => void }) {
    const [activeTab, setActiveTab] = useState<'market' | 'installed'>('market');
    const [searchQuery, setSearchQuery] = useState('');
    const [servers, setServers] = useState<MCPServer[]>([]);
    const [installedMcps, setInstalledMcps] = useState<InstalledMCP[]>([]);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showUpload, setShowUpload] = useState(false);

    // 加载市场数据
    const loadMarket = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchAPI<{ success: boolean; data: MCPServer[] }>(
                `/api/mcp-marketplace/search?q=${encodeURIComponent(searchQuery)}&pageSize=30`
            );
            if (response.success) {
                setServers(response.data || []);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [searchQuery]);

    // 加载已安装 MCP
    const loadInstalled = useCallback(async () => {
        try {
            const response = await fetchAPI<{ success: boolean; data: InstalledMCP[] }>(
                '/api/mcp-marketplace/user/installed'
            );
            if (response.success) {
                setInstalledMcps(response.data || []);
            }
        } catch (err) {
            // 忽略错误
        }
    }, []);

    useEffect(() => {
        loadMarket();
        loadInstalled();
    }, [loadMarket, loadInstalled]);

    // 安装 MCP
    const handleInstall = async (server: MCPServer) => {
        setInstalling(server.qualifiedName);
        try {
            const response = await fetchAPI<{ success: boolean; error?: string }>(
                `/api/mcp-marketplace/${encodeURIComponent(server.qualifiedName)}/install`,
                { method: 'POST' }
            );
            if (response.success) {
                await loadInstalled();
            } else {
                setError(response.error || '安装失败');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setInstalling(null);
        }
    };

    // 卸载 MCP
    const handleUninstall = async (mcpId: string) => {
        try {
            await fetchAPI(
                `/api/mcp-marketplace/${encodeURIComponent(mcpId)}/uninstall`,
                { method: 'DELETE' }
            );
            await loadInstalled();
        } catch (err: any) {
            setError(err.message);
        }
    };

    // 切换启用状态
    const handleToggle = async (mcpId: string, enabled: boolean) => {
        try {
            await fetchAPI(
                `/api/mcp-marketplace/${encodeURIComponent(mcpId)}/toggle`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled }),
                }
            );
            await loadInstalled();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const installedIds = new Set(installedMcps.map(m => m.mcp_id));

    return (
        <div className="h-full flex flex-col bg-slate-900/95 backdrop-blur-xl">
            {/* 头部 */}
            <div className="px-6 py-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Plug className="text-purple-400" />
                        MCP 工具市场
                    </h2>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X size={20} className="text-slate-400" />
                        </button>
                    )}
                </div>

                {/* 标签页 */}
                <div className="flex gap-4 mt-4">
                    <button
                        onClick={() => setActiveTab('market')}
                        className={`px-4 py-2 text-sm rounded-lg transition-colors ${activeTab === 'market'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        🛒 探索市场
                    </button>
                    <button
                        onClick={() => setActiveTab('installed')}
                        className={`px-4 py-2 text-sm rounded-lg transition-colors ${activeTab === 'installed'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        📦 我的 MCP ({installedMcps.length})
                    </button>

                    <button
                        onClick={() => setShowUpload(true)}
                        className="ml-auto px-4 py-2 text-sm rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5"
                    >
                        <Upload size={14} /> 上传自定义 MCP
                    </button>
                </div>
            </div>

            {/* 搜索栏 (仅市场) */}
            {activeTab === 'market' && (
                <div className="px-6 py-3 border-b border-white/5">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索 MCP 工具..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
                            onKeyDown={(e) => e.key === 'Enter' && loadMarket()}
                        />
                    </div>
                </div>
            )}

            {/* 错误提示 */}
            {error && (
                <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle size={16} />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'market' ? (
                    loading ? (
                        <div className="flex justify-center py-12">
                            <RefreshCw size={24} className="animate-spin text-purple-400" />
                        </div>
                    ) : servers.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            没有找到 MCP 工具
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {servers.map(server => (
                                <MCPCard
                                    key={server.qualifiedName}
                                    server={server}
                                    isInstalled={installedIds.has(server.qualifiedName)}
                                    onInstall={() => handleInstall(server)}
                                    onUninstall={() => handleUninstall(server.qualifiedName)}
                                    installing={installing === server.qualifiedName}
                                />
                            ))}
                        </div>
                    )
                ) : (
                    <InstalledMCPList
                        mcps={installedMcps}
                        onToggle={handleToggle}
                        onUninstall={handleUninstall}
                    />
                )}
            </div>

            {/* 底部提示 */}
            <div className="px-6 py-3 border-t border-white/10 text-xs text-slate-500 text-center">
                数据来源: <a href="https://smithery.ai" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Smithery.ai</a>
            </div>

            {/* 上传弹窗 */}
            {showUpload && (
                <MCPUpload
                    onClose={() => setShowUpload(false)}
                    onSuccess={() => loadInstalled()}
                />
            )}
        </div>
    );
}
