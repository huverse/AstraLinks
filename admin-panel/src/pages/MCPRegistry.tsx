/**
 * MCP 注册管理页面
 * 
 * @module admin-panel/src/pages/MCPRegistry
 * @description MCP 注册中心管理 - 生产版本
 */

import { useState, useEffect } from 'react';
import { Plug, Check, X, Clock, RefreshCw, Search, Trash2, Eye, AlertCircle, ShoppingCart, Download } from 'lucide-react';
import { fetchAPI } from '../services/api';

// ============================================
// 类型定义
// ============================================

interface MCPItem {
    id: string;
    name: string;
    version: string;
    source: 'BUILTIN' | 'MARKETPLACE' | 'USER_UPLOADED';
    status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'PENDING';
    owner?: string;
    tool_count: number;
    usage_count: number;
    created_at: string;
}

// ============================================
// 状态徽章
// ============================================

function SourceBadge({ source }: { source: string }) {
    const styles: Record<string, string> = {
        BUILTIN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        MARKETPLACE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        USER_UPLOADED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };
    const labels: Record<string, string> = {
        BUILTIN: '内置',
        MARKETPLACE: '市场',
        USER_UPLOADED: '用户上传',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[source] || 'bg-gray-100 dark:bg-gray-800'}`}>
            {labels[source] || source}
        </span>
    );
}

function HealthBadge({ status }: { status: string }) {
    const styles: Record<string, { bg: string; icon: any }> = {
        HEALTHY: { bg: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: Check },
        DEGRADED: { bg: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: AlertCircle },
        OFFLINE: { bg: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: X },
        PENDING: { bg: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', icon: Clock },
    };
    const style = styles[status] || styles.PENDING;
    const Icon = style.icon;
    return (
        <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg}`}>
            <Icon size={12} />
            {status}
        </span>
    );
}

// ============================================
// MCP 列表
// ============================================

