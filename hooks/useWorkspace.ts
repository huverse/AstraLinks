/**
 * Workspace API 服务
 * 
 * @module hooks/useWorkspace
 * @description Workspace 相关的 API 调用和状态管理
 */

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../utils/api';

// 获取 token 的辅助函数 (使用与 AuthContext 相同的 key)
const getToken = () => localStorage.getItem('galaxyous_token');

// 封装 API 调用
const fetchAPI = async <T = any>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const token = getToken();
    return authFetch<T>(endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`, token, options);
};

// ============================================
// 类型定义
// ============================================

export type WorkspaceType = 'WORKFLOW' | 'PROJECT' | 'TASK' | 'SANDBOX';

export interface Workspace {
    id: string;
    name: string;
    type: WorkspaceType;
    ownerId: string;
    isolation: {
        contextIsolated: boolean;
        fileIsolated: boolean;
        resourceLimits?: {
            maxTokens: number;
            maxExecutionTime: number;
            maxConcurrentTasks: number;
        };
    };
    description?: string;
    tags: string[];
    icon?: string;
    createdAt: number;
    updatedAt: number;
}

export interface WorkspaceConfig {
    id: string;
    workspaceId: string;
    modelConfigs: any[];
    defaultModelId?: string;
    enabledMCPs: string[];
    features: {
        promptOptimization: boolean;
        autoSave: boolean;
        versionHistory: boolean;
    };
    updatedAt: number;
}

export interface Workflow {
    id: string;
    workspaceId: string;
    name: string;
    description?: string;
    version: number;
    nodes: any[];
    edges: any[];
    variables: Record<string, any>;
    isTemplate: boolean;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

// ============================================
// Workspace Hook
// ============================================

export function useWorkspaces() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWorkspaces = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchAPI('/workspaces');
            setWorkspaces(data.workspaces || []);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    const createWorkspace = async (params: {
        name: string;
        type: WorkspaceType;
        description?: string;
        tags?: string[];
        icon?: string;
    }) => {
        const data = await fetchAPI('/workspaces', {
            method: 'POST',
            body: JSON.stringify(params),
        });
        setWorkspaces(prev => [data, ...prev]);
        return data;
    };

    const updateWorkspace = async (id: string, params: Partial<Workspace>) => {
        await fetchAPI(`/workspaces/${id}`, {
            method: 'PUT',
            body: JSON.stringify(params),
        });
        setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, ...params } : w));
    };

    const deleteWorkspace = async (id: string) => {
        await fetchAPI(`/workspaces/${id}`, { method: 'DELETE' });
        setWorkspaces(prev => prev.filter(w => w.id !== id));
    };

    const activateWorkspace = async (id: string) => {
        await fetchAPI(`/workspaces/${id}/activate`, { method: 'POST' });
    };

    return {
        workspaces,
        loading,
        error,
        refresh: fetchWorkspaces,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        activateWorkspace,
    };
}

// ============================================
// Single Workspace Hook
// ============================================

export function useWorkspace(id: string | null) {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [config, setConfig] = useState<WorkspaceConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) {
            setWorkspace(null);
            setConfig(null);
            setLoading(false);
            return;
        }

        const fetch = async () => {
            try {
                setLoading(true);
                const data = await fetchAPI(`/workspaces/${id}`);
                setWorkspace(data);
                setConfig(data.config);
                setError(null);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };

        fetch();
    }, [id]);

    const updateConfig = async (params: Partial<WorkspaceConfig>) => {
        if (!id) return;
        await fetchAPI(`/workspaces/${id}/config`, {
            method: 'PUT',
            body: JSON.stringify(params),
        });
        setConfig(prev => prev ? { ...prev, ...params } : null);
    };

    return { workspace, config, loading, error, updateConfig };
}

// ============================================
// Workflows Hook
// ============================================

export function useWorkflows(workspaceId: string | null) {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWorkflows = useCallback(async () => {
        if (!workspaceId) {
            setWorkflows([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const data = await fetchAPI(`/workflows?workspaceId=${workspaceId}`);
            setWorkflows(data.workflows || []);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchWorkflows();
    }, [fetchWorkflows]);

    const createWorkflow = async (params: {
        name: string;
        description?: string;
        nodes?: any[];
        edges?: any[];
        variables?: Record<string, any>;
    }) => {
        if (!workspaceId) throw new Error('No workspace selected');

        const data = await fetchAPI('/workflows', {
            method: 'POST',
            body: JSON.stringify({ ...params, workspaceId }),
        });
        setWorkflows(prev => [data, ...prev]);
        return data;
    };

    const deleteWorkflow = async (id: string, permanent: boolean = false) => {
        await fetchAPI(`/workflows/${id}?permanent=${permanent}`, { method: 'DELETE' });
        setWorkflows(prev => prev.filter(w => w.id !== id));
    };

    return {
        workflows,
        loading,
        error,
        refresh: fetchWorkflows,
        createWorkflow,
        deleteWorkflow,
    };
}
