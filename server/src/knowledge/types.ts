/**
 * Knowledge Module Types - 知识库系统类型定义
 */

// 文档来源类型
export type DocumentSourceType = 'file' | 'url' | 'api';

// 文档状态
export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'error';

// 训练任务状态
export type TrainingJobStatus = 'pending' | 'searching' | 'crawling' | 'processing' | 'completed' | 'failed';

// 文档块
export interface DocumentChunk {
    id: string;
    documentId: string;
    workspaceId: string;
    content: string;
    index: number;
    embedding?: number[];
    metadata?: {
        pageNumber?: number;
        section?: string;
    };
}

// 知识库文档
export interface KnowledgeDocument {
    id: string;
    workspaceId: string;
    name: string;
    type: string;
    content?: string;
    sourceType: DocumentSourceType;
    sourceUrl?: string;
    summary?: string;
    mindmapJson?: MindmapNode;
    chunkCount: number;
    embeddingModel?: string;
    embeddingProvider?: string;
    status: DocumentStatus;
    createdAt: string;
    updatedAt: string;
}

// 思维导图节点
export interface MindmapNode {
    id: string;
    text: string;
    children?: MindmapNode[];
    level?: number;
    color?: string;
}

// RAG 查询请求
export interface RAGQueryRequest {
    workspaceId: string;
    query: string;
    apiKey: string;
    provider?: string;
    embeddingModel?: string;
    topK?: number;
    threshold?: number;
    documentIds?: string[];
}

// RAG 查询结果
export interface RAGQueryResult {
    content: string;
    score: number;
    documentId: string;
    documentName?: string;
    metadata?: Record<string, unknown>;
}

// RAG 查询响应
export interface RAGQueryResponse {
    query: string;
    results: RAGQueryResult[];
    context: string;
    totalChunks: number;
}

// 总结请求
export interface SummarizeRequest {
    documentId: string;
    apiKey: string;
    provider?: string;
    model?: string;
    style?: 'brief' | 'detailed' | 'bullet';
}

// 思维导图请求
export interface MindmapRequest {
    documentId: string;
    apiKey: string;
    provider?: string;
    model?: string;
    maxDepth?: number;
}

// 训练任务
export interface KnowledgeTrainingJob {
    id: string;
    workspaceId: string;
    topic: string;
    searchKeywords: string[];
    sourceUrls?: string[];
    status: TrainingJobStatus;
    documentsFound: number;
    documentsAdded: number;
    scheduleCron?: string;
    isEnabled: boolean;
    lastRunAt?: string;
    nextRunAt?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

// 训练历史记录
export interface TrainingHistoryEntry {
    id: string;
    jobId: string;
    documentId: string;
    sourceUrl?: string;
    title?: string;
    summary?: string;
    status: 'added' | 'rejected' | 'reverted';
    reviewedBy?: number;
    reviewedAt?: string;
    createdAt: string;
}

// 向量存储
export interface VectorStore {
    chunks: DocumentChunk[];
    metadata?: {
        lastUpdated: string;
        totalDocuments: number;
    };
}

// Embedding 提供商接口
export interface IEmbeddingProvider {
    getEmbedding(text: string): Promise<number[]>;
    getBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

// 总结器接口
export interface ISummarizer {
    summarize(content: string, style: string): Promise<string>;
}

// 思维导图生成器接口
export interface IMindmapGenerator {
    generate(content: string, maxDepth: number): Promise<MindmapNode>;
}
