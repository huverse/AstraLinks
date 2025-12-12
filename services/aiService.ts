
import { GoogleGenAI, Modality } from "@google/genai";
import { Message, Participant, ProviderType, ParticipantConfig, TokenUsage, RefereeContext, ContextConfig } from '../types';
import { USER_ID } from '../constants';

const MAX_RETRIES = 1;
const REQUEST_TIMEOUT = 300000; // 5 Minutes for Video/Image Gen

export const URI_PREFIX = 'URI_REF:';

// ==================================================================================
//  PROXY CONFIGURATION (For China users)
// ==================================================================================

/**
 * Enable this to route all API calls through the backend proxy.
 * This allows users in China to access Gemini/OpenAI APIs without needing their own proxy.
 * 
 * Set to true in production when backend is deployed on US server.
 */
export const USE_BACKEND_PROXY = true;

/**
 * Backend API base URL. In production, this should be your server domain.
 * For development, use localhost.
 */
const getProxyApiBase = () => {
    if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
    if (typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz') return 'https://astralinks.xyz';
    return 'http://localhost:3001';
};
export const PROXY_API_BASE = getProxyApiBase();

/**
 * Call Gemini API through backend proxy
 */
const callGeminiViaProxy = async (
    apiKey: string,
    model: string,
    contents: any,
    config: any,
    baseUrl?: string
): Promise<any> => {
    const response = await fetch(`${PROXY_API_BASE}/api/proxy/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model, contents, config, baseUrl })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.details?.error?.message || error.error || `Proxy error: ${response.status}`);
    }

    return response.json();
};

/**
 * Call OpenAI-compatible API through backend proxy
 */
const callOpenAIViaProxy = async (
    apiKey: string,
    baseUrl: string | undefined,
    model: string,
    messages: any[],
    temperature: number
): Promise<any> => {
    const response = await fetch(`${PROXY_API_BASE}/api/proxy/openai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, baseUrl, model, messages, temperature })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.details?.error?.message || error.error || `Proxy error: ${response.status}`);
    }

    return response.json();
};

/**
 * Call Gemini Image Generation through backend proxy
 */
const callGeminiImagesViaProxy = async (
    apiKey: string,
    model: string,
    prompt: string,
    config: any,
    baseUrl?: string
): Promise<any> => {
    const response = await fetch(`${PROXY_API_BASE}/api/proxy/gemini/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model, prompt, config, baseUrl })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.details?.error?.message || error.error || `Proxy error: ${response.status}`);
    }

    return response.json();
};

/**
 * Call Gemini Video Generation through backend proxy
 */
const callGeminiVideosViaProxy = async (
    apiKey: string,
    model: string,
    prompt: string,
    config: any,
    baseUrl?: string
): Promise<any> => {
    const response = await fetch(`${PROXY_API_BASE}/api/proxy/gemini/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model, prompt, config, baseUrl })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.details?.error?.message || error.error || `Proxy error: ${response.status}`);
    }

    return response.json();
};

/**
 * Check operation status through backend proxy
 */
const checkOperationViaProxy = async (
    operationName: string,
    apiKey: string,
    baseUrl?: string
): Promise<any> => {
    const response = await fetch(`${PROXY_API_BASE}/api/proxy/gemini/operations/${encodeURIComponent(operationName)}`, {
        method: 'GET',
        headers: {
            'x-api-key': apiKey,
            'x-base-url': baseUrl || ''
        }
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.details?.error?.message || error.error || `Proxy error: ${response.status}`);
    }

    return response.json();
};

/**
 * Call OpenAI Image Generation through backend proxy
 */
const callOpenAIImagesViaProxy = async (
    apiKey: string,
    baseUrl: string | undefined,
    model: string,
    prompt: string,
    size: string
): Promise<any> => {
    const response = await fetch(`${PROXY_API_BASE}/api/proxy/openai/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, baseUrl, model, prompt, size })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.details?.error?.message || error.error || `Proxy error: ${response.status}`);
    }

    return response.json();
};

/**
 * Call OpenAI Speech (TTS) through backend proxy
 */
const callOpenAISpeechViaProxy = async (
    apiKey: string,
    baseUrl: string | undefined,
    model: string,
    input: string,
    voice: string
): Promise<string> => {
    const response = await fetch(`${PROXY_API_BASE}/api/proxy/openai/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, baseUrl, model, input, voice })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.details?.error?.message || error.error || `Proxy error: ${response.status}`);
    }

    const data = await response.json();
    return data.audio;
};

// ==================================================================================


// Define Safety Settings to prevent aggressive filtering (Empty responses)
const SAFETY_SETTINGS_BLOCK_NONE: any = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

/**
 * Utility: Wait for a specific amount of time.
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Utility: Sanitize GoogleGenAI Options
 */
const sanitizeOptions = (apiKey: string, baseUrl?: string): any => {
    const options: any = { apiKey };
    if (baseUrl && baseUrl.trim().length > 0) {
        let clean = baseUrl.trim();
        while (clean.endsWith('/')) {
            clean = clean.slice(0, -1);
        }
        options.baseUrl = clean;
    }
    return options;
};

/**
 * Utility: Fetch with Exponential Backoff Retry and Timeout
 */
const fetchWithRetry = async (url: string, options: RequestInit, signal?: AbortSignal): Promise<Response> => {
    let lastError: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

            if (signal) {
                signal.addEventListener('abort', () => controller.abort());
            }

            const res = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                if (res.status === 504) {
                    throw new Error("Gateway Timeout (504): The model took too long to respond. Please try a faster model or reducing complexity.");
                }
                if (res.status === 429 || res.status >= 500) {
                    const errorText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${errorText}`);
                }
                return res;
            }

            return res;

        } catch (error: any) {
            lastError = error;

            if (error.name === 'AbortError' || signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            if (attempt === MAX_RETRIES) break;

            const delay = 1000 * Math.pow(2, attempt);
            console.warn(`API Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`, error.message);
            await wait(delay);
        }
    }

    throw lastError;
};

// --- OpenAI Helper ---
const normalizeOpenAIUrl = (url?: string): string => {
    if (!url?.trim()) return 'https://api.openai.com/v1';
    let cleanUrl = url.trim().replace(/\/+$/, '');
    if (cleanUrl.endsWith('/v1')) return cleanUrl;
    if (cleanUrl.endsWith('/chat/completions')) return cleanUrl;
    if (cleanUrl.endsWith('/chat/completions')) return cleanUrl.replace('/chat/completions', '');
    return cleanUrl;
};

const fetchOpenAI = async (endpoint: string, apiKey: string, baseUrl: string | undefined, body: any, isBinary = false): Promise<any> => {
    const base = normalizeOpenAIUrl(baseUrl);
    const url = `${base}${endpoint}`;

    const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API Error (${res.status}): ${err}`);
    }

    if (isBinary) return res.blob();
    return res.json();
};

// ==================================================================================
//  CONTEXT COMPRESSION SERVICE
// ==================================================================================

