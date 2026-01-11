/**
 * KnowledgeManager - 知识库管理器
 * 统一管理文档、向量存储、RAG 查询
 */

import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { adapterRegistry } from '../adapters';
import { summarizer } from './Summarizer';
import { mindmapGenerator } from './MindmapGenerator';
import {
    KnowledgeDocument,
    DocumentChunk,
    VectorStore,
    RAGQueryRequest,
    RAGQueryResponse,
    MindmapNode
} from './types';

export class KnowledgeManager {
    private vectorStores: Map<string, VectorStore> = new Map();
    private storageDir: string;

    constructor() {
        this.storageDir = process.env.VECTOR_STORE_PATH ?? path.join(process.cwd(), 'data', 'vectors');
        this.ensureStorageDir();
    }

    private ensureStorageDir(): void {
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    // 获取向量存储
    getVectorStore(workspaceId: string): VectorStore {
        let store = this.vectorStores.get(workspaceId);
        if (!store) {
            store = this.loadVectorStore(workspaceId);
            this.vectorStores.set(workspaceId, store);
        }
        return store;
    }

    // 从文件加载向量存储
    private loadVectorStore(workspaceId: string): VectorStore {
        const filePath = path.join(this.storageDir, `${workspaceId}.json`);
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.error(`[KnowledgeManager] Load error for ${workspaceId}:`, err);
        }
        return { chunks: [] };
    }

    // 保存向量存储
    saveVectorStore(workspaceId: string, store: VectorStore): void {
        const filePath = path.join(this.storageDir, `${workspaceId}.json`);
        store.metadata = {
            lastUpdated: new Date().toISOString(),
            totalDocuments: new Set(store.chunks.map(c => c.documentId)).size
        };
        fs.writeFileSync(filePath, JSON.stringify(store), 'utf-8');
    }

