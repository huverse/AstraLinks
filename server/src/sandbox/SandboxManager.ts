/**
 * SandboxManager - 代码沙箱管理器
 * 支持 Docker + gVisor 安全执行
 */

import { spawn, ChildProcess, exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import {
    SandboxLanguage,
    SandboxSession,
    SandboxArtifact,
    ExecutionRequest,
    ExecutionResult,
    ResourceLimits,
    NetworkPolicy,
    DockerContainerConfig,
    DEFAULT_RESOURCE_LIMITS,
    LANGUAGE_IMAGES
} from './types';

export class SandboxManager {
    private sandboxRoot: string;
    private useDocker: boolean;
    private useGVisor: boolean;
    private activeSessions: Map<string, SandboxSession> = new Map();

    constructor() {
        this.sandboxRoot = process.env.SANDBOX_ROOT ?? path.join(os.tmpdir(), 'astralinks-sandbox');
        this.useDocker = process.env.SANDBOX_USE_DOCKER === 'true';
        this.useGVisor = process.env.SANDBOX_USE_GVISOR === 'true';
        this.ensureSandboxRoot();
    }

    private async ensureSandboxRoot(): Promise<void> {
        await fs.mkdir(this.sandboxRoot, { recursive: true });
    }

    // 创建会话
    async createSession(
        userId: number,
        language: SandboxLanguage,
        options: {
            resourceLimits?: Partial<ResourceLimits>;
            networkPolicy?: NetworkPolicy;
        } = {}
    ): Promise<SandboxSession> {
        const sessionId = crypto.randomUUID();
        const workingDir = path.join(this.sandboxRoot, sessionId);

        await fs.mkdir(workingDir, { recursive: true });

        const session: SandboxSession = {
            id: sessionId,
            userId,
            language,
            status: 'creating',
            resourceLimits: { ...DEFAULT_RESOURCE_LIMITS, ...options.resourceLimits },
            networkPolicy: options.networkPolicy ?? 'none',
            workingDir,
            createdAt: new Date().toISOString()
        };

        // 如果使用 Docker，创建容器
        if (this.useDocker) {
            try {
                const containerId = await this.createDockerContainer(session);
                session.containerId = containerId;
                session.status = 'running';
            } catch (err) {
                session.status = 'error';
                throw err;
            }
        } else {
            session.status = 'running';
        }

        session.startedAt = new Date().toISOString();
        this.activeSessions.set(sessionId, session);

        // 保存到数据库
        await this.saveSession(session);

        return session;
    }

    // 执行代码
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
        const startTime = Date.now();

        // 获取或创建会话
        let session: SandboxSession;
        if (request.sessionId) {
            const existing = this.activeSessions.get(request.sessionId);
            if (!existing) {
                throw new Error('Session not found');
            }
            session = existing;
        } else {
            // 临时会话
            session = await this.createSession(0, request.language);
        }

        // 写入代码文件
        const codeFile = await this.writeCodeFile(session, request.code, request.language);

        // 写入额外文件
        if (request.files) {
            for (const file of request.files) {
                const filePath = path.join(session.workingDir!, file.path);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, file.content, 'utf-8');
            }
        }

        // 执行
        let result: ExecutionResult;
        if (this.useDocker && session.containerId) {
            result = await this.executeInDocker(session, codeFile, request.timeout);
        } else {
            result = await this.executeLocal(session, codeFile, request.timeout);
        }

        result.executionTime = Date.now() - startTime;
        result.sessionId = session.id;

        // 收集产物
        result.artifacts = await this.collectArtifacts(session);

        // 如果是临时会话，清理
        if (!request.sessionId) {
            await this.cleanup(session.id);
        }

        return result;
    }

    // Docker 容器创建
    private async createDockerContainer(session: SandboxSession): Promise<string> {
        const image = LANGUAGE_IMAGES[session.language];
        const runtime = this.useGVisor ? 'runsc' : undefined;

        const args = [
            'create',
            '--name', `sandbox-${session.id.substring(0, 8)}`,
            '-w', '/sandbox',
            '-v', `${session.workingDir}:/sandbox:rw`,
            '--memory', session.resourceLimits.memory,
            '--cpus', session.resourceLimits.cpu,
            '--network', session.networkPolicy === 'none' ? 'none' : 'bridge',
            '--read-only',
            '--security-opt', 'no-new-privileges:true'
        ];

        if (runtime) {
            args.push('--runtime', runtime);
        }

        args.push(image, 'tail', '-f', '/dev/null');

        return new Promise((resolve, reject) => {
            exec(`docker ${args.join(' ')}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Docker create failed: ${stderr}`));
                    return;
                }
                // 启动容器
                exec(`docker start sandbox-${session.id.substring(0, 8)}`, (err, out) => {
                    if (err) {
                        reject(new Error(`Docker start failed: ${err.message}`));
                        return;
                    }
                    resolve(`sandbox-${session.id.substring(0, 8)}`);
                });
            });
        });
    }

    // Docker 执行
    private async executeInDocker(
        session: SandboxSession,
        codeFile: string,
        timeout?: number
    ): Promise<ExecutionResult> {
        const execTimeout = timeout ?? session.resourceLimits.timeout;
        const containerId = session.containerId!;

        let cmd: string[];
        switch (session.language) {
            case 'python':
                cmd = ['python3', `/sandbox/${path.basename(codeFile)}`];
                break;
            case 'nodejs':
                cmd = ['node', `/sandbox/${path.basename(codeFile)}`];
                break;
            default:
                throw new Error(`Unsupported language: ${session.language}`);
        }

        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let killed = false;

            const proc = spawn('docker', ['exec', containerId, ...cmd]);

            const timeoutId = setTimeout(() => {
                killed = true;
                proc.kill('SIGTERM');
            }, execTimeout);

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (exitCode) => {
                clearTimeout(timeoutId);
                resolve({
                    success: exitCode === 0 && !killed,
                    sessionId: session.id,
                    output: stdout,
                    error: killed ? `Execution timeout (${execTimeout}ms)` : (stderr || undefined),
                    exitCode: exitCode ?? -1,
                    executionTime: 0
                });
            });

            proc.on('error', (err) => {
                clearTimeout(timeoutId);
                resolve({
                    success: false,
                    sessionId: session.id,
                    output: '',
                    error: err.message,
                    executionTime: 0
                });
            });
        });
    }

    // 本地执行（无 Docker 回退）
    private async executeLocal(
        session: SandboxSession,
        codeFile: string,
        timeout?: number
    ): Promise<ExecutionResult> {
        const execTimeout = timeout ?? session.resourceLimits.timeout;

        let cmd: string;
        let args: string[];
        switch (session.language) {
            case 'python':
                cmd = process.platform === 'win32' ? 'python' : 'python3';
                args = [codeFile];
                break;
            case 'nodejs':
                cmd = 'node';
                args = [codeFile];
                break;
            default:
                throw new Error(`Unsupported language: ${session.language}`);
        }

        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let killed = false;

            const proc = spawn(cmd, args, {
                cwd: session.workingDir,
                env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
            });

            const timeoutId = setTimeout(() => {
                killed = true;
                proc.kill('SIGTERM');
            }, execTimeout);

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (exitCode) => {
                clearTimeout(timeoutId);
                resolve({
                    success: exitCode === 0 && !killed,
                    sessionId: session.id,
                    output: stdout,
                    error: killed ? `Execution timeout (${execTimeout}ms)` : (stderr || undefined),
                    exitCode: exitCode ?? -1,
                    executionTime: 0
                });
            });

            proc.on('error', (err) => {
                clearTimeout(timeoutId);
                resolve({
                    success: false,
                    sessionId: session.id,
                    output: '',
                    error: `Execution failed: ${err.message}`,
                    executionTime: 0
                });
            });
        });
    }

    // 写入代码文件
    private async writeCodeFile(
        session: SandboxSession,
        code: string,
        language: SandboxLanguage
    ): Promise<string> {
        const ext = language === 'python' ? 'py' : 'js';
        const fileName = `main.${ext}`;
        const filePath = path.join(session.workingDir!, fileName);
        await fs.writeFile(filePath, code, 'utf-8');
        return filePath;
    }

    // 收集产物
    private async collectArtifacts(session: SandboxSession): Promise<SandboxArtifact[]> {
        const artifacts: SandboxArtifact[] = [];
        const workDir = session.workingDir!;

        try {
            const files = await fs.readdir(workDir);
            for (const file of files) {
                if (file.startsWith('main.')) continue; // 跳过代码文件

                const filePath = path.join(workDir, file);
                const stat = await fs.stat(filePath);

                if (stat.isFile() && stat.size < 10 * 1024 * 1024) { // 小于 10MB
                    const content = await fs.readFile(filePath);
                    const checksum = crypto.createHash('sha256').update(content).digest('hex');

                    artifacts.push({
                        id: crypto.randomUUID(),
                        sessionId: session.id,
                        filePath: file,
                        fileType: path.extname(file).slice(1),
                        fileSize: stat.size,
                        checksum,
                        storagePath: filePath,
                        createdAt: new Date().toISOString()
                    });
                }
            }
        } catch (err) {
            console.error('[Sandbox] Artifact collection error:', err);
        }

        return artifacts;
    }

    // 停止会话
    async stopSession(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        if (this.useDocker && session.containerId) {
            try {
                await new Promise<void>((resolve) => {
                    exec(`docker stop ${session.containerId}`, () => resolve());
                });
            } catch (err) {
                console.error('[Sandbox] Docker stop error:', err);
            }
        }

        session.status = 'stopped';
        session.stoppedAt = new Date().toISOString();

        await this.updateSession(session);
    }

    // 清理会话
    async cleanup(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        await this.stopSession(sessionId);

        // 删除 Docker 容器
        if (this.useDocker && session.containerId) {
            try {
                await new Promise<void>((resolve) => {
                    exec(`docker rm -f ${session.containerId}`, () => resolve());
                });
            } catch (err) {
                console.error('[Sandbox] Docker rm error:', err);
            }
        }

        // 删除工作目录
        if (session.workingDir) {
            try {
                await fs.rm(session.workingDir, { recursive: true, force: true });
            } catch (err) {
                console.error('[Sandbox] Cleanup error:', err);
            }
        }

        this.activeSessions.delete(sessionId);
    }

    // 获取会话
    async getSession(sessionId: string): Promise<SandboxSession | null> {
        const cached = this.activeSessions.get(sessionId);
        if (cached) return cached;

        // 从数据库查询
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM sandbox_sessions WHERE id = ?',
            [sessionId]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        return {
            id: row.id,
            userId: row.user_id,
            language: row.language,
            containerId: row.container_id,
            status: row.status,
            resourceLimits: row.resource_limits ? JSON.parse(row.resource_limits) : DEFAULT_RESOURCE_LIMITS,
            networkPolicy: row.network_policy,
            startedAt: row.started_at,
            stoppedAt: row.stopped_at,
            createdAt: row.created_at
        };
    }

    // 保存会话
    private async saveSession(session: SandboxSession): Promise<void> {
        await pool.execute(
            `INSERT INTO sandbox_sessions
             (id, user_id, language, container_id, status, resource_limits, network_policy, started_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                session.id,
                session.userId,
                session.language,
                session.containerId,
                session.status,
                JSON.stringify(session.resourceLimits),
                session.networkPolicy,
                session.startedAt
            ]
        );
    }

    // 更新会话
    private async updateSession(session: SandboxSession): Promise<void> {
        await pool.execute(
            'UPDATE sandbox_sessions SET status = ?, stopped_at = ? WHERE id = ?',
            [session.status, session.stoppedAt, session.id]
        );
    }

    // 获取产物
    async getArtifacts(sessionId: string): Promise<SandboxArtifact[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM sandbox_artifacts WHERE session_id = ?',
            [sessionId]
        );

        return rows.map(row => ({
            id: row.id,
            sessionId: row.session_id,
            filePath: row.file_path,
            fileType: row.file_type,
            fileSize: row.file_size,
            checksum: row.checksum,
            storagePath: row.storage_path,
            createdAt: row.created_at
        }));
    }

    // 清理过期会话（定时任务调用）
    async cleanupExpiredSessions(maxAgeMs: number = 3600000): Promise<number> {
        const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
        const cleaned: string[] = [];

        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (session.createdAt < cutoff) {
                await this.cleanup(sessionId);
                cleaned.push(sessionId);
            }
        }

        return cleaned.length;
    }
}

export const sandboxManager = new SandboxManager();