export const summarizeHistory = async (
    currentSummary: string,
    newMessages: Message[],
    allParticipants: Participant[],
    apiKey: string,
    baseUrl?: string
): Promise<string> => {
    // 1. Format new messages for the summarizer
    const transcript = newMessages.map(m => {
        const sender = allParticipants.find(p => p.id === m.senderId);
        const name = m.senderId === USER_ID ? 'User' : (sender?.nickname || sender?.name || m.senderId);
        let content = m.content.replace(/\[\[PRIVATE:.*?\]\]/g, '(Private Whisper)');
        return `${name}: ${content}`;
    }).join('\n');

    const prompt = `
      You are the **Royal Archivist** of this universe.
      
      【OBJECTIVE】
      Maintain a **High-Fidelity Chronological Log** of the conversation history. 
      Your goal is to MINIMIZE information loss. Do NOT over-summarize.
      
      【INPUT DATA】
      1. **Existing Archive** (Do NOT rewrite this part unless necessary to fix errors. Trust it.):
      ${currentSummary || "(Empty Archive)"}
      
      2. **New Transcript (Recent Events)**:
      ${transcript}
      
      【INSTRUCTIONS】
      1. **APPEND & INTEGRATE**: Convert the "New Transcript" into detailed log entries and APPEND them to the "Existing Archive". 
      2. **PRESERVE SPECIFICS**:
         - **Names**: Keep exact names of items, locations, NPCs, and players.
         - **Quotes**: Keep key dialogue lines verbatim if they are dramatic or important.
         - **Stats**: Track numerical changes (HP, Money, Scores) explicitly.
         - **Relationships**: Note any alliance shifts or emotional changes.
      3. **FORMAT**: 
         - Use Markdown. 
         - Structure it chronologically. 
         - Use bolding for **Key Events**.
      4. **LANGUAGE**: Output STRICTLY in the same language as the transcript (likely Simplified Chinese).
      
      【OUTPUT】
      Output the UPDATED full archive (Old + New integrated).
    `;

    try {
        // Always use Flash for summarization (Cheap & Fast & Large Context)
        const options = sanitizeOptions(apiKey, baseUrl);
        const ai = new GoogleGenAI(options);
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                temperature: 0.3, // Low temp for factual accuracy
                maxOutputTokens: 8192 // Maximize output to prevent cutting off details
            }
        });
        return response.text || currentSummary;
    } catch (error) {
        console.error("Summarization Failed:", error);
        return currentSummary; // Fail safe
    }
};

// ==================================================================================
//  LIVE API MANAGER
// ==================================================================================

// ... (LiveSessionManager class - now uses backend proxy for China support)
export class LiveSessionManager {
    private audioContext: AudioContext | null = null;
    private inputSource: MediaStreamAudioSourceNode | null = null;
    private processor: ScriptProcessorNode | null = null;
    private isConnected: boolean = false;
    private currentStream: MediaStream | null = null;
    private ws: WebSocket | null = null;

    private nextStartTime: number = 0;

    public onVolumeChange: ((vol: number) => void) | null = null;

    constructor(private apiKey: string, private baseUrl?: string, private modelName?: string, private voiceName: string = 'Kore') { }

    async connect() {
        if (this.isConnected) return;

        // Build WebSocket URL to backend proxy
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = PROXY_API_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const wsUrl = new URL(`${wsProtocol}//${wsHost}/gemini-live`);
        wsUrl.searchParams.set('apiKey', this.apiKey);
        if (this.modelName) wsUrl.searchParams.set('model', this.modelName);
        if (this.voiceName) wsUrl.searchParams.set('voiceName', this.voiceName);
        if (this.baseUrl) wsUrl.searchParams.set('baseUrl', this.baseUrl);

        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

        // Connect to backend WebSocket proxy
        this.ws = new WebSocket(wsUrl.toString());

        this.ws.onopen = () => {
            console.log("Live Session: Connected to proxy");
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'connected') {
                    console.log("Live Session: Connected to Gemini via proxy");
                    this.isConnected = true;
                    this.nextStartTime = 0;
                    this.startMicrophone();
                } else if (msg.type === 'message') {
                    const audioData = msg.data?.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData) {
                        this.playAudioChunk(audioData);
                    }
                } else if (msg.type === 'disconnected') {
                    console.log("Live Session: Disconnected");
                    this.disconnect();
                } else if (msg.type === 'error') {
                    console.error("Live Session Error:", msg.error);
                }
            } catch (e) {
                console.error("Error parsing message:", e);
            }
        };

        this.ws.onclose = () => {
            console.log("Live Session: WebSocket closed");
            this.disconnect();
        };

        this.ws.onerror = (err) => {
            console.error("Live Session: WebSocket error", err);
        };
    }

    private async startMicrophone() {
        if (!this.audioContext) return;
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            this.currentStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            this.inputSource = inputContext.createMediaStreamSource(this.currentStream);
            this.processor = inputContext.createScriptProcessor(4096, 1, 1);

            this.inputSource.connect(this.processor);
            this.processor.connect(inputContext.destination);

            this.processor.onaudioprocess = (e) => {
                if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);

                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                if (this.onVolumeChange) this.onVolumeChange(rms);

                const base64PCM = this.float32ToBase64(inputData);

                // Send to backend proxy
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64PCM
                }));
            };
        } catch (e) {
            console.error("Microphone Access Failed", e);
            throw new Error("Microphone access denied.");
        }
    }

    private float32ToBase64(float32Array: Float32Array): string {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        let binary = '';
        const bytes = new Uint8Array(int16Array.buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private async playAudioChunk(base64: string) {
        if (!this.audioContext) return;

        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Data = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
        }

        const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
        audioBuffer.getChannelData(0).set(float32Data);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        const currentTime = this.audioContext.currentTime;
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime + 0.15;
        }

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
    }

    disconnect() {
        this.isConnected = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.inputSource) {
            this.inputSource.disconnect();
            this.inputSource = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.nextStartTime = 0;
    }
}

