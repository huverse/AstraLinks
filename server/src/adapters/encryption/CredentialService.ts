/**
 * Credential Service - 凭证解密服务
 *
 * 使用 AES-256-GCM 加密方案
 */

import crypto from 'crypto';
import { pool } from '../../config/database';
import { AICredential, DecryptedCredential } from '../types';
import { EncryptionError, AuthError } from '../errors';
import { RowDataPacket } from 'mysql2';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16;

interface EncryptionKey {
    id: string;
    keyType: 'master' | 'dek';
    encryptedKey: Buffer;
    keyVersion: number;
    status: 'active' | 'rotating' | 'retired';
}

export class CredentialService {
    private dekCache: Map<string, Buffer> = new Map();
    private masterKey: Buffer | null = null;

    // 从环境变量获取主密钥（生产环境应使用 HSM）
    private getMasterKey(): Buffer {
        if (this.masterKey) return this.masterKey;

        const keyHex = process.env.ENCRYPTION_MASTER_KEY;
        if (!keyHex) {
            throw new EncryptionError('ENCRYPTION_MASTER_KEY not configured');
        }

        if (keyHex.length !== 64) {
            throw new EncryptionError('ENCRYPTION_MASTER_KEY must be 64 hex characters (256 bits)');
        }

        this.masterKey = Buffer.from(keyHex, 'hex');
        return this.masterKey;
    }

    // 获取 DEK（数据加密密钥）
    private async getDEK(dekId: string): Promise<Buffer> {
        const cached = this.dekCache.get(dekId);
        if (cached) return cached;

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM encryption_keys WHERE id = ? AND key_type = ? AND status = ?',
            [dekId, 'dek', 'active']
        );

        if (rows.length === 0) {
            throw new EncryptionError(`DEK not found: ${dekId}`);
        }

        const keyRecord = rows[0] as unknown as EncryptionKey;
        const masterKey = this.getMasterKey();

        // DEK 是用主密钥加密存储的，需要解密
        const dek = this.unwrapKey(keyRecord.encryptedKey, masterKey);
        this.dekCache.set(dekId, dek);

