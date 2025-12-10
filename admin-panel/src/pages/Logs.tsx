import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { Activity } from 'lucide-react';

export default function Logs() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        adminAPI.getLogs()
            .then(data => setLogs(data.logs || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const actionLabels: Record<string, string> = {
        UPDATE_USER: '更新用户',
        DELETE_USER: '删除用户',
        GENERATE_CODES: '生成邀请码',
        DELETE_CODE: '删除邀请码',
        UPDATE_REPORT_STATUS: '更新举报状态',
        CREATE_BAN: '创建封禁',
        LIFT_BAN: '解除封禁',
        DELETE_BAN: '删除封禁记录',
    };

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <h1 className="text-3xl font-bold mb-8">操作日志</h1>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg divide-y divide-gray-200 dark:divide-slate-700">
                {loading ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">暂无操作记录</div>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="p-6 hover:bg-gray-50 dark:hover:bg-slate-700">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-full">
                                    <Activity className="text-blue-500" size={20} />
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold">{log.admin_username}</span>
                                        <span className="text-gray-500 dark:text-gray-400">·</span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(log.created_at).toLocaleString()}
                                        </span>
                                    </div>

                                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                        {actionLabels[log.action_type] || log.action_type}
                                        {log.target_type && log.target_id && (
                                            <span className="text-gray-500 dark:text-gray-400">
                                                {' '}({log.target_type} #{log.target_id})
                                            </span>
                                        )}
                                    </p>

                                    {log.details && (() => {
                                        try {
                                            const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                                            if (details && Object.keys(details).length > 0) {
                                                return (
                                                    <details className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900 p-2 rounded">
                                                        <summary className="cursor-pointer">详细信息</summary>
                                                        <pre className="mt-2 overflow-auto">
                                                            {JSON.stringify(details, null, 2)}
                                                        </pre>
                                                    </details>
                                                );
                                            }
                                        } catch (e) {
                                            return null;
                                        }
                                        return null;
                                    })()}

                                    {log.ip_address && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">IP: {log.ip_address}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
