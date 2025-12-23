/**
 * Scenario 配置加载器
 * 
 * 从 YAML 文件加载并校验场景配置
 * 
 * 设计目标：
 * - 策划只改 YAML、不改代码
 * - 配置错误必须明确报错，指出字段路径
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import {
    ScenarioSchema,
    AlignmentConfig,
    FlowConfig,
    PhaseConfig,
    ModeratorPolicyConfig,
    InterventionLevel,
    RoleTemplate
} from '../core/types/scenario.types';
import { ScenarioError } from '../core/errors';

// ============================================
// 校验错误类型
// ============================================

interface ValidationError {
    path: string;
    message: string;
    value?: unknown;
}

// ============================================
// ScenarioConfigLoader
// ============================================

export class ScenarioConfigLoader {
    private configDir: string;
    private cache: Map<string, ScenarioSchema> = new Map();

    constructor(configDir?: string) {
        this.configDir = configDir || path.join(__dirname, '../config/scenarios');
    }

    /**
     * 加载场景配置
     */
    async load(scenarioId: string): Promise<ScenarioSchema> {
        // 检查缓存
        if (this.cache.has(scenarioId)) {
            return this.cache.get(scenarioId)!;
        }

        // 查找配置文件
        const filePath = this.findConfigFile(scenarioId);
        if (!filePath) {
            throw new ScenarioError(`Scenario not found: ${scenarioId}`, scenarioId);
        }

        // 读取并解析 YAML
        const content = fs.readFileSync(filePath, 'utf-8');
        let config: unknown;
        try {
            config = yaml.parse(content);
        } catch (e: any) {
            throw new ScenarioError(
                `YAML parse error: ${e.message}`,
                scenarioId,
                { file: filePath }
            );
        }

        // 校验配置
        const errors = this.validate(config);
        if (errors.length > 0) {
            const errorMessages = errors
                .map(e => `  - ${e.path}: ${e.message}`)
                .join('\n');
            throw new ScenarioError(
                `Invalid scenario configuration:\n${errorMessages}`,
                scenarioId,
                { errors }
            );
        }

        // 缓存并返回
        const schema = config as ScenarioSchema;
        this.cache.set(scenarioId, schema);
        return schema;
    }

    /**
     * 获取所有可用场景 ID
     */
    listAvailable(): string[] {
        if (!fs.existsSync(this.configDir)) {
            return [];
        }

        return fs.readdirSync(this.configDir)
            .filter(f => f.endsWith('.scenario.yaml') || f.endsWith('.scenario.yml'))
            .map(f => f.replace(/\.scenario\.(yaml|yml)$/, ''));
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
    }

    // ============================================
    // 私有方法
    // ============================================

    private findConfigFile(scenarioId: string): string | null {
        const extensions = ['.scenario.yaml', '.scenario.yml'];
        for (const ext of extensions) {
            const filePath = path.join(this.configDir, `${scenarioId}${ext}`);
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }
        return null;
    }

    /**
     * 完整校验
     */
    private validate(config: unknown): ValidationError[] {
        const errors: ValidationError[] = [];

        if (!config || typeof config !== 'object') {
            errors.push({ path: '', message: 'Config must be an object' });
            return errors;
        }

        const c = config as Record<string, unknown>;

        // === 基础信息校验 ===
        this.validateRequired(c, 'id', 'string', errors);
        this.validateRequired(c, 'name', 'string', errors);
        this.validateRequired(c, 'description', 'string', errors);
        this.validateRequired(c, 'version', 'string', errors);

        // === alignment 校验 ===
        if (!c.alignment) {
            errors.push({ path: 'alignment', message: 'Required field missing' });
        } else {
            this.validateAlignment(c.alignment, errors);
        }

        // === flow 校验 ===
        if (!c.flow) {
            errors.push({ path: 'flow', message: 'Required field missing' });
        } else {
            this.validateFlow(c.flow, errors);
        }

        // === moderatorPolicy 校验 ===
        if (!c.moderatorPolicy) {
            errors.push({ path: 'moderatorPolicy', message: 'Required field missing' });
        } else {
            this.validateModeratorPolicy(c.moderatorPolicy, errors);
        }

        // === suggestedRoles 校验 ===
        if (c.suggestedRoles) {
            this.validateRoles(c.suggestedRoles, errors);
        }

        return errors;
    }

    /**
     * 校验 alignment
     */
    private validateAlignment(alignment: unknown, errors: ValidationError[]): void {
        if (typeof alignment !== 'object' || !alignment) {
            errors.push({ path: 'alignment', message: 'Must be an object' });
            return;
        }

        const a = alignment as Record<string, unknown>;

        // type 必填
        if (!a.type) {
            errors.push({ path: 'alignment.type', message: 'Required field missing' });
        } else if (!['opposing', 'free', 'multi-faction'].includes(a.type as string)) {
            errors.push({
                path: 'alignment.type',
                message: 'Must be one of: opposing, free, multi-faction',
                value: a.type
            });
        }

        // opposing/multi-faction 需要 factions
        if ((a.type === 'opposing' || a.type === 'multi-faction') && !a.factions) {
            errors.push({
                path: 'alignment.factions',
                message: `Required when type is '${a.type}'`
            });
        }

        // factions 校验
        if (a.factions && Array.isArray(a.factions)) {
            a.factions.forEach((faction, i) => {
                if (!faction.id) {
                    errors.push({ path: `alignment.factions[${i}].id`, message: 'Required' });
                }
                if (!faction.description) {
                    errors.push({ path: `alignment.factions[${i}].description`, message: 'Required' });
                }
            });

            // opposing 必须正好 2 个阵营
            if (a.type === 'opposing' && a.factions.length !== 2) {
                errors.push({
                    path: 'alignment.factions',
                    message: 'Opposing alignment requires exactly 2 factions',
                    value: a.factions.length
                });
            }
        }
    }

    /**
     * 校验 flow
     */
    private validateFlow(flow: unknown, errors: ValidationError[]): void {
        if (typeof flow !== 'object' || !flow) {
            errors.push({ path: 'flow', message: 'Must be an object' });
            return;
        }

        const f = flow as Record<string, unknown>;

        // phases 必填
        if (!f.phases || !Array.isArray(f.phases)) {
            errors.push({ path: 'flow.phases', message: 'Required and must be an array' });
            return;
        }

        if (f.phases.length === 0) {
            errors.push({ path: 'flow.phases', message: 'Must have at least one phase' });
            return;
        }

        // 校验每个 phase
        const phaseIds = new Set<string>();
        f.phases.forEach((phase, i) => {
            this.validatePhase(phase, i, phaseIds, errors);
        });

        // 校验 phase 顺序合法性
        this.validatePhaseOrder(f.phases as PhaseConfig[], errors);
    }

    /**
     * 校验单个 phase
     */
    private validatePhase(
        phase: unknown,
        index: number,
        existingIds: Set<string>,
        errors: ValidationError[]
    ): void {
        const prefix = `flow.phases[${index}]`;

        if (typeof phase !== 'object' || !phase) {
            errors.push({ path: prefix, message: 'Must be an object' });
            return;
        }

        const p = phase as Record<string, unknown>;

        // 必填字段
        if (!p.id) {
            errors.push({ path: `${prefix}.id`, message: 'Required' });
        } else {
            if (existingIds.has(p.id as string)) {
                errors.push({ path: `${prefix}.id`, message: 'Duplicate phase id', value: p.id });
            }
            existingIds.add(p.id as string);
        }

        if (!p.type) {
            errors.push({ path: `${prefix}.type`, message: 'Required' });
        }

        if (!p.name) {
            errors.push({ path: `${prefix}.name`, message: 'Required' });
        }

        if (!p.description) {
            errors.push({ path: `${prefix}.description`, message: 'Required' });
        }

        // maxRounds
        if (p.maxRounds === undefined) {
            errors.push({ path: `${prefix}.maxRounds`, message: 'Required' });
        } else if (typeof p.maxRounds !== 'number' || p.maxRounds < 1) {
            errors.push({
                path: `${prefix}.maxRounds`,
                message: 'Must be a positive integer',
                value: p.maxRounds
            });
        }

        // allowInterrupt
        if (p.allowInterrupt === undefined) {
            errors.push({ path: `${prefix}.allowInterrupt`, message: 'Required' });
        } else if (typeof p.allowInterrupt !== 'boolean') {
            errors.push({
                path: `${prefix}.allowInterrupt`,
                message: 'Must be a boolean',
                value: p.allowInterrupt
            });
        }

        // speakingOrder
        if (!p.speakingOrder) {
            errors.push({ path: `${prefix}.speakingOrder`, message: 'Required' });
        } else if (!['round-robin', 'free', 'moderated'].includes(p.speakingOrder as string)) {
            errors.push({
                path: `${prefix}.speakingOrder`,
                message: 'Must be one of: round-robin, free, moderated',
                value: p.speakingOrder
            });
        }

        // endCondition
        if (!p.endCondition) {
            errors.push({ path: `${prefix}.endCondition`, message: 'Required' });
        } else if (!['max_rounds', 'moderator_decision', 'consensus', 'timeout'].includes(p.endCondition as string)) {
            errors.push({
                path: `${prefix}.endCondition`,
                message: 'Must be one of: max_rounds, moderator_decision, consensus, timeout',
                value: p.endCondition
            });
        }

        // timeout 需要时检查
        if (p.endCondition === 'timeout' && !p.timeout) {
            errors.push({
                path: `${prefix}.timeout`,
                message: 'Required when endCondition is timeout'
            });
        }
    }

    /**
     * 校验 phase 顺序合法性
     */
    private validatePhaseOrder(phases: PhaseConfig[], errors: ValidationError[]): void {
        // 规则：closing 必须是最后一个（如果有）
        const closingIndex = phases.findIndex(p => p.type === 'closing');
        if (closingIndex !== -1 && closingIndex !== phases.length - 1) {
            errors.push({
                path: `flow.phases[${closingIndex}]`,
                message: 'Phase of type "closing" must be the last phase'
            });
        }

        // 规则：opening 必须是第一个（如果有）
        const openingIndex = phases.findIndex(p => p.type === 'opening');
        if (openingIndex !== -1 && openingIndex !== 0) {
            errors.push({
                path: `flow.phases[${openingIndex}]`,
                message: 'Phase of type "opening" must be the first phase'
            });
        }
    }

    /**
     * 校验 moderatorPolicy
     */
    private validateModeratorPolicy(policy: unknown, errors: ValidationError[]): void {
        if (typeof policy !== 'object' || !policy) {
            errors.push({ path: 'moderatorPolicy', message: 'Must be an object' });
            return;
        }

        const p = policy as Record<string, unknown>;

        // interventionLevel (0-3)
        if (p.interventionLevel === undefined) {
            errors.push({ path: 'moderatorPolicy.interventionLevel', message: 'Required' });
        } else if (typeof p.interventionLevel !== 'number' ||
            p.interventionLevel < 0 ||
            p.interventionLevel > 3) {
            errors.push({
                path: 'moderatorPolicy.interventionLevel',
                message: 'Must be an integer between 0 and 3',
                value: p.interventionLevel
            });
        }

        // coldThreshold
        if (p.coldThreshold === undefined) {
            errors.push({ path: 'moderatorPolicy.coldThreshold', message: 'Required' });
        } else if (typeof p.coldThreshold !== 'number' || p.coldThreshold < 0) {
            errors.push({
                path: 'moderatorPolicy.coldThreshold',
                message: 'Must be a non-negative number',
                value: p.coldThreshold
            });
        }

        // maxIdleRounds
        if (p.maxIdleRounds === undefined) {
            errors.push({ path: 'moderatorPolicy.maxIdleRounds', message: 'Required' });
        } else if (typeof p.maxIdleRounds !== 'number' || p.maxIdleRounds < 1) {
            errors.push({
                path: 'moderatorPolicy.maxIdleRounds',
                message: 'Must be a positive integer',
                value: p.maxIdleRounds
            });
        }

        // forceSummaryEachPhase
        if (p.forceSummaryEachPhase === undefined) {
            errors.push({ path: 'moderatorPolicy.forceSummaryEachPhase', message: 'Required' });
        } else if (typeof p.forceSummaryEachPhase !== 'boolean') {
            errors.push({
                path: 'moderatorPolicy.forceSummaryEachPhase',
                message: 'Must be a boolean',
                value: p.forceSummaryEachPhase
            });
        }

        // biasAllowed
        if (p.biasAllowed === undefined) {
            errors.push({ path: 'moderatorPolicy.biasAllowed', message: 'Required' });
        } else if (typeof p.biasAllowed !== 'boolean') {
            errors.push({
                path: 'moderatorPolicy.biasAllowed',
                message: 'Must be a boolean',
                value: p.biasAllowed
            });
        }
    }

    /**
     * 校验 suggestedRoles
     */
    private validateRoles(roles: unknown, errors: ValidationError[]): void {
        if (!Array.isArray(roles)) {
            errors.push({ path: 'suggestedRoles', message: 'Must be an array' });
            return;
        }

        roles.forEach((role, i) => {
            const prefix = `suggestedRoles[${i}]`;
            if (typeof role !== 'object' || !role) {
                errors.push({ path: prefix, message: 'Must be an object' });
                return;
            }

            const r = role as Record<string, unknown>;
            if (!r.id) errors.push({ path: `${prefix}.id`, message: 'Required' });
            if (!r.name) errors.push({ path: `${prefix}.name`, message: 'Required' });
            if (!r.systemPromptTemplate) {
                errors.push({ path: `${prefix}.systemPromptTemplate`, message: 'Required' });
            }
        });
    }

    /**
     * 必填字段校验辅助
     */
    private validateRequired(
        obj: Record<string, unknown>,
        field: string,
        type: 'string' | 'number' | 'boolean',
        errors: ValidationError[]
    ): void {
        if (obj[field] === undefined || obj[field] === null) {
            errors.push({ path: field, message: 'Required field missing' });
        } else if (typeof obj[field] !== type) {
            errors.push({
                path: field,
                message: `Must be a ${type}`,
                value: obj[field]
            });
        }
    }
}

// ============================================
// 单例导出
// ============================================

export const scenarioConfigLoader = new ScenarioConfigLoader();
