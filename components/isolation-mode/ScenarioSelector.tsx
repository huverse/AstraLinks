/**
 * 场景选择器组件
 * 6种场景卡片选择样式
 */

import React from 'react';
import { ScenarioConfig } from './types';

interface ScenarioSelectorProps {
    scenarios: ScenarioConfig[];
    selected: string | null;
    onSelect: (id: string) => void;
}

// 颜色映射
const colorMap: Record<string, { bg: string; border: string; text: string; hover: string }> = {
    red: {
        bg: 'bg-red-500/10',
        border: 'border-red-500',
        text: 'text-red-400',
        hover: 'hover:border-red-500/50 hover:bg-red-500/5'
    },
    amber: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500',
        text: 'text-amber-400',
        hover: 'hover:border-amber-500/50 hover:bg-amber-500/5'
    },
    blue: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500',
        text: 'text-blue-400',
        hover: 'hover:border-blue-500/50 hover:bg-blue-500/5'
    },
    green: {
        bg: 'bg-green-500/10',
        border: 'border-green-500',
        text: 'text-green-400',
        hover: 'hover:border-green-500/50 hover:bg-green-500/5'
    },
    purple: {
        bg: 'bg-purple-500/10',
        border: 'border-purple-500',
        text: 'text-purple-400',
        hover: 'hover:border-purple-500/50 hover:bg-purple-500/5'
    },
    cyan: {
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500',
        text: 'text-cyan-400',
        hover: 'hover:border-cyan-500/50 hover:bg-cyan-500/5'
    },
};

export const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
    scenarios,
    selected,
    onSelect,
}) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {scenarios.map(scenario => {
                const isSelected = selected === scenario.id;
                const colors = colorMap[scenario.color] || colorMap.purple;

                return (
                    <button
                        key={scenario.id}
                        onClick={() => onSelect(scenario.id)}
                        className={`
                            relative p-4 rounded-xl text-left transition-all duration-200
                            ${isSelected
                                ? `${colors.bg} border-2 ${colors.border} shadow-lg`
                                : `bg-slate-800/50 border border-white/10 ${colors.hover}`
                            }
                        `}
                    >
                        {/* 选中指示器 */}
                        {isSelected && (
                            <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${colors.border.replace('border-', 'bg-')} animate-pulse`} />
                        )}

                        {/* 图标 */}
                        <div className="text-2xl mb-2">{scenario.icon}</div>

                        {/* 名称 */}
                        <div className={`font-semibold ${isSelected ? colors.text : 'text-white'}`}>
                            {scenario.name}
                        </div>

                        {/* 描述 */}
                        <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {scenario.description}
                        </div>

                        {/* 推荐人数 */}
                        {scenario.recommendedAgents && (
                            <div className={`text-xs mt-2 ${isSelected ? colors.text : 'text-slate-500'}`}>
                                推荐 {scenario.recommendedAgents}
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
