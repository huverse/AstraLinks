/**
 * 讨论规则解析器
 *
 * 从场景配置中提取讨论规则
 */

import { ScenarioConfig, DiscussionRules, FlowConfig, PhaseConfig } from '../core/types';

/** 默认讨论规则 */
const DEFAULT_RULES: DiscussionRules = {
    speakingOrder: 'round-robin',
    maxTokensPerTurn: 300,
    maxTimePerTurn: 120,
    allowInterruption: false,
    allowVoting: false,
    minRounds: 1,
    maxRounds: 10,
};

/**
 * 从 Flow 配置中提取规则
 */
function extractRulesFromFlow(flow: FlowConfig): Partial<DiscussionRules> {
    if (!flow.phases?.length) return {};

    const firstPhase = flow.phases[0];
    const totalRounds = flow.phases.reduce(
        (sum, phase) => sum + (phase.maxRounds || 0),
        0
    );

    return {
        speakingOrder: firstPhase.speakingOrder,
        allowInterruption: firstPhase.allowInterrupt,
        maxTokensPerTurn: firstPhase.maxTokensPerSpeech,
        maxTimePerTurn: firstPhase.maxTimePerSpeech,
        maxRounds: totalRounds > 0 ? totalRounds : undefined,
    };
}

/**
 * 从场景配置解析讨论规则
 */
export function resolveDiscussionRules(
    scenario: ScenarioConfig,
    overrideMaxRounds?: number
): DiscussionRules {
    // 从 flow 配置获取规则
    const flowRules = scenario.flow
        ? extractRulesFromFlow(scenario.flow as FlowConfig)
        : {};

    // 合并规则：默认 < flow配置 < 覆盖
    const merged: DiscussionRules = {
        ...DEFAULT_RULES,
        ...filterUndefined(flowRules),
    };

    // 应用覆盖
    if (overrideMaxRounds && overrideMaxRounds > 0) {
        merged.maxRounds = overrideMaxRounds;
    }

    // 确保 minRounds <= maxRounds
    if (merged.maxRounds < merged.minRounds) {
        merged.minRounds = Math.max(1, merged.maxRounds);
    }

    return merged;
}

/** 过滤掉 undefined 值 */
function filterUndefined<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as Partial<T>;
}

/** 获取默认规则（用于测试或外部访问） */
export function getDefaultRules(): DiscussionRules {
    return { ...DEFAULT_RULES };
}
