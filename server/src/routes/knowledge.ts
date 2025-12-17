/**
 * 知识库 API
 * 
 * @module server/src/routes/knowledge
 * @description 知识库文档管理和 RAG 查询 (支持 txt/md/pdf)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authMiddleware } from '../middleware/auth';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse');
// Handle both default export and direct export
const pdfParse = pdfParseModule.default || pdfParseModule;

const router = Router();
router.use(authMiddleware);

// ============================================
// 向量存储 + 文件持久化
// ============================================

interface DocumentChunk {
    id: string;
    documentId: string;
    workspaceId: string;
    content: string;
    index: number;
    embedding?: number[];
}

interface VectorStore {
    chunks: DocumentChunk[];
}

const vectorStores: Map<string, VectorStore> = new Map();

// 向量存储目录
const VECTOR_STORE_DIR = process.env.VECTOR_STORE_PATH || path.join(process.cwd(), 'data', 'vectors');

// 确保目录存在
function ensureVectorStoreDir() {
    if (!fs.existsSync(VECTOR_STORE_DIR)) {
        fs.mkdirSync(VECTOR_STORE_DIR, { recursive: true });
    }
}

// 获取向量存储文件路径
function getVectorStorePath(workspaceId: string): string {
    return path.join(VECTOR_STORE_DIR, `${workspaceId}.json`);
}

// 从文件加载向量存储
function loadVectorStore(workspaceId: string): VectorStore {
    const filePath = getVectorStorePath(workspaceId);
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(data);
            console.log(`[Knowledge] Loaded ${parsed.chunks?.length || 0} chunks for workspace ${workspaceId}`);
            return parsed;
        }
    } catch (e: any) {
        console.error(`[Knowledge] Failed to load vector store for ${workspaceId}:`, e.message);
    }
    return { chunks: [] };
}

// 保存向量存储到文件
function saveVectorStore(workspaceId: string, store: VectorStore): void {
    ensureVectorStoreDir();
    const filePath = getVectorStorePath(workspaceId);
    try {
        fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
        console.log(`[Knowledge] Saved ${store.chunks.length} chunks for workspace ${workspaceId}`);
    } catch (e: any) {
        console.error(`[Knowledge] Failed to save vector store for ${workspaceId}:`, e.message);
    }
}

// 获取工作区的向量存储 (自动从文件加载)
function getVectorStore(workspaceId: string): VectorStore {
    let store = vectorStores.get(workspaceId);
    if (!store) {
        // 尝试从文件加载
        store = loadVectorStore(workspaceId);
        vectorStores.set(workspaceId, store);
    }
    return store;
}

// ============================================
// 文本分块
// ============================================

function chunkText(text: string, documentId: string, workspaceId: string, chunkSize = 500, overlap = 50): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const paragraphs = text.split(/\n\n+/);

    let currentChunk = '';
    let chunkIndex = 0;

    for (const para of paragraphs) {
        if (currentChunk.length + para.length > chunkSize) {
            if (currentChunk.trim()) {
                chunks.push({
                    id: uuidv4(),
                    documentId,
                    workspaceId,
                    content: currentChunk.trim(),
                    index: chunkIndex++,
                });
            }
            currentChunk = para.slice(-overlap) + '\n' + para;
        } else {
            currentChunk += '\n' + para;
        }
    }

    if (currentChunk.trim()) {
        chunks.push({
            id: uuidv4(),
            documentId,
            workspaceId,
            content: currentChunk.trim(),
            index: chunkIndex,
        });
    }

    return chunks;
}

// ============================================
// Embedding 调用
// ============================================

async function getEmbedding(text: string, apiKey: string, provider: string = 'openai'): Promise<number[]> {
    if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/text-embedding-004',
                content: { parts: [{ text }] }
            }),
        });
        if (!response.ok) throw new Error('Gemini embedding failed');
        const data = await response.json() as any;
        return data.embedding.values;
    }

    // OpenAI
    const url = 'https://api.openai.com/v1/embeddings';
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text,
        }),
    });
    if (!response.ok) throw new Error('OpenAI embedding failed');
    const data = await response.json() as any;
    return data.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================
// 验证工作区所有权
// ============================================

async function verifyOwnership(workspaceId: string, userId: number): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM workspaces WHERE id = ? AND owner_id = ? AND is_deleted = FALSE`,
        [workspaceId, userId]
    );
    return rows.length > 0;
}

// ============================================
// API 路由
// ============================================

/**
 * 获取知识库文档列表
 * GET /api/knowledge/:workspaceId/documents
 */
