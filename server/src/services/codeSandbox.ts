/**
 * 安全代码执行服务
 * 
 * @module server/src/services/codeSandbox
 * @description 使用 vm2 在隔离沙箱中执行用户代码
 */

import { VM, VMScript } from 'vm2';

// ============================================
// 类型定义
// ============================================

export interface CodeExecutionRequest {
    code: string;
    input: any;
    variables?: Record<string, any>;
    timeout?: number;
    language?: string;
}

export interface CodeExecutionResult {
    success: boolean;
    result?: any;
    logs: string[];
    error?: string;
    executionTime: number;
}

// ============================================
// 安全代码执行
// ============================================

export async function executeCodeSandbox(request: CodeExecutionRequest): Promise<CodeExecutionResult> {
    const { code, input, variables = {}, timeout = 10000, language = 'javascript' } = request;
    const startTime = Date.now();
    const logs: string[] = [];

    // 目前只支持 JavaScript
    if (language !== 'javascript' && language !== 'js') {
        return {
            success: false,
            error: `不支持的语言: ${language}，目前只支持 JavaScript`,
            logs,
            executionTime: Date.now() - startTime
        };
    }

    if (!code || !code.trim()) {
        return {
            success: true,
            result: input,
            logs,
            executionTime: Date.now() - startTime
        };
    }

    try {
        // 创建安全的沙箱环境
        const sandbox = {
            input,
            variables: { ...variables },
            result: undefined as any,
            console: {
                log: (...args: any[]) => {
                    logs.push(args.map(a =>
                        typeof a === 'object' ? JSON.stringify(a) : String(a)
                    ).join(' '));
                },
                error: (...args: any[]) => {
                    logs.push('[ERROR] ' + args.map(a =>
                        typeof a === 'object' ? JSON.stringify(a) : String(a)
                    ).join(' '));
                },
                warn: (...args: any[]) => {
                    logs.push('[WARN] ' + args.map(a =>
                        typeof a === 'object' ? JSON.stringify(a) : String(a)
                    ).join(' '));
                },
                info: (...args: any[]) => {
                    logs.push('[INFO] ' + args.map(a =>
                        typeof a === 'object' ? JSON.stringify(a) : String(a)
                    ).join(' '));
                }
            },
            // 安全的内置函数
            JSON: JSON,
            Math: Math,
            Date: Date,
            parseInt,
            parseFloat,
            isNaN,
            isFinite,
            encodeURIComponent,
            decodeURIComponent,
            encodeURI,
            decodeURI,
            Array,
            Object,
            String,
            Number,
            Boolean,
            RegExp,
            Map,
            Set,
            Promise,
        };

        // 创建隔离的 VM 实例
        const vm = new VM({
            timeout,
            sandbox,
            eval: false,
            wasm: false,
        });

        // 包装用户代码，确保返回值
        const wrappedCode = `
            (function() {
                ${code}
                return result !== undefined ? result : input;
            })()
        `;

        // 预编译脚本以检查语法错误
        const script = new VMScript(wrappedCode);

        // 在沙箱中执行
        const result = vm.run(script);

        return {
            success: true,
            result,
            logs,
            executionTime: Date.now() - startTime
        };

    } catch (error: any) {
        // 处理各种错误类型
        let errorMessage = error.message;

        if (error.message?.includes('Script execution timed out')) {
            errorMessage = `代码执行超时 (${timeout}ms)`;
        } else if (error.message?.includes('not defined')) {
            errorMessage = `变量或函数未定义: ${error.message}`;
        } else if (error.name === 'SyntaxError') {
            errorMessage = `语法错误: ${error.message}`;
        }

        return {
            success: false,
            error: errorMessage,
            logs,
            executionTime: Date.now() - startTime
        };
    }
}

// ============================================
// 代码验证 (静态检查)
// ============================================

export function validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查危险模式
    const dangerousPatterns = [
        { pattern: /require\s*\(/, message: '不允许使用 require()' },
        { pattern: /import\s+/, message: '不允许使用 import 语句' },
        { pattern: /eval\s*\(/, message: '不允许使用 eval()' },
        { pattern: /Function\s*\(/, message: '不允许使用 Function 构造函数' },
        { pattern: /process\./, message: '不允许访问 process 对象' },
        { pattern: /global\./, message: '不允许访问 global 对象' },
        { pattern: /globalThis\./, message: '不允许访问 globalThis' },
        { pattern: /__dirname/, message: '不允许访问 __dirname' },
        { pattern: /__filename/, message: '不允许访问 __filename' },
        { pattern: /require\.resolve/, message: '不允许使用 require.resolve' },
        { pattern: /child_process/, message: '不允许访问子进程' },
        { pattern: /fs\./, message: '不允许访问文件系统' },
        { pattern: /http\./, message: '不允许使用 http 模块' },
        { pattern: /https\./, message: '不允许使用 https 模块' },
        { pattern: /net\./, message: '不允许使用 net 模块' },
    ];

    for (const { pattern, message } of dangerousPatterns) {
        if (pattern.test(code)) {
            errors.push(message);
        }
    }

    // 尝试语法检查
    try {
        new Function(code);
    } catch (error: any) {
        if (error instanceof SyntaxError) {
            errors.push(`语法错误: ${error.message}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
