/**
 * 场景选择器组件
 */

import React from 'react';
import { Scenario } from './types';

interface ScenarioSelectorProps {
    scenarios: Scenario[];
    selected: string | null;
    onSelect: (id: string) => void;
}

export const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
    scenarios,
    selected,
    onSelect,
}) => {
    return (
        <div className="grid grid-cols-2 gap-3">
            {scenarios.map(scenario => (
                <button
                    key={scenario.id}
                    onClick={() => onSelect(scenario.id)}
                    className={`
                        p-4 rounded-xl text-left transition-all
                        ${selected === scenario.id
                            ? 'bg-purple-500/20 border-2 border-purple-500'
                            : 'bg-slate-800/50 border border-white/10 hover:border-purple-500/50'}
                    `}
                >
                    <div className="font-medium text-white">{scenario.name}</div>
                    <div className="text-xs text-slate-400 mt-1">{scenario.description}</div>
                </button>
            ))}
        </div>
    );
};
