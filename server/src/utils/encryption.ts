import crypto from 'crypto';

// Encryption key from environment or generate consistent one
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || 'galaxyous-config-encryption-key-32b';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt sensitive data (API keys, etc.)
 */
export function encryptApiKey(plainText: string): string {
    if (!plainText) return '';

    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
export function decryptApiKey(encryptedText: string): string {
    if (!encryptedText || !encryptedText.includes(':')) return encryptedText;

    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return encryptedText;

        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (e) {
        // If decryption fails, return masked value
        console.error('Decryption failed:', e);
        return '';
    }
}

/**
 * Check if a string is already encrypted
 */
export function isEncrypted(text: string): boolean {
    if (!text) return false;
    const parts = text.split(':');
    return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

/**
 * Encrypt API keys in config payload
 * Supports:
 * - Participant arrays with nested config.apiKey
 * - Flat multimodal config with direct apiKey
 */
export function encryptConfigApiKeys(config: any): any {
    // Handle arrays recursively
    if (Array.isArray(config)) {
        return config.map(item => encryptConfigApiKeys(item));
    }

    // Non-object passthrough
    if (!config || typeof config !== 'object') {
        return config;
    }

    let result = { ...config };

    // Handle nested config.apiKey (participant structure)
    if (result.config?.apiKey && !isEncrypted(result.config.apiKey)) {
        result = {
            ...result,
            config: {
                ...result.config,
                apiKey: encryptApiKey(result.config.apiKey)
            }
        };
    }

    // Handle flat apiKey (multimodal config structure)
    if (result.apiKey && !isEncrypted(result.apiKey)) {
        result = {
            ...result,
            apiKey: encryptApiKey(result.apiKey)
        };
    }

    return result;
}

/**
 * Decrypt API keys in config payload
 * Supports:
 * - Participant arrays with nested config.apiKey
 * - Flat multimodal config with direct apiKey
 */
export function decryptConfigApiKeys(config: any): any {
    // Handle arrays recursively
    if (Array.isArray(config)) {
        return config.map(item => decryptConfigApiKeys(item));
    }

    // Non-object passthrough
    if (!config || typeof config !== 'object') {
        return config;
    }

    let result = { ...config };

    // Handle nested config.apiKey (participant structure)
    if (result.config?.apiKey && isEncrypted(result.config.apiKey)) {
        result = {
            ...result,
            config: {
                ...result.config,
                apiKey: decryptApiKey(result.config.apiKey)
            }
        };
    }

    // Handle flat apiKey (multimodal config structure)
    if (result.apiKey && isEncrypted(result.apiKey)) {
        result = {
            ...result,
            apiKey: decryptApiKey(result.apiKey)
        };
    }

    return result;
}

/**
 * Mask API key for display (shows only last 4 chars)
 */
export function maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) return '••••••••';
    return '••••••••' + apiKey.slice(-4);
}
