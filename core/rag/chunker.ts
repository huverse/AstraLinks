/**
 * 文本分块器
 * 
 * @module core/rag/chunker
 * @description 将长文本分割为适合 Embedding 的小块
 */

import { DocumentChunk, DEFAULT_RAG_CONFIG } from './types';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// 分块策略
// ============================================

export interface ChunkOptions {
    chunkSize?: number;
    chunkOverlap?: number;
    separators?: string[];
}

/**
 * 按段落和句子分割文本
 */
function splitBySeparators(text: string, separators: string[]): string[] {
    let parts = [text];

    for (const sep of separators) {
        const newParts: string[] = [];
        for (const part of parts) {
            const splits = part.split(sep);
            for (let i = 0; i < splits.length; i++) {
                if (splits[i].trim()) {
                    newParts.push(splits[i] + (i < splits.length - 1 ? sep : ''));
                }
            }
        }
        parts = newParts;
    }

    return parts;
}

/**
 * 将文本分割为块
 */
export function chunkText(
    text: string,
    documentId: string,
    workspaceId: string,
    options: ChunkOptions = {}
): DocumentChunk[] {
    const {
        chunkSize = DEFAULT_RAG_CONFIG.chunkSize,
        chunkOverlap = DEFAULT_RAG_CONFIG.chunkOverlap,
        separators = ['\n\n', '\n', '。', '！', '？', '.', '!', '?', ' '],
    } = options;

    const chunks: DocumentChunk[] = [];

    // 先按自然段落分割
    const paragraphs = splitBySeparators(text, separators.slice(0, 2));

    let currentChunk = '';
    let currentOffset = 0;
    let chunkIndex = 0;

    for (const para of paragraphs) {
        // 如果当前段落太长，需要进一步分割
        if (para.length > chunkSize) {
            // 先保存当前块
            if (currentChunk.trim()) {
                chunks.push(createChunk(
                    currentChunk.trim(),
                    documentId,
                    workspaceId,
                    chunkIndex++,
                    currentOffset,
                    currentOffset + currentChunk.length
                ));
                currentOffset += currentChunk.length - chunkOverlap;
                currentChunk = currentChunk.slice(-chunkOverlap);
            }

            // 按句子分割长段落
            const sentences = splitBySeparators(para, separators.slice(2));
            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > chunkSize) {
                    if (currentChunk.trim()) {
                        chunks.push(createChunk(
                            currentChunk.trim(),
                            documentId,
                            workspaceId,
                            chunkIndex++,
                            currentOffset,
                            currentOffset + currentChunk.length
                        ));
                        currentOffset += currentChunk.length - chunkOverlap;
                        currentChunk = currentChunk.slice(-chunkOverlap);
                    }
                }
                currentChunk += sentence;
            }
        } else {
            // 正常累积
            if (currentChunk.length + para.length > chunkSize) {
                if (currentChunk.trim()) {
                    chunks.push(createChunk(
                        currentChunk.trim(),
                        documentId,
                        workspaceId,
                        chunkIndex++,
                        currentOffset,
                        currentOffset + currentChunk.length
                    ));
                    currentOffset += currentChunk.length - chunkOverlap;
                    currentChunk = currentChunk.slice(-chunkOverlap);
                }
            }
            currentChunk += para + '\n';
        }
    }

    // 保存最后一块
    if (currentChunk.trim()) {
        chunks.push(createChunk(
            currentChunk.trim(),
            documentId,
            workspaceId,
            chunkIndex,
            currentOffset,
            currentOffset + currentChunk.length
        ));
    }

    return chunks;
}

/**
 * 创建文档块
 */
function createChunk(
    content: string,
    documentId: string,
    workspaceId: string,
    index: number,
    startOffset: number,
    endOffset: number
): DocumentChunk {
    return {
        id: uuidv4(),
        documentId,
        workspaceId,
        content,
        index,
        startOffset,
        endOffset,
    };
}

/**
 * 估算文本的 token 数量
 */
export function estimateTokens(text: string): number {
    // 粗略估算: 英文约 4 字符/token, 中文约 2 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
}
