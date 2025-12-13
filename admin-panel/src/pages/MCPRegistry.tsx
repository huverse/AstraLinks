/**
 * MCP 注册管理页面
 * 
 * @module admin-panel/src/pages/MCPRegistry
 * @description MCP 注册中心管理
 */

import { useState } from 'react';
import { Plug, Check, X, Clock, RefreshCw, Search, Trash2, Eye, AlertCircle } from 'lucide-react';

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
    toolCount: number;
    usageCount: number;
    createdAt: string;
}

// ============================================
// 状态徽章
// ============================================

function SourceBadge({ source }: { source: string }) {
    const styles: Record<string, string> = {
        BUILTIN: 'bg-blue-100 text-blue-700',
        MARKETPLACE: 'bg-purple-100 text-purple-700',
        USER_UPLOADED: 'bg-orange-100 text-orange-700',
    };
    const labels: Record<string, string> = {
        BUILTIN: '内置',
        MARKETPLACE: '市场',
        USER_UPLOADED: '用户上传',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[source]}`}>
            {labels[source]}
        </span>
    );
}

function HealthBadge({ status }: { status: string }) {
    const styles: Record<string, { bg: string; icon: any }> = {
        HEALTHY: { bg: 'bg-green-100 text-green-700', icon: Check },
        DEGRADED: { bg: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
        OFFLINE: { bg: 'bg-red-100 text-red-700', icon: X },
        PENDING: { bg: 'bg-gray-100 text-gray-700', icon: Clock },
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
    onApprove,
    onReject,
    onDelete
}: {
    mcps: MCPItem[];
    onApprove?: (id: string) => void;
    onReject?: (id: string) => void;
    onDelete?: (id: string) => void;
}) {
    return (
        <div className="space-y-3">
            {mcps.map(mcp => (
                <div key={mcp.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className="p-3 bg-white rounded-xl">
                        <Plug size={24} className="text-purple-500" />
                    </div>

                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{mcp.name}</span>
                            <span className="text-xs text-gray-500">v{mcp.version}</span>
                            <SourceBadge source={mcp.source} />
                            <HealthBadge status={mcp.status} />
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                            {mcp.toolCount} 工具 · {mcp.usageCount} 次调用
                            {mcp.owner && ` · 上传者: ${mcp.owner}`}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {mcp.status === 'PENDING' && onApprove && onReject && (
                            <>
                                <button
                                    onClick={() => onApprove(mcp.id)}
                                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                >
                                    <Check size={18} />
                                </button>
                                <button
                                    onClick={() => onReject(mcp.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                >
                                    <X size={18} />
                                </button>
                            </>
                        )}
                        <button className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg">
                            <Eye size={18} />
                        </button>
                        {mcp.source !== 'BUILTIN' && onDelete && (
                            <button
                                onClick={() => onDelete(mcp.id)}
                                className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {mcps.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    暂无 MCP
                </div>
            )}
        </div>
    );
}

// ============================================
// 主页面
// ============================================

export default function MCPRegistry() {
    const [activeTab, setActiveTab] = useState<'builtin' | 'pending' | 'uploaded'>('builtin');
    const [searchQuery, setSearchQuery] = useState('');

    const [builtinMCPs] = useState<MCPItem[]>([
        { id: 'mcp-web-search', name: 'Web Search', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', toolCount: 1, usageCount: 1250, createdAt: '2024-01-01' },
        { id: 'mcp-file-system', name: 'File System', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', toolCount: 3, usageCount: 890, createdAt: '2024-01-01' },
        { id: 'mcp-code-exec', name: 'Code Executor', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', toolCount: 1, usageCount: 567, createdAt: '2024-01-01' },
        { id: 'mcp-http', name: 'HTTP Client', version: '1.0.0', source: 'BUILTIN', status: 'HEALTHY', toolCount: 1, usageCount: 2340, createdAt: '2024-01-01' },
    ]);

    const [pendingMCPs, setPendingMCPs] = useState<MCPItem[]>([
        { id: 'mcp-custom-1', name: 'Custom Analytics', version: '0.1.0', source: 'USER_UPLOADED', status: 'PENDING', owner: '张三', toolCount: 2, usageCount: 0, createdAt: '2024-12-10' },
    ]);

    const [uploadedMCPs, setUploadedMCPs] = useState<MCPItem[]>([
        { id: 'mcp-user-1', name: 'My Database Tool', version: '1.2.0', source: 'USER_UPLOADED', status: 'HEALTHY', owner: '李四', toolCount: 4, usageCount: 156, createdAt: '2024-11-20' },
    ]);

    const handleApprove = (id: string) => {
        const mcp = pendingMCPs.find(m => m.id === id);
        if (mcp) {
            setPendingMCPs(pendingMCPs.filter(m => m.id !== id));
            setUploadedMCPs([...uploadedMCPs, { ...mcp, status: 'HEALTHY' }]);
        }
    };

    const handleReject = (id: string) => {
        setPendingMCPs(pendingMCPs.filter(m => m.id !== id));
    };

    const handleDelete = (id: string) => {
        if (confirm('确定删除此 MCP？')) {
            setUploadedMCPs(uploadedMCPs.filter(m => m.id !== id));
        }
    };

    const tabs = [
        { id: 'builtin', label: '内置 MCP', count: builtinMCPs.length },
        { id: 'pending', label: '待审核', count: pendingMCPs.length },
        { id: 'uploaded', label: '用户上传', count: uploadedMCPs.length },
    ];

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">MCP 注册中心</h1>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="搜索 MCP..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                        <RefreshCw size={16} />
                        刷新
                    </button>
                </div>
            </div>

            {/* 标签页 */}
            <div className="flex border-b border-gray-200 mb-6">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                            ? 'text-blue-600 border-blue-600'
                            : 'text-gray-500 border-transparent hover:text-gray-700'
                            }`}
                    >
                        {tab.label}
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                            }`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* 内容 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                {activeTab === 'builtin' && <MCPList mcps={builtinMCPs} />}
                {activeTab === 'pending' && (
                    <MCPList
                        mcps={pendingMCPs}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                )}
                {activeTab === 'uploaded' && (
                    <MCPList
                        mcps={uploadedMCPs}
                        onDelete={handleDelete}
                    />
                )}
            </div>
        </div>
    );
}
