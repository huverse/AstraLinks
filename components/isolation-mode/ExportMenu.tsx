/**
 * 导出菜单组件
 *
 * 支持多种导出格式
 */

import React, { useState } from 'react';
import { Download, FileJson, FileText, File, Loader2 } from 'lucide-react';
import { Session, ExportFormat, ScoringResult } from './types';

interface ExportMenuProps {
    session: Session;
    scoringResult?: ScoringResult | null;
    onExport?: (format: ExportFormat) => Promise<void>;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
    session,
    scoringResult,
    onExport
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [exporting, setExporting] = useState<ExportFormat | null>(null);

    const handleExport = async (format: ExportFormat) => {
        setExporting(format);
        try {
            if (onExport) {
                await onExport(format);
            } else {
                // 默认导出逻辑
                await defaultExport(format);
            }
        } finally {
            setExporting(null);
            setIsOpen(false);
        }
    };

    const defaultExport = async (format: ExportFormat) => {
        let content: string;
        let filename: string;
        let mimeType: string;

        switch (format) {
            case 'json':
                content = JSON.stringify({
                    session: {
                        id: session.id,
                        title: session.title,
                        topic: session.topic,
                        status: session.status,
                        currentRound: session.currentRound,
                        agents: session.agents.map(a => ({
                            id: a.id,
                            name: a.name,
                            role: a.role,
                            stance: a.stance,
                            speakCount: a.speakCount
                        })),
                    },
                    events: session.events,
                    summary: session.summary,
                    scoringResult,
                    exportedAt: new Date().toISOString()
                }, null, 2);
                filename = `${session.title || 'discussion'}.json`;
                mimeType = 'application/json';
                break;

            case 'markdown':
            default:
                content = generateMarkdown(session, scoringResult);
                filename = `${session.title || 'discussion'}.md`;
                mimeType = 'text/markdown';
                break;
        }

        // 下载文件
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const generateMarkdown = (session: Session, scoring?: ScoringResult | null): string => {
        const lines: string[] = [];

        lines.push(`# ${session.title}`);
        lines.push('');
        lines.push(`**主题**: ${session.topic}`);
        lines.push(`**状态**: ${session.status}`);
        lines.push(`**轮次**: ${session.currentRound}`);
        lines.push(`**时间**: ${new Date().toLocaleString()}`);
        lines.push('');

        // 参与者
        lines.push('## 参与者');
        lines.push('');
        session.agents.forEach(agent => {
            const stanceLabel = agent.stance === 'for' ? '正方' : agent.stance === 'against' ? '反方' : '中立';
            lines.push(`- **${agent.name}** (${stanceLabel}) - 发言 ${agent.speakCount} 次`);
        });
        lines.push('');

        // 讨论记录
        lines.push('## 讨论记录');
        lines.push('');
        session.events
            .filter(e => e.payload?.content || e.payload?.message)
            .forEach(event => {
                const time = new Date(event.timestamp).toLocaleTimeString();
                const speaker = event.sourceId === 'moderator' ? '主持人' :
                    session.agents.find(a => a.id === event.sourceId)?.name || event.sourceId;
                const content = event.payload?.content || event.payload?.message || '';
                lines.push(`### [${time}] ${speaker}`);
                lines.push('');
                lines.push(content);
                lines.push('');
            });

        // 总结
        if (session.summary) {
            lines.push('## 讨论总结');
            lines.push('');
            lines.push(session.summary);
            lines.push('');
        }

        // 评分
        if (scoring) {
            lines.push('## 评分结果');
            lines.push('');
            scoring.ranking.forEach(item => {
                const agentName = session.agents.find(a => a.id === item.agentId)?.name || item.agentId;
                lines.push(`${item.rank}. **${agentName}** - ${item.score.toFixed(1)} 分`);
            });
            lines.push('');
            if (scoring.finalComment) {
                lines.push('**总评**: ' + scoring.finalComment);
                lines.push('');
            }
        }

        lines.push('---');
        lines.push(`*导出自 AstraLinks 隔离模式*`);

        return lines.join('\n');
    };

    const formats: { format: ExportFormat; label: string; icon: React.ReactNode }[] = [
        { format: 'markdown', label: 'Markdown', icon: <FileText size={14} /> },
        { format: 'json', label: 'JSON', icon: <FileJson size={14} /> },
        { format: 'pdf', label: 'PDF (开发中)', icon: <File size={14} /> },
        { format: 'word', label: 'Word (开发中)', icon: <File size={14} /> },
    ];

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 text-white rounded-lg flex items-center gap-2 text-sm"
            >
                <Download size={14} />
                导出
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-40 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                        {formats.map(({ format, label, icon }) => (
                            <button
                                key={format}
                                onClick={() => handleExport(format)}
                                disabled={exporting !== null || format === 'pdf' || format === 'word'}
                                className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {exporting === format ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    icon
                                )}
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
