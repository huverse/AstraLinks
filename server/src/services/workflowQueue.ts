/**
 * 工作流队列服务
 * 
 * @module server/src/services/workflowQueue
 * @description BullMQ 工作流执行队列 (需要 Redis)
 */

// ============================================
// 注意: 此文件需要安装 Redis 才能使用
// 如果 Redis 未安装，系统会降级为直接执行模式
// ============================================

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// ============================================
// Redis 连接配置
// ============================================

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
};

let connection: IORedis | null = null;
let workflowQueue: Queue | null = null;
let queueEvents: QueueEvents | null = null;

// ============================================
// 初始化队列
// ============================================

export async function initWorkflowQueue(): Promise<boolean> {
    try {
        // 尝试连接 Redis
        connection = new IORedis(redisConfig);

        // 测试连接
        await connection.ping();
        console.log('[WorkflowQueue] Redis connected');

        // 创建队列
        workflowQueue = new Queue('workflow-execution', { connection });
        queueEvents = new QueueEvents('workflow-execution', { connection });

        // 创建 Worker
        const worker = new Worker(
            'workflow-execution',
            async (job: Job) => {
                return processWorkflowJob(job);
            },
            {
                connection,
                concurrency: 5, // 最大并发数
            }
        );

        // 事件监听
        worker.on('completed', (job: Job) => {
            console.log(`[WorkflowQueue] Job ${job.id} completed`);
        });

        worker.on('failed', (job: Job | undefined, err: Error) => {
            console.error(`[WorkflowQueue] Job ${job?.id} failed:`, err.message);
        });

        console.log('[WorkflowQueue] Queue initialized');
        return true;
    } catch (error) {
        console.warn('[WorkflowQueue] Redis not available, using direct execution mode');
        return false;
    }
}

// ============================================
// 处理工作流任务
// ============================================

async function processWorkflowJob(job: Job): Promise<any> {
    const { workflowId, input, userId } = job.data;

    // 更新进度
    await job.updateProgress(10);

    // TODO: 实际的工作流执行逻辑
    // 这里应该调用 WorkflowEngine 执行工作流

    // 模拟执行
    await new Promise(r => setTimeout(r, 2000));
    await job.updateProgress(50);

    await new Promise(r => setTimeout(r, 2000));
    await job.updateProgress(100);

    return {
        success: true,
        output: `Workflow ${workflowId} completed`,
        timestamp: new Date().toISOString(),
    };
}

// ============================================
// 添加工作流到队列
// ============================================

export async function enqueueWorkflow(
    workflowId: string,
    input: any,
    userId: string,
    options?: {
        priority?: number;
        delay?: number;
        attempts?: number;
    }
): Promise<string | null> {
    if (!workflowQueue) {
        console.warn('[WorkflowQueue] Queue not initialized, running directly');
        return null;
    }

    const job = await workflowQueue.add(
        'execute',
        {
            workflowId,
            input,
            userId,
            timestamp: Date.now(),
        },
        {
            priority: options?.priority || 0,
            delay: options?.delay || 0,
            attempts: options?.attempts || 3,
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
        }
    );

    console.log(`[WorkflowQueue] Job ${job.id} added for workflow ${workflowId}`);
    return job.id || null;
}

// ============================================
// 获取队列状态
// ============================================

export async function getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
} | null> {
    if (!workflowQueue) return null;

    const [waiting, active, completed, failed] = await Promise.all([
        workflowQueue.getWaitingCount(),
        workflowQueue.getActiveCount(),
        workflowQueue.getCompletedCount(),
        workflowQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
}

// ============================================
// 获取任务状态
// ============================================

export async function getJobStatus(jobId: string): Promise<{
    status: string;
    progress: number;
    result?: any;
    error?: string;
} | null> {
    if (!workflowQueue) return null;

    const job = await workflowQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();

    return {
        status: state,
        progress: job.progress as number || 0,
        result: job.returnvalue,
        error: job.failedReason,
    };
}

// ============================================
// 取消任务
// ============================================

export async function cancelJob(jobId: string): Promise<boolean> {
    if (!workflowQueue) return false;

    const job = await workflowQueue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
        await job.remove();
        return true;
    }

    return false;
}

// ============================================
// 检查队列是否可用
// ============================================

export function isQueueAvailable(): boolean {
    return workflowQueue !== null;
}

// ============================================
// 关闭队列
// ============================================

export async function closeWorkflowQueue(): Promise<void> {
    if (workflowQueue) {
        await workflowQueue.close();
    }
    if (queueEvents) {
        await queueEvents.close();
    }
    if (connection) {
        await connection.quit();
    }
    console.log('[WorkflowQueue] Queue closed');
}