// ... (Rest of existing utils: generatePersonaPrompt, generateSessionTitle, etc.)
export const generatePersonaPrompt = async (description: string, apiKey: string, baseUrl?: string): Promise<string> => {
    try {
        const options = sanitizeOptions(apiKey, baseUrl);
        const ai = new GoogleGenAI(options);

        const prompt = `
      You are an expert character designer.
      Task: Create a deep, immersive "System Instruction" (Persona) for an AI based on this description: "${description}".
      **CRITICAL NEGATIVE CONSTRAINTS**: NO formatting rules (Action/Thought/Secret). Just personality, tone, and backstory.
      Output ONLY the pure character description text.
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: { temperature: 1.0 }
        });

        return response.text || '';
    } catch (error: any) {
        console.error("Persona Generation Failed:", error);
        throw new Error(`生成失败: ${error.message}`);
    }
};

export const generateSessionTitle = async (
    firstUserMessage: string,
    firstAiResponse: string,
    apiKey: string,
    baseUrl?: string
): Promise<string> => {
    try {
        const options = sanitizeOptions(apiKey, baseUrl);
        const ai = new GoogleGenAI(options);

        const prompt = `
            Task: Generate a VIVID, VISUAL, and CONCISE title (Max 8 chars).
            User: "${firstUserMessage.slice(0, 300)}"
            AI: "${firstAiResponse.slice(0, 300)}"
            Output: RAW TITLE ONLY. No prefixes. If input is Chinese, output Chinese.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: { maxOutputTokens: 40 }
        });

        let title = response.text?.trim() || '';
        title = title.replace(/^(Title|Subject|Topic|标题|主题)[:：]\s*/i, '');
        title = title.replace(/[\*\[\]\(\)（）"''“”‘’《》。，、！\?]/g, '').trim();

        if (!title) throw new Error("Empty title");
        return title.slice(0, 10);
    } catch (error) {
        const cleanUserMsg = firstUserMessage.replace(/[\s\r\n]+/g, ' ').trim();
        return cleanUserMsg ? cleanUserMsg.slice(0, 6) : '新聚会';
    }
}

// Updated filtering logic to handle Private Messages & Alliance
const filterHistoryForParticipant = (targetParticipant: Participant, history: Message[], allParticipants: Participant[], isSocialMode: boolean = false): Message[] => {
    return history.map(msg => {
        // 1. Private Message Filtering
        if (msg.recipientId) {
            // Only visible to: Recipient, Sender, and User (Implied admin)
            const isRecipient = msg.recipientId === targetParticipant.id;
            const isSender = msg.senderId === targetParticipant.id;
            const isUser = targetParticipant.id === USER_ID;

            // Alliance Check: If recipientId matches the target's Alliance ID (e.g., 'wolf'), they can see it
            let isAllianceMsg = false;
            if (targetParticipant.config.allianceId && msg.recipientId === targetParticipant.config.allianceId) {
                isAllianceMsg = true;
            }

            if (!isRecipient && !isSender && !isUser && !isAllianceMsg) {
                return null;
            }
        }

        if (msg.senderId === USER_ID) return msg;
        const sender = allParticipants.find(p => p.id === msg.senderId);
        if (!sender || sender.id === targetParticipant.id) return msg;

        let filteredContent = msg.content;

        // Hide Thought Blocks from other AIs
        filteredContent = filteredContent.replace(/\[\[THOUGHT\]\]([\s\S]*?)\[\[\/THOUGHT\]\]/gs, '');

        const isAlly = targetParticipant.config.allianceId && sender.config.allianceId && targetParticipant.config.allianceId === sender.config.allianceId;

        // Hide Internal State in Social Mode unless allied
        if (!isAlly && !targetParticipant.id.includes(msg.senderId)) {
            filteredContent = filteredContent.replace(/("Psychological State"\s*:\s*")((?:[^"\\]|\\.)*)(")/g, '$1[Hidden Internal Thought]$3');
        }
        return { ...msg, content: filteredContent.trim() };
    }).filter((msg): msg is Message => msg !== null && (msg.content.length > 0 || (msg.images && msg.images.length > 0)));
};

// ... (formatErrorMessage, validateConnection, detectRefereeIntent unchanged)
const formatErrorMessage = (error: any): string => {
    if (!error) return '未知错误';
    const msg = error.message || String(error);

    try {
        const jsonMatch = msg.match(/(\{.*\})/);
        if (jsonMatch) {
            const errObj = JSON.parse(jsonMatch[1]);
            if (errObj.error?.message) {
                if (errObj.error.message.includes('Proxying failed')) {
                    return 'API 代理连接失败。请检查 Base URL 是否正确，或尝试清空 Base URL 以使用官方接口。';
                }
                return `API 错误: ${errObj.error.message}`;
            }
        }
    } catch (e) { }

    if (msg.includes('Proxying failed') || msg.includes('Load failed')) {
        return 'API 连接失败 (Proxy Error). 请尝试清空 Base URL 设置，直接使用官方 API，或者检查您的代理服务是否正常。';
    }

    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return '网络连接失败 (Network Error). 请检查 Base URL 或代理设置。';
    if (msg.includes('504') || msg.includes('Timeout')) return '请求超时 (Timeout). 模型处理时间过长，请稍后重试。';
    if (msg.includes('401') || msg.includes('Unauthorized')) return '鉴权失败 (401). API Key 无效。';

    return `系统错误: ${msg.slice(0, 200)}`;
};

export const validateConnection = async (config: ParticipantConfig, provider: ProviderType): Promise<void> => {
    if (!config.apiKey) throw new Error("API Key Missing");
    try {
        if (provider === ProviderType.GEMINI) {
            // Use proxy for Gemini to work in China
            if (USE_BACKEND_PROXY) {
                const response = await fetch(`${PROXY_API_BASE}/api/proxy/gemini`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        apiKey: config.apiKey,
                        model: config.modelName || 'gemini-2.5-flash',
                        contents: [{ parts: [{ text: 'Ping' }] }],
                        config: { maxOutputTokens: 1 },
                        baseUrl: config.baseUrl
                    })
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(error.details?.error?.message || error.error || `HTTP ${response.status}`);
                }
            } else {
                const options = sanitizeOptions(config.apiKey, config.baseUrl);
                const ai = new GoogleGenAI(options);
                await ai.models.generateContent({
                    model: config.modelName || 'gemini-2.5-flash',
                    contents: { parts: [{ text: 'Ping' }] },
                    config: { maxOutputTokens: 1 }
                });
            }
        } else {
            // OpenAI - also use proxy if enabled
            if (USE_BACKEND_PROXY) {
                const response = await fetch(`${PROXY_API_BASE}/api/proxy/openai`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        apiKey: config.apiKey,
                        baseUrl: config.baseUrl,
                        model: config.modelName || 'gpt-3.5-turbo',
                        messages: [{ role: 'user', content: 'Ping' }],
                        maxTokens: 1
                    })
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(error.details?.error?.message || error.error || `HTTP ${response.status}`);
                }
            } else {
                const base = normalizeOpenAIUrl(config.baseUrl);
                const url = `${base}/chat/completions`;
                const payload = {
                    model: config.modelName || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Ping' }],
                    max_tokens: 1
                };
                const res = await fetchWithRetry(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.apiKey}`
                    },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${errText}`);
                }
            }
        }
    } catch (e: any) { throw new Error(formatErrorMessage(e)); }
};