router.get('/:workspaceId/documents', async (req: Request, res: Response): Promise<void> => {
    try {
        const { workspaceId } = req.params;
        const userId = (req as any).user?.id;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM knowledge_documents WHERE workspace_id = ? ORDER BY created_at DESC`,
            [workspaceId]
        );

        res.json({ documents: rows });
    } catch (error: any) {
        console.error('[Knowledge] Get documents error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 上传文档
 * POST /api/knowledge/:workspaceId/documents
 */
router.post('/:workspaceId/documents', async (req: Request, res: Response): Promise<void> => {
    try {
        const { workspaceId } = req.params;
        const userId = (req as any).user?.id;
        const { name, content, type = 'txt', apiKey, provider = 'openai' } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        if (!content || !apiKey) {
            res.status(400).json({ error: '缺少文档内容或 API Key' });
            return;
        }

        const documentId = uuidv4();
        const chunks = chunkText(content, documentId, workspaceId);

        // 生成 Embedding
        console.log(`[Knowledge] Processing ${chunks.length} chunks...`);
        for (const chunk of chunks) {
            try {
                chunk.embedding = await getEmbedding(chunk.content, apiKey, provider);
            } catch (e: any) {
                console.error(`[Knowledge] Embedding error for chunk ${chunk.index}:`, e.message);
            }
            // 避免速率限制
            await new Promise(r => setTimeout(r, 100));
        }

        // 存入向量存储
        const store = getVectorStore(workspaceId);
        store.chunks.push(...chunks);

        // 持久化到文件
        saveVectorStore(workspaceId, store);

        // 存入数据库
        await pool.execute(
            `INSERT INTO knowledge_documents (id, workspace_id, name, type, content, chunk_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [documentId, workspaceId, name || 'Untitled', type, content, chunks.length]
        );

        res.json({
            id: documentId,
            name,
            type,
            chunkCount: chunks.length,
            message: '文档已处理完成'
        });
    } catch (error: any) {
        console.error('[Knowledge] Upload document error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 删除文档
 * DELETE /api/knowledge/:workspaceId/documents/:documentId
 */
router.delete('/:workspaceId/documents/:documentId', async (req: Request, res: Response): Promise<void> => {
    try {
        const { workspaceId, documentId } = req.params;
        const userId = (req as any).user?.id;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        // 从向量存储删除
        const store = getVectorStore(workspaceId);
        store.chunks = store.chunks.filter(c => c.documentId !== documentId);

        // 持久化到文件
        saveVectorStore(workspaceId, store);

        // 从数据库删除
        await pool.execute(
            `DELETE FROM knowledge_documents WHERE id = ? AND workspace_id = ?`,
            [documentId, workspaceId]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Knowledge] Delete document error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 上传 PDF 文件 (Base64)
 * POST /api/knowledge/:workspaceId/documents/pdf
 */
router.post('/:workspaceId/documents/pdf', async (req: Request, res: Response): Promise<void> => {
    try {
        const { workspaceId } = req.params;
        const userId = (req as any).user?.id;
        const { name, fileBase64, apiKey, provider = 'openai' } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        if (!fileBase64 || !apiKey) {
            res.status(400).json({ error: '缺少 PDF 文件或 API Key' });
            return;
        }

        // 解析 Base64 PDF
        console.log('[Knowledge] Parsing PDF...');
        const buffer = Buffer.from(fileBase64, 'base64');

        let pdfText: string;
        try {
            const pdfData = await pdfParse(buffer);
            pdfText = pdfData.text;
            console.log(`[Knowledge] PDF parsed: ${pdfData.numpages} pages, ${pdfText.length} chars`);
        } catch (pdfError: any) {
            console.error('[Knowledge] PDF parse error:', pdfError);
            res.status(400).json({ error: `PDF 解析失败: ${pdfError.message}` });
            return;
        }

        if (!pdfText.trim()) {
            res.status(400).json({ error: 'PDF 内容为空或无法提取文本' });
            return;
        }

        const documentId = uuidv4();
        const chunks = chunkText(pdfText, documentId, workspaceId);

        // 生成 Embedding
        console.log(`[Knowledge] Processing ${chunks.length} chunks from PDF...`);
        for (const chunk of chunks) {
            try {
                chunk.embedding = await getEmbedding(chunk.content, apiKey, provider);
            } catch (e: any) {
                console.error(`[Knowledge] Embedding error for chunk ${chunk.index}:`, e.message);
            }
            await new Promise(r => setTimeout(r, 100));
        }

        // 存入向量存储
        const store = getVectorStore(workspaceId);
        store.chunks.push(...chunks);

        // 持久化到文件
        saveVectorStore(workspaceId, store);

        // 存入数据库
        await pool.execute(
            `INSERT INTO knowledge_documents (id, workspace_id, name, type, content, chunk_count, created_at, updated_at)
             VALUES (?, ?, ?, 'pdf', ?, ?, NOW(), NOW())`,
            [documentId, workspaceId, name || 'PDF文档', pdfText.substring(0, 65000), chunks.length]
        );

        res.json({
            id: documentId,
            name: name || 'PDF文档',
            type: 'pdf',
            chunkCount: chunks.length,
            charCount: pdfText.length,
            message: 'PDF 文档已处理完成'
        });
    } catch (error: any) {
        console.error('[Knowledge] PDF upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * RAG 查询
 * POST /api/knowledge/:workspaceId/query
 */
router.post('/:workspaceId/query', async (req: Request, res: Response): Promise<void> => {
    try {
        const { workspaceId } = req.params;
        const userId = (req as any).user?.id;
        const { query, apiKey, provider = 'openai', topK = 5, threshold = 0.7 } = req.body;

        if (!await verifyOwnership(workspaceId, userId)) {
            res.status(403).json({ error: '无权访问' });
            return;
        }

        if (!query || !apiKey) {
            res.status(400).json({ error: '缺少查询内容或 API Key' });
            return;
        }

        // 获取查询向量
        const queryEmbedding = await getEmbedding(query, apiKey, provider);

        // 搜索相似块
        const store = getVectorStore(workspaceId);
        const results: { chunk: DocumentChunk; score: number }[] = [];

        for (const chunk of store.chunks) {
            if (!chunk.embedding) continue;
            const score = cosineSimilarity(queryEmbedding, chunk.embedding);
            if (score >= threshold) {
                results.push({ chunk, score });
            }
        }

        // 排序并取 Top K
        results.sort((a, b) => b.score - a.score);
        const topResults = results.slice(0, topK);

        // 构建上下文
        const context = topResults.map((r, i) =>
            `[参考资料 ${i + 1}] (相似度: ${(r.score * 100).toFixed(1)}%)\n${r.chunk.content}`
        ).join('\n\n---\n\n');

        res.json({
            query,
            results: topResults.map(r => ({
                content: r.chunk.content,
                score: r.score,
                documentId: r.chunk.documentId,
            })),
            context,
            totalChunks: store.chunks.length,
        });
    } catch (error: any) {
        console.error('[Knowledge] Query error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
