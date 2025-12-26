/**
 * Isolation Mode Crypto Utilities
 * 
 * AES 加密/解密 API Key 和敏感配置
 * 用于前后端安全传输
 */

import * as crypto from 'crypto';
import { isProductionLike } from '../../config/world-engine.config';

// ============================================
// 配置
// ============================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const DEFAULT_SALT = 'salt';
const DEFAULT_DEV_KEY = 'default-dev-key-do-not-use-in-production!!';
const PLACEHOLDER_KEY = 'your-32-char-random-secret-key!!';

// 从环境变量获取加密密钥（生产环境必须设置）
const getEncryptionKey = (): string => {
    const key = process.env.ISOLATION_ENCRYPTION_KEY;
    if (!key) {
        if (isProductionLike) {
            throw new Error('ISOLATION_ENCRYPTION_KEY is required in production');
        }
        // 开发环境使用默认密钥（生产环境必须覆盖）
        return DEFAULT_DEV_KEY;
    }
    if (isProductionLike && (key === DEFAULT_DEV_KEY || key === PLACEHOLDER_KEY)) {
        throw new Error('ISOLATION_ENCRYPTION_KEY must be set to a secure value');
    }
    return key;
};

// ============================================
// 加密
// ============================================

export interface EncryptedData {
    ciphertext: string;  // Base64
    iv: string;          // Base64
    authTag: string;     // Base64
}

/**
 * 加密字符串
 */
function deriveKey(): Buffer {
    return crypto.pbkdf2Sync(getEncryptionKey(), DEFAULT_SALT, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

function deriveLegacyKey(): Buffer {
    return crypto.scryptSync(getEncryptionKey(), DEFAULT_SALT, KEY_LENGTH);
}

function decryptWithKey(encrypted: EncryptedData, key: Buffer): string {
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
}

export function encrypt(plaintext: string): EncryptedData {
    const key = deriveKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return {
        ciphertext,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64')
    };
}

/**
 * 解密字符串
 */
export function decrypt(encrypted: EncryptedData): string {
    try {
        return decryptWithKey(encrypted, deriveKey());
    } catch (error) {
        // 兼容旧版 scrypt 加密
        return decryptWithKey(encrypted, deriveLegacyKey());
    }
}

// ============================================
// LLM 配置加密
// ============================================

export interface LlmConfigData {
    provider: 'GEMINI' | 'OPENAI_COMPATIBLE';
    apiKey: string;
    baseUrl?: string;
    modelName: string;
    temperature?: number;
}

export interface EncryptedLlmConfig {
    provider: string;
    encryptedApiKey: EncryptedData;
    baseUrl?: string;
    modelName: string;
    temperature?: number;
}

/**
 * 加密 LLM 配置（只加密 apiKey）
 */
export function encryptLlmConfig(config: LlmConfigData): EncryptedLlmConfig {
    return {
        provider: config.provider,
        encryptedApiKey: encrypt(config.apiKey),
        baseUrl: config.baseUrl,
        modelName: config.modelName,
        temperature: config.temperature
    };
}

/**
 * 解密 LLM 配置
 */
export function decryptLlmConfig(encrypted: EncryptedLlmConfig): LlmConfigData {
    return {
        provider: encrypted.provider as 'GEMINI' | 'OPENAI_COMPATIBLE',
        apiKey: decrypt(encrypted.encryptedApiKey),
        baseUrl: encrypted.baseUrl,
        modelName: encrypted.modelName,
        temperature: encrypted.temperature
    };
}

/**
 * 验证加密配置格式
 */
export function isValidEncryptedConfig(data: any): data is EncryptedLlmConfig {
    return (
        data &&
        typeof data.provider === 'string' &&
        data.encryptedApiKey &&
        typeof data.encryptedApiKey.ciphertext === 'string' &&
        typeof data.encryptedApiKey.iv === 'string' &&
        typeof data.encryptedApiKey.authTag === 'string' &&
        typeof data.modelName === 'string'
    );
}
