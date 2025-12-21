/**
 * 评论面板
 * 
 * @module components/workflow/CommentPanel
 * @description 工作流评论列表、添加评论、回复和解决
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, X, Check, Reply, Trash2, Loader2, CheckCircle } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface Comment {
    id: string;
    nodeId: string | null;
    userId: string;
    username: string;
    avatar?: string;
    content: string;
    position: { x: number; y: number } | null;
    resolved: boolean;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
}

interface CommentPanelProps {
    workflowId: string;
    isOpen: boolean;
    onClose: () => void;
    selectedNodeId?: string | null;
    canEdit?: boolean;
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

export function CommentPanel({ workflowId, isOpen, onClose, selectedNodeId, canEdit = true }: CommentPanelProps) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [showResolved, setShowResolved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // 获取评论列表
    const fetchComments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let url = `${getApiBase()}/api/workflows/${workflowId}/comments`;
            const params = new URLSearchParams();
            if (selectedNodeId) params.append('nodeId', selectedNodeId);
            if (!showResolved) params.append('resolved', 'false');
            if (params.toString()) url += `?${params.toString()}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });

            if (!response.ok) throw new Error('获取评论失败');

            const data = await response.json();
            setComments(data.comments || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [workflowId, selectedNodeId, showResolved]);

    useEffect(() => {
        if (isOpen && workflowId) {
            fetchComments();
        }
    }, [isOpen, workflowId, fetchComments]);

    // 添加评论
    const handleSubmit = async () => {
        if (!newComment.trim()) return;

        setSubmitting(true);
        setError(null);
        try {
            const response = await fetch(`${getApiBase()}/api/workflows/${workflowId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`,
                },
                body: JSON.stringify({
                    nodeId: selectedNodeId || null,
                    content: newComment.trim(),
                    parentId: replyingTo,
                }),
            });

            if (!response.ok) throw new Error('发送失败');

            setNewComment('');
            setReplyingTo(null);
            fetchComments();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // 删除评论
    const handleDelete = async (commentId: string) => {
        if (!confirm('确定要删除此评论吗？')) return;

        try {
            const response = await fetch(
                `${getApiBase()}/api/workflows/${workflowId}/comments/${commentId}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${getToken()}` },
                }
            );

            if (!response.ok) throw new Error('删除失败');
            fetchComments();
        } catch (err: any) {
            setError(err.message);
        }
    };

    // 标记解决
    const handleResolve = async (commentId: string, resolved: boolean) => {
        try {
            const response = await fetch(
                `${getApiBase()}/api/workflows/${workflowId}/comments/${commentId}/resolve`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`,
                    },
                    body: JSON.stringify({ resolved }),
                }
            );

            if (!response.ok) throw new Error('操作失败');
            fetchComments();
        } catch (err: any) {
            setError(err.message);
        }
    };

    // 格式化时间
    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes} 分钟前`;
        if (hours < 24) return `${hours} 小时前`;
        if (days < 7) return `${days} 天前`;
        return date.toLocaleDateString('zh-CN');
    };

    if (!isOpen) return null;

    // 按父评论分组
    const rootComments = comments.filter(c => !c.parentId);
    const getReplies = (parentId: string) => comments.filter(c => c.parentId === parentId);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
                {/* 头部 */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="text-green-400" size={20} />
                        <h2 className="text-lg font-bold text-white">评论</h2>
                        {selectedNodeId && (
                            <span className="text-xs text-slate-500 ml-2">节点: {selectedNodeId.slice(0, 8)}...</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showResolved}
                                onChange={e => setShowResolved(e.target.checked)}
                                className="rounded"
                            />
                            显示已解决
                        </label>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* 错误提示 */}
                {error && (
                    <div className="px-4 py-2 bg-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* 评论列表 */}
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="animate-spin text-green-400" size={24} />
                        </div>
                    ) : rootComments.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            暂无评论，发表第一条吧！
                        </div>
                    ) : (
                        rootComments.map(comment => (
                            <div key={comment.id} className="space-y-2">
                                {/* 主评论 */}
                                <div className={`p-3 rounded-xl ${comment.resolved ? 'bg-green-900/20 border border-green-500/30' : 'bg-white/5'}`}>
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                            {comment.username?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-white text-sm">{comment.username}</span>
                                                <span className="text-xs text-slate-500">{formatTime(comment.createdAt)}</span>
                                                {comment.resolved && (
                                                    <span className="flex items-center gap-1 text-xs text-green-400">
                                                        <CheckCircle size={12} />
                                                        已解决
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{comment.content}</p>

                                            {/* 操作按钮 */}
                                            <div className="flex items-center gap-2 mt-2">
                                                <button
                                                    onClick={() => {
                                                        setReplyingTo(comment.id);
                                                        inputRef.current?.focus();
                                                    }}
                                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                                                >
                                                    <Reply size={12} />
                                                    回复
                                                </button>
                                                {canEdit && !comment.resolved && (
                                                    <button
                                                        onClick={() => handleResolve(comment.id, true)}
                                                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-green-400 transition-colors"
                                                    >
                                                        <Check size={12} />
                                                        标记解决
                                                    </button>
                                                )}
                                                {canEdit && comment.resolved && (
                                                    <button
                                                        onClick={() => handleResolve(comment.id, false)}
                                                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-yellow-400 transition-colors"
                                                    >
                                                        重新打开
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(comment.id)}
                                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 回复 */}
                                {getReplies(comment.id).map(reply => (
                                    <div key={reply.id} className="ml-8 p-3 bg-white/5 rounded-xl">
                                        <div className="flex items-start gap-3">
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                {reply.username?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-white text-xs">{reply.username}</span>
                                                    <span className="text-xs text-slate-500">{formatTime(reply.createdAt)}</span>
                                                </div>
                                                <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">{reply.content}</p>
                                            </div>
                                            <button
                                                onClick={() => handleDelete(reply.id)}
                                                className="p-1 text-slate-400 hover:text-red-400 transition-colors shrink-0"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </div>

                {/* 输入区 */}
                <div className="p-4 border-t border-white/10 shrink-0">
                    {replyingTo && (
                        <div className="flex items-center justify-between mb-2 px-2 py-1 bg-blue-500/20 rounded-lg text-xs text-blue-400">
                            <span>回复评论...</span>
                            <button onClick={() => setReplyingTo(null)} className="hover:text-white">
                                <X size={14} />
                            </button>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <textarea
                            ref={inputRef}
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            placeholder="写下你的评论..."
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500 text-sm resize-none"
                            rows={2}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    handleSubmit();
                                }
                            }}
                        />
                        <button
                            onClick={handleSubmit}
                            disabled={!newComment.trim() || submitting}
                            className="px-4 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg flex items-center transition-colors"
                        >
                            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Ctrl+Enter 快速发送</div>
                </div>
            </div>
        </div>
    );
}

export default CommentPanel;
