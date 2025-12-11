import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

/**
 * Normalize Gemini API base URL
 * Ensures the URL ends with /v1beta for proper API routing
 */
const normalizeGeminiUrl = (url?: string): string => {
    const defaultUrl = 'https://generativelanguage.googleapis.com/v1beta';
    if (!url?.trim()) return defaultUrl;

    let cleanUrl = url.trim().replace(/\/+$/, '');

    // If user provided just the domain, add /v1beta
    if (cleanUrl.match(/^https?:\/\/[^\/]+$/)) {
        return `${cleanUrl}/v1beta`;
    }

    // If URL ends with /v1 or /v1beta, use as-is
    if (cleanUrl.match(/\/v1(beta)?$/)) {
        return cleanUrl;
    }

    // Otherwise append /v1beta if it looks like a base URL (no path after domain)
    if (!cleanUrl.includes('/v1')) {
        return `${cleanUrl}/v1beta`;
    }

    return cleanUrl;
};

/**
 * POST /api/proxy/gemini
 * Proxy requests to Google Gemini API
 * This allows Chinese users to access Gemini through the US server
 */
router.post('/gemini', async (req: Request, res: Response) => {
    try {
        const { apiKey, model, contents, config, baseUrl } = req.body;

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required' });
            return;
        }

        // Build the target URL with proper normalization
        const targetBaseUrl = normalizeGeminiUrl(baseUrl);
        const targetUrl = `${targetBaseUrl}/models/${model || 'gemini-2.5-flash'}:generateContent`;

        console.log(`[Gemini Proxy] Target URL: ${targetUrl}`);

        // Build proper request body - systemInstruction and safetySettings are top-level, not inside generationConfig
        const requestBody: any = { contents };

        if (config) {
            // Extract top-level fields that should NOT be in generationConfig
            const { systemInstruction, safetySettings, tools, toolConfig, ...generationConfig } = config;

            if (systemInstruction) {
                // systemInstruction must be a Content object, not a plain string
                if (typeof systemInstruction === 'string') {
                    requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
                } else if (systemInstruction.parts) {
                    requestBody.systemInstruction = systemInstruction;
                } else if (systemInstruction.text) {
                    requestBody.systemInstruction = { parts: [{ text: systemInstruction.text }] };
                } else {
                    requestBody.systemInstruction = systemInstruction;
                }
            }
            if (safetySettings) {
                requestBody.safetySettings = safetySettings;
            }
            if (tools) {
                requestBody.tools = tools;
            }
            if (toolConfig) {
                requestBody.toolConfig = toolConfig;
            }

            // Only add generationConfig if there are remaining fields
            if (Object.keys(generationConfig).length > 0) {
                requestBody.generationConfig = generationConfig;
            }
        }

        // Make the request to Gemini
        const response = await axios.post(
            targetUrl,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                timeout: 300000 // 5 minute timeout for long generations
            }
        );

        res.json(response.data);

    } catch (error: any) {
        console.error('Gemini proxy error:', error.response?.data || error.message);

        if (error.response) {
            res.status(error.response.status).json({
                error: 'Gemini API Error',
                details: error.response.data
            });
        } else if (error.code === 'ECONNABORTED') {
            res.status(504).json({ error: 'Request timeout' });
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            res.status(502).json({ error: '无法连接到 API 服务器，请检查 Base URL 是否正确' });
        } else {
            res.status(500).json({ error: 'Proxy error', message: error.message });
        }
    }
});

/**
 * POST /api/proxy/gemini/stream
 * Proxy streaming requests to Gemini API
 */
router.post('/gemini/stream', async (req: Request, res: Response) => {
    try {
        const { apiKey, model, contents, config, baseUrl } = req.body;

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required' });
            return;
        }

        const targetBaseUrl = normalizeGeminiUrl(baseUrl);
        const targetUrl = `${targetBaseUrl}/models/${model || 'gemini-2.5-flash'}:streamGenerateContent?alt=sse`;

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const response = await axios({
            method: 'post',
            url: targetUrl,
            data: { contents, generationConfig: config },
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            responseType: 'stream',
            timeout: 300000
        });

        response.data.pipe(res);

        response.data.on('error', (error: any) => {
            console.error('Stream error:', error);
            res.end();
        });

    } catch (error: any) {
        console.error('Gemini stream proxy error:', error.message);
        res.status(500).json({ error: 'Stream proxy error' });
    }
});

