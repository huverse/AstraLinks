/**
 * 场景加载器
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ScenarioConfig } from '../core/types';
import { ScenarioError } from '../core/errors';

/**
 * 场景加载器
 */
export class ScenarioLoader {
    private scenariosDir: string;
    private cache: Map<string, ScenarioConfig> = new Map();

    constructor(scenariosDir?: string) {
        this.scenariosDir = scenariosDir || path.join(__dirname, 'presets');
    }

    /**
     * 加载场景配置
     */
    async load(scenarioId: string): Promise<ScenarioConfig> {
        // 先检查缓存
        if (this.cache.has(scenarioId)) {
            return this.cache.get(scenarioId)!;
        }

        // 尝试从文件加载
        const filePath = path.join(this.scenariosDir, `${scenarioId}.scenario.yaml`);

        if (!fs.existsSync(filePath)) {
            throw new ScenarioError(`Scenario not found: ${scenarioId}`, scenarioId);
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const config = yaml.parse(content) as ScenarioConfig;

            // 验证配置
            this.validate(config);

            // 缓存
            this.cache.set(scenarioId, config);

            return config;
        } catch (err: any) {
            throw new ScenarioError(
                `Failed to load scenario: ${err.message}`,
                scenarioId,
                { error: err.message }
            );
        }
    }

    /**
     * 获取所有可用场景
     */
    async listAvailable(): Promise<string[]> {
        if (!fs.existsSync(this.scenariosDir)) {
            return [];
        }

        const files = fs.readdirSync(this.scenariosDir);
        return files
            .filter(f => f.endsWith('.scenario.yaml'))
            .map(f => f.replace('.scenario.yaml', ''));
    }

    /**
     * 验证场景配置
     */
    private validate(config: ScenarioConfig): void {
        if (!config.id) {
            throw new Error('Scenario must have an id');
        }
        if (!config.name) {
            throw new Error('Scenario must have a name');
        }
        if (!config.type) {
            throw new Error('Scenario must have a type');
        }
        if (!config.rules) {
            throw new Error('Scenario must have rules');
        }
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
    }
}

export const scenarioLoader = new ScenarioLoader();