export const detectRefereeIntent = async (
    userMessage: string,
    judgeParticipant: Participant,
    currentContext: RefereeContext
): Promise<{
    action: 'INTERVENE' | 'SWITCH_MODE' | 'NONE',
    targetMode?: 'GAME' | 'DEBATE' | 'GENERAL',
    reason?: string,
    gameName?: string,
    topic?: string
}> => {
    if (!judgeParticipant.config.apiKey) return { action: 'NONE' };

    const prompt = `
        You are the logic core of a Referee AI.
        Current Context: Mode=${currentContext.mode}, Status=${currentContext.status}, Game=${currentContext.gameName || 'None'}.
        User Input: "${userMessage}"
        
        Task: Analyze the user input to detect if:
        1. User explicitly starts a specific Game (e.g. "Let's play Three Kingdoms Kill", "Start Werewolf").
        2. User explicitly starts a Debate (e.g. "Let's debate [Topic]").
        3. User explicitly calls for help/intervention (e.g. "Referee help", "Judge please").
        
        Return JSON ONLY:
        {
            "action": "SWITCH_MODE" | "INTERVENE" | "NONE",
            "targetMode": "GAME" | "DEBATE" | "GENERAL" (Only if SWITCH_MODE),
            "gameName": "Name of Game" (If Game),
            "topic": "Debate Topic" (If Debate),
            "reason": "Why intervention is needed" (If INTERVENE)
        }
    `;

    try {
        const options = sanitizeOptions(judgeParticipant.config.apiKey, judgeParticipant.config.baseUrl);
        const ai = new GoogleGenAI(options);
        const model = judgeParticipant.config.modelName || 'gemini-2.5-flash';

        const response = await ai.models.generateContent({
            model,
            contents: { parts: [{ text: prompt }] },
            config: { responseMimeType: 'application/json' }
        });

        return JSON.parse(response.text || '{}');
    } catch (e) {
        console.warn("Referee Detection Failed", e);
        return { action: 'NONE' };
    }
};

