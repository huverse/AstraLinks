/**
 * 定时任务调度器
 * 
 * @module server/services/scheduler
 * @description 管理基于 Cron 表达式的定时触发器
 */

import cron, { ScheduledTask } from 'node-cron';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { addWorkflowJob } from './workflowQueue';
import { v4 as uuidv4 } from 'uuid';

// 活跃的定时任务缓存
const activeTasks: Map<string, ScheduledTask> = new Map();

/**
 * 初始化调度器 - 加载所有活跃的定时触发器
 */
export async function initScheduler(): Promise<void> {
    console.log('[Scheduler] Initializing...');

    try {
        // 加载所有活跃的定时触发器
        const [triggers] = await pool.execute<RowDataPacket[]>(
            `SELECT t.*, w.workspace_id, ws.owner_id 
             FROM workflow_triggers t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE t.type = 'schedule' AND t.is_active = TRUE AND t.cron_expression IS NOT NULL`
        );

        console.log(`[Scheduler] Found ${triggers.length} active scheduled triggers`);

        for (const trigger of triggers) {
            scheduleTask(trigger);
        }
    } catch (error) {
        console.error('[Scheduler] Init error:', error);
    }
}

/**
 * 调度单个任务
 */
export function scheduleTask(trigger: any): boolean {
    try {
        // 验证 cron 表达式
        if (!cron.validate(trigger.cron_expression)) {
            console.error(`[Scheduler] Invalid cron expression: ${trigger.cron_expression}`);
            return false;
        }

        // 如果已存在，先停止
        if (activeTasks.has(trigger.id)) {
            activeTasks.get(trigger.id)?.stop();
            activeTasks.delete(trigger.id);
        }

        // 创建定时任务
        const task = cron.schedule(trigger.cron_expression, async () => {
            console.log(`[Scheduler] Triggering workflow ${trigger.workflow_id} (trigger ${trigger.id})`);
            await executeTrigger(trigger);
        }, {
            timezone: trigger.timezone || 'Asia/Shanghai'
        });

        activeTasks.set(trigger.id, task);
        console.log(`[Scheduler] Scheduled trigger ${trigger.id}: ${trigger.cron_expression}`);

        return true;
    } catch (error) {
        console.error(`[Scheduler] Failed to schedule trigger ${trigger.id}:`, error);
        return false;
    }
}

/**
 * 执行触发器
 */
async function executeTrigger(trigger: any): Promise<void> {
    const historyId = uuidv4();

    try {
        // 解析配置中的输入数据
        let input = {};
        if (trigger.config) {
            const config = typeof trigger.config === 'string' ? JSON.parse(trigger.config) : trigger.config;
            input = config.input || {};
        }

        // 创建触发历史记录
        await pool.execute(
            `INSERT INTO trigger_history (id, trigger_id, workflow_id, status, input)
             VALUES (?, ?, ?, 'pending', ?)`,
            [historyId, trigger.id, trigger.workflow_id, JSON.stringify(input)]
        );

        // 更新触发器统计
        await pool.execute(
            `UPDATE workflow_triggers SET trigger_count = trigger_count + 1, last_triggered_at = NOW() WHERE id = ?`,
            [trigger.id]
        );

        // 添加到执行队列
        const job = await addWorkflowJob({
            workflowId: trigger.workflow_id,
            userId: trigger.owner_id,
            input,
            triggerId: trigger.id,
            triggerHistoryId: historyId
        });

        // 更新历史记录
        await pool.execute(
            `UPDATE trigger_history SET status = 'running', execution_id = ? WHERE id = ?`,
            [job.id, historyId]
        );

        console.log(`[Scheduler] Workflow ${trigger.workflow_id} queued with job ${job.id}`);
    } catch (error: any) {
        console.error(`[Scheduler] Trigger execution error:`, error);

        // 更新失败状态
        await pool.execute(
            `UPDATE trigger_history SET status = 'failed', error = ? WHERE id = ?`,
            [error.message, historyId]
        ).catch(() => { });

        await pool.execute(
            `UPDATE workflow_triggers SET last_error = ? WHERE id = ?`,
            [error.message, trigger.id]
        ).catch(() => { });
    }
}

/**
 * 停止单个任务
 */
export function stopTask(triggerId: string): boolean {
    const task = activeTasks.get(triggerId);
    if (task) {
        task.stop();
        activeTasks.delete(triggerId);
        console.log(`[Scheduler] Stopped trigger ${triggerId}`);
        return true;
    }
    return false;
}

/**
 * 重新加载单个触发器
 */
export async function reloadTrigger(triggerId: string): Promise<boolean> {
    try {
        const [triggers] = await pool.execute<RowDataPacket[]>(
            `SELECT t.*, w.workspace_id, ws.owner_id 
             FROM workflow_triggers t
             JOIN workflows w ON t.workflow_id = w.id
             JOIN workspaces ws ON w.workspace_id = ws.id
             WHERE t.id = ? AND t.type = 'schedule'`,
            [triggerId]
        );

        if (triggers.length === 0) {
            stopTask(triggerId);
            return false;
        }

        const trigger = triggers[0];

        if (trigger.is_active && trigger.cron_expression) {
            return scheduleTask(trigger);
        } else {
            stopTask(triggerId);
            return true;
        }
    } catch (error) {
        console.error(`[Scheduler] Reload trigger error:`, error);
        return false;
    }
}

/**
 * 获取活跃任务数量
 */
export function getActiveTaskCount(): number {
    return activeTasks.size;
}

/**
 * 停止所有任务
 */
export function stopAllTasks(): void {
    for (const [id, task] of activeTasks) {
        task.stop();
    }
    activeTasks.clear();
    console.log('[Scheduler] All tasks stopped');
}

export default {
    initScheduler,
    scheduleTask,
    stopTask,
    reloadTrigger,
    getActiveTaskCount,
    stopAllTasks
};
