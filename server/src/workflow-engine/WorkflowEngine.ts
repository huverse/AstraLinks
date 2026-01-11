/**
 * Workflow Engine - 工作流引擎主入口
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
    WorkflowDefinition,
    WorkflowVersion,
    WorkflowRun,
    RunContext,
    RunStatus,
    WorkflowGraph,
    AgentConfig
} from './types';
import { DAGRunner } from './DAGRunner';
import { AgentRunner } from './AgentRunner';

export class WorkflowEngine {
    private eventEmitter?: (event: string, data: unknown) => void;
    private runnerMap: Map<string, DAGRunner | AgentRunner> = new Map();

    constructor(eventEmitter?: (event: string, data: unknown) => void) {
        this.eventEmitter = eventEmitter;
    }

    // 获取工作流定义
    async getWorkflow(workflowId: string): Promise<WorkflowDefinition | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT w.*, wv.graph_json
             FROM workflows w
             LEFT JOIN workflow_versions wv ON w.id = wv.workflow_id AND wv.is_active = TRUE
             WHERE w.id = ?`,
            [workflowId]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            type: row.workflow_type ?? 'dag',
            graph: row.graph_json ? JSON.parse(row.graph_json) : JSON.parse(row.nodes ?? '{}'),
            agentConfig: row.agent_config ? JSON.parse(row.agent_config) : undefined,
            collaborationModels: row.collaboration_models ? JSON.parse(row.collaboration_models) : undefined,
            validationMode: row.validation_mode ?? 'balanced',
            globalContext: row.global_context ? JSON.parse(row.global_context) : {},
            variables: row.variables ? JSON.parse(row.variables) : {}
        };
    }

    // 创建新版本
    async createVersion(
        workflowId: string,
        graph: WorkflowGraph,
        createdBy: number,
        isDraft: boolean = true
    ): Promise<string> {
        // 获取当前最大版本号
        const [versionRows] = await pool.execute<RowDataPacket[]>(
            'SELECT MAX(version) as max_version FROM workflow_versions WHERE workflow_id = ?',
            [workflowId]
        );

        const maxVersion = (versionRows[0] as { max_version: number | null }).max_version ?? 0;
        const newVersion = maxVersion + 1;
        const versionId = crypto.randomUUID();

        await pool.execute(
            `INSERT INTO workflow_versions (id, workflow_id, version, graph_json, is_draft, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [versionId, workflowId, newVersion, JSON.stringify(graph), isDraft, createdBy]
        );

        return versionId;
    }

    // 发布版本
    async publishVersion(versionId: string): Promise<void> {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 获取版本信息
            const [versionRows] = await connection.execute<RowDataPacket[]>(
                'SELECT workflow_id FROM workflow_versions WHERE id = ?',
                [versionId]
            );

            if (versionRows.length === 0) {
                throw new Error('Version not found');
            }

            const workflowId = (versionRows[0] as { workflow_id: string }).workflow_id;

            // 停用旧版本
            await connection.execute(
                'UPDATE workflow_versions SET is_active = FALSE WHERE workflow_id = ?',
                [workflowId]
            );

            // 激活新版本
            await connection.execute(
                'UPDATE workflow_versions SET is_active = TRUE, is_draft = FALSE, published_at = NOW() WHERE id = ?',
                [versionId]
            );

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    // 启动运行
    async startRun(
        workflowId: string,
        userId: number,
        input: Record<string, unknown> = {},
        versionId?: string
    ): Promise<string> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error('Workflow not found');
        }

        // 获取版本
        let activeVersionId = versionId;
        if (!activeVersionId) {
            const [versionRows] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM workflow_versions WHERE workflow_id = ? AND is_active = TRUE',
                [workflowId]
            );

            if (versionRows.length === 0) {
                throw new Error('No active version found');
            }

            activeVersionId = (versionRows[0] as { id: string }).id;
        }

        // 创建运行记录
        const runId = crypto.randomUUID();
        const context: RunContext = {
            variables: { ...workflow.variables, ...input },
            nodeOutputs: {},
            metadata: {
                startTime: Date.now(),
                executedNodes: [],
                totalTokens: 0,
                errors: []
            }
        };

        await pool.execute(
            `INSERT INTO workflow_runs
             (id, workflow_id, version_id, user_id, status, input_json, context_json, started_at)
             VALUES (?, ?, ?, ?, 'running', ?, ?, NOW())`,
            [runId, workflowId, activeVersionId, userId, JSON.stringify(input), JSON.stringify(context)]
        );

        this.emit('run:started', { runId, workflowId, userId });

        // 异步执行
        this.executeRun(runId, workflow, context).catch(err => {
            console.error(`[WorkflowEngine] Run ${runId} failed:`, err);
        });

        return runId;
    }

    // 执行运行
    private async executeRun(
        runId: string,
        workflow: WorkflowDefinition,
        context: RunContext
    ): Promise<void> {
        let runner: DAGRunner | AgentRunner;

        if (workflow.type === 'agent' && workflow.agentConfig) {
            runner = new AgentRunner(
                workflow.graph,
                workflow.agentConfig,
                runId,
                (event, data) => this.emit(event, data)
            );
        } else {
            runner = new DAGRunner(
                workflow.graph,
                runId,
                (event, data) => this.emit(event, data)
            );
        }

        this.runnerMap.set(runId, runner);

        try {
            const result = await runner.run(context);

            if (result.success) {
                await this.updateRunStatus(runId, 'completed', result.output, context);
                this.emit('run:completed', { runId, output: result.output });
            } else {
                await this.updateRunStatus(runId, 'failed', null, context, result.error);
                this.emit('run:failed', { runId, error: result.error });
            }
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Unknown error';
            await this.updateRunStatus(runId, 'failed', null, context, error);
            this.emit('run:failed', { runId, error });
        } finally {
            this.runnerMap.delete(runId);
        }
    }

    // 更新运行状态
    private async updateRunStatus(
        runId: string,
        status: RunStatus,
        output: unknown,
        context: RunContext,
        error?: string
    ): Promise<void> {
        await pool.execute(
            `UPDATE workflow_runs
             SET status = ?, output_json = ?, context_json = ?,
                 total_tokens = ?, error_message = ?,
                 completed_at = CASE WHEN ? IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE NULL END
             WHERE id = ?`,
            [
                status,
                output ? JSON.stringify(output) : null,
                JSON.stringify(context),
                context.metadata.totalTokens,
                error,
                status,
                runId
            ]
        );
    }

    // 获取运行状态
    async getRunStatus(runId: string): Promise<WorkflowRun | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM workflow_runs WHERE id = ?',
            [runId]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        return {
            id: row.id,
            workflowId: row.workflow_id,
            versionId: row.version_id,
            userId: row.user_id,
            status: row.status,
            input: row.input_json ? JSON.parse(row.input_json) : {},
            output: row.output_json ? JSON.parse(row.output_json) : undefined,
            context: row.context_json ? JSON.parse(row.context_json) : {} as RunContext,
            currentNodeId: row.current_node_id,
            totalTokens: row.total_tokens,
            errorMessage: row.error_message,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            createdAt: row.created_at
        };
    }

    // 取消运行
    async cancelRun(runId: string): Promise<void> {
        const runner = this.runnerMap.get(runId);
        if (runner) {
            runner.cancel();
        }

        await pool.execute(
            'UPDATE workflow_runs SET status = ?, completed_at = NOW() WHERE id = ? AND status = ?',
            ['cancelled', runId, 'running']
        );

        this.emit('run:cancelled', { runId });
    }

    // 暂停运行
    async pauseRun(runId: string): Promise<void> {
        const runner = this.runnerMap.get(runId);
        if (runner) {
            runner.pause();
        }

        await pool.execute(
            'UPDATE workflow_runs SET status = ? WHERE id = ? AND status = ?',
            ['paused', runId, 'running']
        );
    }

    // 恢复运行
    async resumeRun(runId: string): Promise<void> {
        const runner = this.runnerMap.get(runId);
        if (runner) {
            runner.resume();
        }

        await pool.execute(
            'UPDATE workflow_runs SET status = ? WHERE id = ? AND status = ?',
            ['running', runId, 'paused']
        );
    }

    // 获取运行历史
    async getRunHistory(
        workflowId: string,
        options: { limit?: number; offset?: number; status?: RunStatus } = {}
    ): Promise<WorkflowRun[]> {
        const { limit = 20, offset = 0, status } = options;

        let query = 'SELECT * FROM workflow_runs WHERE workflow_id = ?';
        const params: unknown[] = [workflowId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        return rows.map(row => ({
            id: row.id,
            workflowId: row.workflow_id,
            versionId: row.version_id,
            userId: row.user_id,
            status: row.status,
            input: row.input_json ? JSON.parse(row.input_json) : {},
            output: row.output_json ? JSON.parse(row.output_json) : undefined,
            context: row.context_json ? JSON.parse(row.context_json) : {} as RunContext,
            currentNodeId: row.current_node_id,
            totalTokens: row.total_tokens,
            errorMessage: row.error_message,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            createdAt: row.created_at
        }));
    }

    private emit(event: string, data: unknown): void {
        if (this.eventEmitter) {
            this.eventEmitter(event, data);
        }
    }
}

// 单例
export const workflowEngine = new WorkflowEngine();