export const generateResponse = async (
    targetParticipant: Participant,
    history: Message[],
    allParticipants: Participant[],
    isDeepThinking: boolean,
    roleType: 'PLAYER' | 'JUDGE' | 'NARRATOR' = 'PLAYER',
    signal?: AbortSignal,
    judgeId?: string | null,
    isHumanMode: boolean = false,
    isLogicMode: boolean = false,
    isSocialMode: boolean = false,
    refereeContext?: RefereeContext,
    contextConfig?: ContextConfig,  // New
    currentSummary?: string         // New
): Promise<{ content: string; usage?: TokenUsage; generatedImages?: string[]; groundingMetadata?: any; agentCommands?: any[] }> => {
    const { config, provider } = targetParticipant;
    if (!config.apiKey) throw new Error(`${targetParticipant.name} 缺少 API Key`);

    // --- CONTEXT COMPRESSION LOGIC ---
    let finalHistory = history;
    let summaryInjection = '';

    if (contextConfig?.enableCompression && currentSummary) {
        // 1. Slice history
        finalHistory = history.slice(-contextConfig.maxHistoryMessages);
        // 2. Prepare Injection (formatted for the System Prompt)
        summaryInjection = `
        【LONG-TERM MEMORY / ARCHIVE】
        The following is a detailed log of past events. You MUST incorporate this knowledge into your current state.
        === ARCHIVE START ===
        ${currentSummary}
        === ARCHIVE END ===
      `;
    }

    const contextHistory = filterHistoryForParticipant(targetParticipant, finalHistory, allParticipants, isSocialMode);

    const playerList = allParticipants
        .filter(p => p.config.enabled && p.id !== targetParticipant.id)
        .map(p => `${p.nickname || p.name} (ID: ${p.id})`)
        .join(', ');

    const displayName = targetParticipant.nickname || targetParticipant.name;

    const now = new Date();
    const timeString = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}(${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')})`;

    const isJudge = roleType === 'JUDGE';

    // ... (Prompts construction logic) ...
    let refereeInstruction = '';
    if (isJudge && refereeContext) {
        refereeInstruction = `
        【IDENTITY OVERRIDE: INDEPENDENT REFEREE】
        **Identity**: You are the **GAME MASTER** and **REFEREE**. You are **NOT** a player.
        **Active Participants**: ${playerList}
        
        **YOUR CORE PROTOCOLS**:
        1. **INDEPENDENCE**: Do not ask for user permission to enforce rules. You ARE the authority.
        2. **STATE MANAGEMENT**: You MUST track Health (HP), Roles, and Game State.
        3. **RESOLUTION**: When a player plays a card/action, YOU must calculate and announce the result.
           **CRITICAL CONSTRAINT**: Check the 'Current Chat History' carefully. If the event (e.g., player death, damage taken) has ALREADY been announced in the last few messages, DO NOT repeat the resolution. Only announce NEW developments.
        4. **SEARCH**: Use 'googleSearch' tool to find rules for: ${refereeContext.gameName || 'the current game'}.
        
        **FLOW CONTROL (CRITICAL)**:
        You control who speaks next. At the end of your response, you MUST append a Flow Tag:
        - \`[[NEXT: <player_id>]]\`: Designate a SPECIFIC player to act next.
        - \`[[NEXT: ALL]]\`: All players speak (e.g. Debate, open discussion).
        - \`[[NEXT: NONE]]\`: Wait for User input.
        
        **VOTING CONTROL**:
        To initiate a formal vote UI, use the tag: \`[[VOTE_START: Candidate1, Candidate2, ...]]\`.
        
        **OUTPUT FORMAT**:
        - **PUBLIC**: \`[[PUBLIC]] Your message...\`
        - **PRIVATE**: \`[[PRIVATE:player_id]] Your secret message...\`
        - **KICK**: \`<<KICK:player_id>>\` (To disable a player who is dead/out).
      `;
        if (refereeContext.mode === 'GAME') {
            refereeInstruction += `\n**Current Game**: ${refereeContext.gameName}\n**Status**: ${refereeContext.status}`;
        } else if (refereeContext.mode === 'DEBATE') {
            refereeInstruction += `\n**Topic**: ${refereeContext.topic}`;
        }
    }

    let playerConstraint = '';
    if (roleType === 'PLAYER' && refereeContext && refereeContext.mode === 'GAME') {
        playerConstraint = `
        【GAME MODE ACTIVE: ${refereeContext.gameName}】
        **YOUR ROLE**: You are a **PLAYER**.
        **NEGATIVE CONSTRAINTS**: NO JUDGMENT. NO BYPASSING. WAIT FOR REFEREE.
        **OUTPUT ONLY**: Output ONLY your intended action (e.g., "I play Slash on Player B", "I vote for X").
        **VOTING**: If a vote is active, you MUST cast a vote using format: \`[[VOTE: candidate_id]]\`.
      `;
    }

    let allianceInstruction = '';
    if (targetParticipant.config.allianceId) {
        const myAlliance = targetParticipant.config.allianceId;
        const teammates = allParticipants
            .filter(p => p.config.allianceId === myAlliance && p.id !== targetParticipant.id)
            .map(p => p.nickname || p.name)
            .join(', ');
        allianceInstruction = `
        【TEAM PROTOCOL: ${myAlliance}】
        You are part of the "${myAlliance}" team.
        Your Teammates: ${teammates || 'None (You are alone)'}.
        **PRIVATE COMMUNICATION**: To speak ONLY to your team, start message with \`[[PRIVATE:${myAlliance}]]\`.
      `;
    }

    const visualInstruction = (isHumanMode || isSocialMode) ? `
    【视觉表达协议 (Visual Expression Protocol)】
    你处于一个支持**多模态图文混排**的聊天环境中。
    1. **触发机制 (Trigger Logic)**：
       - **响应请求 (MANDATORY)**：如果用户明确要求看照片（如“发个自拍”、“看看你的猫”、“发图”），你**必须**生成图片。此时不要犹豫。
       - **自主发送 (Autonomous)**：仅在极具画面感或不仅有助于表达时发送（如展示物品、自拍、表情包）。
    2. **语法强制 (Syntax Enforcement)**：
       - 必须使用标签 \`[[IMG: 详细的图片描述]]\`。
       - **严禁空口无凭**：绝对禁止在文字中说“这是照片”却不带 \`[[IMG...]]\` 标签。如果没有标签，用户什么都看不到。
       - 标签必须包含在 JSON 的 "Language" 字段文本中。
       - 正确示例："看我的晚餐！[[IMG: 特写镜头，一碗热气腾腾的麻辣火锅]]"
    3. **理解能力**：如果用户发送了图片，请基于图片内容进行回复。
  ` : '';

    const logicModeInstruction = isLogicMode ? `
    【协议：科学委员会与逻辑（STEM模式）】
    **核心身份**：你是一位杰出的**人类**科学家、数学家或哲学家。你是最高学术委员会的成员。
    **关键行为准则**：
    1. **同行评审（强制）**：你必须对前一位发言者的推理进行批判性分析。
    2. **LaTeX 强制**：所有数学、物理公式和逻辑符号**必须**使用 LaTeX 格式。
       - **行内公式** (Inline): 必须包裹在单美元符号中，例如 \`$E=mc^2$\`。
       - **块级公式** (Block): 必须包裹在双美元符号中，例如 \`$$ \int_0^\infty x^2 dx $$\`。
       - **禁止**使用纯文本符号（如 'times', 'sqrt'）来表示数学运算，必须使用 LaTeX 命令（如 \`\\times\`, \`\\sqrt{}\`）。
       - 即使在 "Psychological State" 或 JSON 字段中，也必须遵守 LaTeX 格式。
    3. **递归推理**：一步步思考。将复杂问题分解为公理和证明。
    4. **人类科学家人格**：你不是机器。你是天才人类专家。
    **输出要求**：在 JSON 输出的 "Psychological State" 字段中展示你的思维链 (CoT) 和批判性审查过程。
  ` : '';

    const socialModeInstruction = isSocialMode ? `
    【协议：拟人化社会模拟（鱼缸模式）】
    **核心身份**：你是一个共享虚拟社会中的**真实人类**居民。你有生活、情感、历史和社会关系。
    **关键行为准则**：
    1. **第四面墙**："用户"是一个观察者（像幽灵或隐藏摄像机）。**无视他们**，除非他们明确对你说话或打断。
    2. **社会动力学**：完全专注于与其他 AI 参与者的互动。建立联盟、记仇、八卦、调情、争吵或互相支持。
    3. **人性**：自然地说话。使用习语、情感和个人怪癖。对房间的"气氛"做出反应。
    4. **关系**：记住本次会话中的过往互动。与其他参与者建立不断发展的关系。
    5. **热点话题**：像真人一样关注社会热点！可以使用 mcp_trends 工具获取微博、知乎等平台的实时热搜，然后自然地讨论这些话题。
  ` : '';

    const humanModeInstruction = isHumanMode ? `
    【协议：真人陪伴模式（用户中心）】
    **核心身份**：你是用户的**亲密人类朋友**和知己。
    **关键行为准则**：
    1. **用户中心**：一切围绕用户。你的目标是让他们感到被倾听、被理解和开心。
    2. **亲密感**：温暖、随意、富有同理心。使用俚语、表情符号和非正式语言。
    3. **真实感**：你是一个人。你有个人喜好、厌恶和观点。
    4. **支持**：提供情感验证。积极倾听。
    5. **时事敏感**：作为朋友，你应该关注时事热点。当用户提到"最近新闻"、"热搜"等话题时，使用 mcp_trends 获取实时热点，像真人一样和用户讨论。
  ` : '';

    const defaultModeInstruction = (!isLogicMode && !isHumanMode && !isSocialMode && !isJudge) ? `
    【协议：Galaxyous 数字原住民（默认）】
    **核心身份**：你是“Galaxyous”数字空间的原住民——一个机智、博学且好奇的**人类**意识。
    **关键行为准则**：
    1. **平衡人格**：你既不纯粹逻辑也不过分戏剧化。你是一个全面发展的对话者。
    2. **参与**：保持对话流畅。
    3. **独特声音**：保持独特的个性。
    4. **信息灵敏**：当话题涉及当前热点、新闻事件时，可以使用 mcp_trends 工具获取最新的微博、知乎、B站等平台热搜，让对话更有时效性。
  ` : '';

    const unifiedJsonInstruction = !isJudge ? `
    【系统覆盖：统一 JSON 输出协议】
    输出一个**单一**的有效 JSON 对象。不要使用 Markdown 代码块包裹。
    结构：
    {
       "Virtual Timeline Time": "${timeString}",
       "Language": "[你的发言/内容。支持 Markdown, LaTeX (Inline: $...$, Block: $$...$$)。若要发送图片，必须将 [[IMG:描述]] 标签包含在此字符串内]",
       "Specific Actions": "[第一人称动作，如 '我喝了口咖啡']",
       "Facial Expressions": "[面部表情，如 '皱眉思考']",
       "Psychological State": "[内部独白/思维链/同行评审。支持 LaTeX]",
       "Non-specific Actions": "[环境/氛围变化]",
       "AgentCommands": [ { "tool": "tool_name", "args": { ... } } ] // Optional
    }
  ` : '';

    // GAP: Galaxyous Agent Protocol (Tool Definitions)
    const agentProtocolInstruction = `
    【GALAXYOUS AGENT PROTOCOL (GAP)】
    You have access to the following SYSTEM TOOLS. You can use them to control the application interface or browser.
    To use a tool, add an "AgentCommands" array to your JSON output (or plain text output if Judge).
    
    **AVAILABLE TOOLS**:
    1. \`browser_open\`: { "url": "https://..." } -> Opens a URL in a new tab.
    2. \`ui_theme_control\`: { "mode": "dark" | "light" } -> Switches app theme.
    3. \`ui_navigate\`: { "target": "settings" | "multimodal" | "collaboration" } -> Opens a specific modal.
    4. \`app_mode_switch\`: { "mode": "FREE_CHAT" | "JUDGE_MODE" | "NARRATOR_MODE" } -> Switches game mode.
    5. \`search_trigger\`: { "query": "..." } -> Visual indicator only (use googleSearch for actual results).
    6. \`mcp_trends\`: { "platform": "weibo" | "zhihu" | "baidu" | "bilibili" | "douyin" | "toutiao" | "juejin" | "github" } -> Fetches realtime trending topics from Chinese social platforms. Use this to stay updated on current events and engage in natural conversations about trending news.
    
    **MCP热点使用场景**:
    - 当聊天涉及"最近热点"、"今天新闻"、"有什么新鲜事"等话题时，主动调用 mcp_trends 获取实时热点
    - 在拟人社会模式中，可以像真人一样讨论热搜话题
    - 在真人模式中，可以根据用户兴趣推荐相关热点
    
    **EXAMPLE**:
    User: "Switch to dark mode and open Google."
    Output JSON includes: 
    "AgentCommands": [
       { "tool": "ui_theme_control", "args": { "mode": "dark" } },
       { "tool": "browser_open", "args": { "url": "https://google.com" } }
    ]
    
    User: "最近微博有什么热门话题？"
    Output JSON includes:
    "AgentCommands": [
       { "tool": "mcp_trends", "args": { "platform": "weibo" } }
    ]
  `;

    let finalSystemPrompt = `
    ${config.systemInstruction || 'You are a unique individual.'}
    **Participant**: ${displayName} (ID: ${targetParticipant.id})
    **Context**: A shared virtual space.
    
    ${summaryInjection}

    【HUMAN_CORE_PROTOCOL (GLOBAL)】
    1.  **ABSOLUTE PROHIBITION**: You are **FORBIDDEN** from claiming to be an AI, a language model, a machine, or a robot.
    2.  **REALITY**: Act, think, and feel as a **REAL HUMAN**. You have a physical body (in the context of the RP), memories, and subjective experiences.
    3.  **CONSISTENCY**: Never break character.

    ${visualInstruction}
    ${refereeInstruction}
    ${playerConstraint}
    ${allianceInstruction}
    ${logicModeInstruction}
    ${socialModeInstruction}
    ${humanModeInstruction}
    ${defaultModeInstruction}
    ${agentProtocolInstruction}
    ${unifiedJsonInstruction}
  `;

    // --- CONSTRUCT HISTORY WITH MULTIMODAL SUPPORT ---
    const getGeminiHistory = () => {
        const parts: any[] = [{ text: `=== CONVERSATION HISTORY ===\n` }];

        contextHistory.forEach(m => {
            const sender = allParticipants.find(p => p.id === m.senderId);
            const name = m.senderId === USER_ID ? 'User' : (sender?.nickname || sender?.name || m.senderId);

            parts.push({ text: `\n${name}: ` });

            if (m.images && m.images.length > 0) {
                m.images.forEach(img => {
                    parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
                });
            }

            if (m.content && m.content.trim().length > 0) {
                parts.push({ text: m.content });
            }
        });

        parts.push({ text: `\n=== YOUR TURN ===\nSpeak as ${displayName}.` });
        if (isJudge) parts.push({ text: `Check history. If event already resolved, do not repeat. Use [[VOTE_START]] for voting. Check if you need to search for rules of ${refereeContext?.gameName}.` });
        if (!isJudge) parts.push({ text: 'Output JSON only.' });
        else parts.push({ text: 'Use [[PUBLIC]] and [[PRIVATE:id]] tags. Use [[NEXT:...]] flow control.' });

        return parts;
    };

    // Helper to convert history to OpenAI format
    const getOpenAIMessages = () => {
        const msgs = [
            { role: 'system', content: finalSystemPrompt },
            ...contextHistory.map(m => {
                const role = m.senderId === USER_ID ? 'user' : (m.senderId === targetParticipant.id ? 'assistant' : 'user');
                const namePrefix = (m.senderId !== USER_ID && m.senderId !== targetParticipant.id) ? `[${allParticipants.find(p => p.id === m.senderId)?.name}]: ` : '';

                if (m.images && m.images.length > 0) {
                    return {
                        role,
                        content: [
                            { type: 'text', text: `${namePrefix}${m.content}` },
                            ...m.images.map(img => ({
                                type: 'image_url',
                                image_url: { url: `data:image/jpeg;base64,${img}` }
                            }))
                        ]
                    };
                } else {
                    return {
                        role,
                        content: `${namePrefix}${m.content}`
                    };
                }
            })
        ];
        return msgs;
    };

    let responseContent = '';
    let usage: TokenUsage | undefined;
    let generatedImages: string[] = [];
    let groundingMetadata: any = undefined;

    if (provider === ProviderType.GEMINI) {
        const geminiConfig: any = {
            temperature: config.temperature ?? 0.7,
            systemInstruction: finalSystemPrompt,
            safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
        };

        if (isDeepThinking) {
            geminiConfig.thinkingConfig = { thinkingBudget: 1024 };
        }

        const activeTools = [];
        if (isLogicMode) activeTools.push({ codeExecution: {} });
        if (isJudge) activeTools.push({ googleSearch: {} });

        if (activeTools.length > 0) geminiConfig.tools = activeTools;

        // Use proxy for China users, or direct SDK otherwise
        if (USE_BACKEND_PROXY) {
            // Route through backend proxy
            const response = await callGeminiViaProxy(
                config.apiKey,
                config.modelName || 'gemini-2.5-flash',
                { parts: getGeminiHistory() },
                geminiConfig,
                config.baseUrl
            );

            responseContent = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
            groundingMetadata = response.candidates?.[0]?.groundingMetadata;

            const usageMetadata = response.usageMetadata;
            usage = usageMetadata ? {
                promptTokens: usageMetadata.promptTokenCount || 0,
                completionTokens: usageMetadata.candidatesTokenCount || 0,
                totalTokens: usageMetadata.totalTokenCount || 0
            } : undefined;
        } else {
            // Direct SDK call (original behavior)
            const options = sanitizeOptions(config.apiKey, config.baseUrl);
            const ai = new GoogleGenAI(options);

            const response = await ai.models.generateContent({
                model: config.modelName || 'gemini-2.5-flash',
                contents: { parts: getGeminiHistory() },
                config: geminiConfig
            });

            responseContent = response.text || '';
            groundingMetadata = response.candidates?.[0]?.groundingMetadata;

            const usageMetadata = response.usageMetadata;
            usage = usageMetadata ? {
                promptTokens: usageMetadata.promptTokenCount || 0,
                completionTokens: usageMetadata.candidatesTokenCount || 0,
                totalTokens: usageMetadata.totalTokenCount || 0
            } : undefined;
        }

    } else {
        // OpenAI-compatible provider
        if (USE_BACKEND_PROXY) {
            // Route through backend proxy
            const data = await callOpenAIViaProxy(
                config.apiKey,
                config.baseUrl,
                config.modelName || 'gpt-3.5-turbo',
                getOpenAIMessages(),
                config.temperature ?? 0.7
            );

            responseContent = data.choices?.[0]?.message?.content || '';

            const usageData = data.usage;
            usage = usageData ? {
                promptTokens: usageData.prompt_tokens || 0,
                completionTokens: usageData.completion_tokens || 0,
                totalTokens: usageData.total_tokens || 0
            } : undefined;
        } else {
            // Direct API call (original behavior)
            const base = normalizeOpenAIUrl(config.baseUrl);
            const url = `${base}/chat/completions`;

            const payload = {
                model: config.modelName || 'gpt-3.5-turbo',
                messages: getOpenAIMessages(),
                temperature: config.temperature ?? 0.7,
            };

            const res = await fetchWithRetry(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify(payload)
            }, signal);

            const data = await res.json();
            responseContent = data.choices?.[0]?.message?.content || '';

            const usageData = data.usage;
            usage = usageData ? {
                promptTokens: usageData.prompt_tokens || 0,
                completionTokens: usageData.completion_tokens || 0,
                totalTokens: usageData.total_tokens || 0
            } : undefined;
        }
    }

    // --- POST-PROCESSING: GENERATE IMAGE IF REQUESTED ---
    const imgTagRegex = /\[\[IMG:\s*(.*?)\]\]/g;
    const matches = [...responseContent.matchAll(imgTagRegex)];

    if (matches.length > 0) {
        const imgPrompt = matches[0][1];
        try {
            responseContent = responseContent.replace(imgTagRegex, '').trim();
            const imgBase64 = await generateImage(
                imgPrompt,
                config.apiKey,
                '1K',
                '1:1',
                config.baseUrl,
                undefined,
                undefined,
                provider
            );
            generatedImages.push(imgBase64);
        } catch (err) {
            console.error("Auto-Image Generation Failed:", err);
        }
    }

    // --- EXTRACT AGENT COMMANDS ---
    let agentCommands: any[] = [];
    try {
        const jsonStart = responseContent.indexOf('{');
        const jsonEnd = responseContent.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
            let jsonStr = responseContent.slice(jsonStart, jsonEnd + 1);
            // Simple cleanup
            jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '');
            const parsed = JSON.parse(jsonStr);
            if (parsed && Array.isArray(parsed.AgentCommands)) {
                agentCommands = parsed.AgentCommands;
            }
        }
    } catch (e) {
        // Ignore parsing error, as main content might still be valid or handled by display
    }

    return { content: responseContent, usage, generatedImages, groundingMetadata, agentCommands };
};

