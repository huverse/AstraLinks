import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';

export default function Reports() {
    const [reports, setReports] = useState<any[]>([]);
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(true);

    const loadReports = () => {
        setLoading(true);
        adminAPI.getReports(1, status)
            .then(data => setReports(data.reports || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadReports() }, [status]);

    const handleUpdateStatus = async (id: number, newStatus: string) => {
        const notes = prompt('备注（可选）：');

        try {
            await adminAPI.updateReportStatus(id, newStatus, notes || '');
            alert('状态更新成功');
            loadReports();
        } catch (err: any) {
            alert('更新失败：' + err.message);
        }
    };

    const statusColors: Record<string, string> = {
        pending: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400',
        reviewing: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
        resolved: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400',
        dismissed: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    };

    const statusLabels: Record<string, string> = {
        pending: '待处理',
        reviewing: '审核中',
        resolved: '已解决',
        dismissed: '已驳回',
    };

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <h1 className="text-3xl font-bold mb-8">举报管理</h1>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-6">
                <div className="flex gap-2">
                    {['', 'pending', 'reviewing', 'resolved', 'dismissed'].map(s => (
                        <button
                            key={s}
                            onClick={() => setStatus(s)}
                            className={`px-4 py-2 rounded-lg font-medium ${status === s
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                }`}
                        >
                            {s === '' ? '全部' : statusLabels[s]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                {loading ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                ) : reports.length === 0 ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">暂无举报</div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">举报人</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">被举报人</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">类型</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">内容</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">状态</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">时间</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {reports.map(report => (
                                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                                    <td className="px-6 py-4 text-sm">{report.id}</td>
                                    <td className="px-6 py-4 text-sm font-medium">{report.reporter_username}</td>
                                    <td className="px-6 py-4 text-sm font-medium">{report.reported_username}</td>
                                    <td className="px-6 py-4 text-sm">{report.report_type}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                        {report.content}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${statusColors[report.status]}`}>
                                            {statusLabels[report.status]}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(report.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <select
                                            value={report.status}
                                            onChange={e => handleUpdateStatus(report.id, e.target.value)}
                                            className="text-sm border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                        >
                                            <option value="pending">待处理</option>
                                            <option value="reviewing">审核中</option>
                                            <option value="resolved">已解决</option>
                                            <option value="dismissed">已驳回</option>
                                        </select>
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
