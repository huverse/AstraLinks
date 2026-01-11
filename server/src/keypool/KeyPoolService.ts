/**
 * KeyPool Service - 号池服务
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { adapterRegistry } from '../adapters';
import { keyPoolEncryption } from './KeyPoolEncryption';
import { riskEngine } from './RiskEngine';
import {
    KeyPoolEntry,
    KeyPoolUsage,
    RiskEvent,
    LeaderboardEntry,
    KeyContributionRequest,
    KeyValidationResult,
    KeySelectionResult,
    KeyStatus,
    DEFAULT_DAILY_QUOTA
} from './types';

export class KeyPoolService {
    // 贡献密钥
    async contributeKey(
        contributorId: number,
        request: KeyContributionRequest
    ): Promise<{ keyId: string; masked: string }> {
        const { apiKey, providerId, baseUrl, headers, modelsSupported, dailyQuota } = request;

        // 生成指纹检查重复
        const fingerprint = keyPoolEncryption.generateFingerprint(apiKey);
        const existing = await this.findByFingerprint(fingerprint);
        if (existing) {
            throw new Error('此密钥已存在于号池中');
        }

        // 验证密钥有效性
        const validation = await this.validateKey(apiKey, providerId);
        if (!validation.valid) {
            throw new Error(`密钥验证失败: ${validation.error}`);
        }

        // 生成 DEK 并加密
        const { keyId: dekId, key: dek } = keyPoolEncryption.generateDEK();
        const { ciphertext: encryptedKey, nonce, tag } = keyPoolEncryption.encrypt(apiKey, dek);

        // 加密其他敏感数据
        let encryptedBaseUrl: string | undefined;
        let encryptedHeaders: string | undefined;

        if (baseUrl) {
            const result = keyPoolEncryption.encrypt(baseUrl, dek);
            encryptedBaseUrl = `${result.ciphertext}:${result.tag.toString('base64')}`;
        }

        if (headers) {
            const result = keyPoolEncryption.encrypt(JSON.stringify(headers), dek);
            encryptedHeaders = `${result.ciphertext}:${result.tag.toString('base64')}`;
        }

        // 包装 DEK
        const wrappedDek = keyPoolEncryption.wrapDEK(dek);

        // 生成脱敏显示
        const masked = keyPoolEncryption.maskKey(apiKey);

        const keyId = crypto.randomUUID();

        // 存入数据库
        await pool.execute(
            `INSERT INTO key_pool_entries
             (id, contributor_id, provider_id, encrypted_api_key, encrypted_base_url,
              encrypted_headers, key_fingerprint, encryption_key_id, encryption_nonce,
              masked_key, status, models_supported, daily_quota, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NOW(), NOW())`,
            [
                keyId,
                contributorId,
                providerId,
                `${encryptedKey}:${tag.toString('base64')}`,
                encryptedBaseUrl,
                encryptedHeaders,
                fingerprint,
                wrappedDek,
                nonce,
                masked,
                modelsSupported ? JSON.stringify(modelsSupported) : null,
                dailyQuota ?? DEFAULT_DAILY_QUOTA
            ]
        );

        // 更新贡献榜
        await this.updateLeaderboard(contributorId);

        return { keyId, masked };
    }

    // 验证密钥
    async validateKey(apiKey: string, providerId: string): Promise<KeyValidationResult> {
        try {
            // 通过连接测试验证密钥有效性
            const adapter = await adapterRegistry.createAdapterWithKey(providerId, apiKey);
            const result = await adapter.testConnection();

            if (!result.success) {
                return {
                    valid: false,
                    providerId,
                    error: result.error ?? 'Connection test failed'
                };
            }

            return {
                valid: true,
                providerId,
                models: result.models ?? []
            };
        } catch (err) {
            return {
                valid: false,
                providerId,
                error: err instanceof Error ? err.message : 'Validation failed'
            };
        }
    }

    // 选择密钥（智能路由）
    async selectKey(
        providerId: string,
        model?: string,
        excludeKeys?: string[]
    ): Promise<KeySelectionResult | null> {
        // 查询可用密钥
        let query = `
            SELECT * FROM key_pool_entries
            WHERE provider_id = ? AND status = 'active' AND risk_score < 50
        `;
        const params: unknown[] = [providerId];

        if (excludeKeys && excludeKeys.length > 0) {
            query += ` AND id NOT IN (${excludeKeys.map(() => '?').join(',')})`;
            params.push(...excludeKeys);
        }

        query += ` ORDER BY success_rate DESC, avg_latency_ms ASC, total_calls ASC LIMIT 10`;

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        if (rows.length === 0) return null;

        // 加权随机选择（偏向成功率高的）
        const totalWeight = rows.reduce((sum, row) => sum + (row.success_rate * 100), 0);
        let random = Math.random() * totalWeight;

        let selected = rows[0];
        for (const row of rows) {
            random -= row.success_rate * 100;
            if (random <= 0) {
                selected = row;
                break;
            }
        }

        // 解密
        const dek = keyPoolEncryption.unwrapDEK(selected.encryption_key_id);
        const [ciphertext, tagB64] = selected.encrypted_api_key.split(':');
        const tag = Buffer.from(tagB64, 'base64');

        const apiKey = keyPoolEncryption.decrypt(
            ciphertext,
            dek,
            selected.encryption_nonce,
            tag
        );

        // 解密 baseUrl 和 headers（如果有）
        let baseUrl: string | undefined;
        let headers: Record<string, string> | undefined;

        if (selected.encrypted_base_url) {
            const [urlCipher, urlTag] = selected.encrypted_base_url.split(':');
            baseUrl = keyPoolEncryption.decrypt(
                urlCipher,
                dek,
                selected.encryption_nonce,
                Buffer.from(urlTag, 'base64')
            );
        }

        if (selected.encrypted_headers) {
            const [headerCipher, headerTag] = selected.encrypted_headers.split(':');
            const headersJson = keyPoolEncryption.decrypt(
                headerCipher,
                dek,
                selected.encryption_nonce,
                Buffer.from(headerTag, 'base64')
            );
            headers = JSON.parse(headersJson);
        }

        return {
            keyId: selected.id,
            apiKey,
            baseUrl,
            headers,
            providerId: selected.provider_id
        };
    }

    // 记录使用
    async recordUsage(
        keyId: string,
        userId: number,
        tokensUsed: number,
        success: boolean,
        latencyMs: number,
        errorCode?: string
    ): Promise<void> {
        // 插入使用记录
        await pool.execute(
            `INSERT INTO key_pool_usage (key_id, user_id, tokens_used, status, error_code, latency_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [keyId, userId, tokensUsed, success ? 'success' : 'failed', errorCode, latencyMs]
        );

        // 更新统计
        await pool.execute(
            `UPDATE key_pool_entries
             SET total_contributed = total_contributed + ?,
                 total_calls = total_calls + 1,
                 success_rate = (success_rate * total_calls + ?) / (total_calls + 1),
                 avg_latency_ms = (avg_latency_ms * total_calls + ?) / (total_calls + 1),
                 last_used_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [tokensUsed, success ? 1 : 0, latencyMs, keyId]
        );

        // 风控检查
        await this.checkRisk(keyId);
    }

    // 风控检查
    async checkRisk(keyId: string): Promise<void> {
        const entry = await this.getEntry(keyId);
        if (!entry) return;

        // 获取最近使用记录
        const [usageRows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM key_pool_usage WHERE key_id = ? ORDER BY created_at DESC LIMIT 100`,
            [keyId]
        );

        const recentUsage: KeyPoolUsage[] = usageRows.map(row => ({
            id: row.id,
            keyId: row.key_id,
            userId: row.user_id,
            tokensUsed: row.tokens_used,
            status: row.status,
            errorCode: row.error_code,
            latencyMs: row.latency_ms,
            createdAt: row.created_at
        }));

        // 评估风险
        const events = riskEngine.evaluate(entry, recentUsage);

        if (events.length > 0) {
            // 保存风险事件
            for (const event of events) {
                await pool.execute(
                    `INSERT INTO key_pool_risk_events (key_id, rule_name, severity, details, action_taken, created_at)
                     VALUES (?, ?, ?, ?, ?, NOW())`,
                    [event.keyId, event.ruleName, event.severity, JSON.stringify(event.details), event.actionTaken]
                );
            }

            // 更新风险分数
            const riskScore = riskEngine.calculateRiskScore(events);
            const shouldSuspend = riskEngine.shouldSuspend(riskScore, events);

            await pool.execute(
                `UPDATE key_pool_entries SET risk_score = ?, status = ?, updated_at = NOW() WHERE id = ?`,
                [riskScore, shouldSuspend ? 'banned' : entry.status, keyId]
            );
        }
    }

    // 获取条目
    async getEntry(keyId: string): Promise<KeyPoolEntry | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM key_pool_entries WHERE id = ?',
            [keyId]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        return this.rowToEntry(row);
    }

    // 根据指纹查找
    async findByFingerprint(fingerprint: string): Promise<KeyPoolEntry | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM key_pool_entries WHERE key_fingerprint = ?',
            [fingerprint]
        );

        if (rows.length === 0) return null;
        return this.rowToEntry(rows[0]);
    }

    // 获取用户贡献的密钥
    async getUserKeys(userId: number): Promise<KeyPoolEntry[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM key_pool_entries WHERE contributor_id = ? ORDER BY created_at DESC',
            [userId]
        );

        return rows.map(row => this.rowToEntry(row));
    }

    // 撤回密钥
    async withdrawKey(keyId: string, userId: number): Promise<void> {
        const entry = await this.getEntry(keyId);
        if (!entry) {
            throw new Error('密钥不存在');
        }

        if (entry.contributorId !== userId) {
            throw new Error('无权操作此密钥');
        }

        await pool.execute(
            `UPDATE key_pool_entries SET status = 'withdrawn', updated_at = NOW() WHERE id = ?`,
            [keyId]
        );

        await this.updateLeaderboard(userId);
    }

    // 获取贡献榜
    async getLeaderboard(limit: number = 20): Promise<LeaderboardEntry[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT l.*, u.username FROM key_pool_leaderboard l
             LEFT JOIN users u ON l.user_id = u.id
             ORDER BY rank_score DESC LIMIT ?`,
            [limit]
        );

        return rows.map(row => ({
            userId: row.user_id,
            username: row.username,
            totalKeys: row.total_keys,
            activeKeys: row.active_keys,
            totalTokensContributed: row.total_tokens_contributed,
            totalCallsServed: row.total_calls_served,
            avgSuccessRate: row.avg_success_rate,
            rankScore: row.rank_score,
            lastUpdated: row.last_updated
        }));
    }

    // 更新贡献榜
    private async updateLeaderboard(userId: number): Promise<void> {
        await pool.execute(
            `INSERT INTO key_pool_leaderboard (user_id, total_keys, active_keys, total_tokens_contributed, total_calls_served, avg_success_rate, rank_score)
             SELECT
                 contributor_id,
                 COUNT(*),
                 SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END),
                 SUM(total_contributed),
                 SUM(total_calls),
                 AVG(success_rate),
                 SUM(total_contributed) * AVG(success_rate)
             FROM key_pool_entries
             WHERE contributor_id = ?
             GROUP BY contributor_id
             ON DUPLICATE KEY UPDATE
                 total_keys = VALUES(total_keys),
                 active_keys = VALUES(active_keys),
                 total_tokens_contributed = VALUES(total_tokens_contributed),
                 total_calls_served = VALUES(total_calls_served),
                 avg_success_rate = VALUES(avg_success_rate),
                 rank_score = VALUES(rank_score)`,
            [userId]
        );
    }

    // 行转对象
    private rowToEntry(row: RowDataPacket): KeyPoolEntry {
        return {
            id: row.id,
            contributorId: row.contributor_id,
            providerId: row.provider_id,
            encryptedApiKey: row.encrypted_api_key,
            encryptedBaseUrl: row.encrypted_base_url,
            encryptedHeaders: row.encrypted_headers,
            keyFingerprint: row.key_fingerprint,
            encryptionKeyId: row.encryption_key_id,
            encryptionNonce: row.encryption_nonce,
            maskedKey: row.masked_key,
            status: row.status,
            modelsSupported: row.models_supported ? JSON.parse(row.models_supported) : undefined,
            dailyQuota: row.daily_quota,
            totalContributed: row.total_contributed,
            totalCalls: row.total_calls,
            successRate: row.success_rate,
            avgLatencyMs: row.avg_latency_ms,
            riskScore: row.risk_score,
            lastUsedAt: row.last_used_at,
            lastCheckAt: row.last_check_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const keyPoolService = new KeyPoolService();