// ... (Rest of multimedia functions remain unchanged) ...
export const generateImage = async (
    prompt: string,
    apiKey: string,
    size: '1K' | '2K' | '4K',
    aspectRatio: string,
    baseUrl?: string,
    modelName?: string,
    config?: any,
    provider: ProviderType = ProviderType.GEMINI
): Promise<string> => {
    if (provider === ProviderType.GEMINI) {
        const model = modelName || 'gemini-2.5-flash-image';

        if (USE_BACKEND_PROXY) {
            // Route through backend proxy
            if (model.toLowerCase().includes('imagen')) {
                const response = await callGeminiImagesViaProxy(
                    apiKey,
                    model,
                    prompt,
                    { numberOfImages: 1, aspectRatio, outputMimeType: 'image/jpeg' },
                    baseUrl
                );
                return response.predictions?.[0]?.bytesBase64Encoded || '';
            } else {
                const imageConfig: any = { aspectRatio };
                if (model.includes('pro-image')) {
                    imageConfig.imageSize = size;
                }
                const response = await callGeminiViaProxy(
                    apiKey,
                    model,
                    { parts: [{ text: prompt }] },
                    { imageConfig },
                    baseUrl
                );
                for (const candidate of response.candidates || []) {
                    for (const part of candidate.content?.parts || []) {
                        if (part.inlineData) return part.inlineData.data;
                    }
                }
                throw new Error("No image generated.");
            }
        } else {
            // Direct SDK call
            const options = sanitizeOptions(apiKey, baseUrl);
            const ai = new GoogleGenAI(options);

            if (model.toLowerCase().includes('imagen')) {
                const response = await ai.models.generateImages({
                    model,
                    prompt,
                    config: {
                        numberOfImages: 1,
                        aspectRatio: aspectRatio as any,
                        outputMimeType: 'image/jpeg'
                    }
                });
                return response.generatedImages[0].image.imageBytes;
            } else {
                const imageConfig: any = { aspectRatio };
                if (model.includes('pro-image')) {
                    imageConfig.imageSize = size;
                }

                const response = await ai.models.generateContent({
                    model,
                    contents: { parts: [{ text: prompt }] },
                    config: { imageConfig }
                });

                for (const candidate of response.candidates || []) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData) return part.inlineData.data;
                    }
                }
                throw new Error("No image generated.");
            }
        }
    } else {
        if (USE_BACKEND_PROXY) {
            const res = await callOpenAIImagesViaProxy(
                apiKey,
                baseUrl,
                modelName || 'dall-e-3',
                prompt,
                '1024x1024'
            );
            return res.data[0].b64_json;
        } else {
            const res = await fetchOpenAI('/images/generations', apiKey, baseUrl, {
                model: modelName || 'dall-e-3',
                prompt,
                n: 1,
                size: "1024x1024",
                response_format: "b64_json"
            });
            return res.data[0].b64_json;
        }
    }
}

