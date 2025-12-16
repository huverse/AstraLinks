/**
 * 工作流帮助指南组件
 * 
 * @module components/workflow/WorkflowGuide
 * @description 工作流使用教程和帮助文档
 */

import React, { useState, useCallback } from 'react';
import {
    HelpCircle, X, ChevronRight, ChevronDown,
    Play, Square, Bot, GitBranch, Code, Plug,
    Globe, Repeat, Database, FileInput, FileOutput,
    Zap, Timer, ArrowLeftRight, Workflow as WorkflowIcon,
    Book, Keyboard, Lightbulb, Rocket
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

interface GuideSection {
    id: string;
    title: string;
    icon: React.ReactNode;
    content: React.ReactNode;
}

// ============================================
// 帮助指南内容
// ============================================

const guideSections: GuideSection[] = [
    {
        id: 'quickstart',
        title: '🚀 快速入门',
        icon: <Rocket size={16} />,
        content: (
            <div className="space-y-3 text-sm text-slate-300">
                <div className="flex gap-3 items-start">
                    <div className="shrink-0 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 text-xs font-bold">1</div>
                    <div>
                        <div className="font-medium text-white">添加节点</div>
                        <div className="text-slate-400">从左侧工具栏点击想要的节点类型</div>
                    </div>
                </div>
                <div className="flex gap-3 items-start">
                    <div className="shrink-0 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 text-xs font-bold">2</div>
                    <div>
                        <div className="font-medium text-white">连接节点</div>
                        <div className="text-slate-400">从节点底部的连接点拖动到目标节点顶部</div>
                    </div>
                </div>
                <div className="flex gap-3 items-start">
                    <div className="shrink-0 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 text-xs font-bold">3</div>
                    <div>
                        <div className="font-medium text-white">配置节点</div>
                        <div className="text-slate-400">点击节点，在右侧面板编辑参数</div>
                    </div>
                </div>
                <div className="flex gap-3 items-start">
                    <div className="shrink-0 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 text-xs font-bold">4</div>
                    <div>
                        <div className="font-medium text-white">运行工作流</div>
                        <div className="text-slate-400">点击右上角绿色的"运行"按钮</div>
                    </div>
                </div>
            </div>
        ),
    },
    {
        id: 'nodes',
        title: '🔲 节点类型',
        icon: <WorkflowIcon size={16} />,
        content: (
            <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                    <NodeHint icon={<Play size={12} />} name="开始" desc="工作流入口" color="green" />
                    <NodeHint icon={<Square size={12} />} name="结束" desc="工作流出口" color="red" />
                    <NodeHint icon={<Bot size={12} />} name="AI" desc="调用语言模型" color="purple" />
                    <NodeHint icon={<Database size={12} />} name="知识库" desc="RAG 检索" color="blue" />
                    <NodeHint icon={<GitBranch size={12} />} name="条件" desc="分支判断" color="amber" />
                    <NodeHint icon={<Repeat size={12} />} name="循环" desc="重复执行" color="yellow" />
                    <NodeHint icon={<Code size={12} />} name="代码" desc="执行自定义代码" color="slate" />
                    <NodeHint icon={<Globe size={12} />} name="HTTP" desc="API 请求" color="blue" />
                    <NodeHint icon={<Plug size={12} />} name="MCP" desc="调用外部工具" color="emerald" />
                    <NodeHint icon={<Timer size={12} />} name="延迟" desc="暂停执行" color="gray" />
                    <NodeHint icon={<FileInput size={12} />} name="输入" desc="用户输入" color="cyan" />
                    <NodeHint icon={<FileOutput size={12} />} name="输出" desc="结果输出" color="teal" />
                </div>
            </div>
        ),
    },
    {
        id: 'variables',
        title: '📝 变量引用',
        icon: <Code size={16} />,
        content: (
            <div className="space-y-3 text-sm text-slate-300">
                <p>在节点配置中使用 <code className="px-1.5 py-0.5 bg-slate-700 rounded text-purple-400">{'{{变量}}'}</code> 语法引用数据：</p>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-slate-900 rounded text-green-400 text-xs">{'{{input}}'}</code>
                        <span className="text-slate-400">→ 上一节点的输出</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-slate-900 rounded text-green-400 text-xs">{'{{input.text}}'}</code>
                        <span className="text-slate-400">→ 访问嵌套属性</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-slate-900 rounded text-green-400 text-xs">{'{{variables.xxx}}'}</code>
                        <span className="text-slate-400">→ 全局工作流变量</span>
                    </div>
                </div>
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                    💡 条件节点支持 JavaScript 表达式，如 <code>{'{{input.count}} > 10'}</code>
                </div>
            </div>
        ),
    },
    {
        id: 'shortcuts',
        title: '⌨️ 快捷操作',
        icon: <Keyboard size={16} />,
        content: (
            <div className="space-y-2 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                    <span>删除节点</span>
                    <span className="text-slate-400">选中节点 + 点击删除按钮</span>
                </div>
                <div className="flex items-center justify-between">
                    <span>取消选中</span>
                    <span className="text-slate-400">点击空白区域</span>
                </div>
                <div className="flex items-center justify-between">
                    <span>缩放画布</span>
                    <span className="text-slate-400">滚轮 / 双指缩放</span>
                </div>
                <div className="flex items-center justify-between">
                    <span>移动画布</span>
                    <span className="text-slate-400">拖动空白区域</span>
                </div>
                <div className="flex items-center justify-between">
                    <span>适应画布</span>
                    <span className="text-slate-400">左下角控制条</span>
                </div>
            </div>
        ),
    },
    {
        id: 'tips',
        title: '💡 使用技巧',
        icon: <Lightbulb size={16} />,
        content: (
            <div className="space-y-2 text-sm text-slate-300">
                <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    <div className="font-medium text-purple-300 mb-1">AI 节点提示</div>
                    <div className="text-xs text-slate-400">在系统提示词中明确任务目标，使用 {"{{input}}"} 注入上下文</div>
                </div>
                <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="font-medium text-blue-300 mb-1">条件分支</div>
                    <div className="text-xs text-slate-400">条件节点有 "true" 和 "false" 两个输出口</div>
                </div>
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    <div className="font-medium text-emerald-300 mb-1">MCP 工具</div>
                    <div className="text-xs text-slate-400">可使用网页搜索、文件操作、代码执行等强大工具</div>
                </div>
            </div>
        ),
    },
];

// ============================================
// 节点提示组件
// ============================================

function NodeHint({
    icon,
    name,
    desc,
    color
}: {
    icon: React.ReactNode;
    name: string;
    desc: string;
    color: string;
}) {
    const colorClasses: Record<string, string> = {
        green: 'bg-green-500/20 text-green-400',
        red: 'bg-red-500/20 text-red-400',
        purple: 'bg-purple-500/20 text-purple-400',
        blue: 'bg-blue-500/20 text-blue-400',
        amber: 'bg-amber-500/20 text-amber-400',
        yellow: 'bg-yellow-500/20 text-yellow-400',
        slate: 'bg-slate-600/50 text-slate-300',
        emerald: 'bg-emerald-500/20 text-emerald-400',
        gray: 'bg-gray-500/20 text-gray-400',
        cyan: 'bg-cyan-500/20 text-cyan-400',
        teal: 'bg-teal-500/20 text-teal-400',
    };

    return (
        <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
            <div className={`p-1.5 rounded ${colorClasses[color] || colorClasses.slate}`}>
                {icon}
            </div>
            <div className="min-w-0">
                <div className="text-xs font-medium text-white">{name}</div>
                <div className="text-[10px] text-slate-500 truncate">{desc}</div>
            </div>
        </div>
    );
}

// ============================================
// 折叠区块组件
// ============================================

function CollapsibleSection({
    section,
    isOpen,
    onToggle,
}: {
    section: GuideSection;
    isOpen: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="border-b border-slate-700/50 last:border-b-0">
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
            >
                {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                <span className="text-sm font-medium text-white flex-1">{section.title}</span>
            </button>
            {isOpen && (
                <div className="px-3 pb-3">
                    {section.content}
                </div>
            )}
        </div>
    );
}

// ============================================
// 主帮助指南组件
// ============================================

export function WorkflowGuide() {
    const [isOpen, setIsOpen] = useState(false);
    const [openSections, setOpenSections] = useState<Set<string>>(new Set(['quickstart']));

    const toggleSection = useCallback((id: string) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    return (
        <>
            {/* 帮助按钮 */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 left-4 z-50 p-3 bg-purple-600/90 hover:bg-purple-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all group"
                title="使用帮助"
            >
                <HelpCircle size={20} />
                <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    使用帮助
                </span>
            </button>

            {/* 帮助面板 */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pointer-events-none">
                    {/* 背景遮罩 */}
                    <div
                        className="absolute inset-0 bg-black/30 pointer-events-auto"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* 帮助内容 */}
                    <div className="relative w-full max-w-sm bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto max-h-[calc(100vh-2rem)]">
                        {/* 头部 */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                            <div className="flex items-center gap-2">
                                <Book size={18} className="text-purple-400" />
                                <span className="font-semibold text-white">工作流使用指南</span>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X size={16} className="text-slate-400" />
                            </button>
                        </div>

                        {/* 内容 */}
                        <div className="overflow-y-auto max-h-[calc(100vh-8rem)]">
                            {guideSections.map(section => (
                                <CollapsibleSection
                                    key={section.id}
                                    section={section}
                                    isOpen={openSections.has(section.id)}
                                    onToggle={() => toggleSection(section.id)}
                                />
                            ))}
                        </div>

                        {/* 底部 */}
                        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/50">
                            <p className="text-xs text-slate-500 text-center">
                                有问题? 联系我们获取更多帮助
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default WorkflowGuide;
