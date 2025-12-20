import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { hashPassword, verifyPassword, generateDeviceFingerprint } from '../utils/crypto';

describe('Crypto Utils', () => {
    describe('hashPassword', () => {
        it('should hash a password', async () => {
            const password = 'testPassword123';
            const hash = await hashPassword(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should generate different hashes for same password', async () => {
            const password = 'testPassword123';
            const hash1 = await hashPassword(password);
            const hash2 = await hashPassword(password);

            // BCrypt generates salt each time, so hashes should be different
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('verifyPassword', () => {
        it('should verify correct password', async () => {
            const password = 'testPassword123';
            const hash = await hashPassword(password);

            const isValid = await verifyPassword(password, hash);
            expect(isValid).toBe(true);
        });

        it('should reject incorrect password', async () => {
            const password = 'testPassword123';
            const hash = await hashPassword(password);

            const isValid = await verifyPassword('wrongPassword', hash);
            expect(isValid).toBe(false);
        });
    });

    describe('generateDeviceFingerprint', () => {
        it('should generate a fingerprint from user agent and IP', () => {
            const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
            const ip = '192.168.1.1';

            const fingerprint = generateDeviceFingerprint(userAgent, ip);

            expect(fingerprint).toBeDefined();
            expect(typeof fingerprint).toBe('string');
            expect(fingerprint.length).toBeGreaterThan(0);
        });

        it('should generate same fingerprint for same inputs', () => {
            const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
            const ip = '192.168.1.1';

            const fingerprint1 = generateDeviceFingerprint(userAgent, ip);
            const fingerprint2 = generateDeviceFingerprint(userAgent, ip);

            expect(fingerprint1).toBe(fingerprint2);
        });

        it('should generate different fingerprints for different inputs', () => {
            const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

            const fingerprint1 = generateDeviceFingerprint(userAgent, '192.168.1.1');
            const fingerprint2 = generateDeviceFingerprint(userAgent, '192.168.1.2');

            expect(fingerprint1).not.toBe(fingerprint2);
        });
    });
});

describe('Validation Helpers', () => {
    const validateEmail = (email: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const validatePassword = (password: string): boolean => {
        return password.length >= 6;
    };

    const validateUsername = (username: string): boolean => {
        return username.length >= 3 && username.length <= 60;
    };

    describe('validateEmail', () => {
        it('should accept valid email addresses', () => {
            expect(validateEmail('test@example.com')).toBe(true);
            expect(validateEmail('user.name@domain.co.uk')).toBe(true);
            expect(validateEmail('user+tag@gmail.com')).toBe(true);
        });

        it('should reject invalid email addresses', () => {
            expect(validateEmail('invalid')).toBe(false);
            expect(validateEmail('invalid@')).toBe(false);
            expect(validateEmail('@domain.com')).toBe(false);
            expect(validateEmail('')).toBe(false);
        });
    });

    describe('validatePassword', () => {
        it('should accept valid passwords', () => {
            expect(validatePassword('123456')).toBe(true);
            expect(validatePassword('longerPassword123!')).toBe(true);
        });

        it('should reject short passwords', () => {
            expect(validatePassword('12345')).toBe(false);
            expect(validatePassword('')).toBe(false);
        });
    });

    describe('validateUsername', () => {
        it('should accept valid usernames', () => {
            expect(validateUsername('abc')).toBe(true);
            expect(validateUsername('user123')).toBe(true);
            expect(validateUsername('a'.repeat(60))).toBe(true);
        });

        it('should reject invalid usernames', () => {
            expect(validateUsername('ab')).toBe(false);
            expect(validateUsername('')).toBe(false);
            expect(validateUsername('a'.repeat(61))).toBe(false);
        });
    });
});