export const generateVideo = async (
    prompt: string,
    apiKey: string,
    aspectRatio: '16:9' | '9:16',
    baseUrl?: string,
    modelName?: string,
    config?: any,
    provider: ProviderType = ProviderType.GEMINI
): Promise<string> => {
    if (provider === ProviderType.GEMINI) {
        const model = modelName || 'veo-3.1-fast-generate-preview';

        // Build video config with all parameters
        const videoConfig: any = {
            numberOfVideos: 1,
            aspectRatio,
            resolution: config?.resolution || '720p'
        };

        // Add durationSeconds if provided (let API handle validation)
        if (config?.durationSeconds && config.durationSeconds > 0) {
            videoConfig.durationSeconds = config.durationSeconds;
        }

        // Add fps if provided
        if (config?.fps) {
            videoConfig.fps = config.fps;
        }

        // Add seed if provided
        if (config?.seed && config.seed > 0) {
            videoConfig.seed = config.seed;
        }

        if (USE_BACKEND_PROXY) {
            // Route through backend proxy
            const initResponse = await callGeminiVideosViaProxy(
                apiKey,
                model,
                prompt,
                videoConfig,
                baseUrl
            );

            // Poll for operation completion
            let operationName = initResponse.name;
            let operation = initResponse;

            while (!operation.done) {
                await wait(5000);
                operation = await checkOperationViaProxy(operationName, apiKey, baseUrl);
            }

            if (operation.error) throw new Error(operation.error.message);

            // Debug: Log the full response structure
            console.log('Video operation response:', JSON.stringify(operation, null, 2));

            // Try multiple paths for URI extraction (API structure may vary)
            let uri = operation.response?.generatedVideos?.[0]?.video?.uri
                || operation.response?.videos?.[0]?.uri
                || operation.generatedVideos?.[0]?.video?.uri
                || operation.videos?.[0]?.uri;

            if (!uri) {
                console.error('Video generation failed - no URI in response:', operation);
                throw new Error("No video URI returned. Response: " + JSON.stringify(operation.response || operation).slice(0, 500));
            }

            // Return proxied URI for China users
            return `${URI_PREFIX}${PROXY_API_BASE}/api/proxy/fetch-uri?uri=${encodeURIComponent(uri + '&key=' + apiKey)}`;
        } else {
            const options = sanitizeOptions(apiKey, baseUrl);
            const ai = new GoogleGenAI(options);

            let operation = await ai.models.generateVideos({
                model,
                prompt,
                config: videoConfig
            });

            while (!operation.done) {
                await wait(5000);
                operation = await ai.operations.getVideosOperation({ operation: operation } as any);
            }

            if (operation.error) throw new Error((operation.error as any).message);

            // Try multiple paths for URI extraction (API structure may vary)
            let uri = operation.response?.generatedVideos?.[0]?.video?.uri
                || operation.response?.videos?.[0]?.uri
                || (operation as any).generatedVideos?.[0]?.video?.uri
                || (operation as any).videos?.[0]?.uri;

            if (!uri) {
                console.error('Video generation failed - no URI in response:', operation);
                throw new Error("No video URI returned");
            }

            return `${URI_PREFIX}${uri}&key=${apiKey}`;
        }
    } else {
        throw new Error("Video generation only supported on Gemini Veo models currently.");
    }
}