/**
 * POST /api/proxy/openai
 * Proxy requests to OpenAI-compatible APIs
 */
router.post('/openai', async (req: Request, res: Response) => {
    try {
        const { apiKey, baseUrl, model, messages, temperature, maxTokens, stream } = req.body;

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required' });
            return;
        }

        // Normalize base URL
        let targetBaseUrl = baseUrl?.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';
        if (!targetBaseUrl.endsWith('/v1')) {
            targetBaseUrl = targetBaseUrl.replace(/\/chat\/completions$/, '');
            if (!targetBaseUrl.endsWith('/v1')) {
                targetBaseUrl += '/v1';
            }
        }

        const targetUrl = `${targetBaseUrl}/chat/completions`;

        const requestBody: any = {
            model: model || 'gpt-4o',
            messages,
            temperature: temperature ?? 0.7,
            stream: stream || false
        };

        if (maxTokens) {
            requestBody.max_tokens = maxTokens;
        }

        if (stream) {
            // Handle streaming response
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const response = await axios({
                method: 'post',
                url: targetUrl,
                data: requestBody,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                responseType: 'stream',
                timeout: 300000
            });

            response.data.pipe(res);

            response.data.on('error', (error: any) => {
                console.error('OpenAI stream error:', error);
                res.end();
            });
        } else {
            // Non-streaming request
            const response = await axios.post(
                targetUrl,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    timeout: 300000
                }
            );

            res.json(response.data);
        }

    } catch (error: any) {
        console.error('OpenAI proxy error:', error.response?.data || error.message);

        if (error.response) {
            res.status(error.response.status).json({
                error: 'OpenAI API Error',
                details: error.response.data
            });
        } else if (error.code === 'ECONNABORTED') {
            res.status(504).json({ error: 'Request timeout' });
        } else {
            res.status(500).json({ error: 'Proxy error', message: error.message });
        }
    }
});

// ==================================================================================
//  MULTIMEDIA PROXY ENDPOINTS
// ==================================================================================

/**
 * POST /api/proxy/gemini/images
 * Proxy image generation requests to Gemini Imagen API
 */
router.post('/gemini/images', async (req: Request, res: Response) => {
    try {
        const { apiKey, model, prompt, config, baseUrl } = req.body;

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required' });
            return;
        }

        const targetBaseUrl = normalizeGeminiUrl(baseUrl);
        const targetUrl = `${targetBaseUrl}/models/${model || 'imagen-3.0-generate-001'}:predict`;

        const response = await axios.post(
            targetUrl,
            {
                instances: [{ prompt }],
                parameters: {
                    sampleCount: config?.numberOfImages || 1,
                    aspectRatio: config?.aspectRatio || '1:1',
                    outputMimeType: config?.outputMimeType || 'image/jpeg'
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                timeout: 300000
            }
        );

        res.json(response.data);

    } catch (error: any) {
        console.error('Gemini images proxy error:', error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json({ error: 'Gemini API Error', details: error.response.data });
        } else {
            res.status(500).json({ error: 'Proxy error', message: error.message });
        }
    }
});

/**
 * POST /api/proxy/gemini/videos
 * Proxy video generation requests to Gemini Veo API
 */
router.post('/gemini/videos', async (req: Request, res: Response) => {
    try {
        const { apiKey, model, prompt, config, baseUrl } = req.body;

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required' });
            return;
        }

        const targetBaseUrl = normalizeGeminiUrl(baseUrl);
        const targetUrl = `${targetBaseUrl}/models/${model || 'veo-3.1-fast-generate-preview'}:predictLongRunning`;

        const response = await axios.post(
            targetUrl,
            {
                instances: [{ prompt }],
                parameters: {
                    sampleCount: config?.numberOfVideos || 1,
                    aspectRatio: config?.aspectRatio || '16:9',
                    durationSeconds: config?.durationSeconds || 5
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                timeout: 300000
            }
        );

        res.json(response.data);

    } catch (error: any) {
        console.error('Gemini videos proxy error:', error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json({ error: 'Gemini API Error', details: error.response.data });
        } else {
            res.status(500).json({ error: 'Proxy error', message: error.message });
        }
    }
});

