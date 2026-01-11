/**
 * Sandbox Types - 代码沙箱类型定义
 */

// 沙箱语言
export type SandboxLanguage = 'python' | 'nodejs' | 'web';

// 沙箱状态
export type SandboxStatus = 'creating' | 'running' | 'stopped' | 'error';

// 网络策略
export type NetworkPolicy = 'none' | 'internal' | 'external';

// 资源限制
export interface ResourceLimits {
    cpu: string;          // e.g., "0.5"
    memory: string;       // e.g., "512M"
    timeout: number;      // ms
    diskSpace?: string;   // e.g., "100M"
}

// 沙箱会话
export interface SandboxSession {
    id: string;
    userId: number;
    language: SandboxLanguage;
    containerId?: string;
    status: SandboxStatus;
    resourceLimits: ResourceLimits;
    networkPolicy: NetworkPolicy;
    workingDir?: string;
    startedAt?: string;
    stoppedAt?: string;
    createdAt: string;
}

// 沙箱产物
export interface SandboxArtifact {
    id: string;
    sessionId: string;
    filePath: string;
    fileType?: string;
    fileSize: number;
    checksum: string;
    storagePath: string;
    createdAt: string;
}

// 执行请求
export interface ExecutionRequest {
    sessionId?: string;      // 复用会话
    language: SandboxLanguage;
    code: string;
    files?: { path: string; content: string }[];
    timeout?: number;
    env?: Record<string, string>;
}

// 执行结果
export interface ExecutionResult {
    success: boolean;
    sessionId: string;
    output: string;
    error?: string;
    exitCode?: number;
    executionTime: number;
    artifacts?: SandboxArtifact[];
}

// Docker 容器配置
export interface DockerContainerConfig {
    image: string;
    command: string[];
    workingDir: string;
    env: Record<string, string>;
    mounts: { source: string; target: string; readonly: boolean }[];
    resourceLimits: ResourceLimits;
    networkMode: string;
    runtime?: string;     // e.g., "runsc" for gVisor
    securityOpt?: string[];
}

// 沙箱管理器接口
export interface ISandboxManager {
    createSession(userId: number, language: SandboxLanguage, options?: Partial<SandboxSession>): Promise<SandboxSession>;
    execute(request: ExecutionRequest): Promise<ExecutionResult>;
    stopSession(sessionId: string): Promise<void>;
    getSession(sessionId: string): Promise<SandboxSession | null>;
    getArtifacts(sessionId: string): Promise<SandboxArtifact[]>;
    cleanup(sessionId: string): Promise<void>;
}

// 默认资源限制
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
    cpu: '0.5',
    memory: '256M',
    timeout: 30000
};

// 语言镜像映射
export const LANGUAGE_IMAGES: Record<SandboxLanguage, string> = {
    python: 'python:3.11-slim',
    nodejs: 'node:20-slim',
    web: 'nginx:alpine'
};
