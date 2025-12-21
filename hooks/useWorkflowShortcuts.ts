/**
 * 工作流编辑器快捷键
 * 
 * @module hooks/useWorkflowShortcuts
 * @description 键盘快捷键管理 (不依赖 ReactFlow Provider)
 */

import { useCallback, useEffect, useRef } from 'react';
import { Node, Edge } from 'reactflow';

// ============================================
// 类型定义
// ============================================

export interface UseWorkflowShortcutsOptions {
    nodes: Node[];
    edges: Edge[];
    selectedNode: string | null;
    onNodesChange: (nodes: Node[]) => void;
    onEdgesChange: (edges: Edge[]) => void;
    onSave?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onDelete?: (nodeIds: string[]) => void;
    onDuplicate?: (nodeIds: string[]) => void;
    onSelectAll?: () => void;
    onShowHelp?: () => void;
}

// ============================================
// 历史管理
// ============================================

interface HistoryState {
    nodes: Node[];
    edges: Edge[];
}

const MAX_HISTORY = 50;

// ============================================
// 主 Hook
// ============================================

export function useWorkflowShortcuts({
    nodes,
    edges,
    selectedNode,
    onNodesChange,
    onEdgesChange,
    onSave,
    onUndo,
    onRedo,
    onDelete,
    onDuplicate,
    onSelectAll,
    onShowHelp
}: UseWorkflowShortcutsOptions) {
    // 剪贴板
    const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

    // 历史记录
    const historyRef = useRef<HistoryState[]>([]);
    const historyIndexRef = useRef(-1);
    const isUndoRedoRef = useRef(false);

    // 保存历史
    const saveHistory = useCallback(() => {
        if (isUndoRedoRef.current) {
            isUndoRedoRef.current = false;
            return;
        }

        const state: HistoryState = {
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges))
        };

        // 如果在历史中间位置，清除后面的历史
        if (historyIndexRef.current < historyRef.current.length - 1) {
            historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        }

        historyRef.current.push(state);

        // 限制历史长度
        if (historyRef.current.length > MAX_HISTORY) {
            historyRef.current.shift();
        }

        historyIndexRef.current = historyRef.current.length - 1;
    }, [nodes, edges]);

    // 初始化历史
    useEffect(() => {
        if (historyRef.current.length === 0 && nodes.length > 0) {
            saveHistory();
        }
    }, [nodes, saveHistory]);

    // 撤销
    const handleUndo = useCallback(() => {
        if (historyIndexRef.current <= 0) return;

        isUndoRedoRef.current = true;
        historyIndexRef.current--;
        const state = historyRef.current[historyIndexRef.current];

        if (state) {
            onNodesChange(state.nodes);
            onEdgesChange(state.edges);
        }

        onUndo?.();
    }, [onNodesChange, onEdgesChange, onUndo]);

    // 重做
    const handleRedo = useCallback(() => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;

        isUndoRedoRef.current = true;
        historyIndexRef.current++;
        const state = historyRef.current[historyIndexRef.current];

        if (state) {
            onNodesChange(state.nodes);
            onEdgesChange(state.edges);
        }

        onRedo?.();
    }, [onNodesChange, onEdgesChange, onRedo]);

    // 复制 - 使用 props 传入的 nodes
    const handleCopy = useCallback(() => {
        const selectedNodes = nodes.filter(n => n.selected || n.id === selectedNode);
        if (selectedNodes.length === 0) return;

        const nodeIds = new Set(selectedNodes.map(n => n.id));
        const relatedEdges = edges.filter(
            e => nodeIds.has(e.source) && nodeIds.has(e.target)
        );

        clipboardRef.current = {
            nodes: JSON.parse(JSON.stringify(selectedNodes)),
            edges: JSON.parse(JSON.stringify(relatedEdges))
        };

        console.log(`[Shortcuts] Copied ${selectedNodes.length} nodes`);
    }, [nodes, edges, selectedNode]);

    // 粘贴
    const handlePaste = useCallback(() => {
        if (!clipboardRef.current) return;

        const { nodes: copiedNodes, edges: copiedEdges } = clipboardRef.current;
        const idMapping: Record<string, string> = {};
        const offset = 50;

        // 创建新节点
        const newNodes = copiedNodes.map(node => {
            const newId = `${node.id}_copy_${Date.now()}`;
            idMapping[node.id] = newId;
            return {
                ...node,
                id: newId,
                position: {
                    x: node.position.x + offset,
                    y: node.position.y + offset
                },
                selected: true
            };
        });

        // 创建新边
        const newEdges = copiedEdges.map(edge => ({
            ...edge,
            id: `${edge.id}_copy_${Date.now()}`,
            source: idMapping[edge.source] || edge.source,
            target: idMapping[edge.target] || edge.target
        }));

        // 取消其他节点选中
        const updatedNodes = nodes.map(n => ({ ...n, selected: false }));

        onNodesChange([...updatedNodes, ...newNodes]);
        onEdgesChange([...edges, ...newEdges]);
        saveHistory();

        console.log(`[Shortcuts] Pasted ${newNodes.length} nodes`);
    }, [nodes, edges, onNodesChange, onEdgesChange, saveHistory]);

    // 删除
    const handleDelete = useCallback(() => {
        const selectedNodes = nodes.filter(n => n.selected || n.id === selectedNode);
        if (selectedNodes.length === 0) return;

        // 不允许删除 start 和 end 节点
        const deletableNodes = selectedNodes.filter(
            n => n.type !== 'start' && n.type !== 'end'
        );

        if (deletableNodes.length === 0) return;

        const deleteIds = new Set(deletableNodes.map(n => n.id));

        const newNodes = nodes.filter(n => !deleteIds.has(n.id));
        const newEdges = edges.filter(
            e => !deleteIds.has(e.source) && !deleteIds.has(e.target)
        );

        onNodesChange(newNodes);
        onEdgesChange(newEdges);
        saveHistory();
        onDelete?.(Array.from(deleteIds));

        console.log(`[Shortcuts] Deleted ${deletableNodes.length} nodes`);
    }, [nodes, edges, selectedNode, onNodesChange, onEdgesChange, saveHistory, onDelete]);

    // 全选
    const handleSelectAll = useCallback(() => {
        const allSelected = nodes.map(n => ({ ...n, selected: true }));
        onNodesChange(allSelected);
        onSelectAll?.();
    }, [nodes, onNodesChange, onSelectAll]);

    // 复制节点 (Ctrl+D)
    const handleDuplicate = useCallback(() => {
        handleCopy();
        setTimeout(() => handlePaste(), 10);
        onDuplicate?.([selectedNode || ''].filter(Boolean));
    }, [handleCopy, handlePaste, onDuplicate, selectedNode]);

    // 保存
    const handleSave = useCallback(() => {
        onSave?.();
    }, [onSave]);

    // 显示帮助
    const handleShowHelp = useCallback(() => {
        onShowHelp?.();
    }, [onShowHelp]);

    // 键盘事件处理
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 如果在输入框中，不处理快捷键
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            const key = e.key.toLowerCase();
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;

            // Ctrl+C 复制
            if (ctrl && key === 'c') {
                e.preventDefault();
                handleCopy();
                return;
            }

            // Ctrl+V 粘贴
            if (ctrl && key === 'v') {
                e.preventDefault();
                handlePaste();
                return;
            }

            // Ctrl+X 剪切
            if (ctrl && key === 'x') {
                e.preventDefault();
                handleCopy();
                handleDelete();
                return;
            }

            // Ctrl+Z 撤销
            if (ctrl && key === 'z' && !shift) {
                e.preventDefault();
                handleUndo();
                return;
            }

            // Ctrl+Y 或 Ctrl+Shift+Z 重做
            if ((ctrl && key === 'y') || (ctrl && shift && key === 'z')) {
                e.preventDefault();
                handleRedo();
                return;
            }

            // Delete/Backspace 删除
            if (key === 'delete' || key === 'backspace') {
                e.preventDefault();
                handleDelete();
                return;
            }

            // Ctrl+A 全选
            if (ctrl && key === 'a') {
                e.preventDefault();
                handleSelectAll();
                return;
            }

            // Ctrl+D 复制节点
            if (ctrl && key === 'd') {
                e.preventDefault();
                handleDuplicate();
                return;
            }

            // Ctrl+S 保存
            if (ctrl && key === 's') {
                e.preventDefault();
                handleSave();
                return;
            }

            // ? 显示帮助
            if (key === '?' || (shift && key === '/')) {
                e.preventDefault();
                handleShowHelp();
                return;
            }

            // Escape 取消选择
            if (key === 'escape') {
                const deselected = nodes.map(n => ({ ...n, selected: false }));
                onNodesChange(deselected);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        handleCopy, handlePaste, handleDelete, handleUndo, handleRedo,
        handleSelectAll, handleDuplicate, handleSave, handleShowHelp,
        nodes, onNodesChange
    ]);

    // 监听节点变化保存历史
    useEffect(() => {
        const timeout = setTimeout(() => {
            saveHistory();
        }, 500);
        return () => clearTimeout(timeout);
    }, [nodes, edges, saveHistory]);

    return {
        copy: handleCopy,
        paste: handlePaste,
        cut: () => { handleCopy(); handleDelete(); },
        undo: handleUndo,
        redo: handleRedo,
        delete: handleDelete,
        selectAll: handleSelectAll,
        duplicate: handleDuplicate,
        save: handleSave,
        canUndo: historyIndexRef.current > 0,
        canRedo: historyIndexRef.current < historyRef.current.length - 1,
        historyLength: historyRef.current.length
    };
}

// ============================================
// 快捷键列表 (用于帮助面板)
// ============================================

export const SHORTCUT_LIST = [
    { keys: ['Ctrl', 'C'], description: '复制选中节点' },
    { keys: ['Ctrl', 'V'], description: '粘贴节点' },
    { keys: ['Ctrl', 'X'], description: '剪切节点' },
    { keys: ['Ctrl', 'D'], description: '复制当前节点' },
    { keys: ['Ctrl', 'Z'], description: '撤销' },
    { keys: ['Ctrl', 'Y'], description: '重做' },
    { keys: ['Ctrl', 'A'], description: '全选节点' },
    { keys: ['Ctrl', 'S'], description: '保存工作流' },
    { keys: ['Delete'], description: '删除选中节点' },
    { keys: ['Escape'], description: '取消选择' },
    { keys: ['?'], description: '显示快捷键帮助' },
];

export default useWorkflowShortcuts;
