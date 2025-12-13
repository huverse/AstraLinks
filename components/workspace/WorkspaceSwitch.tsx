/**
 * Workspace 模式切换组件
 * 
 * @module components/workspace/WorkspaceSwitch
 * @description 顶部导航的模式切换按钮
 */

import React from 'react';
import { MessageSquare, Layers } from 'lucide-react';

export type AppMode = 'CHAT' | 'WORKSPACE';

interface WorkspaceSwitchProps {
    mode: AppMode;
    onModeChange: (mode: AppMode) => void;
}

export function WorkspaceSwitch({ mode, onModeChange }: WorkspaceSwitchProps) {
    return (
        <div className="flex bg-slate-800/80 backdrop-blur-sm rounded-full p-1 border border-white/10">
            <button
                onClick={() => onModeChange('CHAT')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${mode === 'CHAT'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                        : 'text-slate-400 hover:text-white'
                    }`}
            >
                <MessageSquare size={14} />
                <span className="hidden sm:inline">对话</span>
            </button>
            <button
                onClick={() => onModeChange('WORKSPACE')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${mode === 'WORKSPACE'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                        : 'text-slate-400 hover:text-white'
                    }`}
            >
                <Layers size={14} />
                <span className="hidden sm:inline">工作区</span>
            </button>
        </div>
    );
}

export default WorkspaceSwitch;
