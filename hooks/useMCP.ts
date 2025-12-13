/**
 * MCP 注册表 React Hook
 * 
 * @module hooks/useMCP
 * @description MCP 列表获取和工具调用
 */

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../utils/api';

// ============================================
// 类型定义
// ============================================

export interface MCPTool {
    name: string;
    description: string;
    parameters: { name: string; type: string; required: boolean }[];
}

export interface MCP {
    id: string;
    name: string;
    description: string;
    version: string;
    providerType: 'builtin' | 'custom' | 'marketplace';
    status: 'active' | 'inactive' | 'error';
    tools: MCPTool[];
}

export interface MCPCallResult {
    success: boolean;
    result?: any;
    error?: string;
    duration?: number;
}

// ============================================
// Hook: useMCPList
// ============================================

export function useMCPList() {
    const [mcps, setMcps] = useState<MCP[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMCPs = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // 先获取内置 MCP
            const builtinRes = await authFetch('/api/mcp-registry/builtin');
            const builtinData = await builtinRes.json();

            // 再获取自定义 MCP
            const customRes = await authFetch('/api/mcp-registry');
            const customData = await customRes.json();

            const allMcps = [
                ...(builtinData.data || []),
                ...(customData.data || []),
            ];

            setMcps(allMcps);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMCPs();
    }, [fetchMCPs]);

    return { mcps, loading, error, refetch: fetchMCPs };
}

// ============================================
// Hook: useMCPCall
// ============================================

export function useMCPCall() {
    const [calling, setCalling] = useState(false);
    const [lastResult, setLastResult] = useState<MCPCallResult | null>(null);

    const call = useCallback(async (
        mcpId: string,
        tool: string,
        params: Record<string, any>
    ): Promise<MCPCallResult> => {
        setCalling(true);

        try {
            const res = await authFetch(`/api/mcp-registry/${mcpId}/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool, params }),
            });

            const data = await res.json();

            const result: MCPCallResult = {
                success: data.success,
                result: data.result,
                error: data.error,
                duration: data.metadata?.duration,
            };

            setLastResult(result);
            return result;
        } catch (err: any) {
            const result: MCPCallResult = {
                success: false,
                error: err.message,
            };
            setLastResult(result);
            return result;
        } finally {
            setCalling(false);
        }
    }, []);

    return { call, calling, lastResult };
}

// ============================================
// Hook: useMCPRegister
// ============================================

export function useMCPRegister() {
    const [registering, setRegistering] = useState(false);

    const register = useCallback(async (mcp: Partial<MCP>): Promise<{ id?: string; error?: string }> => {
        setRegistering(true);

        try {
            const res = await authFetch('/api/mcp-registry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mcp),
            });

            const data = await res.json();
            return { id: data.data?.id };
        } catch (err: any) {
            return { error: err.message };
        } finally {
            setRegistering(false);
        }
    }, []);

    const unregister = useCallback(async (mcpId: string): Promise<boolean> => {
        try {
            await authFetch(`/api/mcp-registry/${mcpId}`, { method: 'DELETE' });
            return true;
        } catch {
            return false;
        }
    }, []);

    return { register, unregister, registering };
}

export default useMCPList;
