/**
 * Risk Engine - 号池风控引擎
 */

import {
    KeyPoolEntry,
    KeyPoolUsage,
    RiskEvent,
    RiskSeverity,
    RiskAction,
    RiskRule,
    DEFAULT_RISK_THRESHOLD
} from './types';

// 内置风控规则
const builtinRules: RiskRule[] = [
    // 高失败率规则
    {
        name: 'high_failure_rate',
        check(entry, recentUsage) {
            if (recentUsage.length < 10) return null;

            const failCount = recentUsage.filter(u => u.status === 'failed').length;
            const failRate = failCount / recentUsage.length;

            if (failRate > 0.5) {
                return {
                    id: 0,
                    keyId: entry.id,
                    ruleName: 'high_failure_rate',
                    severity: failRate > 0.8 ? 'high' : 'medium',
                    details: { failRate, failCount, total: recentUsage.length },
                    actionTaken: failRate > 0.8 ? 'suspended' : 'warned',
                    createdAt: new Date().toISOString()
                };
            }
            return null;
        }
    },

    // 异常调用量规则
    {
        name: 'abnormal_call_volume',
        check(entry, recentUsage) {
            // 每分钟超过 100 次调用
            const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
            const recentCalls = recentUsage.filter(u => u.createdAt > oneMinuteAgo);

            if (recentCalls.length > 100) {
                return {
                    id: 0,
                    keyId: entry.id,
                    ruleName: 'abnormal_call_volume',
                    severity: 'high',
                    details: { callsPerMinute: recentCalls.length },
                    actionTaken: 'throttled',
                    createdAt: new Date().toISOString()
                };
            }
            return null;
        }
    },

    // 高延迟规则
    {
        name: 'high_latency',
        check(entry, recentUsage) {
            if (recentUsage.length < 5) return null;

            const avgLatency = recentUsage.reduce((sum, u) => sum + u.latencyMs, 0) / recentUsage.length;

            if (avgLatency > 30000) {
                return {
                    id: 0,
                    keyId: entry.id,
                    ruleName: 'high_latency',
                    severity: 'low',
                    details: { avgLatencyMs: avgLatency },
                    actionTaken: 'warned',
                    createdAt: new Date().toISOString()
                };
            }
            return null;
        }
    },

    // 认证错误规则
    {
        name: 'auth_errors',
        check(entry, recentUsage) {
            const authErrors = recentUsage.filter(u =>
                u.errorCode && ['401', 'invalid_api_key', 'authentication_error'].includes(u.errorCode)
            );

            if (authErrors.length >= 3) {
                return {
                    id: 0,
                    keyId: entry.id,
                    ruleName: 'auth_errors',
                    severity: 'critical',
                    details: { authErrorCount: authErrors.length },
                    actionTaken: 'suspended',
                    createdAt: new Date().toISOString()
                };
            }
            return null;
        }
    },

    // 配额超限规则
    {
        name: 'quota_exceeded',
        check(entry, recentUsage) {
            const today = new Date().toISOString().split('T')[0];
            const todayUsage = recentUsage.filter(u => u.createdAt.startsWith(today));
            const totalTokens = todayUsage.reduce((sum, u) => sum + u.tokensUsed, 0);

            if (totalTokens > entry.dailyQuota) {
                return {
                    id: 0,
                    keyId: entry.id,
                    ruleName: 'quota_exceeded',
                    severity: 'medium',
                    details: { usedTokens: totalTokens, quota: entry.dailyQuota },
                    actionTaken: 'throttled',
                    createdAt: new Date().toISOString()
                };
            }
            return null;
        }
    }
];

export class RiskEngine {
    private rules: RiskRule[] = [...builtinRules];

    // 添加自定义规则
    addRule(rule: RiskRule): void {
        this.rules.push(rule);
    }

    // 评估风险
    evaluate(entry: KeyPoolEntry, recentUsage: KeyPoolUsage[]): RiskEvent[] {
        const events: RiskEvent[] = [];

        for (const rule of this.rules) {
            const event = rule.check(entry, recentUsage);
            if (event) {
                events.push(event);
            }
        }

        return events;
    }

    // 计算风险分数 (0-100)
    calculateRiskScore(events: RiskEvent[]): number {
        const severityWeights: Record<RiskSeverity, number> = {
            low: 5,
            medium: 15,
            high: 30,
            critical: 50
        };

        let score = 0;
        for (const event of events) {
            score += severityWeights[event.severity];
        }

        return Math.min(100, score);
    }

    // 判断是否应该暂停
    shouldSuspend(riskScore: number, events: RiskEvent[]): boolean {
        // 风险分数超过阈值
        if (riskScore >= DEFAULT_RISK_THRESHOLD) {
            return true;
        }

        // 有 critical 事件
        if (events.some(e => e.severity === 'critical')) {
            return true;
        }

        return false;
    }

    // 获取建议动作
    getSuggestedAction(events: RiskEvent[]): RiskAction {
        if (events.length === 0) return 'none';

        // 按严重程度排序，取最严重的动作
        const actions = events.map(e => e.actionTaken);

        if (actions.includes('banned')) return 'banned';
        if (actions.includes('suspended')) return 'suspended';
        if (actions.includes('throttled')) return 'throttled';
        if (actions.includes('warned')) return 'warned';

        return 'none';
    }
}

export const riskEngine = new RiskEngine();
