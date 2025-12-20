/**
 * 工作流执行服务
 * 
 * @module server/src/services/executionService
 * @description 工作流执行历史的持久化和查询
 */

import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// 类型定义
// ============================================

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowExecution {
    id: string;
    workflowId: string;
    userId: number;
    jobId?: string;
    status: ExecutionStatus;
    input?: any;
    output?: any;
    error?: string;
    nodeStates?: Record<string, any>;
    logs?: any[];
    totalTokens: number;
    durationMs: number;
    retryCount: number;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
}

export interface CreateExecutionInput {
    workflowId: string;
    userId: number;
    jobId?: string;
    input?: any;
}

export interface UpdateExecutionInput {
    status?: ExecutionStatus;
    output?: any;
    error?: string;
    nodeStates?: Record<string, any>;
    logs?: any[];
    totalTokens?: number;
    durationMs?: number;
    retryCount?: number;
    startedAt?: Date;
    completedAt?: Date;
}

// ============================================
// 创建执行记录
// ============================================

export async function createExecution(data: CreateExecutionInput): Promise<string> {
    const id = uuidv4();

    await pool.execute<ResultSetHeader>(
        `INSERT INTO workflow_executions (id, workflow_id, user_id, job_id, status, input)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
        [id, data.workflowId, data.userId, data.jobId || null, JSON.stringify(data.input || null)]
    );

    return id;
}

// ============================================
// 更新执行记录
// ============================================

export async function updateExecution(executionId: string, data: UpdateExecutionInput): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
    }
    if (data.output !== undefined) {
        updates.push('output = ?');
        values.push(JSON.stringify(data.output));
    }
    if (data.error !== undefined) {
        updates.push('error = ?');
        values.push(data.error);
    }
    if (data.nodeStates !== undefined) {
        updates.push('node_states = ?');
        values.push(JSON.stringify(data.nodeStates));
    }
    if (data.logs !== undefined) {
        updates.push('logs = ?');
        values.push(JSON.stringify(data.logs));
    }
    if (data.totalTokens !== undefined) {
        updates.push('total_tokens = ?');
        values.push(data.totalTokens);
    }
    if (data.durationMs !== undefined) {
        updates.push('duration_ms = ?');
        values.push(data.durationMs);
    }
    if (data.retryCount !== undefined) {
        updates.push('retry_count = ?');
        values.push(data.retryCount);
    }
    if (data.startedAt !== undefined) {
        updates.push('started_at = ?');
        values.push(data.startedAt);
    }
    if (data.completedAt !== undefined) {
        updates.push('completed_at = ?');
        values.push(data.completedAt);
    }

    if (updates.length === 0) return;

    values.push(executionId);
    await pool.execute(
        `UPDATE workflow_executions SET ${updates.join(', ')} WHERE id = ?`,
        values
    );
}

// ============================================
// 获取执行记录
// ============================================

export async function getExecution(executionId: string): Promise<WorkflowExecution | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM workflow_executions WHERE id = ?`,
        [executionId]
    );

    if (rows.length === 0) return null;

    return mapRowToExecution(rows[0]);
}

// ============================================
// 获取工作流的执行历史
// ============================================

export async function getWorkflowExecutions(
    workflowId: string,
    limit: number = 20,
    offset: number = 0
): Promise<{ executions: WorkflowExecution[]; total: number }> {
    const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM workflow_executions WHERE workflow_id = ?`,
        [workflowId]
    );
    const total = countRows[0].total;

    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM workflow_executions 
         WHERE workflow_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [workflowId, limit, offset]
    );

    return {
        executions: rows.map(mapRowToExecution),
        total
    };
}

// ============================================
// 获取用户的执行历史
// ============================================

export async function getUserExecutions(
    userId: number,
    limit: number = 20,
    offset: number = 0
): Promise<{ executions: WorkflowExecution[]; total: number }> {
    const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM workflow_executions WHERE user_id = ?`,
        [userId]
    );
    const total = countRows[0].total;

    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT e.*, w.name as workflow_name
         FROM workflow_executions e
         LEFT JOIN workflows w ON e.workflow_id = w.id
         WHERE e.user_id = ? 
         ORDER BY e.created_at DESC 
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
    );

    return {
        executions: rows.map(mapRowToExecution),
        total
    };
}

// ============================================
// 辅助函数
// ============================================

function mapRowToExecution(row: RowDataPacket): WorkflowExecution {
    return {
        id: row.id,
        workflowId: row.workflow_id,
        userId: row.user_id,
        jobId: row.job_id,
        status: row.status,
        input: row.input ? (typeof row.input === 'string' ? JSON.parse(row.input) : row.input) : null,
        output: row.output ? (typeof row.output === 'string' ? JSON.parse(row.output) : row.output) : null,
        error: row.error,
        nodeStates: row.node_states ? (typeof row.node_states === 'string' ? JSON.parse(row.node_states) : row.node_states) : null,
        logs: row.logs ? (typeof row.logs === 'string' ? JSON.parse(row.logs) : row.logs) : null,
        totalTokens: row.total_tokens || 0,
        durationMs: row.duration_ms || 0,
        retryCount: row.retry_count || 0,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at
    };
}
