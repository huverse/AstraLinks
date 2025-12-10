import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { XCircle } from 'lucide-react';

export default function Bans() {
    const [bans, setBans] = useState<any[]>([]);
    const [activeOnly, setActiveOnly] = useState(true);
    const [loading, setLoading] = useState(true);

    const loadBans = () => {
        setLoading(true);
        adminAPI.getBans(1, activeOnly)
            .then(data => setBans(data.bans || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadBans() }, [activeOnly]);

    const handleLift = async (id: number, username: string) => {
        if (!confirm(`确定解除用户 ${username} 的封禁？`)) return;

        try {
            await adminAPI.liftBan(id);
            alert('解封成功');
            loadBans();
        } catch (err: any) {
            alert('解封失败：' + err.message);
        }
    };

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <h1 className="text-3xl font-bold mb-8">封禁管理</h1>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-6">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveOnly(true)}
                        className={`px-4 py-2 rounded-lg font-medium ${activeOnly
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                    >
                        活跃封禁
                    </button>
                    <button
                        onClick={() => setActiveOnly(false)}
                        className={`px-4 py-2 rounded-lg font-medium ${!activeOnly
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                    >
                        全部记录
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                {loading ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                ) : bans.length === 0 ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">暂无封禁记录</div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">用户</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">类型</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">原因</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">操作管理员</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">创建时间</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">到期时间</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">状态</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {bans.map(ban => (
                                <tr key={ban.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                                    <td className="px-6 py-4 text-sm">{ban.id}</td>
                                    <td className="px-6 py-4 text-sm font-medium">{ban.user_username}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${ban.ban_type === 'permanent'
                                            ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                                            : 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400'
                                            }`}>
                                            {ban.ban_type === 'permanent' ? '永久' : '临时'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                        {ban.reason}
                                    </td>
                                    <td className="px-6 py-4 text-sm">{ban.banned_by_username}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(ban.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {ban.expires_at ? new Date(ban.expires_at).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${ban.is_active
                                            ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                                            : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                                            }`}>
                                            {ban.is_active ? '生效中' : '已解除'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {ban.is_active && (
                                            <button
                                                onClick={() => handleLift(ban.id, ban.user_username)}
                                                className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                                                title="解除封禁"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        )}
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
