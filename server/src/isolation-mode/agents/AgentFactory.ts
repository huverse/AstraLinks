/**
 * Agent 工厂
 * 
 * 根据配置创建 Agent 实例
 */

import { AgentConfig } from '../core/types';
import { IAgent, IAgentFactory } from '../core/interfaces';
import { AgentExecutor } from './AgentExecutor';
import { ILlmAdapter } from '../llm';
import agentPresets from './presets';

/**
 * Agent 工厂实现
 */
export class AgentFactory implements IAgentFactory {
    private presets: Map<string, Partial<AgentConfig>> = new Map();

    constructor() {
        this.loadPresets();
    }

    /**
     * 加载预设 Agent 配置
     */
    private loadPresets(): void {
        Object.entries(agentPresets).forEach(([id, preset]) => {
            this.registerPreset(id, preset);
        });
    }

    /**
     * 创建 Agent 实例
     */
    create(config: AgentConfig, llmAdapter?: ILlmAdapter): IAgent {
        const normalized: AgentConfig = {
            ...config,
            name: config.name || config.id,
            role: (config.role || 'custom') as AgentConfig['role'],
            llmProviderId: config.llmProviderId || 'galaxyous',
            systemPrompt: config.systemPrompt || ''
        };

        return new AgentExecutor(normalized, llmAdapter);
    }

    /**
     * 从预设创建 Agent
     */
    createFromPreset(presetId: string, overrides?: Partial<AgentConfig>): IAgent {
        const preset = this.presets.get(presetId);
        if (!preset) {
            throw new Error(`Agent preset not found: ${presetId}`);
        }

        const config: AgentConfig = {
            id: overrides?.id || `${presetId}-${Date.now()}`,
            name: overrides?.name || preset.name || presetId,
            role: overrides?.role || preset.role || 'custom',
            llmProviderId: overrides?.llmProviderId || preset.llmProviderId || 'galaxyous',
            systemPrompt: overrides?.systemPrompt || preset.systemPrompt || '',
            ...preset,
            ...overrides,
        } as AgentConfig;

        return this.create(config);
    }

    /**
     * 注册预设
     */
    registerPreset(presetId: string, config: Partial<AgentConfig>): void {
        this.presets.set(presetId, config);
    }
}

// 导出单例
export const agentFactory = new AgentFactory();
