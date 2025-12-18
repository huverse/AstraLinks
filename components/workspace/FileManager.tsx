/**
 * 文件管理器组件
 * 
 * @module components/workspace/FileManager
 * @description Workspace 内的文件管理器
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
    Folder, File, FileText, FileCode, Image, Upload,
    Trash2, Download, FolderPlus, ChevronRight, ChevronDown,
    RefreshCw, Search
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface FileItem {
    id: string;
    name: string;
    type: 'file' | 'folder';
    mimeType?: string;
    size?: number;
    path: string;
    parentId?: string;
    children?: FileItem[];
    createdAt: string;
    updatedAt: string;
}

interface FileManagerProps {
    workspaceId: string;
    onFileSelect?: (file: FileItem) => void;
    onFileUpload?: (file: File, path: string) => void;
}

// ============================================
// 文件图标
// ============================================

function FileIcon({ mimeType, type }: { mimeType?: string; type: 'file' | 'folder' }) {
    if (type === 'folder') {
        return <Folder size={16} className="text-amber-400" />;
    }

    if (mimeType?.startsWith('image/')) {
        return <Image size={16} className="text-green-400" />;
    }

    if (mimeType?.includes('javascript') || mimeType?.includes('typescript') || mimeType?.includes('json')) {
        return <FileCode size={16} className="text-blue-400" />;
    }

    if (mimeType?.startsWith('text/')) {
        return <FileText size={16} className="text-slate-400" />;
    }

    return <File size={16} className="text-slate-400" />;
}

// ============================================
// 文件项组件
// ============================================

interface FileTreeItemProps {
    item: FileItem;
    level: number;
    selectedId: string | null;
    expandedIds: Set<string>;
    onSelect: (item: FileItem) => void;
    onToggle: (id: string) => void;
}

function FileTreeItem({ item, level, selectedId, expandedIds, onSelect, onToggle }: FileTreeItemProps) {
    const isExpanded = expandedIds.has(item.id);
    const isSelected = selectedId === item.id;
    const hasChildren = item.type === 'folder' && item.children && item.children.length > 0;

    return (
        <div>
            <div
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg transition-colors ${isSelected ? 'bg-purple-600/30 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`}
                style={{ paddingLeft: `${8 + level * 16}px` }}
                onClick={() => {
                    if (item.type === 'folder') {
                        onToggle(item.id);
                    }
                    onSelect(item);
                }}
            >
                {item.type === 'folder' && (
                    <span className="text-slate-500">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                )}
                <FileIcon type={item.type} mimeType={item.mimeType} />
                <span className="text-sm truncate">{item.name}</span>
                {item.size && (
                    <span className="text-[10px] text-slate-500 ml-auto">
                        {formatFileSize(item.size)}
                    </span>
                )}
            </div>

            {isExpanded && hasChildren && (
                <div>
                    {item.children!.map(child => (
                        <FileTreeItem
                            key={child.id}
                            item={child}
                            level={level + 1}
                            selectedId={selectedId}
                            expandedIds={expandedIds}
                            onSelect={onSelect}
                            onToggle={onToggle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================
// 格式化文件大小
// ============================================

function formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

// ============================================
// 主组件
// ============================================

export function FileManager({ workspaceId, onFileSelect }: FileManagerProps) {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz'
        ? 'https://astralinks.xyz'
        : 'http://localhost:3001';

    // 获取文件列表
    const fetchFiles = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`${API_BASE}/api/workspace-config/${workspaceId}/files`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            if (response.ok) {
                const data = await response.json();
                setFiles(data.files || []);
                const folderIds = (data.files || [])
                    .filter((f: FileItem) => f.type === 'folder')
                    .map((f: FileItem) => f.id);
                setExpandedIds(new Set(folderIds));
            }
        } catch (error) {
            console.error('Failed to fetch files:', error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, API_BASE]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const handleSelect = useCallback((item: FileItem) => {
        setSelectedId(item.id);
        if (item.type === 'file') {
            onFileSelect?.(item);
        }
    }, [onFileSelect]);

    const handleToggle = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // 上传文件
    const handleUpload = useCallback(async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = async (e) => {
            const fileList = (e.target as HTMLInputElement).files;
            if (!fileList || fileList.length === 0) return;

            setUploading(true);
            try {
                const token = localStorage.getItem('galaxyous_token');

                for (const file of Array.from(fileList)) {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('path', '/');

                    const response = await fetch(`${API_BASE}/api/workspace-config/${workspaceId}/files`, {
                        method: 'POST',
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                        body: formData,
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        alert(`上传失败: ${err.error || '未知错误'}`);
                    }
                }

                alert('上传成功！');
                fetchFiles();
            } catch (error: any) {
                alert('上传失败: ' + error.message);
            } finally {
                setUploading(false);
            }
        };
        input.click();
    }, [workspaceId, fetchFiles, API_BASE]);

    // 新建文件夹
    const handleCreateFolder = useCallback(async () => {
        const name = prompt('请输入文件夹名称:');
        if (!name?.trim()) return;

        try {
            const token = localStorage.getItem('galaxyous_token');
            const response = await fetch(`${API_BASE}/api/workspace-config/${workspaceId}/files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    name: name.trim(),
                    type: 'folder',
                    path: '/',
                }),
            });

            if (response.ok) {
                alert('文件夹创建成功！');
                fetchFiles();
            } else {
                const err = await response.json();
                alert(`创建失败: ${err.error || '未知错误'}`);
            }
        } catch (error: any) {
            alert('创建失败: ' + error.message);
        }
    }, [workspaceId, fetchFiles, API_BASE]);

    // 过滤文件
    const filteredFiles = searchQuery
        ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : files;

    return (
        <div className="h-full flex flex-col bg-slate-900/50 rounded-xl border border-white/10">
            {/* 工具栏 */}
            <div className="p-3 border-b border-white/10 flex items-center gap-2">
                <div className="flex-1 relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="搜索文件..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                    />
                </div>
                <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="p-1.5 bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50"
                    title="上传文件"
                >
                    <Upload size={16} className="text-white" />
                </button>
                <button
                    onClick={handleCreateFolder}
                    className="p-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    title="新建文件夹"
                >
                    <FolderPlus size={16} className="text-slate-400" />
                </button>
                <button
                    onClick={fetchFiles}
                    className="p-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    title="刷新"
                >
                    <RefreshCw size={16} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* 文件树 */}
            <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                    <div className="flex items-center justify-center h-20">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent" />
                    </div>
                ) : filteredFiles.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <FolderPlus size={24} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">暂无文件</p>
                        <p className="text-xs mt-1">点击上传按钮添加文件</p>
                    </div>
                ) : (
                    filteredFiles.map(item => (
                        <FileTreeItem
                            key={item.id}
                            item={item}
                            level={0}
                            selectedId={selectedId}
                            expandedIds={expandedIds}
                            onSelect={handleSelect}
                            onToggle={handleToggle}
                        />
                    ))
                )}
            </div>

            {/* 底部信息 */}
            <div className="p-2 border-t border-white/10 text-xs text-slate-500 flex justify-between">
                <span>{uploading ? '上传中...' : (selectedId ? `已选择: ${files.find(f => f.id === selectedId)?.name || ''}` : '无选择')}</span>
                <span>{files.length} 个项目</span>
            </div>
        </div>
    );
}

export default FileManager;

