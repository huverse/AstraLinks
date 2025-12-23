/**
 * World Engine Metrics
 * 
 * 运行指标收集
 */

import { worldEngineSessionManager } from '../isolation-mode/session/WorldEngineSessionManager';

// ============================================
// 指标类型
// ============================================

export interface WorldEngineMetrics {
    /** 活跃 Session 数 */
    activeSessions: number;

    /** Session 分布 (按 worldType) */
    sessionsByType: Record<string, number>;

    /** 总 Tick 数 */
    totalTicks: number;

    /** 平均 Tick 速率 (每秒) */
    ticksPerSecond: number;

    /** 活跃 Agent 总数 */
    totalActiveAgents: number;

    /** 事件速率 (每分钟) */
    eventRate: number;

    /** 错误率 */
    errorRate: number;

    /** 平均 Session 时长 (秒) */
    avgSessionDuration: number;

    /** 服务启动时间 */
    startedAt: number;

    /** 运行时长 (秒) */
    uptime: number;
}

// ============================================
// 指标收集器
// ============================================

class MetricsCollector {
    private startedAt: number;
    private tickCount: number = 0;
    private errorCount: number = 0;
    private eventCount: number = 0;
    private lastTickTime: number = 0;
    private ticksInWindow: number[] = [];

    constructor() {
        this.startedAt = Date.now();
    }

    /** 记录 Tick */
    recordTick(): void {
        this.tickCount++;
        const now = Date.now();
        this.ticksInWindow.push(now);

        // 保留最近 60 秒
        const cutoff = now - 60000;
        this.ticksInWindow = this.ticksInWindow.filter(t => t > cutoff);

        this.lastTickTime = now;
    }

    /** 记录错误 */
    recordError(): void {
        this.errorCount++;
    }

    /** 记录事件 */
    recordEvents(count: number): void {
        this.eventCount += count;
    }

    /** 获取当前指标 */
    getMetrics(): WorldEngineMetrics {
        const sessions = worldEngineSessionManager.listSessions();
        const now = Date.now();

        // 计算 Session 分布
        const sessionsByType: Record<string, number> = {};
        let totalTicks = 0;

        for (const session of sessions) {
            sessionsByType[session.worldType] = (sessionsByType[session.worldType] || 0) + 1;
            totalTicks += session.tickCount;
        }

        // 计算 Tick 速率 (最近 60 秒)
        const ticksPerSecond = this.ticksInWindow.length / 60;

        // 计算平均 Session 时长
        let totalDuration = 0;
        for (const session of sessions) {
            totalDuration += (now - session.createdAt) / 1000;
        }
        const avgSessionDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

        // 计算事件速率 (每分钟)
        const uptime = (now - this.startedAt) / 1000;
        const eventRate = uptime > 0 ? (this.eventCount / uptime) * 60 : 0;

        // 计算错误率
        const totalRequests = this.tickCount + this.errorCount;
        const errorRate = totalRequests > 0 ? this.errorCount / totalRequests : 0;

        return {
            activeSessions: sessions.length,
            sessionsByType,
            totalTicks,
            ticksPerSecond,
            totalActiveAgents: 0, // TODO: 从 sessions 计算
            eventRate,
            errorRate,
            avgSessionDuration,
            startedAt: this.startedAt,
            uptime
        };
    }

    /** 重置指标 */
    reset(): void {
        this.tickCount = 0;
        this.errorCount = 0;
        this.eventCount = 0;
        this.ticksInWindow = [];
    }
}

// ============================================
// 单例
// ============================================

export const metricsCollector = new MetricsCollector();

// ============================================
// 导出函数
// ============================================

export function getWorldEngineMetrics(): WorldEngineMetrics {
    return metricsCollector.getMetrics();
}

export function recordTick(): void {
    metricsCollector.recordTick();
}

export function recordError(): void {
    metricsCollector.recordError();
}

export function recordEvents(count: number): void {
    metricsCollector.recordEvents(count);
}
