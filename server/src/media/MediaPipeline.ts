/**
 * Media Pipeline - 多媒体创作管线服务
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { adapterRegistry } from '../adapters';
import { EventEmitter } from 'events';

export type MediaType = 'image' | 'video' | 'audio';
export type PipelineType = 'image_gen' | 'image_edit' | 'video_gen' | 'audio_gen' | 'tts' | 'composite';
export type JobStatus = 'pending' | 'processing' | 'streaming' | 'completed' | 'failed' | 'cancelled';
export type StepType = 'generate' | 'edit' | 'transform' | 'merge';

export interface MediaAsset {
    id: string;
    userId: number;
    type: MediaType;
    storageUrl: string;
    thumbnailUrl: string | null;
    metadata: {
        width?: number;
        height?: number;
        duration?: number;
        format?: string;
    } | null;
    fileSize: number | null;
    createdAt: Date;
}

export interface MediaJob {
    id: string;
    userId: number;
    workflowRunId: string | null;
    pipelineType: PipelineType;
    status: JobStatus;
    inputAssetId: string | null;
    inputPrompt: string | null;
    outputAssetId: string | null;
    progress: number;
    providerId: string | null;
    model: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
}

export interface PipelineStep {
    id: string;
    jobId: string;
    stepOrder: number;
    stepType: StepType;
    inputAssetId: string | null;
    outputAssetId: string | null;
    params: Record<string, any>;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    startedAt: Date | null;
    completedAt: Date | null;
}

export interface CreateJobRequest {
    pipelineType: PipelineType;
    inputAssetId?: string;
    inputPrompt?: string;
    providerId?: string;
    model?: string;
    params?: Record<string, any>;
    workflowRunId?: string;
}

export interface JobProgressEvent {
    jobId: string;
    progress: number;
    status: JobStatus;
    message?: string;
    outputAssetId?: string;
}

export class MediaPipeline extends EventEmitter {
    // 创建媒体任务
    async createJob(userId: number, request: CreateJobRequest): Promise<MediaJob> {
        const jobId = crypto.randomUUID();

        await pool.execute(
            `INSERT INTO media_jobs
             (id, user_id, workflow_run_id, pipeline_type, status, input_asset_id, input_prompt,
              provider_id, model, progress, created_at)
             VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0, NOW())`,
            [
                jobId,
                userId,
                request.workflowRunId,
                request.pipelineType,
                request.inputAssetId,
                request.inputPrompt,
                request.providerId,
                request.model
            ]
        );

        const job = await this.getJob(jobId);
        if (!job) throw new Error('Failed to create job');

        // 异步执行任务
        this.executeJob(job).catch(err => {
            console.error(`[MediaPipeline] Job ${jobId} failed:`, err);
        });

        return job;
    }

    // 获取任务
    async getJob(jobId: string): Promise<MediaJob | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM media_jobs WHERE id = ?',
            [jobId]
        );

        if (rows.length === 0) return null;
        return this.rowToJob(rows[0]);
    }

    // 获取用户任务列表
    async getUserJobs(userId: number, limit = 50): Promise<MediaJob[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM media_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
            [userId, limit]
        );
        return rows.map(row => this.rowToJob(row));
    }

    // 取消任务
    async cancelJob(jobId: string, userId: number): Promise<void> {
        const [result] = await pool.execute<ResultSetHeader>(
            `UPDATE media_jobs SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status IN ('pending', 'processing')`,
            [jobId, userId]
        );

        if (result.affectedRows === 0) {
            throw new Error('Cannot cancel job');
        }

        this.emit('progress', {
            jobId,
            progress: 0,
            status: 'cancelled',
            message: 'Job cancelled by user'
        } as JobProgressEvent);
    }

    // 创建资产记录
    async createAsset(
        userId: number,
        type: MediaType,
        storageUrl: string,
        metadata?: MediaAsset['metadata'],
        fileSize?: number,
        thumbnailUrl?: string
    ): Promise<MediaAsset> {
        const assetId = crypto.randomUUID();

        await pool.execute(
            `INSERT INTO media_assets (id, user_id, type, storage_url, thumbnail_url, metadata, file_size, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                assetId,
                userId,
                type,
                storageUrl,
                thumbnailUrl,
                metadata ? JSON.stringify(metadata) : null,
                fileSize
            ]
        );

        return {
            id: assetId,
            userId,
            type,
            storageUrl,
            thumbnailUrl: thumbnailUrl ?? null,
            metadata: metadata ?? null,
            fileSize: fileSize ?? null,
            createdAt: new Date()
        };
    }

    // 获取资产
    async getAsset(assetId: string): Promise<MediaAsset | null> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM media_assets WHERE id = ?',
            [assetId]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        return {
            id: row.id,
            userId: row.user_id,
            type: row.type,
            storageUrl: row.storage_url,
            thumbnailUrl: row.thumbnail_url,
            metadata: row.metadata ? JSON.parse(row.metadata) : null,
            fileSize: row.file_size,
            createdAt: row.created_at
        };
    }

    // 获取用户资产列表
    async getUserAssets(userId: number, type?: MediaType, limit = 50): Promise<MediaAsset[]> {
        let query = 'SELECT * FROM media_assets WHERE user_id = ?';
        const params: any[] = [userId];

        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);
        return rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            type: row.type,
            storageUrl: row.storage_url,
            thumbnailUrl: row.thumbnail_url,
            metadata: row.metadata ? JSON.parse(row.metadata) : null,
            fileSize: row.file_size,
            createdAt: row.created_at
        }));
    }

    // 执行任务 (内部)
    private async executeJob(job: MediaJob): Promise<void> {
        try {
            // 更新状态为处理中
            await this.updateJobStatus(job.id, 'processing', 0);
            this.emit('progress', {
                jobId: job.id,
                progress: 0,
                status: 'processing',
                message: 'Starting job...'
            } as JobProgressEvent);

            let outputUrl: string | undefined;
            let metadata: MediaAsset['metadata'] | undefined;

            switch (job.pipelineType) {
                case 'image_gen':
                    const imageResult = await this.executeImageGeneration(job);
                    outputUrl = imageResult.url;
                    metadata = imageResult.metadata;
                    break;

                case 'tts':
                    const ttsResult = await this.executeTTS(job);
                    outputUrl = ttsResult.url;
                    metadata = ttsResult.metadata;
                    break;

                case 'video_gen':
                    const videoResult = await this.executeVideoGeneration(job);
                    outputUrl = videoResult.url;
                    metadata = videoResult.metadata;
                    break;

                case 'audio_gen':
                    const audioResult = await this.executeAudioGeneration(job);
                    outputUrl = audioResult.url;
                    metadata = audioResult.metadata;
                    break;

                default:
                    throw new Error(`Unsupported pipeline type: ${job.pipelineType}`);
            }

            // 创建输出资产
            if (outputUrl) {
                const assetType = this.getAssetTypeFromPipeline(job.pipelineType);
                const asset = await this.createAsset(job.userId, assetType, outputUrl, metadata);

                // 更新任务完成状态
                await pool.execute(
                    `UPDATE media_jobs SET status = 'completed', output_asset_id = ?, progress = 100, completed_at = NOW() WHERE id = ?`,
                    [asset.id, job.id]
                );

                this.emit('progress', {
                    jobId: job.id,
                    progress: 100,
                    status: 'completed',
                    message: 'Job completed',
                    outputAssetId: asset.id
                } as JobProgressEvent);
            }
        } catch (err: any) {
            // 更新失败状态
            await pool.execute(
                `UPDATE media_jobs SET status = 'failed', error_message = ? WHERE id = ?`,
                [err.message, job.id]
            );

            this.emit('progress', {
                jobId: job.id,
                progress: 0,
                status: 'failed',
                message: err.message
            } as JobProgressEvent);

            throw err;
        }
    }

    // 图像生成
    private async executeImageGeneration(job: MediaJob): Promise<{ url: string; metadata?: MediaAsset['metadata'] }> {
        if (!job.inputPrompt) {
            throw new Error('Image generation requires a prompt');
        }

        // 更新进度
        await this.updateJobStatus(job.id, 'processing', 30);

        const adapter = await adapterRegistry.createSystemAdapter('openai_compatible');
        const result = await adapter.generateImage(job.inputPrompt, {
            model: job.model ?? 'dall-e-3',
            size: '1024x1024',
            quality: 'standard'
        });

        await this.updateJobStatus(job.id, 'processing', 80);

        if (result.images.length === 0 || (!result.images[0].url && !result.images[0].b64Json)) {
            throw new Error('No image generated');
        }

        // 如果返回的是 base64，可能需要上传到存储
        const imageUrl = result.images[0].url ?? `data:image/png;base64,${result.images[0].b64Json}`;

        return {
            url: imageUrl,
            metadata: { width: 1024, height: 1024, format: 'png' }
        };
    }

    // TTS 生成
    private async executeTTS(job: MediaJob): Promise<{ url: string; metadata?: MediaAsset['metadata'] }> {
        if (!job.inputPrompt) {
            throw new Error('TTS requires text input');
        }

        await this.updateJobStatus(job.id, 'processing', 30);

        const adapter = await adapterRegistry.createSystemAdapter('openai_compatible');
        const result = await adapter.generateAudio(job.inputPrompt, {
            model: job.model ?? 'tts-1',
            voice: 'alloy',
            responseFormat: 'mp3'
        });

        await this.updateJobStatus(job.id, 'processing', 80);

        // 将 Buffer 转为 data URL (实际应上传到存储)
        const audioUrl = `data:audio/mp3;base64,${result.audioData.toString('base64')}`;

        return {
            url: audioUrl,
            metadata: { format: 'mp3' }
        };
    }

    // 视频生成 (使用 Veo 等)
    private async executeVideoGeneration(job: MediaJob): Promise<{ url: string; metadata?: MediaAsset['metadata'] }> {
        if (!job.inputPrompt) {
            throw new Error('Video generation requires a prompt');
        }

        await this.updateJobStatus(job.id, 'processing', 10);

        // 模拟进度更新 (实际应使用轮询或流式回调)
        for (let progress = 20; progress <= 80; progress += 20) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.updateJobStatus(job.id, 'processing', progress);
        }

        // 占位实现 - 实际应调用 Gemini Veo API
        // const result = await veoClient.generate(job.inputPrompt);

        throw new Error('Video generation not yet implemented - requires Veo API integration');
    }

    // 音频生成
    private async executeAudioGeneration(job: MediaJob): Promise<{ url: string; metadata?: MediaAsset['metadata'] }> {
        // 占位实现 - 可以集成 Suno、Stable Audio 等
        throw new Error('Audio generation not yet implemented');
    }

    // 更新任务状态
    private async updateJobStatus(jobId: string, status: JobStatus, progress: number): Promise<void> {
        await pool.execute(
            `UPDATE media_jobs SET status = ?, progress = ?, started_at = COALESCE(started_at, NOW()) WHERE id = ?`,
            [status, progress, jobId]
        );

        this.emit('progress', {
            jobId,
            progress,
            status,
            message: `Progress: ${progress}%`
        } as JobProgressEvent);
    }

    // 获取资产类型
    private getAssetTypeFromPipeline(pipelineType: PipelineType): MediaType {
        switch (pipelineType) {
            case 'image_gen':
            case 'image_edit':
                return 'image';
            case 'video_gen':
                return 'video';
            case 'audio_gen':
            case 'tts':
                return 'audio';
            default:
                return 'image';
        }
    }

    // 行转对象
    private rowToJob(row: RowDataPacket): MediaJob {
        return {
            id: row.id,
            userId: row.user_id,
            workflowRunId: row.workflow_run_id,
            pipelineType: row.pipeline_type,
            status: row.status,
            inputAssetId: row.input_asset_id,
            inputPrompt: row.input_prompt,
            outputAssetId: row.output_asset_id,
            progress: row.progress,
            providerId: row.provider_id,
            model: row.model,
            errorMessage: row.error_message,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            createdAt: row.created_at
        };
    }
}

export const mediaPipeline = new MediaPipeline();
