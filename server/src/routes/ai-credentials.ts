/**
 * AI Credentials API Routes
 * 管理用户的 AI API 凭证
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { credentialService } from '../adapters/encryption/CredentialService';
import { adapterRegistry } from '../adapters';

const router = Router();

interface AuthRequest extends Request {
    user?: { id: number; role?: string };
}

// GET /api/ai-credentials - 获取用户凭证列表（不含敏感信息）
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    const credentials = await credentialService.listUserCredentials(userId);

    const safeCredentials = credentials.map(c => ({
        id: c.id,
        providerId: c.providerId,
        name: c.name,
        status: c.status,
        lastUsedAt: c.lastUsedAt,
        lastError: c.lastError,
        createdAt: c.createdAt
    }));

    res.json({ credentials: safeCredentials });
});

// POST /api/ai-credentials - 添加新凭证
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { providerId, apiKey, name, headers, customBaseUrl, endpointId } = req.body;

    if (!providerId || !apiKey) {
        res.status(400).json({ error: 'Missing required fields: providerId, apiKey' });
        return;
    }

    // 验证 Provider 存在
    const provider = await adapterRegistry.getProvider(providerId);
    if (!provider) {
        res.status(400).json({ error: 'Invalid provider' });
        return;
    }

    const id = await credentialService.encryptAndStoreCredential(
        userId,
        providerId,
        apiKey,
        name,
        headers,
        customBaseUrl,
        endpointId
    );

    res.status(201).json({ id, message: 'Credential created' });
});

// POST /api/ai-credentials/:id/test - 测试凭证连接
router.post('/:id/test', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const credential = await credentialService.getUserCredential(userId, id);
    if (!credential) {
        res.status(404).json({ error: 'Credential not found' });
        return;
    }

    const adapter = await adapterRegistry.createAdapter(userId, credential.providerId, id);
    const result = await adapter.testConnection();

    // 更新凭证状态
    if (result.success) {
        await credentialService.updateCredentialStatus(id, 'active');
        await credentialService.touchCredential(id);
    } else {
        await credentialService.updateCredentialStatus(id, 'error', result.error);
    }

    res.json(result);
});

// DELETE /api/ai-credentials/:id - 删除凭证
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const credential = await credentialService.getUserCredential(userId, id);
    if (!credential) {
        res.status(404).json({ error: 'Credential not found' });
        return;
    }

    await credentialService.updateCredentialStatus(id, 'deleted');
    res.json({ message: 'Credential deleted' });
});

// PUT /api/ai-credentials/:id/rotate - 轮换 API Key
router.put('/:id/rotate', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const { newApiKey, headers, customBaseUrl } = req.body;

    if (!newApiKey) {
        res.status(400).json({ error: 'Missing newApiKey' });
        return;
    }

    const credential = await credentialService.getUserCredential(userId, id);
    if (!credential) {
        res.status(404).json({ error: 'Credential not found' });
        return;
    }

    // 标记旧凭证为已删除
    await credentialService.updateCredentialStatus(id, 'deleted');

    // 创建新凭证
    const newId = await credentialService.encryptAndStoreCredential(
        userId,
        credential.providerId,
        newApiKey,
        `${credential.providerId} (Rotated)`,
        headers,
        customBaseUrl ?? credential.baseUrl ?? undefined,
        credential.endpointId ?? undefined
    );

    res.json({ id: newId, message: 'API key rotated' });
});

export default router;
