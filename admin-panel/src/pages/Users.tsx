import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { Search, Ban, Trash2, ShieldOff } from 'lucide-react';

export default function Users() {
    const [users, setUsers] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

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

    const handleDelete = async (userId: number, username: string) => {
        if (!confirm(`确定删除用户 ${username}？此操作不可逆！`)) return;

        try {
            await adminAPI.deleteUser(userId);
            alert('删除成功');
            loadUsers();
        } catch (err: any) {
            alert('删除失败：' + err.message);
        }
    };

    // Check if user is banned (active_ban_ids is a comma-separated string of ban IDs)
    const isBanned = (user: any) => !!user.active_ban_ids;

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
                                                onClick={() => handleDelete(user.id, user.username)}
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
        </div>
    );
}
