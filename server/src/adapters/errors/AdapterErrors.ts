/**
 * Adapter Errors - Unified error definitions
 */

export class AdapterError extends Error {
    constructor(
        message: string,
        public readonly code: 'VALIDATION' | 'TIMEOUT' | 'RATE_LIMIT' | 'API_ERROR' | 'AUTH_ERROR' | 'NOT_SUPPORTED' | 'ENCRYPTION_ERROR',
        public readonly providerId?: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'AdapterError';
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            providerId: this.providerId,
            details: this.details
        };
    }
}

export class ValidationError extends AdapterError {
    constructor(message: string, details?: unknown) {
        super(message, 'VALIDATION', undefined, details);
        this.name = 'ValidationError';
    }
}

export class TimeoutError extends AdapterError {
    constructor(message: string, providerId?: string) {
        super(message, 'TIMEOUT', providerId);
        this.name = 'TimeoutError';
    }
}

export class RateLimitError extends AdapterError {
    constructor(message: string, providerId?: string, retryAfter?: number) {
        super(message, 'RATE_LIMIT', providerId, { retryAfter });
        this.name = 'RateLimitError';
    }
}

export class AuthError extends AdapterError {
    constructor(message: string, providerId?: string) {
        super(message, 'AUTH_ERROR', providerId);
        this.name = 'AuthError';
    }
}

export class NotSupportedError extends AdapterError {
    constructor(capability: string, providerId?: string) {
        super(`Capability '${capability}' is not supported`, 'NOT_SUPPORTED', providerId);
        this.name = 'NotSupportedError';
    }
}

export class EncryptionError extends AdapterError {
    constructor(message: string, details?: unknown) {
        super(message, 'ENCRYPTION_ERROR', undefined, details);
        this.name = 'EncryptionError';
    }
}