    // 获取 Embedding
    async getEmbedding(
        text: string,
        apiKey: string,
        provider: string = 'openai',
        model?: string
    ): Promise<number[]> {
        if (provider === 'gemini') {
            const embeddingModel = model ?? 'gemini-embedding-001';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent?key=${apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: { parts: [{ text }] } })
            });

            if (!response.ok) {
                const err = await response.json() as any;
                throw new Error(err.error?.message ?? 'Gemini embedding failed');
            }

            const data = await response.json() as any;
            return data.embedding.values;
        }

        // OpenAI
        const embeddingModel = model ?? 'text-embedding-3-small';
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model: embeddingModel, input: text })
        });

        if (!response.ok) {
            const err = await response.json() as any;
            throw new Error(err.error?.message ?? 'OpenAI embedding failed');
        }

        const data = await response.json() as any;
        return data.data[0].embedding;
    }

    // 余弦相似度
    cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // 文本分块
    chunkText(
        text: string,
        documentId: string,
        workspaceId: string,
        chunkSize: number = 500,
        overlap: number = 50
    ): DocumentChunk[] {
        const chunks: DocumentChunk[] = [];
        const paragraphs = text.split(/\n\n+/);

        let currentChunk = '';
        let chunkIndex = 0;

        for (const para of paragraphs) {
            if (currentChunk.length + para.length > chunkSize) {
                if (currentChunk.trim()) {
                    chunks.push({
                        id: crypto.randomUUID(),
                        documentId,
                        workspaceId,
                        content: currentChunk.trim(),
                        index: chunkIndex++
                    });
                }
                currentChunk = para.slice(-overlap) + '\n' + para;
            } else {
                currentChunk += '\n' + para;
            }
        }

        if (currentChunk.trim()) {
            chunks.push({
                id: crypto.randomUUID(),
                documentId,
                workspaceId,
                content: currentChunk.trim(),
                index: chunkIndex
            });
        }

        return chunks;
    }

    // RAG 查询
    async query(request: RAGQueryRequest): Promise<RAGQueryResponse> {
        const { workspaceId, query, apiKey, provider = 'openai', embeddingModel, topK = 5, threshold = 0.7, documentIds } = request;

        // 获取查询向量
        const queryEmbedding = await this.getEmbedding(query, apiKey, provider, embeddingModel);

        // 搜索
        const store = this.getVectorStore(workspaceId);
        const results: { chunk: DocumentChunk; score: number }[] = [];

        for (const chunk of store.chunks) {
            // 过滤指定文档
            if (documentIds && documentIds.length > 0 && !documentIds.includes(chunk.documentId)) {
                continue;
            }

            if (!chunk.embedding) continue;

            const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
            if (score >= threshold) {
                results.push({ chunk, score });
            }
        }

        // 排序取 Top K
        results.sort((a, b) => b.score - a.score);
        const topResults = results.slice(0, topK);

        // 构建上下文
        const context = topResults.map((r, i) =>
            `[参考资料 ${i + 1}] (相似度: ${(r.score * 100).toFixed(1)}%)\n${r.chunk.content}`
        ).join('\n\n---\n\n');

        return {
            query,
            results: topResults.map(r => ({
                content: r.chunk.content,
                score: r.score,
                documentId: r.chunk.documentId
            })),
            context,
            totalChunks: store.chunks.length
        };
    }

    // 生成文档总结
    async summarizeDocument(
        documentId: string,
        workspaceId: string,
        options: {
            userId: number;
            providerId?: string;
            credentialId?: string;
            model?: string;
            style?: 'brief' | 'detailed' | 'bullet';
        }
    ): Promise<string> {
        // 获取文档内容
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT content FROM knowledge_documents WHERE id = ? AND workspace_id = ?',
            [documentId, workspaceId]
        );

        if (rows.length === 0) {
            throw new Error('Document not found');
        }

        const content = rows[0].content as string;
        const summary = await summarizer.summarize(content, options);

        // 保存总结
        await pool.execute(
            'UPDATE knowledge_documents SET summary = ?, updated_at = NOW() WHERE id = ?',
            [summary, documentId]
        );

        return summary;
    }

    // 生成思维导图
    async generateMindmap(
        documentId: string,
        workspaceId: string,
        options: {
            userId: number;
            providerId?: string;
            credentialId?: string;
            model?: string;
            maxDepth?: number;
        }
    ): Promise<MindmapNode> {
        // 获取文档内容
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT name, content FROM knowledge_documents WHERE id = ? AND workspace_id = ?',
            [documentId, workspaceId]
        );

        if (rows.length === 0) {
            throw new Error('Document not found');
        }

        const { name, content } = rows[0] as { name: string; content: string };
        const mindmap = await mindmapGenerator.generate(content, {
            ...options,
            title: name
        });

        // 保存思维导图
        await pool.execute(
            'UPDATE knowledge_documents SET mindmap_json = ?, updated_at = NOW() WHERE id = ?',
            [JSON.stringify(mindmap), documentId]
        );

        return mindmap;
    }

    // 获取文档列表
    async getDocuments(workspaceId: string): Promise<KnowledgeDocument[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id, workspace_id, name, type, source_type, source_url, summary,
                    mindmap_json, chunk_count, embedding_model, embedding_provider,
                    created_at, updated_at
             FROM knowledge_documents
             WHERE workspace_id = ?
             ORDER BY created_at DESC`,
            [workspaceId]
        );

        return rows.map(row => ({
            id: row.id,
            workspaceId: row.workspace_id,
            name: row.name,
            type: row.type,
            sourceType: row.source_type ?? 'file',
            sourceUrl: row.source_url,
            summary: row.summary,
            mindmapJson: row.mindmap_json ? JSON.parse(row.mindmap_json) : undefined,
            chunkCount: row.chunk_count,
            embeddingModel: row.embedding_model,
            embeddingProvider: row.embedding_provider,
            status: 'ready',
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }

    // 删除文档
    async deleteDocument(documentId: string, workspaceId: string): Promise<void> {
        // 从向量存储删除
        const store = this.getVectorStore(workspaceId);
        store.chunks = store.chunks.filter(c => c.documentId !== documentId);
        this.saveVectorStore(workspaceId, store);

        // 从数据库删除
        await pool.execute(
            'DELETE FROM knowledge_documents WHERE id = ? AND workspace_id = ?',
            [documentId, workspaceId]
        );
    }

    // 获取工作区统计
    async getStats(workspaceId: string): Promise<{
        documentCount: number;
        chunkCount: number;
        lastUpdated?: string;
    }> {
        const store = this.getVectorStore(workspaceId);
        const documentIds = new Set(store.chunks.map(c => c.documentId));

        return {
            documentCount: documentIds.size,
            chunkCount: store.chunks.length,
            lastUpdated: store.metadata?.lastUpdated
        };
    }
}

export const knowledgeManager = new KnowledgeManager();
