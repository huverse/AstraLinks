/**
 * 模型能力 React Hook
 * 
 * @module hooks/useModelCapabilities
 * @description 获取和缓存模型能力信息
 */

import { useState, useEffect, useCallback } from 'react';
import { modelDetector, ModelCapabilities, KNOWN_MODELS } from '../core/model';

export interface UseModelCapabilitiesReturn {
    /** 模型能力 */
    capabilities: ModelCapabilities | null;
    /** 加载状态 */
    loading: boolean;
    /** 错误信息 */
    error: string | null;
    /** 刷新能力 */
    refresh: () => Promise<void>;
    /** 获取所有已知模型 */
    knownModels: string[];
}

/**
 * 获取单个模型能力
 */
export function useModelCapabilities(
    model: string,
    options?: {
        endpoint?: string;
        apiKey?: string;
        autoDetect?: boolean;
    }
): UseModelCapabilitiesReturn {
    const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!model) {
            setCapabilities(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const caps = await modelDetector.getCapabilities(model, {
                endpoint: options?.endpoint || '',
                apiKey: options?.apiKey || '',
                useCache: true,
            });
            setCapabilities(caps);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [model, options?.endpoint, options?.apiKey]);

    useEffect(() => {
        if (options?.autoDetect !== false) {
            refresh();
        }
    }, [refresh, options?.autoDetect]);

    return {
        capabilities,
        loading,
        error,
        refresh,
        knownModels: modelDetector.getKnownModels(),
    };
}

/**
 * 获取多个模型能力
 */
export function useMultiModelCapabilities(
    models: string[]
): {
    capabilities: Record<string, ModelCapabilities>;
    loading: boolean;
} {
    const [capabilities, setCapabilities] = useState<Record<string, ModelCapabilities>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAll() {
            setLoading(true);
            const results: Record<string, ModelCapabilities> = {};

            await Promise.all(
                models.map(async (model) => {
                    try {
                        results[model] = await modelDetector.getCapabilities(model);
                    } catch {
                        // 忽略错误
                    }
                })
            );

            setCapabilities(results);
            setLoading(false);
        }

        if (models.length > 0) {
            fetchAll();
        } else {
            setCapabilities({});
            setLoading(false);
        }
    }, [models.join(',')]);

    return { capabilities, loading };
}

/**
 * 获取模型参数验证器
 */
export function useModelParameterValidator(model: string) {
    const { capabilities } = useModelCapabilities(model);

    const validateTemperature = useCallback((value: number): boolean => {
        if (!capabilities) return true;
        const { min, max } = capabilities.parameters.temperature;
        return value >= min && value <= max;
    }, [capabilities]);

    const validateMaxTokens = useCallback((value: number): boolean => {
        if (!capabilities) return true;
        const { min, max } = capabilities.parameters.maxTokens;
        return value >= min && value <= max;
    }, [capabilities]);

    const validateTopP = useCallback((value: number): boolean => {
        if (!capabilities) return true;
        const { min, max } = capabilities.parameters.topP;
        return value >= min && value <= max;
    }, [capabilities]);

    const clampTemperature = useCallback((value: number): number => {
        if (!capabilities) return value;
        const { min, max } = capabilities.parameters.temperature;
        return Math.max(min, Math.min(max, value));
    }, [capabilities]);

    const clampMaxTokens = useCallback((value: number): number => {
        if (!capabilities) return value;
        const { min, max } = capabilities.parameters.maxTokens;
        return Math.max(min, Math.min(max, value));
    }, [capabilities]);

    return {
        capabilities,
        validateTemperature,
        validateMaxTokens,
        validateTopP,
        clampTemperature,
        clampMaxTokens,
    };
}

export default useModelCapabilities;
