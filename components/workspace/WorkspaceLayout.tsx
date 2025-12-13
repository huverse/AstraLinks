/**
 * Workspace 布局组件
 * 
 * @module components/workspace/WorkspaceLayout
 * @description 包含侧边栏和主内容区的 Workspace 布局
 */

import React, { useState } from 'react';
import {
    GitBranch, History, FolderOpen, Settings,
    ChevronLeft, Plus, Search
} from 'lucide-react';
import { useWorkflows, Workflow } from '../../hooks/useWorkspace';
import { WorkflowEditor } from '../workflow';

// ============================================
// 侧边栏
// ============================================

interface SidebarProps {
    workspaceId: string;
    workspaceName: string;
    activeTab: 'workflows' | 'executions' | 'files' | 'settings';
    onTabChange: (tab: 'workflows' | 'executions' | 'files' | 'settings') => void;
    onBack: () => void;
    workflows: Workflow[];
    selectedWorkflowId: string | null;
    onSelectWorkflow: (id: string) => void;
    onCreateWorkflow: () => void;
}

function Sidebar({
    workspaceName, activeTab, onTabChange, onBack,
    workflows, selectedWorkflowId, onSelectWorkflow, onCreateWorkflow
}: SidebarProps) {
    const tabs = [
        { id: 'workflows' as const, icon: GitBranch, label: '工作流' },
        { id: 'executions' as const, icon: History, label: '执行历史' },
        { id: 'files' as const, icon: FolderOpen, label: '文件' },
        { id: 'settings' as const, icon: Settings, label: '设置' },
    ];

    return (
        <div className="w-64 bg-slate-900/50 border-r border-white/10 flex flex-col">
            {/* 头部 */}
            <div className="p-4 border-b border-white/10">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-2"
                >
                    <ChevronLeft size={16} />
                    <span className="text-sm">返回列表</span>
                </button>
                <h2 className="font-semibold text-white truncate">{workspaceName}</h2>
            </div>

            {/* 标签页 */}
            <div className="flex border-b border-white/10">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs transition-colors ${activeTab === tab.id
                            ? 'text-purple-400 border-b-2 border-purple-500'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        <tab.icon size={18} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'workflows' && (
                    <div className="p-2">
                        {/* 搜索和新建 */}
                        <div className="flex gap-2 mb-2">
                            <div className="flex-1 relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="搜索..."
                                    className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <button
                                onClick={onCreateWorkflow}
                                className="p-1.5 bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors"
                            >
                                <Plus size={16} className="text-white" />
                            </button>
                        </div>

                        {/* 工作流列表 */}
                        <div className="space-y-1">
                            {workflows.length === 0 ? (
                                <p className="text-center text-slate-500 text-sm py-4">暂无工作流</p>
                            ) : (
                                workflows.map(wf => (
                                    <button
                                        key={wf.id}
                                        onClick={() => onSelectWorkflow(wf.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedWorkflowId === wf.id
                                            ? 'bg-purple-600/20 text-purple-400'
                                            : 'text-slate-300 hover:bg-white/5'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <GitBranch size={14} />
                                            <span className="text-sm truncate">{wf.name}</span>
                                        </div>
                                        <span className="text-xs text-slate-500 ml-5">v{wf.version}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'executions' && (
                    <div className="p-4 text-center text-slate-500 text-sm">
                        执行历史 (待实现)
                    </div>
                )}

                {activeTab === 'files' && (
                    <div className="p-4 text-center text-slate-500 text-sm">
                        文件管理 (待实现)
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="p-4 text-center text-slate-500 text-sm">
                        设置面板 (待实现)
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// 主布局组件
// ============================================

interface WorkspaceLayoutProps {
    workspaceId: string;
    workspaceName: string;
    onBack: () => void;
    children?: React.ReactNode;
}

export function WorkspaceLayout({ workspaceId, workspaceName, onBack }: WorkspaceLayoutProps) {
    const [activeTab, setActiveTab] = useState<'workflows' | 'executions' | 'files' | 'settings'>('workflows');
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    const { workflows, createWorkflow } = useWorkflows(workspaceId);

    const handleCreateWorkflow = async () => {
        const name = prompt('工作流名称:');
        if (name) {
            const wf = await createWorkflow({ name });
            setSelectedWorkflowId(wf.id);
        }
    };

    const handleSaveWorkflow = async (nodes: any[], edges: any[]) => {
        // TODO: Save workflow nodes and edges to backend
        console.log('Saving workflow:', { nodes, edges });
        alert('工作流已保存 (本地)');
    };

    return (
        <div className="h-full flex bg-slate-950">
            {/* 侧边栏 */}
            <Sidebar
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onBack={onBack}
                workflows={workflows}
                selectedWorkflowId={selectedWorkflowId}
                onSelectWorkflow={setSelectedWorkflowId}
                onCreateWorkflow={handleCreateWorkflow}
            />

            {/* 主内容区 */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* 内容区 */}
                <div className="flex-1 overflow-hidden">
                    {selectedWorkflowId ? (
                        <WorkflowEditor
                            workflowId={selectedWorkflowId}
                            onSave={handleSaveWorkflow}
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-500">
                            <div className="text-center">
                                <GitBranch size={48} className="mx-auto mb-4 opacity-50" />
                                <p>选择或创建一个工作流</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default WorkspaceLayout;
