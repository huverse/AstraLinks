/**
 * 前端日志服务
 * 
 * 生产环境友好的日志系统:
 * - 开发环境: 输出所有级别
 * - 生产环境: 只输出 warn/error
 * - 支持结构化日志
 * - 可扩展为远程上报
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
    [key: string]: unknown;
}

interface LoggerConfig {
    /** 是否启用调试日志 (生产环境默认 false) */
    enableDebug: boolean;
    /** 日志前缀 */
    prefix: string;
    /** 远程上报 URL (可选) */
    remoteUrl?: string;
}

const isProduction = typeof window !== 'undefined' &&
    (window.location.hostname === 'astralinks.xyz' ||
        window.location.hostname === 'www.astralinks.xyz');

const defaultConfig: LoggerConfig = {
    enableDebug: !isProduction,
    prefix: '[AstraLinks]',
};

class Logger {
    private config: LoggerConfig;

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = { ...defaultConfig, ...config };
    }

    private formatMessage(level: LogLevel, message: string, meta?: LogMeta): string {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `${this.config.prefix} [${level.toUpperCase()}] ${timestamp} ${message}${metaStr}`;
    }

    private shouldLog(level: LogLevel): boolean {
        if (level === 'debug' && !this.config.enableDebug) {
            return false;
        }
        return true;
    }

    debug(message: string, meta?: LogMeta): void {
        if (!this.shouldLog('debug')) return;
        console.debug(this.formatMessage('debug', message, meta));
    }

    info(message: string, meta?: LogMeta): void {
        if (!this.shouldLog('info')) return;
        console.info(this.formatMessage('info', message, meta));
    }

    warn(message: string, meta?: LogMeta): void {
        if (!this.shouldLog('warn')) return;
        console.warn(this.formatMessage('warn', message, meta));
    }

    error(message: string, meta?: LogMeta): void {
        if (!this.shouldLog('error')) return;
        console.error(this.formatMessage('error', message, meta));

        // 生产环境可扩展: 上报到 Sentry 或自建服务
        if (isProduction && this.config.remoteUrl) {
            this.reportError(message, meta);
        }
    }

    private async reportError(message: string, meta?: LogMeta): Promise<void> {
        if (!this.config.remoteUrl) return;

        try {
            await fetch(this.config.remoteUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    meta,
                    timestamp: Date.now(),
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                }),
            });
        } catch {
            // 静默失败，避免循环
        }
    }

    /** 创建带作用域的子 logger */
    child(scope: string): Logger {
        return new Logger({
            ...this.config,
            prefix: `${this.config.prefix}[${scope}]`,
        });
    }
}

// 默认 logger 实例
export const logger = new Logger();

// 隔离模式专用 logger
export const isolationLogger = logger.child('Isolation');

// 导出供自定义配置
export { Logger };
export type { LoggerConfig, LogMeta, LogLevel };
