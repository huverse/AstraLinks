/**
 * 主持人接口
 * 
 * Moderator 是系统级能力，不是普通 Agent
 * 由 Controller (流程控制) + LLM (智能决策) 组成
 */

import { SessionState, DiscussionEvent, DiscussionRules } from '../types';
import { IAgent } from './IAgent';

/**
 * 主持人控制器接口
 * 负责流程调度，不涉及 LLM 调用
 */
export interface IModeratorController {
    /**
     * 开始讨论
     */
    startSession(sessionId: string): Promise<void>;

    /**
     * 暂停讨论
     */
    pauseSession(sessionId: string): Promise<void>;

    /**
     * 恢复讨论
     */
    resumeSession(sessionId: string): Promise<void>;

    /**
     * 结束讨论
     */
    endSession(sessionId: string, reason: string): Promise<void>;

    /**
     * 选择下一个发言者
     */
    selectNextSpeaker(sessionId: string): Promise<IAgent | null>;

    /**
     * 指定发言者
     */
    directSpeaker(sessionId: string, agentId: string): Promise<void>;

    /**
     * 检查是否应该结束
     */
    shouldEndSession(state: SessionState): boolean;

    /**
     * 推进一轮
     */
    advanceRound(sessionId: string): Promise<void>;
}

/**
 * 主持人 LLM 接口
 * 负责智能决策，调用 LLM
 */
export interface IModeratorLLM {
    /**
     * 生成开场白
     */
    generateOpening(topic: string, agents: string[]): Promise<string>;

    /**
     * 生成中场总结
     */
    generateSummary(events: DiscussionEvent[]): Promise<string>;

    /**
     * 生成结束语
     */
    generateClosing(events: DiscussionEvent[]): Promise<string>;

    /**
     * 决定是否干预
     */
    shouldIntervene(events: DiscussionEvent[]): Promise<boolean>;

    /**
     * 生成干预内容
     */
    generateIntervention(events: DiscussionEvent[]): Promise<string>;

    /**
     * 评估讨论质量
     */
    evaluateDiscussion(events: DiscussionEvent[]): Promise<{
        score: number;
        feedback: string;
    }>;

    /**
     * 智能选择下一个发言者
     * 当没有Agent主动举手时，由AI决定谁应该发言
     * @param topic 讨论主题
     * @param recentEvents 最近的讨论事件
     * @param agents 可选的Agent列表
     * @param speakCounts 各Agent发言次数统计
     * @returns 被选中的Agent ID及选择原因
     */
    selectNextSpeaker(
        topic: string,
        recentEvents: DiscussionEvent[],
        agents: Array<{ id: string; name: string; role?: string; stance?: string }>,
        speakCounts: Map<string, number>
    ): Promise<{ agentId: string; reason: string } | null>;
}

/**
 * 规则引擎接口
 */
export interface IRuleEngine {
    /**
     * 设置规则
     */
    setRules(rules: DiscussionRules): void;

    /**
     * 检查发言是否符合规则
     */
    validateSpeak(
        agentId: string,
        state: SessionState
    ): { valid: boolean; reason?: string };

    /**
     * 获取下一个发言者 (根据发言顺序规则)
     */
    getNextSpeaker(state: SessionState, agents: IAgent[]): IAgent | null;

    /**
     * 检查是否超时
     */
    checkTimeout(state: SessionState): boolean;

    /**
     * 获取剩余时间（秒）
     */
    getRemainingTime(state: SessionState): number | null;

    /**
     * 获取当前规则
     */
    getRules(): DiscussionRules | null;
}
