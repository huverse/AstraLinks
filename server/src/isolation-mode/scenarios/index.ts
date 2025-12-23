/**
 * Scenarios 模块导出
 */

// 配置加载器
export { ScenarioConfigLoader, scenarioConfigLoader } from './ScenarioConfigLoader';

// 旧版加载器（兼容）
export { ScenarioLoader, scenarioLoader } from './ScenarioLoader';

// 重导出类型
export {
    ScenarioSchema,
    AlignmentConfig,
    AlignmentType,
    Faction,
    FlowConfig,
    PhaseConfig,
    PhaseType,
    ModeratorPolicyConfig,
    InterventionLevel,
    RoleTemplate,
} from '../core/types/scenario.types';
