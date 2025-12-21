/**
 * 变量选择器组件
 * 
 * @module components/workflow/VariableSelector
 * @description 用于在工作流节点配置中选择和插入变量引用
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    ChevronDown,
    Search,
    Database,
    Box,
    FileInput,
    Settings,
    X
} from 'lucide-react';
import { Node } from 'reactflow';
import { getAvailableVariables, AvailableVariable } from '../../core/workflow/variableResolver';

// ============================================
// 类型定义
// ============================================

interface VariableSelectorProps {
    nodes: Node[];
    currentNodeId: string;
    variables?: Record<string, any>;
    onSelect: (variable: string) => void;
    triggerElement?: React.ReactNode;
    className?: string;
}

// ============================================
// 变量类型图标映射
// ============================================

const TypeIcon: React.FC<{ type: AvailableVariable['type'] }> = ({ type }) => {
    switch (type) {
        case 'node':
            return <Box size={14} className="text-purple-400" />;
        case 'variable':
            return <Database size={14} className="text-blue-400" />;
        case 'input':
            return <FileInput size={14} className="text-green-400" />;
        case 'env':
            return <Settings size={14} className="text-amber-400" />;
        default:
            return <Box size={14} className="text-slate-400" />;
    }
};

// ============================================
// 主组件
// ============================================

export function VariableSelector({
    nodes,
    currentNodeId,
    variables,
    onSelect,
    triggerElement,
    className = ''
}: VariableSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // 获取可用变量列表
    const availableVariables = useMemo(() => {
        return getAvailableVariables(
            nodes.map(n => ({ id: n.id, type: n.type || 'unknown', data: n.data })),
            currentNodeId,
            variables
        );
    }, [nodes, currentNodeId, variables]);

    // 过滤搜索结果
    const filteredVariables = useMemo(() => {
        if (!search.trim()) return availableVariables;
        const searchLower = search.toLowerCase();
        return availableVariables.filter(v =>
            v.label.toLowerCase().includes(searchLower) ||
            v.value.toLowerCase().includes(searchLower) ||
            v.description?.toLowerCase().includes(searchLower)
        );
    }, [availableVariables, search]);

    // 按类型分组
    const groupedVariables = useMemo(() => {
        const groups: Record<string, AvailableVariable[]> = {
            input: [],
            node: [],
            variable: [],
            env: []
        };

        for (const v of filteredVariables) {
            if (groups[v.type]) {
                groups[v.type].push(v);
            }
        }

        return groups;
    }, [filteredVariables]);

    // 点击外部关闭
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // 选择变量
    const handleSelect = (variable: AvailableVariable) => {
        onSelect(variable.value);
        setIsOpen(false);
        setSearch('');
    };

    // 分组标题
    const groupTitles: Record<string, string> = {
        input: '📥 工作流输入',
        node: '🔲 节点输出',
        variable: '📦 全局变量',
        env: '⚙️ 环境变量'
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* 触发按钮 */}
            {triggerElement ? (
                <div onClick={() => setIsOpen(!isOpen)}>
                    {triggerElement}
                </div>
            ) : (
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600/20 text-purple-400 rounded hover:bg-purple-600/30 transition-colors"
                >
                    <Database size={12} />
                    <span>插入变量</span>
                    <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            )}

            {/* 下拉面板 */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-1 z-50 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                    {/* 搜索框 */}
                    <div className="p-2 border-b border-slate-700">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="搜索变量..."
                                className="w-full pl-8 pr-8 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                                autoFocus
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 变量列表 */}
                    <div className="max-h-64 overflow-y-auto">
                        {filteredVariables.length === 0 ? (
                            <div className="p-4 text-center text-slate-500 text-sm">
                                没有找到匹配的变量
                            </div>
                        ) : (
                            <>
                                {(['input', 'node', 'variable', 'env'] as const).map(type => {
                                    const items = groupedVariables[type];
                                    if (items.length === 0) return null;

                                    return (
                                        <div key={type}>
                                            <div className="px-3 py-1.5 text-xs text-slate-500 bg-slate-900/50 sticky top-0">
                                                {groupTitles[type]}
                                            </div>
                                            {items.map((v, i) => (
                                                <button
                                                    key={`${v.value}-${i}`}
                                                    onClick={() => handleSelect(v)}
                                                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                                                >
                                                    <TypeIcon type={v.type} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-white truncate">{v.label}</div>
                                                        <div className="text-[10px] text-slate-500 font-mono truncate">{v.value}</div>
                                                        {v.description && (
                                                            <div className="text-[10px] text-slate-600 truncate">{v.description}</div>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    {/* 底部提示 */}
                    <div className="px-3 py-2 border-t border-slate-700 bg-slate-900/50">
                        <p className="text-[10px] text-slate-500">
                            💡 变量将在工作流执行时动态替换
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// 带输入框的变量选择器
// ============================================

interface VariableInputProps {
    value: string;
    onChange: (value: string) => void;
    nodes: Node[];
    currentNodeId: string;
    variables?: Record<string, any>;
    placeholder?: string;
    multiline?: boolean;
    rows?: number;
    className?: string;
    label?: string;
}

export function VariableInput({
    value,
    onChange,
    nodes,
    currentNodeId,
    variables,
    placeholder,
    multiline = false,
    rows = 3,
    className = '',
    label
}: VariableInputProps) {
    const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

    // 插入变量
    const handleInsertVariable = (variable: string) => {
        const input = inputRef.current;
        if (!input) {
            onChange(value + variable);
            return;
        }

        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const newValue = value.slice(0, start) + variable + value.slice(end);
        onChange(newValue);

        // 设置光标位置
        setTimeout(() => {
            input.focus();
            const newPos = start + variable.length;
            input.setSelectionRange(newPos, newPos);
        }, 0);
    };

    const InputComponent = multiline ? 'textarea' : 'input';

    return (
        <div className={className}>
            {label && (
                <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">{label}</label>
                    <VariableSelector
                        nodes={nodes}
                        currentNodeId={currentNodeId}
                        variables={variables}
                        onSelect={handleInsertVariable}
                    />
                </div>
            )}
            <InputComponent
                ref={inputRef as any}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={multiline ? rows : undefined}
                className={`w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 font-mono ${multiline ? 'resize-none' : ''}`}
            />
        </div>
    );
}

export default VariableSelector;
