/**
 * 安全沙箱执行器
 * 
 * @module core/sandbox/executor
 * @description 安全的代码执行环境，使用 Web Worker 或 Function 隔离
 */

// ============================================
// 类型定义
// ============================================

export interface SandboxConfig {
    /** 最大执行时间 (ms) */
    timeout: number;
    /** 最大内存 (MB) */
    maxMemory?: number;
    /** 允许的全局变量 */
    allowedGlobals?: string[];
    /** 禁止的操作 */
    blockedOperations?: string[];
}

export interface SandboxResult {
    success: boolean;
    output?: any;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    logs: string[];
    metrics: {
        executionTime: number;
        memoryUsed?: number;
    };
}

export interface SandboxContext {
    /** 输入数据 */
    input: any;
    /** 变量存储 */
    variables: Record<string, any>;
    /** 安全的 console */
    console: SandboxConsole;
    /** 安全的工具函数 */
    utils: SandboxUtils;
}

interface SandboxConsole {
    log: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    info: (...args: any[]) => void;
}

interface SandboxUtils {
    /** 安全的 JSON 解析 */
    parseJSON: (str: string) => any;
    /** 安全的 JSON 序列化 */
    stringify: (obj: any) => string;
    /** 延迟 */
    sleep: (ms: number) => Promise<void>;
    /** 获取当前时间戳 */
    now: () => number;
}

// ============================================
// 默认配置
// ============================================

const DEFAULT_CONFIG: SandboxConfig = {
    timeout: 5000,
    maxMemory: 128,
    allowedGlobals: ['Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp'],
    blockedOperations: ['eval', 'Function', 'fetch', 'XMLHttpRequest', 'WebSocket', 'import', 'require'],
};

// ============================================
// 沙箱执行器
// ============================================

export class SandboxExecutor {
    private config: SandboxConfig;

    constructor(config: Partial<SandboxConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 执行代码
     */
    async execute(code: string, context: Partial<SandboxContext> = {}): Promise<SandboxResult> {
        const logs: string[] = [];
        const startTime = Date.now();

        // 创建安全的 console
        const sandboxConsole: SandboxConsole = {
            log: (...args) => logs.push(`[LOG] ${args.map(this.safeStringify).join(' ')}`),
            warn: (...args) => logs.push(`[WARN] ${args.map(this.safeStringify).join(' ')}`),
            error: (...args) => logs.push(`[ERROR] ${args.map(this.safeStringify).join(' ')}`),
            info: (...args) => logs.push(`[INFO] ${args.map(this.safeStringify).join(' ')}`),
        };

        // 创建安全的工具函数
        const sandboxUtils: SandboxUtils = {
            parseJSON: (str: string) => {
                try {
                    return JSON.parse(str);
                } catch {
                    return null;
                }
            },
            stringify: (obj: any) => this.safeStringify(obj),
            sleep: (ms: number) => new Promise(r => setTimeout(r, Math.min(ms, 1000))),
            now: () => Date.now(),
        };

        const fullContext: SandboxContext = {
            input: context.input ?? {},
            variables: context.variables ?? {},
            console: sandboxConsole,
            utils: sandboxUtils,
        };

        try {
            // 验证代码安全性
            this.validateCode(code);

            // 执行代码
            const output = await this.runInSandbox(code, fullContext);

            return {
                success: true,
                output,
                logs,
                metrics: {
                    executionTime: Date.now() - startTime,
                },
            };
        } catch (error: any) {
            return {
                success: false,
                error: {
                    name: error.name || 'Error',
                    message: error.message || 'Unknown error',
                    stack: error.stack,
                },
                logs,
                metrics: {
                    executionTime: Date.now() - startTime,
                },
            };
        }
    }

    /**
     * 验证代码安全性
     */
    private validateCode(code: string): void {
        const blockedPatterns = [
            /\beval\s*\(/g,
            /\bnew\s+Function\s*\(/g,
            /\bfetch\s*\(/g,
            /\bXMLHttpRequest\b/g,
            /\bWebSocket\b/g,
            /\bimport\s*\(/g,
            /\brequire\s*\(/g,
            /\bprocess\b/g,
            /\bglobal\b/g,
            /\bwindow\b/g,
            /\bdocument\b/g,
            /\b__proto__\b/g,
            /\bconstructor\b/g,
            /\bprototype\b/g,
        ];

        for (const pattern of blockedPatterns) {
            if (pattern.test(code)) {
                throw new Error(`禁止的操作: ${pattern.source.replace(/\\b|\\s\*|\\/g, '')}`);
            }
        }
    }

    /**
     * 在沙箱中运行代码
     */
    private async runInSandbox(code: string, context: SandboxContext): Promise<any> {
        return new Promise((resolve, reject) => {
            // 超时处理
            const timeoutId = setTimeout(() => {
                reject(new Error(`执行超时 (${this.config.timeout}ms)`));
            }, this.config.timeout);

            try {
                // 创建安全的执行函数
                const wrappedCode = `
          "use strict";
          return (async function(input, variables, console, utils) {
            ${code}
          })(input, variables, console, utils);
        `;

                // 使用 Function 构造器创建隔离的执行环境
                const executor = new Function('input', 'variables', 'console', 'utils', wrappedCode);

                const result = executor(
                    context.input,
                    context.variables,
                    context.console,
                    context.utils
                );

                // 处理 Promise 结果
                if (result && typeof result.then === 'function') {
                    result
                        .then((value: any) => {
                            clearTimeout(timeoutId);
                            resolve(value);
                        })
                        .catch((err: any) => {
                            clearTimeout(timeoutId);
                            reject(err);
                        });
                } else {
                    clearTimeout(timeoutId);
                    resolve(result);
                }
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    /**
     * 安全序列化
     */
    private safeStringify(value: any): string {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (typeof value === 'function') return '[Function]';
        if (typeof value === 'symbol') return value.toString();

        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    /**
     * 更新配置
     */
    updateConfig(config: Partial<SandboxConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

// 单例实例
export const sandbox = new SandboxExecutor();

// ============================================
// 便捷执行函数
// ============================================

export async function runSandboxCode(
    code: string,
    input?: any,
    variables?: Record<string, any>,
    config?: Partial<SandboxConfig>
): Promise<SandboxResult> {
    const executor = config ? new SandboxExecutor(config) : sandbox;
    return executor.execute(code, { input, variables });
}
