/**
 * KeyPool Types - 号池系统类型定义
 */

// 密钥状态
export type KeyStatus = 'active' | 'exhausted' | 'invalid' | 'banned' | 'withdrawn';

// 风险事件严重程度
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

// 风控动作
export type RiskAction = 'none' | 'warned' | 'throttled' | 'suspended' | 'banned';

// 号池条目
export interface KeyPoolEntry {
    id: string;
    contributorId: number;
    providerId: string;
    encryptedApiKey: string;
    encryptedBaseUrl?: string;
    encryptedHeaders?: string;
    keyFingerprint: string;
    encryptionKeyId: string;
    encryptionNonce: Buffer;
    maskedKey: string;
    status: KeyStatus;
    modelsSupported?: string[];
    dailyQuota: number;
    totalContributed: number;
    totalCalls: number;
    successRate: number;
    avgLatencyMs: number;
    riskScore: number;
    lastUsedAt?: string;
    lastCheckAt?: string;
    createdAt: string;
    updatedAt: string;
}

// 使用记录
export interface KeyPoolUsage {
    id: number;
    keyId: string;
    userId: number;
    tokensUsed: number;
    status: 'success' | 'failed';
    errorCode?: string;
    latencyMs: number;
    createdAt: string;
}

// 风控事件
export interface RiskEvent {
    id: number;
    keyId: string;
    ruleName: string;
    severity: RiskSeverity;
    details?: Record<string, unknown>;
    actionTaken: RiskAction;
    createdAt: string;
}

// 贡献榜条目
export interface LeaderboardEntry {
    userId: number;
    username?: string;
    totalKeys: number;
    activeKeys: number;
    totalTokensContributed: number;
    totalCallsServed: number;
    avgSuccessRate: number;
    rankScore: number;
    lastUpdated: string;
}

// 密钥贡献请求
export interface KeyContributionRequest {
    apiKey: string;
    providerId: string;
    baseUrl?: string;
    headers?: Record<string, string>;
    modelsSupported?: string[];
    dailyQuota?: number;
}

// 密钥验证结果
export interface KeyValidationResult {
    valid: boolean;
    providerId: string;
    models?: string[];
    error?: string;
}

// 密钥选择结果
export interface KeySelectionResult {
    keyId: string;
    apiKey: string;
    baseUrl?: string;
    headers?: Record<string, string>;
    providerId: string;
}

// 风控规则
export interface RiskRule {
    name: string;
    check(entry: KeyPoolEntry, recentUsage: KeyPoolUsage[]): RiskEvent | null;
}

// 加密配置
export interface EncryptionConfig {
    masterKeyId: string;
    algorithm: 'aes-256-gcm';
    keyRotationDays: number;
}

// 默认配置
export const DEFAULT_DAILY_QUOTA = 10000;
export const DEFAULT_RISK_THRESHOLD = 50;
export const KEY_FINGERPRINT_SECRET = process.env.KEY_FINGERPRINT_SECRET ?? 'astralinks-keypool-fingerprint';
