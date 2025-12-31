/**
 * Discussion Loop
 *
 * 驱动讨论自动推进的核心循环
 * 负责: 发言者选择 → AI 生成 → 事件发布 → 轮次推进 → 结束检测
 */

import { v4 as uuidv4 } from 'uuid';
import { EventType, Event, Intent, IntentUrgencyLevel } from '../core/types';
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
    /** 是否启用意图队列 */
    useIntentQueue: boolean;
    /** 是否启用流式响应 (默认 true) */
    enableStreaming: boolean;
}

const DEFAULT_CONFIG: DiscussionLoopConfig = {
    maxSpeakersPerRound: 5,
    speakIntervalMs: 1000,
    maxRounds: 10,
    noProgressTimeoutMs: 60000,
    useIntentQueue: true,
    enableStreaming: true
};

// ============================================
// Discussion Loop
// ============================================

export class DiscussionLoop {
    private running = new Map<string, boolean>();
    private lastProgressTime = new Map<string, number>();
    /** 追踪上次生成意图的轮次，避免同一轮重复生成 */
    private lastIntentRound = new Map<string, number>();

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
        // 读取流式响应配置 (默认启用)
        if (sessionConfig?.enableStreaming !== undefined) {
            fullConfig.enableStreaming = sessionConfig.enableStreaming;
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
            // 0. 检查会话状态（暂停/结束）
            const currentState = moderatorController.getSessionState(sessionId);
            if (currentState?.status === 'paused') {
                await this.sleep(500);
                continue;
            }
            if (currentState?.status === 'completed' || currentState?.status === 'aborted') {
                weLogger.info({ sessionId, status: currentState.status }, 'session_ended_by_status');
                break;
            }

            // 1. 检查结束条件
            if (this.shouldEnd(sessionId, config)) {
                break;
            }

            // 2. 检查当前发言者是否超时
            if (moderatorController.checkSpeakerTimeout(sessionId)) {
                const currentState = moderatorController.getSessionState(sessionId);
                if (currentState?.currentSpeakerId) {
                    await this.publishEvent(sessionId, {
                        type: EventType.SYSTEM,
                        content: {
                            action: 'SPEAKER_TIMEOUT',
                            message: '发言超时，切换到下一位发言者',
                            agentId: currentState.currentSpeakerId
                        }
                    });
                    weLogger.info({ sessionId, agentId: currentState.currentSpeakerId }, 'speaker_timeout');
                }
            }

            // 3. 选择发言者（优先处理意图队列）
            let speaker: IAgent | null = null;
            let intentProcessed = false;

            if (config.useIntentQueue) {
                // 先确保意图队列中有内容（自动生成 Agent 意图）
                await this.ensureAutoIntents(sessionId);

                const intent = await moderatorController.processNextIntent(sessionId);
                if (intent) {
                    speaker = moderatorController.getAgent(sessionId, intent.agentId) || null;
                    intentProcessed = true;

                    if (speaker) {
                        weLogger.debug({
                            sessionId,
                            agentId: intent.agentId,
                            intentType: intent.type,
                            urgencyLevel: intent.urgencyLevel
                        }, 'processing_intent');
                    }
                }
            }

            // 如果没有意图或意图对应的Agent不存在，使用默认选择
            if (!speaker) {
                speaker = await moderatorController.selectNextSpeaker(sessionId);
            }

            if (!speaker) {
                weLogger.debug({ sessionId }, 'no_speaker_available');
                await this.sleep(config.speakIntervalMs);
                continue;
            }

            // 4. 广播思考状态 → 生成发言 → 广播完成状态
            await this.publishAgentStatus(sessionId, speaker.config.id, 'thinking');
            let message: { content: string; tokens?: number };
            try {
                // 根据配置决定是否使用流式生成
                const useStreaming = config.enableStreaming && typeof speaker.generateResponseStream === 'function';

                if (useStreaming) {
                    let fullContent = '';
                    const generator = speaker.generateResponseStream!();

                    while (true) {
                        const { value, done } = await generator.next();
                        if (done) {
                            // 最后返回的是完整消息
                            message = value as { content: string; tokens?: number };
                            break;
                        }
                        // value 是 chunk
                        const chunkStr = typeof value === 'string' ? value : String(value);
                        fullContent += chunkStr;
                        // 发布流式 chunk 事件
                        await this.publishAgentChunk(sessionId, speaker.config.id, chunkStr, fullContent);
                    }
                } else {
                    // 非流式生成
                    message = await speaker.generateResponse();
                }
            } catch (genErr: any) {
                weLogger.error({
                    sessionId,
                    agentId: speaker.config.id,
                    error: genErr.message
                }, 'agent_generate_response_error');
                // 确保发送 done 状态，避免 UI 一直显示「思考中」
                await this.publishAgentStatus(sessionId, speaker.config.id, 'done');
                await this.sleep(config.speakIntervalMs);
                continue;
            }
            await this.publishAgentStatus(sessionId, speaker.config.id, 'done');

            // 5. 发布事件
            await this.publishEvent(sessionId, {
                type: EventType.SPEECH,
                speaker: speaker.config.id,
                content: {
                    agentId: speaker.config.id,
                    agentName: speaker.config.name,
                    message: message.content,
                    tokens: message.tokens,
                    fromIntent: intentProcessed
                }
            });

            // 6. 更新进度
            this.lastProgressTime.set(sessionId, Date.now());
            speakersThisRound++;

            // 7. 检查是否需要推进轮次
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

            // 8. 等待间隔
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
        const event = await eventLogService.appendEvent({
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

    /**
     * 确保意图队列中有 Agent 的自主意图
     * 每轮只生成一次，避免重复
     */
    private async ensureAutoIntents(sessionId: string): Promise<void> {
        const state = moderatorController.getSessionState(sessionId);
        if (!state) return;

        // 如果已有待处理意图，跳过生成
        const pendingIntents = moderatorController.getPendingIntents(sessionId);
        if (pendingIntents.length > 0) return;

        // 同一轮只生成一次
        if (this.lastIntentRound.get(sessionId) === state.currentRound) return;
        this.lastIntentRound.set(sessionId, state.currentRound);

        const agents = moderatorController.getAgents(sessionId);
        if (agents.length === 0) return;

        // 获取最近事件供 Agent 决策
        const recentEvents = await eventLogService.getRecentEvents(sessionId, 8);

        // 并行让每个 Agent 生成意图
        await Promise.all(agents.map(async (agent) => {
            try {
                const intent = await this.deriveAutoIntent(agent, recentEvents, state.currentRound);
                // intent 为 null 表示 Agent 选择跳过（pass）
                if (intent) {
                    await moderatorController.submitIntent(sessionId, intent);
                    weLogger.debug({
                        sessionId,
                        agentId: agent.config.id,
                        intentType: intent.type,
                        urgencyLevel: intent.urgencyLevel
                    }, 'auto_intent_generated');
                }
            } catch (err: any) {
                weLogger.warn({
                    sessionId,
                    agentId: agent.config.id,
                    error: err.message
                }, 'auto_intent_generation_failed');
            }
        }));
    }

    /**
     * 为单个 Agent 生成自动意图
     * 如果 Agent 有 generateIntent 方法则调用，否则返回默认低优先级举手
     */
    private async deriveAutoIntent(
        agent: IAgent,
        recentEvents: Event[],
        round: number
    ): Promise<Omit<Intent, 'timestamp'> | null> {
        // 尝试调用 Agent 的意图生成方法（如果实现了的话）
        const intentCapable = agent as IAgent & {
            generateIntent?: (context: { recentEvents: Event[]; round: number }) => Promise<Omit<Intent, 'timestamp'> | null>;
        };

        if (typeof intentCapable.generateIntent === 'function') {
            return intentCapable.generateIntent({ recentEvents, round });
        }

        // Agent 当前不空闲，跳过
        if (agent.state.status !== 'idle') return null;

        // 默认：低优先级举手意图
        return {
            agentId: agent.config.id,
            type: 'speak',
            urgency: 1,
            urgencyLevel: IntentUrgencyLevel.RAISE_HAND
        };
    }

    /**
     * 发布 Agent 状态事件（瞬态，不入 EventLog）
     * 用于实时向前端广播 thinking/done 状态
     */
    private async publishAgentStatus(
        sessionId: string,
        agentId: string,
        status: 'thinking' | 'done'
    ): Promise<void> {
        const transientEvent = {
            eventId: uuidv4(),
            sessionId,
            type: `agent:${status}`,
            speaker: agentId,
            content: { message: status, agentId },
            timestamp: new Date().toISOString(),
            sequence: Date.now(),
            meta: { transient: true }
        };
        // 直接广播，不写入 EventLog（避免污染讨论历史）
        eventBus.publish(transientEvent as any);
    }

    /**
     * 发布 Agent 流式 chunk 事件（瞬态，不入 EventLog）
     * 用于实时向前端广播流式生成内容
     */
    private async publishAgentChunk(
        sessionId: string,
        agentId: string,
        chunk: string,
        accumulated: string
    ): Promise<void> {
        const transientEvent = {
            eventId: uuidv4(),
            sessionId,
            type: 'agent:chunk',
            speaker: agentId,
            content: {
                chunk,
                accumulated,
                agentId
            },
            timestamp: new Date().toISOString(),
            sequence: Date.now(),
            meta: { transient: true }
        };
        eventBus.publish(transientEvent as any);
    }
}

/** 单例 */
export const discussionLoop = new DiscussionLoop();
