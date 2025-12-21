/**
 * 条件编辑器
 * 
 * @module components/workflow/ConditionEditor
 * @description 可视化条件规则构建器 - 支持 AND/OR 组合和多分支
 */

import React, { useState, useCallback } from 'react';
import {
    Plus,
    Trash2,
    ChevronDown,
    ChevronUp,
    GitBranch,
    Copy
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface ConditionRule {
    id: string;
    field: string;      // 字段路径 (如 input.score)
    operator: ConditionOperator;
    value: string;      // 比较值
}

export type ConditionOperator =
    | 'equals'           // ==
    | 'notEquals'        // !=
    | 'greaterThan'      // >
    | 'lessThan'         // <
    | 'greaterOrEqual'   // >=
    | 'lessOrEqual'      // <=
    | 'contains'         // 包含
    | 'notContains'      // 不包含
    | 'startsWith'       // 开头是
    | 'endsWith'         // 结尾是
    | 'isEmpty'          // 为空
    | 'isNotEmpty'       // 非空
    | 'isTrue'           // 为真
    | 'isFalse';         // 为假

export interface ConditionGroup {
    id: string;
    logic: 'AND' | 'OR';
    rules: ConditionRule[];
}

export interface ConditionBranch {
    id: string;
    name: string;
    condition: ConditionGroup;
    targetHandle?: string; // 连接的输出句柄
}

export interface ConditionEditorProps {
    branches: ConditionBranch[];
    onChange: (branches: ConditionBranch[]) => void;
    availableFields?: string[];
}

// ============================================
// 操作符选项
// ============================================

const OPERATORS: { value: ConditionOperator; label: string }[] = [
    { value: 'equals', label: '等于' },
    { value: 'notEquals', label: '不等于' },
    { value: 'greaterThan', label: '大于' },
    { value: 'lessThan', label: '小于' },
    { value: 'greaterOrEqual', label: '大于等于' },
    { value: 'lessOrEqual', label: '小于等于' },
    { value: 'contains', label: '包含' },
    { value: 'notContains', label: '不包含' },
    { value: 'startsWith', label: '开头是' },
    { value: 'endsWith', label: '结尾是' },
    { value: 'isEmpty', label: '为空' },
    { value: 'isNotEmpty', label: '非空' },
    { value: 'isTrue', label: '为真' },
    { value: 'isFalse', label: '为假' },
];

const NO_VALUE_OPERATORS = ['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse'];

// ============================================
// 工具函数
// ============================================

function genId(): string {
    return Math.random().toString(36).slice(2, 10);
}

function createEmptyRule(): ConditionRule {
    return { id: genId(), field: 'input', operator: 'equals', value: '' };
}

function createEmptyBranch(index: number): ConditionBranch {
    return {
        id: genId(),
        name: `分支 ${index + 1}`,
        condition: {
            id: genId(),
            logic: 'AND',
            rules: [createEmptyRule()]
        }
    };
}

// ============================================
// 条件规则评估 (运行时使用)
// ============================================

export function evaluateCondition(group: ConditionGroup, data: any): boolean {
    const results = group.rules.map(rule => evaluateRule(rule, data));

    if (group.logic === 'AND') {
        return results.every(r => r);
    } else {
        return results.some(r => r);
    }
}

function evaluateRule(rule: ConditionRule, data: any): boolean {
    // 获取字段值
    const fieldValue = getNestedValue(data, rule.field);
    const compareValue = rule.value;

    switch (rule.operator) {
        case 'equals':
            return String(fieldValue) === compareValue;
        case 'notEquals':
            return String(fieldValue) !== compareValue;
        case 'greaterThan':
            return Number(fieldValue) > Number(compareValue);
        case 'lessThan':
            return Number(fieldValue) < Number(compareValue);
        case 'greaterOrEqual':
            return Number(fieldValue) >= Number(compareValue);
        case 'lessOrEqual':
            return Number(fieldValue) <= Number(compareValue);
        case 'contains':
            return String(fieldValue).includes(compareValue);
        case 'notContains':
            return !String(fieldValue).includes(compareValue);
        case 'startsWith':
            return String(fieldValue).startsWith(compareValue);
        case 'endsWith':
            return String(fieldValue).endsWith(compareValue);
        case 'isEmpty':
            return fieldValue === null || fieldValue === undefined || fieldValue === '';
        case 'isNotEmpty':
            return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
        case 'isTrue':
            return Boolean(fieldValue) === true;
        case 'isFalse':
            return Boolean(fieldValue) === false;
        default:
            return false;
    }
}

function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

// ============================================
// 主组件
// ============================================

export function ConditionEditor({
    branches,
    onChange,
    availableFields = ['input', 'input.text', 'input.score', 'input.type']
}: ConditionEditorProps) {
    const [expandedBranch, setExpandedBranch] = useState<string | null>(
        branches[0]?.id || null
    );

    // 添加分支
    const addBranch = useCallback(() => {
        onChange([...branches, createEmptyBranch(branches.length)]);
    }, [branches, onChange]);

    // 删除分支
    const removeBranch = useCallback((branchId: string) => {
        if (branches.length <= 1) return;
        onChange(branches.filter(b => b.id !== branchId));
    }, [branches, onChange]);

    // 更新分支
    const updateBranch = useCallback((branchId: string, updates: Partial<ConditionBranch>) => {
        onChange(branches.map(b =>
            b.id === branchId ? { ...b, ...updates } : b
        ));
    }, [branches, onChange]);

    // 添加规则
    const addRule = useCallback((branchId: string) => {
        onChange(branches.map(b =>
            b.id === branchId
                ? { ...b, condition: { ...b.condition, rules: [...b.condition.rules, createEmptyRule()] } }
                : b
        ));
    }, [branches, onChange]);

    // 删除规则
    const removeRule = useCallback((branchId: string, ruleId: string) => {
        onChange(branches.map(b => {
            if (b.id !== branchId) return b;
            const newRules = b.condition.rules.filter(r => r.id !== ruleId);
            if (newRules.length === 0) newRules.push(createEmptyRule());
            return { ...b, condition: { ...b.condition, rules: newRules } };
        }));
    }, [branches, onChange]);

    // 更新规则
    const updateRule = useCallback((branchId: string, ruleId: string, updates: Partial<ConditionRule>) => {
        onChange(branches.map(b => {
            if (b.id !== branchId) return b;
            return {
                ...b,
                condition: {
                    ...b.condition,
                    rules: b.condition.rules.map(r =>
                        r.id === ruleId ? { ...r, ...updates } : r
                    )
                }
            };
        }));
    }, [branches, onChange]);

    // 切换逻辑
    const toggleLogic = useCallback((branchId: string) => {
        onChange(branches.map(b =>
            b.id === branchId
                ? { ...b, condition: { ...b.condition, logic: b.condition.logic === 'AND' ? 'OR' : 'AND' } }
                : b
        ));
    }, [branches, onChange]);

    return (
        <div className="space-y-3">
            {/* 分支列表 */}
            {branches.map((branch, index) => (
                <div
                    key={branch.id}
                    className="border border-slate-600 rounded-lg overflow-hidden"
                >
                    {/* 分支头部 */}
                    <div
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800 cursor-pointer"
                        onClick={() => setExpandedBranch(expandedBranch === branch.id ? null : branch.id)}
                    >
                        <GitBranch size={14} className="text-amber-400" />
                        <input
                            type="text"
                            value={branch.name}
                            onChange={(e) => updateBranch(branch.id, { name: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 bg-transparent text-sm text-white outline-none"
                        />
                        <span className="text-[10px] text-slate-500">
                            {branch.condition.rules.length} 条规则
                        </span>
                        {branches.length > 1 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); removeBranch(branch.id); }}
                                className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                        {expandedBranch === branch.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>

                    {/* 分支内容 */}
                    {expandedBranch === branch.id && (
                        <div className="p-3 bg-slate-900/50 space-y-2">
                            {/* 逻辑切换 */}
                            {branch.condition.rules.length > 1 && (
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-slate-500">条件关系:</span>
                                    <button
                                        onClick={() => toggleLogic(branch.id)}
                                        className={`px-2 py-0.5 text-xs rounded ${branch.condition.logic === 'AND'
                                                ? 'bg-blue-600/30 text-blue-400'
                                                : 'bg-purple-600/30 text-purple-400'
                                            }`}
                                    >
                                        {branch.condition.logic === 'AND' ? '全部满足 (AND)' : '任一满足 (OR)'}
                                    </button>
                                </div>
                            )}

                            {/* 规则列表 */}
                            {branch.condition.rules.map((rule, ruleIndex) => (
                                <div key={rule.id} className="flex items-center gap-2">
                                    {/* 字段 */}
                                    <select
                                        value={rule.field}
                                        onChange={(e) => updateRule(branch.id, rule.id, { field: e.target.value })}
                                        className="flex-1 min-w-0 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-xs text-white focus:outline-none focus:border-purple-500"
                                    >
                                        {availableFields.map(f => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>

                                    {/* 操作符 */}
                                    <select
                                        value={rule.operator}
                                        onChange={(e) => updateRule(branch.id, rule.id, { operator: e.target.value as ConditionOperator })}
                                        className="w-24 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-xs text-white focus:outline-none focus:border-purple-500"
                                    >
                                        {OPERATORS.map(op => (
                                            <option key={op.value} value={op.value}>{op.label}</option>
                                        ))}
                                    </select>

                                    {/* 值 */}
                                    {!NO_VALUE_OPERATORS.includes(rule.operator) && (
                                        <input
                                            type="text"
                                            value={rule.value}
                                            onChange={(e) => updateRule(branch.id, rule.id, { value: e.target.value })}
                                            placeholder="值"
                                            className="flex-1 min-w-0 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-xs text-white focus:outline-none focus:border-purple-500"
                                        />
                                    )}

                                    {/* 删除规则 */}
                                    <button
                                        onClick={() => removeRule(branch.id, rule.id)}
                                        className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}

                            {/* 添加规则 */}
                            <button
                                onClick={() => addRule(branch.id)}
                                className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                            >
                                <Plus size={12} />
                                添加条件
                            </button>
                        </div>
                    )}
                </div>
            ))}

            {/* 添加分支 */}
            <button
                onClick={addBranch}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 border border-dashed border-slate-600 rounded-lg text-xs text-slate-400 hover:border-purple-500 hover:text-purple-400 transition-colors"
            >
                <Plus size={12} />
                添加分支
            </button>

            {/* 默认分支提示 */}
            <p className="text-[10px] text-slate-500">
                💡 不满足任何条件时走 "else" 分支
            </p>
        </div>
    );
}

export default ConditionEditor;
