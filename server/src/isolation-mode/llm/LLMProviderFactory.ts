/**
 * LLM Provider 工厂
 */

import { ILLMProvider, ILLMProviderFactory } from '../core/interfaces';
import { GalaxyousProvider } from './providers/GalaxyousProvider';

/**
 * LLM Provider 工厂实现
 */
export class LLMProviderFactory implements ILLMProviderFactory {
    private providers: Map<string, ILLMProvider> = new Map();
    private defaultProviderId: string = 'galaxyous';

    constructor() {
        // 注册默认 Provider
        this.registerProvider('galaxyous', new GalaxyousProvider());
    }

    /**
     * 获取 Provider
     */
    getProvider(providerId: string): ILLMProvider {
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new Error(`LLM Provider not found: ${providerId}`);
        }
        return provider;
    }

    /**
     * 获取默认 Provider
     */
    getDefaultProvider(): ILLMProvider {
        return this.getProvider(this.defaultProviderId);
    }

    /**
     * 设置默认 Provider
     */
    setDefaultProvider(providerId: string): void {
        if (!this.providers.has(providerId)) {
            throw new Error(`LLM Provider not found: ${providerId}`);
        }
        this.defaultProviderId = providerId;
    }

    /**
     * 注册 Provider
     */
    registerProvider(providerId: string, provider: ILLMProvider): void {
        this.providers.set(providerId, provider);
    }

    /**
     * 获取所有可用 Provider
     */
    getAvailableProviders(): string[] {
        return Array.from(this.providers.keys());
    }
}

export const llmProviderFactory = new LLMProviderFactory();
