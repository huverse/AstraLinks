/**
 * 隔离模式键盘快捷键 Hook
 */

import React, { useEffect, useCallback } from 'react';

interface HotkeyActions {
    onStart?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onEnd?: () => void;
    onRaiseHand?: () => void;
    onInterrupt?: () => void;
    onTogglePanel?: (panel: 'stats' | 'judge' | 'outline') => void;
    onNextAgent?: () => void;
    onPrevAgent?: () => void;
}

interface UseIsolationHotkeysOptions {
    enabled?: boolean;
    sessionStatus?: 'pending' | 'active' | 'paused' | 'completed';
}

export const HOTKEY_MAP = {
    'Space': { action: 'togglePlayPause', label: '开始/暂停', key: '空格' },
    'Escape': { action: 'end', label: '结束讨论', key: 'Esc' },
    'KeyH': { action: 'raiseHand', label: '举手', key: 'H' },
    'KeyI': { action: 'interrupt', label: '插话', key: 'I' },
    'KeyS': { action: 'toggleStats', label: '统计面板', key: 'S' },
    'KeyJ': { action: 'toggleJudge', label: '评分面板', key: 'J' },
    'KeyO': { action: 'toggleOutline', label: '大纲面板', key: 'O' },
    'ArrowUp': { action: 'prevAgent', label: '上一个 Agent', key: '↑' },
    'ArrowDown': { action: 'nextAgent', label: '下一个 Agent', key: '↓' },
} as const;

export function useIsolationHotkeys(
    actions: HotkeyActions,
    options: UseIsolationHotkeysOptions = {}
) {
    const { enabled = true, sessionStatus } = options;

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // 忽略输入框中的按键
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            e.target instanceof HTMLSelectElement
        ) {
            return;
        }

        // 忽略有修饰键的组合
        if (e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }

        const hotkey = HOTKEY_MAP[e.code as keyof typeof HOTKEY_MAP];
        if (!hotkey) return;

        switch (hotkey.action) {
            case 'togglePlayPause':
                e.preventDefault();
                if (sessionStatus === 'pending') {
                    actions.onStart?.();
                } else if (sessionStatus === 'active') {
                    actions.onPause?.();
                } else if (sessionStatus === 'paused') {
                    actions.onResume?.();
                }
                break;

            case 'end':
                if (sessionStatus === 'active' || sessionStatus === 'paused') {
                    e.preventDefault();
                    actions.onEnd?.();
                }
                break;

            case 'raiseHand':
                if (sessionStatus === 'active') {
                    e.preventDefault();
                    actions.onRaiseHand?.();
                }
                break;

            case 'interrupt':
                if (sessionStatus === 'active') {
                    e.preventDefault();
                    actions.onInterrupt?.();
                }
                break;

            case 'toggleStats':
                e.preventDefault();
                actions.onTogglePanel?.('stats');
                break;

            case 'toggleJudge':
                e.preventDefault();
                actions.onTogglePanel?.('judge');
                break;

            case 'toggleOutline':
                e.preventDefault();
                actions.onTogglePanel?.('outline');
                break;

            case 'prevAgent':
                e.preventDefault();
                actions.onPrevAgent?.();
                break;

            case 'nextAgent':
                e.preventDefault();
                actions.onNextAgent?.();
                break;
        }
    }, [actions, sessionStatus]);

    useEffect(() => {
        if (!enabled) return;

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [enabled, handleKeyDown]);
}

// 快捷键帮助组件
export const HotkeyHelp: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div
                className="bg-slate-800 border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-lg font-semibold text-white mb-4">键盘快捷键</h3>
                <div className="space-y-2">
                    {Object.values(HOTKEY_MAP).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">{item.label}</span>
                            <kbd className="px-2 py-1 bg-slate-900 rounded text-slate-300 text-xs font-mono">
                                {item.key}
                            </kbd>
                        </div>
                    ))}
                </div>
                <button
                    onClick={onClose}
                    className="mt-4 w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
                >
                    关闭
                </button>
            </div>
        </div>
    );
};
