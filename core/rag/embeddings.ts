/**
 * Embedding 模块
 * 
 * @module core/rag/embeddings
 * @description 调用 OpenAI/Gemini Embedding API 生成向量
 */

// ============================================
// Embedding 类型
// ============================================

export interface EmbeddingOptions {
    model?: string;
    apiKey: string;
    baseUrl?: string;
    provider?: 'openai' | 'gemini';
}

export interface EmbeddingResult {
    embedding: number[];
    tokens: number;
}

// ============================================
// OpenAI Embedding
// ============================================

/**
 * 调用 OpenAI Embedding API
 */
async function openAIEmbed(
    text: string,
    apiKey: string,
    model: string = 'text-embedding-3-small',
    baseUrl?: string
): Promise<EmbeddingResult> {
    const url = `${baseUrl || 'https://api.openai.com/v1'}/embeddings`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            input: text,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(`OpenAI Embedding error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json() as any;
    return {
        embedding: data.data[0].embedding,
        tokens: data.usage?.total_tokens || 0,
    };
}

// ============================================
// Gemini Embedding
// ============================================

/**
 * 调用 Gemini Embedding API
 */
async function geminiEmbed(
    text: string,
    apiKey: string,
    model: string = 'text-embedding-004'
): Promise<EmbeddingResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: `models/${model}`,
            content: {
                parts: [{ text }]
            }
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(`Gemini Embedding error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json() as any;
    return {
        embedding: data.embedding.values,
        tokens: Math.ceil(text.length / 4), // 估算
    };
}

// ============================================
// 统一接口
// ============================================

/**
 * 生成文本的 Embedding 向量
 */
export async function embed(text: string, options: EmbeddingOptions): Promise<EmbeddingResult> {
    const { provider = 'openai', apiKey, model, baseUrl } = options;

    if (provider === 'gemini') {
        return geminiEmbed(text, apiKey, model);
    }

    return openAIEmbed(text, apiKey, model, baseUrl);
}

/**
 * 批量生成 Embedding (带速率限制)
 */
export async function embedBatch(
    texts: string[],
    options: EmbeddingOptions,
    batchSize: number = 10,
    delayMs: number = 100
): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        const batchResults = await Promise.all(
            batch.map(text => embed(text, options))
        );

        results.push(...batchResults);

        // 避免速率限制
        if (i + batchSize < texts.length) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    return results;
}

// ============================================
// 相似度计算
// ============================================

/**
 * 计算余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (normA * normB);
}
