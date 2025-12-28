import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { IncomingMessage } from 'http';
import { GoogleGenAI, Modality } from '@google/genai';

/**
 * Gemini Live API WebSocket Proxy
 *
 * This allows Chinese users to use Gemini Live API through the US server.
 *
 * Client connects to: ws://server/gemini-live?apiKey=xxx&model=xxx&voiceName=xxx&mode=audio|video
 * Server connects to: Google Gemini Live API
 * Messages are proxied bidirectionally.
 */

interface LiveProxySession {
    clientWs: WsWebSocket;
    geminiClient: any;
    isConnected: boolean;
    mode: 'audio' | 'video';
}

const activeSessions = new Map<WsWebSocket, LiveProxySession>();

export function initGeminiLiveProxy(httpServer: HttpServer): void {
    const wss = new WebSocketServer({
        server: httpServer,
        path: '/gemini-live'
    });

    wss.on('connection', async (clientWs: WsWebSocket, req: IncomingMessage) => {
        console.log('🎤 Gemini Live: Client connected');

        // Parse query parameters
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const apiKey = url.searchParams.get('apiKey');
        const model = url.searchParams.get('model') || 'gemini-2.5-flash-native-audio-preview-09-2025';
        const voiceName = url.searchParams.get('voiceName') || 'Kore';
        const baseUrl = url.searchParams.get('baseUrl') || undefined;
        const mode = (url.searchParams.get('mode') || 'audio') as 'audio' | 'video';

        if (!apiKey) {
            clientWs.send(JSON.stringify({ error: 'API Key is required' }));
            clientWs.close();
            return;
        }

        try {
            // Create Google AI client
            const options: any = { apiKey };
            if (baseUrl) {
                options.baseUrl = baseUrl.replace(/\/+$/, '');
            }
            const ai = new GoogleGenAI(options);

            // Configure response modalities based on mode
            const responseModalities = mode === 'video'
                ? [Modality.AUDIO]
                : [Modality.AUDIO];

            console.log(`🎤 Gemini Live: Mode=${mode}, Model=${model}`);

            // Connect to Gemini Live API
            const geminiClient = await ai.live.connect({
                model,
                config: {
                    responseModalities,
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName } }
                    }
                },
                callbacks: {
                    onopen: () => {
                        console.log('🎤 Gemini Live: Connected to Google');
                        clientWs.send(JSON.stringify({ type: 'connected' }));
                    },
                    onmessage: (msg: any) => {
                        // Forward Gemini responses to client
                        if (clientWs.readyState === WsWebSocket.OPEN) {
                            clientWs.send(JSON.stringify({ type: 'message', data: msg }));
                        }
                    },
                    onclose: () => {
                        console.log('🎤 Gemini Live: Disconnected from Google');
                        if (clientWs.readyState === WsWebSocket.OPEN) {
                            clientWs.send(JSON.stringify({ type: 'disconnected' }));
                            clientWs.close();
                        }
                    },
                    onerror: (err: any) => {
                        console.error('🎤 Gemini Live Error:', err);
                        if (clientWs.readyState === WsWebSocket.OPEN) {
                            clientWs.send(JSON.stringify({ type: 'error', error: err?.message || 'Unknown error' }));
                        }
                    }
                }
            });

            // Store session
            const session: LiveProxySession = {
                clientWs,
                geminiClient,
                isConnected: true,
                mode
            };
            activeSessions.set(clientWs, session);

            // Handle messages from client
            clientWs.on('message', (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());

                    if (msg.type === 'audio') {
                        // Forward audio to Gemini
                        geminiClient.sendRealtimeInput({
                            media: {
                                mimeType: msg.mimeType || 'audio/pcm;rate=16000',
                                data: msg.data
                            }
                        });
                    } else if (msg.type === 'video') {
                        // Forward video frame to Gemini (for video mode)
                        geminiClient.sendRealtimeInput({
                            media: {
                                mimeType: msg.mimeType || 'image/jpeg',
                                data: msg.data
                            }
                        });
                    }
                    // Note: Live API in audio mode doesn't support text input directly
                } catch (e) {
                    console.error('🎤 Error processing client message:', e);
                }
            });

            // Handle client disconnect
            clientWs.on('close', () => {
                console.log('🎤 Gemini Live: Client disconnected');
                const session = activeSessions.get(clientWs);
                if (session) {
                    try {
                        session.geminiClient.close();
                    } catch (e) {
                        // Ignore close errors
                    }
                    activeSessions.delete(clientWs);
                }
            });

        } catch (error: any) {
            console.error('🎤 Gemini Live: Connection failed:', error);
            clientWs.send(JSON.stringify({ type: 'error', error: error.message }));
            clientWs.close();
        }
    });

    console.log('🎤 Gemini Live WebSocket proxy initialized at /gemini-live');
}
