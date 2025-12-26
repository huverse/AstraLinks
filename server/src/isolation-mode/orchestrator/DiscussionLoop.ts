/**
 * Discussion Loop
 * 
 * 驱动讨论自动推进的核心循环
 * 负责: 发言者选择 → AI 生成 → 事件发布 → 轮次推进 → 结束检测
 */

import { v4 as uuidv4 } from 'uuid';
import { EventType, Event } from '../core/types';
import { IAgent } from '../core/interfaces';
import { eventLogService, eventBus } from '../event-log';
import { moderatorController } from '../moderator';
import { sessionManager } from '../session';
import { weLogger } from '../../services/world-engine-logger';

// ============================================
// 配置
// ============================================

interface DiscussionLoopConfig {
    /** 每轮最大发言数 */
    maxSpeakersPerRound: number;
    /** 发言间隔 (ms) */
    speakIntervalMs: number;
    /** 最大轮数 */
    maxRounds: number;
    /** 无进展超时 (ms) */
    noProgressTimeoutMs: number;
}

const DEFAULT_CONFIG: DiscussionLoopConfig = {
    maxSpeakersPerRound: 5,
    speakIntervalMs: 1000,
    maxRounds: 10,
    noProgressTimeoutMs: 60000
};

// ============================================
// Discussion Loop
// ============================================

export class DiscussionLoop {
    private running = new Map<string, boolean>();
    private lastProgressTime = new Map<string, number>();

    /**
     * 启动讨论循环
     */
    async start(
        sessionId: string,
        config: Partial<DiscussionLoopConfig> = {}
    ): Promise<void> {
        if (this.running.get(sessionId)) {
            weLogger.warn({ sessionId }, 'discussion_loop_already_running');
            return;
        }

        const fullConfig = { ...DEFAULT_CONFIG, ...config };
        const sessionConfig = sessionManager.get(sessionId);
        if (sessionConfig?.maxRounds) {
            fullConfig.maxRounds = sessionConfig.maxRounds;
        }
        this.running.set(sessionId, true);
        this.lastProgressTime.set(sessionId, Date.now());

        weLogger.info({ sessionId, config: fullConfig }, 'discussion_loop_started');

        try {
            await this.runLoop(sessionId, fullConfig);
        } catch (error: any) {
            weLogger.error({ sessionId, error: error.message }, 'discussion_loop_error');
        } finally {
            this.running.set(sessionId, false);
            weLogger.info({ sessionId }, 'discussion_loop_ended');
        }
    }

    /**
     * 停止讨论循环
     */
    stop(sessionId: string): void {
        this.running.set(sessionId, false);
        weLogger.info({ sessionId }, 'discussion_loop_stopped');
    }

    /**
     * 检查是否正在运行
     */
    isRunning(sessionId: string): boolean {
        return this.running.get(sessionId) || false;
    }

    // ============================================
    // 核心循环
    // ============================================

    private async runLoop(
        sessionId: string,
        config: DiscussionLoopConfig
    ): Promise<void> {
        const state = moderatorController.getSessionState(sessionId);
        if (!state) {
            throw new Error(`Session state not found: ${sessionId}`);
        }

        // 发布开始事件
        await this.publishEvent(sessionId, {
            type: EventType.SYSTEM,
            content: { action: 'SESSION_START', message: '讨论开始' }
        });

        let speakersThisRound = 0;

        while (this.running.get(sessionId)) {
            // 1. 检查结束条件
            if (this.shouldEnd(sessionId, config)) {
                break;
            }

            // 2. 选择发言者
            const speaker = await moderatorController.selectNextSpeaker(sessionId);
            if (!speaker) {
                weLogger.debug({ sessionId }, 'no_speaker_available');
                await this.sleep(config.speakIntervalMs);
                continue;
            }

            // 3. 生成发言
            const message = await speaker.generateResponse();

            // 4. 发布事件
            await this.publishEvent(sessionId, {
                type: EventType.SPEECH,
                speaker: speaker.config.id,
                content: {
                    agentId: speaker.config.id,
                    agentName: speaker.config.name,
                    message: message.content,
                    tokens: message.tokens
                }
            });

            // 5. 更新进度
            this.lastProgressTime.set(sessionId, Date.now());
            speakersThisRound++;

            // 6. 检查是否需要推进轮次
            if (speakersThisRound >= config.maxSpeakersPerRound) {
                await moderatorController.advanceRound(sessionId);
                speakersThisRound = 0;

                await this.publishEvent(sessionId, {
                    type: EventType.SYSTEM,
                    content: {
                        action: 'ROUND_ADVANCE',
                        round: state.currentRound
                    }
                });
            }

            // 7. 等待间隔
            await this.sleep(config.speakIntervalMs);
        }

        // 发布结束事件
        await moderatorController.endSession(sessionId, 'Discussion completed');

        await this.publishEvent(sessionId, {
            type: EventType.SYSTEM,
            content: { action: 'SESSION_END', message: '讨论结束' }
        });
    }

    // ============================================
    // 辅助方法
    // ============================================

    private shouldEnd(sessionId: string, config: DiscussionLoopConfig): boolean {
        const state = moderatorController.getSessionState(sessionId);
        if (!state) return true;

        // 状态检查
        if (state.status === 'completed' || state.status === 'aborted') {
            return true;
        }

        // 最大轮数
        if (state.currentRound >= config.maxRounds) {
            weLogger.info({ sessionId, round: state.currentRound }, 'max_rounds_reached');
            return true;
        }

        // 无进展超时
        const lastProgress = this.lastProgressTime.get(sessionId) || Date.now();
        if (Date.now() - lastProgress > config.noProgressTimeoutMs) {
            weLogger.warn({ sessionId }, 'no_progress_timeout');
            return true;
        }

        return false;
    }

    private async publishEvent(
        sessionId: string,
        eventData: {
            type: EventType;
            speaker?: string;
            content: string | Record<string, unknown>;
        }
    ): Promise<void> {
        // 使用 EventLogService 的正确签名
        const event = eventLogService.appendEvent({
            sessionId,
            type: eventData.type,
            speaker: eventData.speaker || 'moderator',
            content: eventData.content as any
        });

        // 广播到订阅者 (Event 和 DiscussionEvent 是相同类型)
        eventBus.publish(event as any);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/** 单例 */
export const discussionLoop = new DiscussionLoop();
