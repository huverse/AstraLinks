/**
 * KeyPool Encryption - 号池加密服务
 * 使用 AES-256-GCM 信封加密
 */

import crypto from 'crypto';
import { KEY_FINGERPRINT_SECRET } from './types';

export class KeyPoolEncryption {
    private masterKey: Buffer;
    private algorithm = 'aes-256-gcm' as const;

    constructor() {
        // 从环境变量获取主密钥，生产环境应使用 HSM
        const masterKeyHex = process.env.KEYPOOL_MASTER_KEY ?? crypto.randomBytes(32).toString('hex');
        this.masterKey = Buffer.from(masterKeyHex, 'hex');
    }

    // 生成数据加密密钥 (DEK)
    generateDEK(): { keyId: string; key: Buffer } {
        return {
            keyId: crypto.randomUUID(),
            key: crypto.randomBytes(32)
        };
    }

    // 加密数据
    encrypt(data: string, dek: Buffer): { ciphertext: string; nonce: Buffer; tag: Buffer } {
        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algorithm, dek, nonce);

        const encrypted = Buffer.concat([
            cipher.update(data, 'utf-8'),
            cipher.final()
        ]);

        return {
            ciphertext: encrypted.toString('base64'),
            nonce,
            tag: cipher.getAuthTag()
        };
    }

    // 解密数据
    decrypt(ciphertext: string, dek: Buffer, nonce: Buffer, tag: Buffer): string {
        const decipher = crypto.createDecipheriv(this.algorithm, dek, nonce);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(ciphertext, 'base64')),
            decipher.final()
        ]);

        return decrypted.toString('utf-8');
    }

    // 包装 DEK（用主密钥加密）
    wrapDEK(dek: Buffer): string {
        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, nonce);

        const encrypted = Buffer.concat([
            cipher.update(dek),
            cipher.final()
        ]);

        const tag = cipher.getAuthTag();

        // 格式: nonce:tag:ciphertext (all base64)
        return `${nonce.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
    }

    // 解包 DEK
    unwrapDEK(wrappedKey: string): Buffer {
        const [nonceB64, tagB64, ciphertextB64] = wrappedKey.split(':');
        const nonce = Buffer.from(nonceB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');
        const ciphertext = Buffer.from(ciphertextB64, 'base64');

        const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, nonce);
        decipher.setAuthTag(tag);

        return Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);
    }

    // 生成密钥指纹（用于去重）
    generateFingerprint(apiKey: string): string {
        return crypto
            .createHmac('sha256', KEY_FINGERPRINT_SECRET)
            .update(apiKey)
            .digest('hex');
    }

    // 生成脱敏显示
    maskKey(apiKey: string): string {
        if (apiKey.length <= 8) {
            return '****';
        }
        return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
    }

    // 验证指纹
    verifyFingerprint(apiKey: string, fingerprint: string): boolean {
        const computed = this.generateFingerprint(apiKey);
        return crypto.timingSafeEqual(
            Buffer.from(computed),
            Buffer.from(fingerprint)
        );
    }
}

export const keyPoolEncryption = new KeyPoolEncryption();
