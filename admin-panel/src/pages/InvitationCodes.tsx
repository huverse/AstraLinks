import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { Plus, Trash2 } from 'lucide-react';

export default function InvitationCodes() {
    const [codes, setCodes] = useState<any[]>([]);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);

    const loadCodes = () => {
        setLoading(true);
        adminAPI.getCodes(1, filter)
            .then(data => setCodes(data.codes || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadCodes() }, [filter]);

    const handleGenerate = async () => {
        const count = prompt('生成多少个邀请码？(1-100)');
        if (!count) return;

        const num = parseInt(count);
        if (isNaN(num) || num < 1 || num > 100) {
            alert('请输入1-100之间的数字');
            return;
        }

        try {
            await adminAPI.generateCodes(num);
            alert(`成功生成 ${num} 个邀请码`);
            loadCodes();
        } catch (err: any) {
            alert('生成失败：' + err.message);
        }
    };

    const handleDelete = async (id: number, code: string) => {
        if (!confirm(`确定删除邀请码 ${code}？`)) return;

        try {
            await adminAPI.deleteCode(id);
            alert('删除成功');
            loadCodes();
        } catch (err: any) {
            alert('删除失败：' + err.message);
        }
    };

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">邀请码管理</h1>
                <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold"
                >
                    <Plus size={20} />
                    批量生成
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-6">
                <div className="flex gap-2">
                    {['all', 'unused', 'used'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-lg font-medium ${filter === f
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                }`}
                        >
                            {f === 'all' ? '全部' : f === 'unused' ? '未使用' : '已使用'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                {loading ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">邀请码</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">状态</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">使用者</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">创建时间</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">使用时间</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {codes.map(code => (
                                <tr key={code.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                                    <td className="px-6 py-4 font-mono font-bold">{code.code}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${code.is_used
                                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                            : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                                            }`}>
                                            {code.is_used ? '已使用' : '未使用'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm">{code.used_by_username || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(code.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {code.used_at ? new Date(code.used_at).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => handleDelete(code.id, code.code)}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                        >
                                            <Trash2 size={16} />
                                        </button>
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
