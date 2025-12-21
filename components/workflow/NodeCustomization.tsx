/**
 * 节点自定义面板
 * 
 * @module components/workflow/NodeCustomization
 * @description 自定义节点颜色、图标和分组
 */

import React, { useState, useCallback } from 'react';
import {
    Palette,
    Star,
    FolderOpen,
    ChevronDown,
    Check,
    X
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface NodeCustomization {
    color?: string;
    icon?: string;
    group?: string;
}

export interface NodeCustomizationPanelProps {
    nodeId: string;
    nodeLabel: string;
    currentCustomization?: NodeCustomization;
    onSave: (customization: NodeCustomization) => void;
    onClose: () => void;
}

// ============================================
// 预设颜色
// ============================================

const PRESET_COLORS = [
    { name: '紫色', value: '#8b5cf6', bg: 'bg-purple-500' },
    { name: '蓝色', value: '#3b82f6', bg: 'bg-blue-500' },
    { name: '青色', value: '#06b6d4', bg: 'bg-cyan-500' },
    { name: '绿色', value: '#22c55e', bg: 'bg-green-500' },
    { name: '黄色', value: '#eab308', bg: 'bg-yellow-500' },
    { name: '橙色', value: '#f97316', bg: 'bg-orange-500' },
    { name: '红色', value: '#ef4444', bg: 'bg-red-500' },
    { name: '粉色', value: '#ec4899', bg: 'bg-pink-500' },
    { name: '灰色', value: '#64748b', bg: 'bg-slate-500' },
];

// ============================================
// 预设图标
// ============================================

const PRESET_ICONS = [
    '🤖', '💡', '📊', '🔍', '📝', '🎯', '⚡', '🔗',
    '📧', '🌐', '💾', '🔒', '📁', '🎨', '🧮', '🔧'
];

// ============================================
// 预设分组
// ============================================

const PRESET_GROUPS = [
    '数据处理',
    'AI 生成',
    '外部服务',
    '控制流程',
    '验证检查',
    '通知输出',
    '自定义'
];

// ============================================
// 主组件
// ============================================

export function NodeCustomizationPanel({
    nodeId,
    nodeLabel,
    currentCustomization = {},
    onSave,
    onClose
}: NodeCustomizationPanelProps) {
    const [color, setColor] = useState(currentCustomization.color || PRESET_COLORS[0].value);
    const [icon, setIcon] = useState(currentCustomization.icon || '');
    const [group, setGroup] = useState(currentCustomization.group || '');
    const [customColor, setCustomColor] = useState('');
    const [showColorPicker, setShowColorPicker] = useState(false);

    const handleSave = useCallback(() => {
        onSave({ color, icon, group: group || undefined });
    }, [color, icon, group, onSave]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-[420px] bg-slate-800 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
                {/* 头部 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900">
                    <div className="flex items-center gap-2">
                        <Palette size={16} className="text-purple-400" />
                        <span className="text-sm font-medium text-white">自定义节点</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                {/* 节点预览 */}
                <div className="p-4 border-b border-slate-700 bg-slate-900/50">
                    <div
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600"
                        style={{ backgroundColor: color + '20', borderColor: color }}
                    >
                        {icon && <span className="text-lg">{icon}</span>}
                        <span className="text-white font-medium">{nodeLabel}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">ID: {nodeId}</p>
                </div>

                <div className="p-4 space-y-4">
                    {/* 颜色选择 */}
                    <div>
                        <label className="text-xs text-slate-400 block mb-2">节点颜色</label>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_COLORS.map((c) => (
                                <button
                                    key={c.value}
                                    onClick={() => setColor(c.value)}
                                    className={`w-8 h-8 rounded-lg transition-all ${color === c.value
                                            ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110'
                                            : 'hover:scale-105'
                                        }`}
                                    style={{ backgroundColor: c.value }}
                                    title={c.name}
                                />
                            ))}
                            {/* 自定义颜色 */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowColorPicker(!showColorPicker)}
                                    className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 via-green-500 to-blue-500 
                                             hover:scale-105 transition-all flex items-center justify-center"
                                    title="自定义颜色"
                                >
                                    <Palette size={14} className="text-white" />
                                </button>
                                {showColorPicker && (
                                    <div className="absolute top-10 left-0 p-2 bg-slate-900 rounded-lg border border-slate-600 z-10">
                                        <input
                                            type="color"
                                            value={customColor || color}
                                            onChange={(e) => {
                                                setCustomColor(e.target.value);
                                                setColor(e.target.value);
                                            }}
                                            className="w-20 h-8 cursor-pointer"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 图标选择 */}
                    <div>
                        <label className="text-xs text-slate-400 block mb-2">节点图标</label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setIcon('')}
                                className={`w-8 h-8 rounded-lg border transition-all flex items-center justify-center
                                    ${!icon
                                        ? 'border-purple-500 bg-purple-500/20'
                                        : 'border-slate-600 hover:border-slate-500'
                                    }`}
                                title="无图标"
                            >
                                <X size={14} className="text-slate-400" />
                            </button>
                            {PRESET_ICONS.map((emoji) => (
                                <button
                                    key={emoji}
                                    onClick={() => setIcon(emoji)}
                                    className={`w-8 h-8 rounded-lg border transition-all flex items-center justify-center
                                        ${icon === emoji
                                            ? 'border-purple-500 bg-purple-500/20'
                                            : 'border-slate-600 hover:border-slate-500'
                                        }`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 分组选择 */}
                    <div>
                        <label className="text-xs text-slate-400 block mb-2">
                            <FolderOpen size={12} className="inline mr-1" />
                            节点分组
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setGroup('')}
                                className={`px-3 py-1.5 text-xs rounded-lg border transition-all
                                    ${!group
                                        ? 'border-purple-500 bg-purple-500/20 text-white'
                                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                                    }`}
                            >
                                无分组
                            </button>
                            {PRESET_GROUPS.map((g) => (
                                <button
                                    key={g}
                                    onClick={() => setGroup(g)}
                                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all
                                        ${group === g
                                            ? 'border-purple-500 bg-purple-500/20 text-white'
                                            : 'border-slate-600 text-slate-400 hover:border-slate-500'
                                        }`}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 底部按钮 */}
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-700 bg-slate-900">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg 
                                 hover:bg-purple-700 transition-colors"
                    >
                        <Check size={14} />
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
}

export default NodeCustomizationPanel;
