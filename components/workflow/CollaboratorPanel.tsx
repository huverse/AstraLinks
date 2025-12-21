/**
 * 协作者管理面板
 * 
 * @module components/workflow/CollaboratorPanel
 * @description 管理工作流协作者：邀请、角色更改、移除
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, X, Shield, Eye, Edit3, Trash2, Crown, Loader2, Check } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface Collaborator {
    id?: string;
    userId: string;
    username: string;
    email?: string;
    avatar?: string;
    role: 'owner' | 'editor' | 'viewer';
    invitedAt?: string;
    acceptedAt?: string;
}

interface CollaboratorPanelProps {
    workflowId: string;
    isOpen: boolean;
    onClose: () => void;
    currentUserRole?: string;
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
// 角色配置
// ============================================

const ROLE_CONFIG = {
    owner: { label: '所有者', icon: Crown, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
    editor: { label: '编辑者', icon: Edit3, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    viewer: { label: '查看者', icon: Eye, color: 'text-slate-400', bgColor: 'bg-slate-500/20' },
};

// ============================================
// 组件
// ============================================

export function CollaboratorPanel({ workflowId, isOpen, onClose, currentUserRole }: CollaboratorPanelProps) {
    const [owner, setOwner] = useState<Collaborator | null>(null);
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [loading, setLoading] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
    const [inviting, setInviting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const isOwner = currentUserRole === 'owner';

    // 获取协作者列表
    const fetchCollaborators = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${getApiBase()}/api/workflows/${workflowId}/collaborators`, {
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });

            if (!response.ok) throw new Error('获取协作者列表失败');

            const data = await response.json();
            setOwner(data.owner);
            setCollaborators(data.collaborators || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [workflowId]);

    useEffect(() => {
        if (isOpen && workflowId) {
            fetchCollaborators();
        }
    }, [isOpen, workflowId, fetchCollaborators]);

    // 邀请协作者
    const handleInvite = async () => {
        if (!inviteEmail.trim()) return;

        setInviting(true);
        setError(null);
        setSuccess(null);
        try {
            const response = await fetch(`${getApiBase()}/api/workflows/${workflowId}/collaborators`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`,
                },
                body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '邀请失败');
            }

            setSuccess('协作者添加成功');
            setInviteEmail('');
            fetchCollaborators();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setInviting(false);
        }
    };

    // 更改角色
    const handleChangeRole = async (userId: string, newRole: 'editor' | 'viewer') => {
        try {
            const response = await fetch(
                `${getApiBase()}/api/workflows/${workflowId}/collaborators/${userId}/role`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`,
                    },
                    body: JSON.stringify({ role: newRole }),
                }
            );

            if (!response.ok) throw new Error('更改角色失败');
            fetchCollaborators();
        } catch (err: any) {
            setError(err.message);
        }
    };

    // 移除协作者
    const handleRemove = async (userId: string) => {
        if (!confirm('确定要移除此协作者吗？')) return;

        try {
            const response = await fetch(
                `${getApiBase()}/api/workflows/${workflowId}/collaborators/${userId}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${getToken()}` },
                }
            );

            if (!response.ok) throw new Error('移除失败');
            fetchCollaborators();
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
                {/* 头部 */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Users className="text-blue-400" size={20} />
                        <h2 className="text-lg font-bold text-white">协作者管理</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* 邀请表单 (仅所有者可见) */}
                {isOwner && (
                    <div className="p-4 border-b border-white/10 shrink-0">
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={inviteEmail}
                                onChange={e => setInviteEmail(e.target.value)}
                                placeholder="输入邮箱地址邀请协作者..."
                                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                            />
                            <select
                                value={inviteRole}
                                onChange={e => setInviteRole(e.target.value as 'editor' | 'viewer')}
                                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                            >
                                <option value="viewer">查看者</option>
                                <option value="editor">编辑者</option>
                            </select>
                            <button
                                onClick={handleInvite}
                                disabled={!inviteEmail.trim() || inviting}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg flex items-center gap-1 text-sm transition-colors"
                            >
                                {inviting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                                <span>邀请</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* 消息提示 */}
                {(error || success) && (
                    <div className={`px-4 py-2 text-sm ${error ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                        {error || success}
                    </div>
                )}

                {/* 协作者列表 */}
                <div className="flex-1 p-4 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="animate-spin text-blue-400" size={24} />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {/* 所有者 */}
                            {owner && (
                                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white font-bold">
                                        {owner.username?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-white truncate">{owner.username}</div>
                                        <div className="text-xs text-slate-500 truncate">{owner.email}</div>
                                    </div>
                                    <div className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${ROLE_CONFIG.owner.bgColor} ${ROLE_CONFIG.owner.color}`}>
                                        <Crown size={12} />
                                        所有者
                                    </div>
                                </div>
                            )}

                            {/* 协作者 */}
                            {collaborators.map(collab => {
                                const roleConfig = ROLE_CONFIG[collab.role] || ROLE_CONFIG.viewer;
                                const RoleIcon = roleConfig.icon;

                                return (
                                    <div key={collab.userId} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                            {collab.username?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-white truncate">{collab.username}</div>
                                            <div className="text-xs text-slate-500 truncate">{collab.email}</div>
                                        </div>

                                        {isOwner ? (
                                            <>
                                                <select
                                                    value={collab.role}
                                                    onChange={e => handleChangeRole(collab.userId, e.target.value as 'editor' | 'viewer')}
                                                    className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none"
                                                >
                                                    <option value="viewer">查看者</option>
                                                    <option value="editor">编辑者</option>
                                                </select>
                                                <button
                                                    onClick={() => handleRemove(collab.userId)}
                                                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                                    title="移除协作者"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        ) : (
                                            <div className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${roleConfig.bgColor} ${roleConfig.color}`}>
                                                <RoleIcon size={12} />
                                                {roleConfig.label}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {collaborators.length === 0 && !owner && (
                                <div className="text-center py-8 text-slate-500">
                                    暂无协作者
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 底部说明 */}
                <div className="p-3 border-t border-white/10 text-xs text-slate-500 text-center shrink-0">
                    <Shield size={12} className="inline mr-1" />
                    编辑者可以修改工作流，查看者只能查看
                </div>
            </div>
        </div>
    );
}

export default CollaboratorPanel;