/**
 * GET /api/proxy/gemini/operations/:name
 * Check operation status for long-running tasks (video generation)
 */
router.get('/gemini/operations/:name', async (req: Request, res: Response) => {
    try {
        const { name } = req.params;
        const apiKey = req.headers['x-api-key'] as string;
        const baseUrl = req.headers['x-base-url'] as string;

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required in x-api-key header' });
            return;
        }

        const targetBaseUrl = normalizeGeminiUrl(baseUrl);
        const targetUrl = `${targetBaseUrl}/${name}`;

        const response = await axios.get(targetUrl, {
            headers: { 'x-goog-api-key': apiKey },
            timeout: 30000
        });

        res.json(response.data);

    } catch (error: any) {
        console.error('Gemini operations proxy error:', error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json({ error: 'Gemini API Error', details: error.response.data });
        } else {
            res.status(500).json({ error: 'Proxy error', message: error.message });
        }
    }
});

/**
 * POST /api/proxy/openai/images
 * Proxy image generation requests to OpenAI DALL-E API
 */
router.post('/openai/images', async (req: Request, res: Response) => {
    try {
        const { apiKey, baseUrl, model, prompt, size, n } = req.body;

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required' });
            return;
        }

        let targetBaseUrl = baseUrl?.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';
        if (!targetBaseUrl.endsWith('/v1')) targetBaseUrl += '/v1';

        const targetUrl = `${targetBaseUrl}/images/generations`;

        const response = await axios.post(
            targetUrl,
            {
                model: model || 'dall-e-3',
                prompt,
                n: n || 1,
                size: size || '1024x1024',
                response_format: 'b64_json'
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: 300000
            }
        );

        res.json(response.data);

    } catch (error: any) {
        console.error('OpenAI images proxy error:', error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json({ error: 'OpenAI API Error', details: error.response.data });
        } else {
            res.status(500).json({ error: 'Proxy error', message: error.message });
        }
    }
});

/**
 * POST /api/proxy/openai/audio/speech
 * Proxy TTS requests to OpenAI API
 */
router.post('/openai/audio/speech', async (req: Request, res: Response) => {
    try {
        const { apiKey, baseUrl, model, input, voice } = req.body;

        if (!apiKey) {
            res.status(400).json({ error: 'API Key is required' });
            return;
        }

        let targetBaseUrl = baseUrl?.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';
        if (!targetBaseUrl.endsWith('/v1')) targetBaseUrl += '/v1';

        const targetUrl = `${targetBaseUrl}/audio/speech`;

        const response = await axios.post(
            targetUrl,
            { model: model || 'tts-1', input, voice: voice || 'alloy' },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                responseType: 'arraybuffer',
                timeout: 300000
            }
        );

        // Send as base64
        const base64 = Buffer.from(response.data).toString('base64');
        res.json({ audio: base64 });

    } catch (error: any) {
        console.error('OpenAI speech proxy error:', error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json({ error: 'OpenAI API Error', details: error.response.data });
        } else {
            res.status(500).json({ error: 'Proxy error', message: error.message });
        }
    }
});

/**
 * GET /api/proxy/fetch-uri
 * Fetch a Gemini-generated video/file URI and return its contents
 * This is needed because video URIs require the API key and can't be fetched directly by the browser
 */
router.get('/fetch-uri', async (req: Request, res: Response) => {
    try {
        const uri = req.query.uri as string;

        if (!uri) {
            res.status(400).json({ error: 'URI is required' });
            return;
        }

        const response = await axios.get(uri, {
            responseType: 'arraybuffer',
            timeout: 300000
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        res.send(response.data);

    } catch (error: any) {
        console.error('Fetch URI proxy error:', error.message);
        res.status(500).json({ error: 'Proxy error', message: error.message });
    }
});

export default router;

