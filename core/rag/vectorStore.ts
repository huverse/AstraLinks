/**
 * 向量存储
 * 
 * @module core/rag/vectorStore
 * @description 内存向量存储 + JSON 文件持久化
 */

import { DocumentChunk, VectorSearchResult, DEFAULT_RAG_CONFIG } from './types';
import { cosineSimilarity } from './embeddings';

// ============================================
// 向量存储类
// ============================================

export class VectorStore {
    private chunks: Map<string, DocumentChunk> = new Map();
    private workspaceId: string;

    constructor(workspaceId: string) {
        this.workspaceId = workspaceId;
    }

    /**
     * 添加带向量的文档块
     */
    add(chunk: DocumentChunk): void {
        if (!chunk.embedding) {
            throw new Error('Chunk must have embedding');
        }
        this.chunks.set(chunk.id, chunk);
    }

    /**
     * 批量添加
     */
    addBatch(chunks: DocumentChunk[]): void {
        for (const chunk of chunks) {
            this.add(chunk);
        }
    }

    /**
     * 删除文档的所有块
     */
    deleteByDocument(documentId: string): number {
        let deleted = 0;
        for (const [id, chunk] of this.chunks.entries()) {
            if (chunk.documentId === documentId) {
                this.chunks.delete(id);
                deleted++;
            }
        }
        return deleted;
    }

    /**
     * 相似度搜索
     */
    search(
        queryEmbedding: number[],
        topK: number = DEFAULT_RAG_CONFIG.topK,
        threshold: number = DEFAULT_RAG_CONFIG.threshold,
        documentIds?: string[]
    ): VectorSearchResult[] {
        const results: VectorSearchResult[] = [];

        for (const chunk of this.chunks.values()) {
            // 过滤文档
            if (documentIds && documentIds.length > 0) {
                if (!documentIds.includes(chunk.documentId)) {
                    continue;
                }
            }

            if (!chunk.embedding) continue;

            const score = cosineSimilarity(queryEmbedding, chunk.embedding);
            const distance = 1 - score;

            if (score >= threshold) {
                results.push({ chunk, score, distance });
            }
        }

        // 按相似度排序
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, topK);
    }

    /**
     * 获取所有块
     */
    getAll(): DocumentChunk[] {
        return Array.from(this.chunks.values());
    }

    /**
     * 获取文档的块
     */
    getByDocument(documentId: string): DocumentChunk[] {
        return Array.from(this.chunks.values()).filter(c => c.documentId === documentId);
    }

    /**
     * 块数量
     */
    size(): number {
        return this.chunks.size;
    }

    /**
     * 导出为 JSON (用于持久化)
     */
    toJSON(): any {
        return {
            workspaceId: this.workspaceId,
            chunks: Array.from(this.chunks.values()),
        };
    }

    /**
     * 从 JSON 恢复
     */
    static fromJSON(data: any): VectorStore {
        const store = new VectorStore(data.workspaceId);
        for (const chunk of data.chunks || []) {
            store.chunks.set(chunk.id, chunk);
        }
        return store;
    }

    /**
     * 清空
     */
    clear(): void {
        this.chunks.clear();
    }
}

// ============================================
// 全局向量存储管理
// ============================================

const vectorStores: Map<string, VectorStore> = new Map();

/**
 * 获取工作区的向量存储
 */
export function getVectorStore(workspaceId: string): VectorStore {
    let store = vectorStores.get(workspaceId);
    if (!store) {
        store = new VectorStore(workspaceId);
        vectorStores.set(workspaceId, store);
    }
    return store;
}

/**
 * 删除工作区的向量存储
 */
export function deleteVectorStore(workspaceId: string): void {
    vectorStores.delete(workspaceId);
}

// ============================================
// RAG 管道函数
// ============================================

/**
 * 构建 RAG 上下文
 */
export function buildRAGContext(results: VectorSearchResult[], maxTokens: number = 2000): string {
    const contexts: string[] = [];
    let totalChars = 0;
    const charsPerToken = 4; // 粗略估算

    for (const result of results) {
        const content = result.chunk.content;
        if (totalChars + content.length > maxTokens * charsPerToken) {
            break;
        }
        contexts.push(`[来源: 文档块 #${result.chunk.index + 1}]\n${content}`);
        totalChars += content.length;
    }

    if (contexts.length === 0) {
        return '';
    }

    return `以下是与问题相关的参考资料：

${contexts.join('\n\n---\n\n')}

请基于以上参考资料回答问题。如果资料中没有相关信息，请诚实说明。`;
}
