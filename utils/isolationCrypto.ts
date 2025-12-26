/**
 * Isolation Mode Crypto Utilities (Frontend)
 * 
 * 前端加密工具 - 使用 Web Crypto API
 * 与后端 crypto.ts 配对使用
 */

// ============================================
// 配置
// ============================================

// 前端加密密钥通过环境变量注入
const getEncryptionKey = (): string => {
    // @ts-ignore
    const key = import.meta.env.VITE_ISOLATION_ENCRYPTION_KEY;
    if (!key) {
        if (import.meta.env.PROD) {
            throw new Error('Missing VITE_ISOLATION_ENCRYPTION_KEY');
        }
        // 开发环境使用默认密钥（生产环境必须覆盖）
        return 'default-dev-key-do-not-use-in-production!!';
    }
    return key;
};

// ============================================
// 工具函数
// ============================================

async function deriveKey(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('salt'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// ============================================
// 加密
// ============================================

export interface EncryptedData {
    ciphertext: string;  // Base64
    iv: string;          // Base64
    authTag: string;     // Base64 (在 AES-GCM 中包含在 ciphertext 末尾)
}

/**
 * 加密字符串
 */
export async function encrypt(plaintext: string): Promise<EncryptedData> {
    const key = await deriveKey(getEncryptionKey());
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encoder = new TextEncoder();

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(plaintext)
    );

    // AES-GCM 的输出包含 ciphertext + authTag
    const encryptedArray = new Uint8Array(encrypted);
    const ciphertext = encryptedArray.slice(0, -16);
    const authTag = encryptedArray.slice(-16);

    return {
        ciphertext: btoa(String.fromCharCode(...ciphertext)),
        iv: btoa(String.fromCharCode(...iv)),
        authTag: btoa(String.fromCharCode(...authTag))
    };
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
export async function encryptLlmConfig(config: LlmConfigData): Promise<EncryptedLlmConfig> {
    return {
        provider: config.provider,
        encryptedApiKey: await encrypt(config.apiKey),
        baseUrl: config.baseUrl,
        modelName: config.modelName,
        temperature: config.temperature
    };
}
