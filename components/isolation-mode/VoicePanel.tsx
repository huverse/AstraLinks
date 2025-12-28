/**
 * 语音面板
 *
 * 集成 Gemini Live API 实现语音交互
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2 } from 'lucide-react';

interface VoicePanelProps {
    onVoiceInput?: (text: string) => void;
    onStatusChange?: (status: 'idle' | 'connecting' | 'connected' | 'error') => void;
    apiKey?: string;
    disabled?: boolean;
}

export const VoicePanel: React.FC<VoicePanelProps> = ({
    onVoiceInput,
    onStatusChange,
    apiKey,
    disabled = false
}) => {
    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOff, setIsSpeakerOff] = useState(false);
    const [transcript, setTranscript] = useState('');

    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);

    const updateStatus = useCallback((newStatus: typeof status) => {
        setStatus(newStatus);
        onStatusChange?.(newStatus);
    }, [onStatusChange]);

    const connect = useCallback(async () => {
        if (!apiKey) {
            updateStatus('error');
            return;
        }

        updateStatus('connecting');

        try {
            // 获取麦克风权限
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            // 创建 AudioContext
            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            // 连接 WebSocket
            const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/gemini-live?apiKey=${encodeURIComponent(apiKey)}&model=gemini-2.0-flash-exp&voiceName=Puck`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                updateStatus('connected');
                startAudioCapture(stream, audioContext, ws);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // 处理转录文本
                    if (data.type === 'transcript' && data.text) {
                        setTranscript(data.text);
                        if (data.isFinal) {
                            onVoiceInput?.(data.text);
                            setTranscript('');
                        }
                    }

                    // 处理音频响应
                    if (data.type === 'audio' && data.data && !isSpeakerOff) {
                        playAudioChunk(data.data);
                    }
                } catch (e) {
                    console.error('Failed to parse WS message', e);
                }
            };

            ws.onerror = () => {
                updateStatus('error');
            };

            ws.onclose = () => {
                if (status === 'connected') {
                    updateStatus('idle');
                }
            };
        } catch (e) {
            console.error('Failed to connect voice', e);
            updateStatus('error');
        }
    }, [apiKey, updateStatus, onVoiceInput, isSpeakerOff, status]);

    const startAudioCapture = (stream: MediaStream, audioContext: AudioContext, ws: WebSocket) => {
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
            if (isMuted || ws.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);
            // 转换为 16-bit PCM
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768)));
            }

            // Base64 编码并发送
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
            ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
    };

    const playAudioChunk = async (base64: string) => {
        try {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const audioContext = audioContextRef.current || new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
        } catch (e) {
            // 静默处理解码错误
        }
    };

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        updateStatus('idle');
        setTranscript('');
    }, [updateStatus]);

    // 清理
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    const isConnected = status === 'connected';
    const isConnecting = status === 'connecting';

    return (
        <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Mic size={12} />
                    语音控制
                </h4>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                    status === 'connected' ? 'bg-green-500/20 text-green-400' :
                    status === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' :
                    status === 'error' ? 'bg-red-500/20 text-red-400' :
                    'bg-slate-700/50 text-slate-500'
                }`}>
                    {status === 'connected' ? '已连接' :
                     status === 'connecting' ? '连接中' :
                     status === 'error' ? '错误' : '未连接'}
                </span>
            </div>

            {/* 连接按钮 */}
            <div className="flex items-center gap-2">
                {isConnected ? (
                    <button
                        onClick={disconnect}
                        className="flex-1 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg flex items-center justify-center gap-2 text-sm"
                    >
                        <PhoneOff size={14} />
                        断开
                    </button>
                ) : (
                    <button
                        onClick={connect}
                        disabled={disabled || isConnecting || !apiKey}
                        className="flex-1 py-2 bg-green-600/80 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 text-sm"
                    >
                        {isConnecting ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Phone size={14} />
                        )}
                        连接语音
                    </button>
                )}
            </div>

            {/* 控制按钮 */}
            {isConnected && (
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`py-1.5 rounded-lg flex items-center justify-center gap-1 text-sm ${
                            isMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/60 text-white hover:bg-slate-700'
                        }`}
                    >
                        {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                        {isMuted ? '已静音' : '麦克风'}
                    </button>
                    <button
                        onClick={() => setIsSpeakerOff(!isSpeakerOff)}
                        className={`py-1.5 rounded-lg flex items-center justify-center gap-1 text-sm ${
                            isSpeakerOff ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/60 text-white hover:bg-slate-700'
                        }`}
                    >
                        {isSpeakerOff ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        {isSpeakerOff ? '已静音' : '扬声器'}
                    </button>
                </div>
            )}

            {/* 实时转录 */}
            {transcript && (
                <div className="bg-slate-900/40 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500 mb-1">正在识别...</div>
                    <div className="text-xs text-slate-300">{transcript}</div>
                </div>
            )}

            {/* 提示 */}
            {!apiKey && (
                <p className="text-[10px] text-slate-500 text-center">
                    需要配置 Gemini API Key
                </p>
            )}
        </div>
    );
};
