import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { Search, Ban, Trash2, ShieldOff, Crown, Star, Shield, ChevronDown, AlertTriangle } from 'lucide-react';

interface TierModalProps {
    isOpen: boolean;
    user: any;
    onClose: () => void;
    onSave: (userId: number, newTier: string, reason: string) => void;
}

function TierModal({ isOpen, user, onClose, onSave }: TierModalProps) {
    const [newTier, setNewTier] = useState(user?.user_tier || 'free');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    if (!isOpen || !user) return null;

    const handleSave = async () => {
        if (!reason.trim() || reason.trim().length < 5) {
            alert('请输入至少5个字符的变更理由');
            return;
        }
        setSaving(true);
        await onSave(user.id, newTier, reason.trim());
        setSaving(false);
        setReason('');
        onClose();
    };

    const tiers = [
        { value: 'free', label: 'Free', icon: Shield, color: 'text-gray-500' },
        { value: 'pro', label: 'Pro', icon: Star, color: 'text-purple-500' },
        { value: 'ultra', label: 'Ultra', icon: Crown, color: 'text-amber-500' }
    ];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md p-6 m-4" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                    修改用户等级
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    用户: <span className="font-medium text-gray-900 dark:text-white">{user.username}</span>
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            新等级
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {tiers.map(tier => {
                                const Icon = tier.icon;
                                return (
                                    <button
                                        key={tier.value}
                                        onClick={() => setNewTier(tier.value)}
                                        className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${newTier === tier.value
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                                            }`}
                                    >
                                        <Icon className={tier.color} size={24} />
                                        <span className={`text-sm font-medium mt-1 ${tier.color}`}>{tier.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            变更理由 <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="请输入变更理由（至少5个字符）"
                            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                            rows={3}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || newTier === user.user_tier}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                    >
                        {saving ? '保存中...' : '确认变更'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ==================== DeleteUserModal ====================
interface DeleteModalProps {
    isOpen: boolean;
    user: any;
    onClose: () => void;
    onConfirm: (userId: number, reason: string, blacklistQQ: boolean, blacklistIP: boolean) => void;
}

function DeleteUserModal({ isOpen, user, onClose, onConfirm }: DeleteModalProps) {
    const [reason, setReason] = useState('');
    const [blacklistQQ, setBlacklistQQ] = useState(false);
    const [blacklistIP, setBlacklistIP] = useState(false);
    const [deleting, setDeleting] = useState(false);

    if (!isOpen || !user) return null;

    const handleConfirm = async () => {
        if (!reason.trim() || reason.trim().length < 5) {
            alert('请输入至少5个字符的删除理由');
            return;
        }
        setDeleting(true);
        await onConfirm(user.id, reason.trim(), blacklistQQ, blacklistIP);
        setDeleting(false);
        setReason('');
        setBlacklistQQ(false);
        setBlacklistIP(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md p-6 m-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                        <AlertTriangle className="text-red-500" size={24} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        永久删除用户
                    </h2>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
                    <p className="text-sm text-red-700 dark:text-red-400">
                        <strong>警告：</strong>此操作不可逆！用户 <span className="font-bold">{user.username}</span> 的所有数据将被永久删除，
                        该用户登录时会看到删除原因。
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            删除原因 <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="请输入删除理由（用户会看到此信息）"
                            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 outline-none"
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            额外措施（可选）
                        </label>

                        <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${blacklistQQ
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                            : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                            } ${!user.qq_openid ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input
                                type="checkbox"
                                checked={blacklistQQ}
                                onChange={e => setBlacklistQQ(e.target.checked)}
                                disabled={!user.qq_openid}
                                className="w-4 h-4 text-red-500"
                            />
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    拉黑 QQ 号
                                </p>
                                <p className="text-xs text-gray-500">
                                    {user.qq_openid ? '该 QQ 将无法再次注册或登录' : '该用户未绑定 QQ'}
                                </p>
                            </div>
                        </label>

                        <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${blacklistIP
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                            : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                            }`}>
                            <input
                                type="checkbox"
                                checked={blacklistIP}
                                onChange={e => setBlacklistIP(e.target.checked)}
                                className="w-4 h-4 text-red-500"
                            />
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    拉黑 IP 地址
                                </p>
                                <p className="text-xs text-gray-500">
                                    该用户最后使用的 IP 将被封禁
                                </p>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={deleting || reason.trim().length < 5}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                    >
                        {deleting ? '删除中...' : '确认删除'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function Users() {
    const [users, setUsers] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [page, _setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [tierModalUser, setTierModalUser] = useState<any>(null);
    const [deleteModalUser, setDeleteModalUser] = useState<any>(null);

    const loadUsers = () => {
        setLoading(true);
        adminAPI.getUsers(page, 20, search)
            .then(data => setUsers(data.users || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadUsers() }, [page, search]);

    const handleBan = async (userId: number, username: string) => {
        const reason = prompt(`封禁用户 ${username}，请输入原因：`);
        if (!reason) return;

        const duration = prompt('封禁天数（留空为永久）：');

        try {
            await adminAPI.createBan({
                user_id: userId,
                reason,
                ban_type: duration ? 'temporary' : 'permanent',
                duration_days: duration || undefined
            });
            alert('封禁成功');
            loadUsers();
        } catch (err: any) {
            alert('封禁失败：' + err.message);
        }
    };

    const handleDelete = async (userId: number, reason: string, blacklistQQ: boolean, blacklistIP: boolean) => {
        try {
            await adminAPI.deleteUser(userId, { reason, blacklistQQ, blacklistIP });
            alert('删除成功');
            loadUsers();
        } catch (err: any) {
            alert('删除失败：' + err.message);
        }
    };

    const handleChangeTier = async (userId: number, newTier: string, reason: string) => {
        try {
            await adminAPI.changeUserTier(userId, newTier, reason);
            alert('等级变更成功');
            loadUsers();
        } catch (err: any) {
            alert('变更失败：' + err.message);
        }
    };

    // Check if user is banned (active_ban_ids is a comma-separated string of ban IDs)
    const isBanned = (user: any) => !!user.active_ban_ids;

    const getTierBadge = (tier: string) => {
        switch (tier) {
            case 'ultra':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded text-xs font-bold">
                        <Crown size={12} />
                        Ultra
                    </span>
                );
            case 'pro':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-xs font-bold">
                        <Star size={12} />
                        Pro
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-xs">
                        <Shield size={12} />
                        Free
                    </span>
                );
        }
    };

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <h1 className="text-3xl font-bold mb-8">用户管理</h1>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-6">
                <div className="flex gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="搜索用户名或邮箱"
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                {loading ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">用户名</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">邮箱</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">等级</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">状态</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">注册时间</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {users.map(user => (
                                <tr
                                    key={user.id}
                                    className={`hover:bg-gray-50 dark:hover:bg-slate-700 ${isBanned(user) ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                                >
                                    <td className="px-6 py-4 text-sm">{user.id}</td>
                                    <td className="px-6 py-4 text-sm font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className={isBanned(user) ? 'text-gray-400 line-through' : ''}>
                                                {user.username}
                                            </span>
                                            {isBanned(user) && (
                                                <span className="px-2 py-0.5 bg-red-500 text-white rounded text-xs font-bold">
                                                    已封禁
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{user.email || '-'}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <button
                                            onClick={() => setTierModalUser(user)}
                                            className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                                            title="点击修改等级"
                                        >
                                            {getTierBadge(user.user_tier || 'free')}
                                            <ChevronDown size={12} className="text-gray-400" />
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        {user.is_admin ? (
                                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded text-xs font-bold">管理员</span>
                                        ) : isBanned(user) ? (
                                            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-bold flex items-center gap-1">
                                                <ShieldOff size={12} />
                                                封禁中
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded text-xs font-bold">正常</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleBan(user.id, user.username)}
                                                disabled={isBanned(user)}
                                                className={`p-2 rounded ${isBanned(user)
                                                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                                    : 'text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30'}`}
                                                title={isBanned(user) ? '用户已被封禁' : '封禁'}
                                            >
                                                <Ban size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteModalUser(user)}
                                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                                title="删除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Tier Change Modal */}
            <TierModal
                isOpen={!!tierModalUser}
                user={tierModalUser}
                onClose={() => setTierModalUser(null)}
                onSave={handleChangeTier}
            />

            {/* Delete User Modal */}
            <DeleteUserModal
                isOpen={!!deleteModalUser}
                user={deleteModalUser}
                onClose={() => setDeleteModalUser(null)}
                onConfirm={handleDelete}
            />
        </div>
    );
}