        return dek;
    }

    // 解包密钥（用主密钥解密 DEK）
    private unwrapKey(wrappedKey: Buffer, masterKey: Buffer): Buffer {
        // 格式: nonce (12) + ciphertext + tag (16)
        const nonce = wrappedKey.subarray(0, 12);
        const tag = wrappedKey.subarray(wrappedKey.length - AUTH_TAG_LENGTH);
        const ciphertext = wrappedKey.subarray(12, wrappedKey.length - AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, nonce);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted;
    }

    // 解密数据
    private decrypt(ciphertext: string, nonce: Buffer, tag: Buffer | null, dek: Buffer): string {
        const ciphertextBuf = Buffer.from(ciphertext, 'base64');
        const decipher = crypto.createDecipheriv(ALGORITHM, dek, nonce);

        if (tag) {
            decipher.setAuthTag(tag);
        }

        const decrypted = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);
        return decrypted.toString('utf8');
    }

    // 加密数据
    encrypt(plaintext: string, dek: Buffer): { ciphertext: string; nonce: Buffer; tag: Buffer } {
        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, dek, nonce);

        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();

        return {
            ciphertext: encrypted.toString('base64'),
            nonce,
            tag
        };
    }

    // 生成 API Key 指纹
    generateFingerprint(apiKey: string): string {
        const hmac = crypto.createHmac('sha256', this.getMasterKey());
        hmac.update(apiKey);
        return hmac.digest('hex');
    }

    // 生成新的 DEK
    async createDEK(): Promise<{ id: string; key: Buffer }> {
        const id = crypto.randomUUID();
        const key = crypto.randomBytes(KEY_LENGTH);
        const masterKey = this.getMasterKey();

        // 用主密钥加密 DEK
        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, masterKey, nonce);
        const encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
        const tag = cipher.getAuthTag();

        // 存储格式: nonce + ciphertext + tag
        const wrappedKey = Buffer.concat([nonce, encrypted, tag]);

        await pool.execute(
            'INSERT INTO encryption_keys (id, key_type, encrypted_key, status) VALUES (?, ?, ?, ?)',
            [id, 'dek', wrappedKey, 'active']
        );

        this.dekCache.set(id, key);
        return { id, key };
    }

    // 解密凭证
    // 注意：encryptedApiKey 实际存储的是 JSON 格式 {apiKey, headers?}，避免 nonce 重用
    async decryptCredential(credential: AICredential): Promise<DecryptedCredential> {
        const dek = await this.getDEK(credential.encryptionKeyId);

        if (!credential.encryptionTag) {
            throw new EncryptionError('Missing encryption tag - credential may be corrupted');
        }

        const decryptedJson = this.decrypt(
            credential.encryptedApiKey,
            credential.encryptionNonce,
            credential.encryptionTag,
            dek
        );

        const data = JSON.parse(decryptedJson) as { apiKey: string; headers?: Record<string, string> };

        return {
            id: credential.id,
            providerId: credential.providerId,
            apiKey: data.apiKey,
            headers: data.headers ?? null,
            baseUrl: credential.customBaseUrl,
            endpointId: credential.endpointId
        };
    }

    // 加密并存储新凭证
    async encryptAndStoreCredential(
        userId: number,
        providerId: string,
        apiKey: string,
        name?: string,
        headers?: Record<string, string>,
        customBaseUrl?: string,
        endpointId?: string
    ): Promise<string> {
        // 检查指纹是否已存在
        const fingerprint = this.generateFingerprint(apiKey);
        const [existing] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM ai_credentials WHERE key_fingerprint = ?',
            [fingerprint]
        );

        if (existing.length > 0) {
            throw new AuthError('API key already exists');
        }

        // 获取或创建 DEK
        let dek: { id: string; key: Buffer };
        const [activeKeys] = await pool.execute<RowDataPacket[]>(
            'SELECT id FROM encryption_keys WHERE key_type = ? AND status = ? LIMIT 1',
            ['dek', 'active']
        );

        if (activeKeys.length > 0) {
            const keyId = (activeKeys[0] as { id: string }).id;
            dek = { id: keyId, key: await this.getDEK(keyId) };
        } else {
            dek = await this.createDEK();
        }

        // 合并 apiKey 和 headers 为单个 JSON，避免 nonce 重用
        const payload = JSON.stringify({ apiKey, headers: headers ?? undefined });
        const { ciphertext, nonce, tag } = this.encrypt(payload, dek.key);

        // encryptedHeaders 字段不再单独使用，保留为 null
        const encryptedHeaders: string | null = null;

        // 生成脱敏显示
        const maskedKey = apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);

        const id = crypto.randomUUID();

        await pool.execute(
            `INSERT INTO ai_credentials
             (id, user_id, provider_id, name, encrypted_api_key, encrypted_headers,
              custom_base_url, endpoint_id, key_fingerprint, encryption_key_id,
              encryption_nonce, encryption_tag, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, userId, providerId, name, ciphertext, encryptedHeaders,
                customBaseUrl, endpointId, fingerprint, dek.id,
                nonce, tag, 'active'
            ]
        );

        return id;
    }

    // 获取用户凭证
    async getUserCredential(userId: number, credentialId: string): Promise<DecryptedCredential | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM ai_credentials
             WHERE id = ? AND user_id = ? AND status = ?`,
            [credentialId, userId, 'active']
        );

        if (rows.length === 0) return null;

        const credential = this.rowToCredential(rows[0]);
        return this.decryptCredential(credential);
    }

    // 获取用户所有凭证（不解密）
    async listUserCredentials(userId: number): Promise<AICredential[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM ai_credentials WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );

        return rows.map(row => this.rowToCredential(row));
    }

    // 更新凭证状态
    async updateCredentialStatus(credentialId: string, status: AICredential['status'], error?: string): Promise<void> {
        await pool.execute(
            'UPDATE ai_credentials SET status = ?, last_error = ?, updated_at = NOW() WHERE id = ?',
            [status, error, credentialId]
        );
    }

    // 更新最后使用时间
    async touchCredential(credentialId: string): Promise<void> {
        await pool.execute(
            'UPDATE ai_credentials SET last_used_at = NOW() WHERE id = ?',
            [credentialId]
        );
    }

    // 行数据转换
    private rowToCredential(row: RowDataPacket): AICredential {
        return {
            id: row.id,
            userId: row.user_id,
            providerId: row.provider_id,
            name: row.name,
            encryptedApiKey: row.encrypted_api_key,
            encryptedHeaders: row.encrypted_headers,
            customBaseUrl: row.custom_base_url,
            endpointId: row.endpoint_id,
            keyFingerprint: row.key_fingerprint,
            encryptionKeyId: row.encryption_key_id,
            encryptionNonce: row.encryption_nonce,
            encryptionTag: row.encryption_tag,
            status: row.status,
            lastUsedAt: row.last_used_at,
            lastError: row.last_error,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    // 清除缓存
    clearCache(): void {
        this.dekCache.clear();
        this.masterKey = null;
    }
}

// 单例
export const credentialService = new CredentialService();