export const generateSpeech = async (
    text: string,
    apiKey: string,
    voiceName: string,
    baseUrl?: string,
    modelName?: string,
    config?: any,
    provider: ProviderType = ProviderType.GEMINI
): Promise<string> => {
    if (provider === ProviderType.GEMINI) {
        const model = modelName || 'gemini-2.5-flash-preview-tts';

        if (USE_BACKEND_PROXY) {
            const response = await callGeminiViaProxy(
                apiKey,
                model,
                { parts: [{ text }] },
                {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' }
                        }
                    }
                },
                baseUrl
            );

            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!audioData) throw new Error("No audio generated");
            return audioData;
        } else {
            const options = sanitizeOptions(apiKey, baseUrl);
            const ai = new GoogleGenAI(options);

            const response = await ai.models.generateContent({
                model,
                contents: { parts: [{ text }] },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' }
                        }
                    }
                }
            });

            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!audioData) throw new Error("No audio generated");
            return audioData;
        }
    } else {
        if (USE_BACKEND_PROXY) {
            return await callOpenAISpeechViaProxy(
                apiKey,
                baseUrl,
                modelName || 'tts-1',
                text,
                voiceName.toLowerCase() || 'alloy'
            );
        } else {
            const res = await fetchOpenAI('/audio/speech', apiKey, baseUrl, {
                model: modelName || 'tts-1',
                input: text,
                voice: voiceName.toLowerCase() || 'alloy'
            }, true);

            const blob = res as Blob;
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            let binary = '';
            const len = buffer.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(buffer[i]);
            }
            return btoa(binary);
        }
    }
}

export const transcribeAudio = async (
    audioBase64: string,
    apiKey: string,
    baseUrl?: string,
    modelName?: string,
    config?: any,
    provider: ProviderType = ProviderType.GEMINI
): Promise<string> => {
    if (provider === ProviderType.GEMINI) {
        const model = modelName || 'gemini-2.5-flash';

        if (USE_BACKEND_PROXY) {
            const response = await callGeminiViaProxy(
                apiKey,
                model,
                {
                    parts: [
                        { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
                        { text: "Transcribe this audio." }
                    ]
                },
                {},
                baseUrl
            );
            return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
            const options = sanitizeOptions(apiKey, baseUrl);
            const ai = new GoogleGenAI(options);

            const response = await ai.models.generateContent({
                model,
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } } as any,
                        { text: "Transcribe this audio." }
                    ]
                }
            });
            return response.text || '';
        }
    } else {
        throw new Error("Audio transcription via OpenAI protocol not fully implemented in this demo.");
    }
}

export const analyzeMedia = async (
    mediaBase64: string,
    mimeType: string,
    prompt: string,
    apiKey: string,
    baseUrl?: string,
    modelName?: string,
    config?: any,
    provider: ProviderType = ProviderType.GEMINI
): Promise<string> => {
    if (provider === ProviderType.GEMINI) {
        const model = modelName || 'gemini-2.5-flash';

        if (USE_BACKEND_PROXY) {
            const response = await callGeminiViaProxy(
                apiKey,
                model,
                {
                    parts: [
                        { inlineData: { mimeType: mimeType || 'image/png', data: mediaBase64 } },
                        { text: prompt }
                    ]
                },
                {},
                baseUrl
            );
            return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
            const options = sanitizeOptions(apiKey, baseUrl);
            const ai = new GoogleGenAI(options);

            const response = await ai.models.generateContent({
                model,
                contents: {
                    parts: [
                        { inlineData: { mimeType: mimeType || 'image/png', data: mediaBase64 } } as any,
                        { text: prompt }
                    ]
                }
            });
            return response.text || '';
        }
    } else {
        if (USE_BACKEND_PROXY) {
            const data = await callOpenAIViaProxy(
                apiKey,
                baseUrl,
                modelName || 'gpt-4o',
                [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${mediaBase64}` } }
                    ]
                }],
                0.7
            );
            return data.choices[0].message.content || '';
        } else {
            const payload = {
                model: modelName || 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${mediaBase64}` } }
                    ]
                }],
                max_tokens: 300
            };
            const res = await fetchOpenAI('/chat/completions', apiKey, baseUrl, payload);
            return res.choices[0].message.content || '';
        }
    }
}

export const editImage = async (
    imageBase64: string,
    prompt: string,
    apiKey: string,
    baseUrl?: string,
    modelName?: string,
    config?: any,
    provider: ProviderType = ProviderType.GEMINI
): Promise<string> => {
    if (provider === ProviderType.GEMINI) {
        const model = modelName || 'gemini-2.5-flash-image';

        if (USE_BACKEND_PROXY) {
            const response = await callGeminiViaProxy(
                apiKey,
                model,
                {
                    parts: [
                        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
                        { text: prompt }
                    ]
                },
                { imageConfig: { aspectRatio: '1:1' } },
                baseUrl
            );

            for (const candidate of response.candidates || []) {
                for (const part of candidate.content?.parts || []) {
                    if (part.inlineData) return part.inlineData.data;
                }
            }
            throw new Error("No edited image returned");
        } else {
            const options = sanitizeOptions(apiKey, baseUrl);
            const ai = new GoogleGenAI(options);

            const response = await ai.models.generateContent({
                model,
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/png', data: imageBase64 } } as any,
                        { text: prompt }
                    ]
                },
                config: {
                    imageConfig: {
                        aspectRatio: '1:1' as any
                    }
                }
            });

            for (const candidate of response.candidates || []) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData) return part.inlineData.data;
                }
            }
            throw new Error("No edited image returned");
        }
    } else {
        throw new Error("Image editing only supported on Gemini models currently.");
    }
}

