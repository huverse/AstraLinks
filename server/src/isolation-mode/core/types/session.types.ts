/**
 * 会话类型定义
 */

import { AgentConfig, AgentState } from './agent.types';
import { ScenarioConfig } from './scenario.types';

export type SessionStatus =
    | 'pending'    // 等待开始
    | 'active'     // 进行中
    | 'paused'     // 暂停
    | 'completed'  // 已完成
    | 'aborted';   // 已中止

export interface SessionConfig {
    /** 会话 ID */
    id: string;
    /** 会话标题 */
    title: string;
    /** 讨论主题/问题 */
    topic: string;
    /** 场景配置 */
    scenario: ScenarioConfig;
    /** 参与的 Agent 配置 */
    agents: AgentConfig[];
    /** 创建者用户 ID */
    createdBy: string;
    /** 最大轮次 */
    maxRounds?: number;
    /** 单轮时间限制 (秒) */
    roundTimeLimit?: number;
    /** 创建时间 */
    createdAt: number;
}

export interface SessionState {
    /** 会话 ID */
    sessionId: string;
    /** 当前状态 */
    status: SessionStatus;
    /** 当前轮次 */
    currentRound: number;
    /** 当前发言者 Agent ID */
    currentSpeakerId: string | null;
    /** 各 Agent 状态 */
    agentStates: Map<string, AgentState>;
    /** 事件序号计数器 */
    eventSequence: number;
    /** 开始时间 */
    startedAt?: number;
    /** 结束时间 */
    endedAt?: number;
}

export interface SessionSummary {
    sessionId: string;
    title: string;
    topic: string;
    scenarioName: string;
    agentCount: number;
    eventCount: number;
    totalRounds: number;
    duration: number;
    status: SessionStatus;
    createdAt: number;
    endedAt?: number;
}
