/**
 * RAG (检索增强生成) 类型定义
 * 
 * @module core/rag/types
 * @description 知识库文档、块、向量类型
 */

// ============================================
// 文档类型
// ============================================

/** 知识库文档 */
export interface KnowledgeDocument {
    id: string;
    workspaceId: string;
    name: string;
    type: 'txt' | 'md' | 'pdf';
    content: string;
    size: number;
    chunkCount: number;
    createdAt: number;
    updatedAt: number;
}

/** 文档块 */
export interface DocumentChunk {
    id: string;
    documentId: string;
    workspaceId: string;
    content: string;
    index: number;
    startOffset: number;
    endOffset: number;
    embedding?: number[];
    metadata?: {
        title?: string;
        section?: string;
    };
}

// ============================================
// 向量存储类型
// ============================================

/** 向量搜索结果 */
export interface VectorSearchResult {
    chunk: DocumentChunk;
    score: number;
    distance: number;
}

/** 向量存储配置 */
export interface VectorStoreConfig {
    workspaceId: string;
    embeddingModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
}

// ============================================
// 知识库类型
// ============================================

/** 知识库 */
export interface KnowledgeBase {
    id: string;
    workspaceId: string;
    name: string;
    description?: string;
    documentCount: number;
    totalChunks: number;
    createdAt: number;
    updatedAt: number;
}

/** RAG 查询请求 */
export interface RAGQueryRequest {
    workspaceId: string;
    query: string;
    topK?: number;
    threshold?: number;
    documentIds?: string[];
}

/** RAG 查询结果 */
export interface RAGQueryResult {
    query: string;
    results: VectorSearchResult[];
    context: string;
    totalTokens: number;
}

// ============================================
// 默认配置
// ============================================

export const DEFAULT_RAG_CONFIG = {
    chunkSize: 500,         // 每块约 500 字符
    chunkOverlap: 50,       // 重叠 50 字符
    topK: 5,                // 返回 Top 5 结果
    threshold: 0.7,         // 相似度阈值
    embeddingModel: 'text-embedding-3-small',
};
