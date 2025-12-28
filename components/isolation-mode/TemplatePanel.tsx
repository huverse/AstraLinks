/**
 * 讨论模板选择器
 *
 * 支持从云端下载模板和本地预设
 */

import React, { useState, useEffect } from 'react';
import { Layout, Download, Cloud, Lock, Loader2, Check } from 'lucide-react';
import { DiscussionTemplate, Agent } from './types';
import { API_BASE } from '../../utils/api';

interface TemplatePanelProps {
    token?: string | null;
    onApplyTemplate: (template: DiscussionTemplate) => void;
    currentScenarioId?: string;
}

// 本地预设模板
const LOCAL_TEMPLATES: DiscussionTemplate[] = [
    {
        id: 'debate-2v2',
        name: '2v2 辩论',
        description: '正反双方各2人的标准辩论',
        scenarioId: 'debate',
        agents: [
            { id: 'agent-1', name: '正方一辩', role: 'debater', stance: 'for', systemPrompt: '你是正方一辩，负责开篇立论。' },
            { id: 'agent-2', name: '正方二辩', role: 'debater', stance: 'for', systemPrompt: '你是正方二辩，负责补充论证和反驳。' },
            { id: 'agent-3', name: '反方一辩', role: 'debater', stance: 'against', systemPrompt: '你是反方一辩，负责开篇立论。' },
            { id: 'agent-4', name: '反方二辩', role: 'debater', stance: 'against', systemPrompt: '你是反方二辩，负责补充论证和反驳。' },
        ],
        maxRounds: 6,
    },
    {
        id: 'brainstorm-3',
        name: '3人头脑风暴',
        description: '3个不同视角的创意发散',
        scenarioId: 'brainstorm',
        agents: [
            { id: 'agent-1', name: '创意者', role: 'creative', stance: 'neutral', systemPrompt: '你是创意发散者，提出大胆新颖的想法。' },
            { id: 'agent-2', name: '分析者', role: 'analyst', stance: 'neutral', systemPrompt: '你是理性分析者，评估想法的可行性。' },
            { id: 'agent-3', name: '整合者', role: 'integrator', stance: 'neutral', systemPrompt: '你是整合者，综合各方观点形成方案。' },
        ],
        maxRounds: 5,
    },
    {
        id: 'review-panel',
        name: '项目评审会',
        description: '多角度评估项目方案',
        scenarioId: 'review',
        agents: [
            { id: 'agent-1', name: '技术专家', role: 'expert', stance: 'neutral', systemPrompt: '你是技术专家，从技术可行性角度评估。' },
            { id: 'agent-2', name: '产品经理', role: 'pm', stance: 'neutral', systemPrompt: '你是产品经理，从用户需求角度评估。' },
            { id: 'agent-3', name: '财务顾问', role: 'finance', stance: 'neutral', systemPrompt: '你是财务顾问，从成本收益角度评估。' },
        ],
        maxRounds: 4,
    },
];

export const TemplatePanel: React.FC<TemplatePanelProps> = ({
    token,
    onApplyTemplate,
    currentScenarioId
}) => {
    const [cloudTemplates, setCloudTemplates] = useState<DiscussionTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState<string | null>(null);

    // 加载云端模板
    useEffect(() => {
        if (!token) return;

        const loadCloudTemplates = async () => {
            setLoading(true);
            try {
                const response = await fetch(`${API_BASE}/api/config-templates/available?type=isolation`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (response.ok) {
                    const data = await response.json();
                    setCloudTemplates(data.data || []);
                }
            } catch (e) {
                console.error('Failed to load cloud templates', e);
            } finally {
                setLoading(false);
            }
        };

        loadCloudTemplates();
    }, [token]);

    const handleApply = async (template: DiscussionTemplate, isCloud: boolean) => {
        setApplying(template.id);
        try {
            if (isCloud && token) {
                // 记录下载
                await fetch(`${API_BASE}/api/config-templates/${template.id}/download`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                });
            }
            onApplyTemplate(template);
        } finally {
            setApplying(null);
        }
    };

    const filteredLocalTemplates = currentScenarioId
        ? LOCAL_TEMPLATES.filter(t => t.scenarioId === currentScenarioId)
        : LOCAL_TEMPLATES;

    return (
        <div className="space-y-4">
            {/* 本地预设 */}
            <div>
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Layout size={12} />
                    预设模板
                </h4>
                <div className="grid grid-cols-1 gap-2">
                    {filteredLocalTemplates.map(template => (
                        <div
                            key={template.id}
                            className="p-3 bg-slate-800/50 border border-white/5 rounded-lg hover:border-purple-500/30 transition-colors"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-white font-medium">{template.name}</div>
                                    <div className="text-xs text-slate-500">{template.description}</div>
                                </div>
                                <button
                                    onClick={() => handleApply(template, false)}
                                    disabled={applying === template.id}
                                    className="px-2 py-1 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white rounded text-xs flex items-center gap-1"
                                >
                                    {applying === template.id ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <Check size={12} />
                                    )}
                                    应用
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 云端模板 */}
            {token && (
                <div>
                    <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Cloud size={12} />
                        云端模板
                        {loading && <Loader2 size={12} className="animate-spin" />}
                    </h4>
                    {cloudTemplates.length === 0 && !loading ? (
                        <div className="text-xs text-slate-500 text-center py-4">
                            暂无云端模板
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {cloudTemplates.map(template => (
                                <div
                                    key={template.id}
                                    className="p-3 bg-slate-800/50 border border-white/5 rounded-lg hover:border-purple-500/30 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm text-white font-medium flex items-center gap-2">
                                                {template.name}
                                                {template.tierRequired && template.tierRequired !== 'free' && (
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                        template.tierRequired === 'pro' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                                                    }`}>
                                                        {template.tierRequired.toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500">{template.description}</div>
                                            {template.downloadCount !== undefined && (
                                                <div className="text-[10px] text-slate-600 mt-1">
                                                    <Download size={10} className="inline mr-1" />
                                                    {template.downloadCount} 次下载
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleApply(template, true)}
                                            disabled={applying === template.id}
                                            className="px-2 py-1 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white rounded text-xs flex items-center gap-1"
                                        >
                                            {applying === template.id ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Download size={12} />
                                            )}
                                            下载
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
