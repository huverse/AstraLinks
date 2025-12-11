import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import { Undo2, X, Clock } from 'lucide-react';

interface PendingOperation {
    id: number;
    operation_type: string;
    target_type: string;
    target_id: number;
    expires_at: string;
    admin_username: string;
}

const operationLabels: Record<string, string> = {
    CREATE_BAN: '封禁用户',
    DELETE_USER: '删除用户',
    DELETE_CODE: '删除邀请码'
};

export default function UndoToast() {
    const [operations, setOperations] = useState<PendingOperation[]>([]);
    const [countdowns, setCountdowns] = useState<Record<number, number>>({});
    const [undoing, setUndoing] = useState<number | null>(null);
    const location = useLocation();
    const navigate = useNavigate();

    const loadOperations = useCallback(async () => {
        try {
            const data = await adminAPI.getPendingOperations();
            const newOps = data.operations || [];

            // Only update if changed (avoid unnecessary re-renders)
            if (JSON.stringify(newOps.map((o: PendingOperation) => o.id)) !==
                JSON.stringify(operations.map(o => o.id))) {
                setOperations(newOps);
            }
        } catch (err) {
            // Silent fail
        }
    }, [operations]);

    useEffect(() => {
        loadOperations();
        // Poll every 1.5 seconds for faster response
        const interval = setInterval(loadOperations, 1500);
        return () => clearInterval(interval);
    }, [loadOperations]);

    // Update countdowns every second
    useEffect(() => {
        const updateCountdowns = () => {
            const newCountdowns: Record<number, number> = {};
            operations.forEach(op => {
                const remaining = Math.max(0, Math.floor((new Date(op.expires_at).getTime() - Date.now()) / 1000));
                newCountdowns[op.id] = remaining;
            });
            setCountdowns(newCountdowns);
        };

        updateCountdowns();
        const interval = setInterval(updateCountdowns, 1000);
        return () => clearInterval(interval);
    }, [operations]);

    const handleUndo = async (id: number, _operationType: string) => {
        setUndoing(id);
        try {
            await adminAPI.cancelOperation(id);
            setOperations(prev => prev.filter(op => op.id !== id));

            // Auto refresh page after successful undo
            // Navigate to same path to trigger re-render
            const currentPath = location.pathname;
            navigate('/dashboard', { replace: true });
            setTimeout(() => {
                navigate(currentPath, { replace: true });
            }, 50);

        } catch (err) {
            console.error('Failed to undo operation:', err);
            alert('撤销失败');
        } finally {
            setUndoing(null);
        }
    };

    const handleDismiss = (id: number) => {
        setOperations(prev => prev.filter(op => op.id !== id));
    };

    if (operations.length === 0) return null;

    return (
        <div className="fixed bottom-6 left-6 z-50 space-y-3 max-w-sm">
            {operations.map(op => {
                const remaining = countdowns[op.id] || 0;
                if (remaining <= 0) return null;

                return (
                    <div
                        key={op.id}
                        className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-[slideIn_0.3s_ease-out]"
                        style={{
                            animation: 'slideIn 0.3s ease-out',
                        }}
                    >
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">
                                {operationLabels[op.operation_type] || op.operation_type}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                                <Clock size={12} />
                                <span>剩余 {remaining} 秒可撤销</span>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-orange-500 transition-all duration-1000 ease-linear"
                                    style={{ width: `${(remaining / 60) * 100}%` }}
                                />
                            </div>
                        </div>

                        <button
                            onClick={() => handleUndo(op.id, op.operation_type)}
                            disabled={undoing === op.id}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors ${undoing === op.id
                                ? 'bg-gray-500 cursor-wait'
                                : 'bg-orange-500 hover:bg-orange-600'
                                }`}
                        >
                            <Undo2 size={14} className={undoing === op.id ? 'animate-spin' : ''} />
                            {undoing === op.id ? '撤销中...' : '撤销'}
                        </button>

                        <button
                            onClick={() => handleDismiss(op.id)}
                            className="p-1 hover:bg-slate-700 rounded transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
