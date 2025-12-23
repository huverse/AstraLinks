/**
 * 规则引擎
 * 
 * 管理讨论规则（发言顺序、时间限制等）
 */

import { SessionState, DiscussionRules } from '../core/types';
import { IRuleEngine, IAgent } from '../core/interfaces';

/**
 * 规则引擎实现
 */
export class RuleEngine implements IRuleEngine {
    private rules: DiscussionRules | null = null;
    private speakerIndex: number = 0;

    /**
     * 设置规则
     */
    setRules(rules: DiscussionRules): void {
        this.rules = rules;
        this.speakerIndex = 0;
    }

    /**
     * 检查发言是否符合规则
     */
    validateSpeak(
        agentId: string,
        state: SessionState
    ): { valid: boolean; reason?: string } {
        if (!this.rules) {
            return { valid: true };
        }

        // 检查是否轮到该 Agent 发言
        if (
            this.rules.speakingOrder !== 'free' &&
            state.currentSpeakerId !== agentId
        ) {
            return {
                valid: false,
                reason: '现在不是你的发言时间',
            };
        }

        // 检查是否超过最大轮次
        if (this.rules.maxRounds && state.currentRound > this.rules.maxRounds) {
            return {
                valid: false,
                reason: '已达到最大发言轮次',
            };
        }

        return { valid: true };
    }

    /**
     * 获取下一个发言者
     */
    getNextSpeaker(state: SessionState, agents: IAgent[]): IAgent | null {
        if (!this.rules || agents.length === 0) {
            return null;
        }

        switch (this.rules.speakingOrder) {
            case 'round-robin':
                // 轮流发言
                const nextAgent = agents[this.speakerIndex % agents.length];
                this.speakerIndex++;
                return nextAgent;

            case 'free':
                // 自由发言 - 返回 null，任何人都可以发言
                return null;

            case 'moderated':
                // 主持人控制 - 由 ModeratorController 决定
                return null;

            case 'priority':
                // 优先级发言 - TODO: 根据优先级排序
                return agents[0];

            default:
                return null;
        }
    }

    /**
     * 检查是否超时
     */
    checkTimeout(state: SessionState): boolean {
        if (!this.rules?.maxTimePerTurn) {
            return false;
        }

        // TODO: 实现超时检查
        return false;
    }

    /**
     * 重置
     */
    reset(): void {
        this.speakerIndex = 0;
    }
}

export const ruleEngine = new RuleEngine();
