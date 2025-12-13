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

export function FileManager({ workspaceId, onFileSelect, onFileUpload }: FileManagerProps) {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    // 获取真实文件列表
    useEffect(() => {
        const fetchFiles = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('galaxyous_token');
                const response = await fetch(`/api/workspace-config/${workspaceId}/files`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                });

                if (response.ok) {
                    const data = await response.json();
                    setFiles(data.files || []);
                    // 自动展开文件夹
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
        };

        fetchFiles();
    }, [workspaceId]);


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

    const handleUpload = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) {
                Array.from(files).forEach(file => {
                    onFileUpload?.(file, '/');
                });
            }
        };
        input.click();
    }, [onFileUpload]);

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
                    className="p-1.5 bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors"
                    title="上传文件"
                >
                    <Upload size={16} className="text-white" />
                </button>
                <button
                    className="p-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    title="新建文件夹"
                >
                    <FolderPlus size={16} className="text-slate-400" />
                </button>
                <button
                    className="p-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    title="刷新"
                >
                    <RefreshCw size={16} className="text-slate-400" />
                </button>
            </div>

            {/* 文件树 */}
            <div className="flex-1 overflow-y-auto p-2">
                {files.map(item => (
                    <FileTreeItem
                        key={item.id}
                        item={item}
                        level={0}
                        selectedId={selectedId}
                        expandedIds={expandedIds}
                        onSelect={handleSelect}
                        onToggle={handleToggle}
                    />
                ))}
            </div>

            {/* 底部信息 */}
            <div className="p-2 border-t border-white/10 text-xs text-slate-500">
                {selectedId ? `已选择: ${files.find(f => f.id === selectedId)?.name || ''}` : '无选择'}
            </div>
        </div>
    );
}

export default FileManager;