function MCPList({
    mcps,
    loading,
    onApprove,
    onReject,
    onDelete
}: {
    mcps: MCPItem[];
    loading: boolean;
    onApprove?: (id: string) => void;
    onReject?: (id: string) => void;
    onDelete?: (id: string) => void;
}) {
    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    if (mcps.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                暂无 MCP
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {mcps.map(mcp => (
                <div key={mcp.id} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                    <div className="p-3 bg-white dark:bg-slate-600 rounded-xl shadow-sm">
                        <Plug size={24} className="text-purple-500" />
                    </div>

                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">{mcp.name}</span>
                            <span className="text-xs text-gray-500 dark:text-slate-400">v{mcp.version}</span>
                            <SourceBadge source={mcp.source} />
                            <HealthBadge status={mcp.status} />
                        </div>
                        <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                            {mcp.tool_count} 工具 · {mcp.usage_count} 次调用
                            {mcp.owner && ` · 上传者: ${mcp.owner}`}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {mcp.status === 'PENDING' && onApprove && onReject && (
                            <>
                                <button
                                    onClick={() => onApprove(mcp.id)}
                                    className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                                >
                                    <Check size={18} />
                                </button>
                                <button
                                    onClick={() => onReject(mcp.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                >
                                    <X size={18} />
                                </button>
                            </>
                        )}
                        <button className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg">
                            <Eye size={18} />
                        </button>
                        {mcp.source !== 'BUILTIN' && onDelete && (
                            <button
                                onClick={() => onDelete(mcp.id)}
                                className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-lg"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================
// 主页面
// ============================================

export default function MCPRegistry() {
    const [activeTab, setActiveTab] = useState<'builtin' | 'pending' | 'uploaded' | 'marketplace'>('builtin');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    const [builtinMCPs, setBuiltinMCPs] = useState<MCPItem[]>([]);
    const [pendingMCPs, setPendingMCPs] = useState<MCPItem[]>([]);
    const [uploadedMCPs, setUploadedMCPs] = useState<MCPItem[]>([]);
    const [marketplaceMCPs, setMarketplaceMCPs] = useState<any[]>([]);
    const [marketplaceLoading, setMarketplaceLoading] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await fetchAPI('/admin/mcp-registry');
            if (res.success && res.data) {
                const all = res.data as MCPItem[];
                setBuiltinMCPs(all.filter(m => m.source === 'BUILTIN'));
                setPendingMCPs(all.filter(m => m.status === 'PENDING'));
                setUploadedMCPs(all.filter(m => m.source === 'USER_UPLOADED' && m.status !== 'PENDING'));
            }
        } catch (error) {
            console.error('Failed to load MCP data:', error);
            // 如果 API 不可用，显示内置 MCP
            setBuiltinMCPs([
                { id: 'mcp-web-search', name: 'Web Search', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', tool_count: 1, usage_count: 0, created_at: '' },
                { id: 'mcp-file-system', name: 'File System', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', tool_count: 3, usage_count: 0, created_at: '' },
                { id: 'mcp-code-exec', name: 'Code Executor', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', tool_count: 1, usage_count: 0, created_at: '' },
                { id: 'mcp-http', name: 'HTTP Client', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', tool_count: 1, usage_count: 0, created_at: '' },
            ]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleApprove = async (id: string) => {
        try {
            await fetchAPI(`/admin/mcp-registry/${id}/approve`, { method: 'POST' });
            const mcp = pendingMCPs.find(m => m.id === id);
            if (mcp) {
                setPendingMCPs(pendingMCPs.filter(m => m.id !== id));
                setUploadedMCPs([...uploadedMCPs, { ...mcp, status: 'HEALTHY' }]);
            }
        } catch (error) {
            console.error('Failed to approve MCP:', error);
        }
    };

    const handleReject = async (id: string) => {
        try {
            await fetchAPI(`/admin/mcp-registry/${id}/reject`, { method: 'POST' });
            setPendingMCPs(pendingMCPs.filter(m => m.id !== id));
        } catch (error) {
            console.error('Failed to reject MCP:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('确定删除此 MCP？')) return;

        try {
            await fetchAPI(`/admin/mcp-registry/${id}`, { method: 'DELETE' });
            setUploadedMCPs(uploadedMCPs.filter(m => m.id !== id));
        } catch (error) {
            console.error('Failed to delete MCP:', error);
        }
    };

    const tabs = [
        { id: 'builtin', label: '内置 MCP', count: builtinMCPs.length },
        { id: 'pending', label: '待审核', count: pendingMCPs.length },
        { id: 'uploaded', label: '用户上传', count: uploadedMCPs.length },
        { id: 'marketplace', label: '🛏️ 市场', count: marketplaceMCPs.length },
    ];

    // 加载市场数据
    const loadMarketplace = async () => {
        setMarketplaceLoading(true);
        try {
            const res = await fetchAPI(`/mcp-marketplace/search?q=${encodeURIComponent(searchQuery)}&pageSize=30`);
            if (res.success && res.data) {
                setMarketplaceMCPs(res.data);
            }
        } catch (error) {
            console.error('Failed to load marketplace:', error);
        } finally {
            setMarketplaceLoading(false);
        }
    };

    // 过滤搜索
    const filterMCPs = (mcps: MCPItem[]) => {
        if (!searchQuery) return mcps;
        const q = searchQuery.toLowerCase();
        return mcps.filter(m => m.name.toLowerCase().includes(q));
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MCP 注册中心</h1>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="搜索 MCP..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <button
                        onClick={loadData}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        刷新
                    </button>
                </div>
            </div>

            {/* 标签页 */}
            <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                            ? 'text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : 'text-gray-500 border-transparent hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
                            }`}
                    >
                        {tab.label}
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* 内容 */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
                {activeTab === 'builtin' && (
                    <MCPList mcps={filterMCPs(builtinMCPs)} loading={loading} />
                )}
                {activeTab === 'pending' && (
                    <MCPList
                        mcps={filterMCPs(pendingMCPs)}
                        loading={loading}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                )}
                {activeTab === 'uploaded' && (
                    <MCPList
                        mcps={filterMCPs(uploadedMCPs)}
                        loading={loading}
                        onDelete={handleDelete}
                    />
                )}
                {activeTab === 'marketplace' && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm text-gray-500 dark:text-slate-400">
                                <ShoppingCart size={14} className="inline mr-1" />
                                从 Smithery.ai 市场浏览 MCP
                            </p>
                            <button
                                onClick={loadMarketplace}
                                className="flex items-center gap-2 px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600"
                            >
                                <RefreshCw size={14} className={marketplaceLoading ? 'animate-spin' : ''} />
                                加载市场
                            </button>
                        </div>
                        {marketplaceLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
                            </div>
                        ) : marketplaceMCPs.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                                点击 "加载市场" 按钮获取 MCP
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {marketplaceMCPs.map((mcp: any) => (
                                    <div key={mcp.qualifiedName} className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                                <Plug size={18} className="text-purple-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                                                    {mcp.displayName}
                                                </h3>
                                                <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2 mt-1">
                                                    {mcp.description || '暂无描述'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-slate-600">
                                            <span className="text-xs text-gray-400">
                                                {mcp.useCount?.toLocaleString() || 0} 次使用
                                            </span>
                                            <a
                                                href={`https://smithery.ai/server/${mcp.qualifiedName}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-600"
                                            >
                                                <Download size={12} />
                                                查看详情
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
