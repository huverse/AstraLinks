/**
 * 讨论总结面板
 *
 * 显示讨论结束后的自动总结
 */

import React from 'react';
import { FileText, Loader2, RefreshCw } from 'lucide-react';

interface SummaryPanelProps {
    summary: string | null;
    isLoading?: boolean;
    onGenerate?: () => void;
    disabled?: boolean;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
    summary,
    isLoading = false,
    onGenerate,
    disabled = false
}) => {
    if (!summary && !isLoading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <FileText size={12} />
                        讨论总结
                    </h4>
                </div>
                <button
                    onClick={onGenerate}
                    disabled={disabled || isLoading}
                    className="w-full py-2 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                    <FileText size={14} />
                    生成总结
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">
                    讨论结束后可生成总结
                </p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                <div className="flex items-center justify-center py-4">
                    <Loader2 size={20} className="animate-spin text-purple-400" />
                    <span className="ml-2 text-sm text-slate-400">生成总结中...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={12} />
                    讨论总结
                </h4>
                {onGenerate && (
                    <button
                        onClick={onGenerate}
                        disabled={disabled || isLoading}
                        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white disabled:opacity-50"
                        title="重新生成"
                    >
                        <RefreshCw size={12} />
                    </button>
                )}
            </div>

            <div className="bg-slate-900/40 rounded-lg p-3 max-h-60 overflow-y-auto">
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {summary}
                </p>
            </div>
        </div>
    );
};
