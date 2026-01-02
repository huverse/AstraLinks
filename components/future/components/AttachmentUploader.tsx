/**
 * Future Letters - Attachment Uploader Component
 * Handles image and audio file uploads with preview
 */

import React, { useState, useRef, useCallback } from 'react';
import {
    Image,
    Mic,
    X,
    Loader2,
    Upload,
    Play,
    Pause,
    AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { API_BASE } from '../../../utils/api';

export interface AttachmentItem {
    id: number;
    storageKey: string;
    originalName?: string;
    mimeType: string;
    sizeBytes: number;
    attachmentType: 'image' | 'audio';
    thumbnailKey?: string;
    width?: number;
    height?: number;
    durationMs?: number;
}

interface AttachmentUploaderProps {
    letterId?: string;
    attachments: AttachmentItem[];
    onAttachmentsChange: (attachments: AttachmentItem[]) => void;
    maxImages?: number;
    maxAudio?: number;
    disabled?: boolean;
}

interface UploadingFile {
    id: string;
    file: File;
    type: 'image' | 'audio';
    progress: number;
    error?: string;
}

const MAX_IMAGE_SIZE_MB = 5;
const MAX_AUDIO_SIZE_MB = 10;
const MAX_AUDIO_DURATION_SEC = 180;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/m4a', 'audio/x-m4a'];

export default function AttachmentUploader({
    letterId,
    attachments,
    onAttachmentsChange,
    maxImages = 2,
    maxAudio = 1,
    disabled = false,
}: AttachmentUploaderProps) {
    const { token } = useAuth();
    const [uploading, setUploading] = useState<UploadingFile[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [playingAudio, setPlayingAudio] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);

    const imageCount = attachments.filter(a => a.attachmentType === 'image').length;
    const audioCount = attachments.filter(a => a.attachmentType === 'audio').length;

    const canAddImage = imageCount < maxImages;
    const canAddAudio = audioCount < maxAudio;

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const getAudioDuration = (file: File): Promise<number> => {
        return new Promise((resolve) => {
            const audio = document.createElement('audio');
            audio.preload = 'metadata';
            audio.onloadedmetadata = () => {
                window.URL.revokeObjectURL(audio.src);
                resolve(Math.floor(audio.duration * 1000));
            };
            audio.onerror = () => resolve(0);
            audio.src = URL.createObjectURL(file);
        });
    };

    const uploadFile = async (file: File, type: 'image' | 'audio'): Promise<AttachmentItem | null> => {
        if (!letterId) {
            setError('请先保存草稿后再添加附件');
            return null;
        }

        // Validate size
        const maxSizeBytes = type === 'image'
            ? MAX_IMAGE_SIZE_MB * 1024 * 1024
            : MAX_AUDIO_SIZE_MB * 1024 * 1024;

        if (file.size > maxSizeBytes) {
            setError(`文件大小超过限制（最大 ${type === 'image' ? MAX_IMAGE_SIZE_MB : MAX_AUDIO_SIZE_MB}MB）`);
            return null;
        }

        // Get duration for audio
        let durationMs: number | undefined;
        if (type === 'audio') {
            durationMs = await getAudioDuration(file);
            if (durationMs > MAX_AUDIO_DURATION_SEC * 1000) {
                setError(`音频时长超过限制（最大 ${MAX_AUDIO_DURATION_SEC} 秒）`);
                return null;
            }
        }

        const base64 = await fileToBase64(file);

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/api/future/letters/${letterId}/attachments`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({
                fileName: file.name,
                mimeType: file.type,
                attachmentType: type,
                fileBase64: base64,
                durationMs,
            }),
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error?.message || '上传失败');
        }

        return await response.json();
    };

    const handleFileSelect = useCallback(async (files: FileList | null, type: 'image' | 'audio') => {
        if (!files || files.length === 0 || disabled) return;

        setError(null);
        const allowedTypes = type === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_AUDIO_TYPES;
        const maxCount = type === 'image' ? maxImages : maxAudio;
        const currentCount = type === 'image' ? imageCount : audioCount;

        const validFiles: File[] = [];
        for (let i = 0; i < files.length && validFiles.length + currentCount < maxCount; i++) {
            const file = files[i];
            if (allowedTypes.includes(file.type)) {
                validFiles.push(file);
            } else {
                setError(`不支持的文件格式：${file.name}`);
            }
        }

        if (validFiles.length === 0) return;

        // Add to uploading list
        const uploadingItems: UploadingFile[] = validFiles.map(file => ({
            id: `${Date.now()}-${Math.random()}`,
            file,
            type,
            progress: 0,
        }));

        setUploading(prev => [...prev, ...uploadingItems]);

        // Upload files
        for (const item of uploadingItems) {
            try {
                setUploading(prev =>
                    prev.map(u => u.id === item.id ? { ...u, progress: 50 } : u)
                );

                const attachment = await uploadFile(item.file, type);

                if (attachment) {
                    onAttachmentsChange([...attachments, attachment]);
                }

                // Remove from uploading
                setUploading(prev => prev.filter(u => u.id !== item.id));
            } catch (err) {
                const message = err instanceof Error ? err.message : '上传失败';
                setUploading(prev =>
                    prev.map(u => u.id === item.id ? { ...u, error: message } : u)
                );
            }
        }
    }, [letterId, attachments, onAttachmentsChange, disabled, maxImages, maxAudio, imageCount, audioCount]);

    const handleDelete = async (attachment: AttachmentItem) => {
        if (!letterId || disabled) return;

        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(
                `${API_BASE}/api/future/letters/${letterId}/attachments/${attachment.id}`,
                { method: 'DELETE', credentials: 'include', headers }
            );

            if (!response.ok && response.status !== 404) {
                const data = await response.json();
                throw new Error(data.error?.message || '删除失败');
            }

            onAttachmentsChange(attachments.filter(a => a.id !== attachment.id));
        } catch (err) {
            const message = err instanceof Error ? err.message : '删除失败';
            setError(message);
        }
    };

    const toggleAudioPlay = (storageKey: string) => {
        if (playingAudio === storageKey) {
            audioRef.current?.pause();
            setPlayingAudio(null);
        } else {
            if (audioRef.current) {
                audioRef.current.src = `${API_BASE}/api/future/attachments/${storageKey}`;
                audioRef.current.play();
            }
            setPlayingAudio(storageKey);
        }
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return '--:--';
        const seconds = Math.floor(ms / 1000);
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    const getAttachmentUrl = (storageKey: string) => `${API_BASE}/api/future/attachments/${storageKey}`;
    const getThumbnailUrl = (attachment: AttachmentItem) =>
        attachment.thumbnailKey
            ? `${API_BASE}/api/future/attachments/${attachment.thumbnailKey}`
            : getAttachmentUrl(attachment.storageKey);

    return (
        <div className="space-y-4">
            {/* Hidden Audio Element */}
            <audio
                ref={audioRef}
                onEnded={() => setPlayingAudio(null)}
                className="hidden"
            />

            {/* Error Message */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Upload Buttons */}
            <div className="flex gap-3">
                {/* Image Upload */}
                <div className="flex-1">
                    <input
                        ref={imageInputRef}
                        type="file"
                        accept={ALLOWED_IMAGE_TYPES.join(',')}
                        multiple
                        onChange={(e) => handleFileSelect(e.target.files, 'image')}
                        className="hidden"
                        disabled={disabled || !canAddImage}
                    />
                    <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={disabled || !canAddImage || !letterId}
                        className="w-full p-4 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center gap-2 hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Image className="w-6 h-6 text-purple-400" />
                        <div className="text-sm">
                            <span className="font-medium">添加图片</span>
                            <span className="text-white/50 ml-1">({imageCount}/{maxImages})</span>
                        </div>
                        <div className="text-xs text-white/40">JPG, PNG, WebP, GIF ≤{MAX_IMAGE_SIZE_MB}MB</div>
                    </button>
                </div>

                {/* Audio Upload */}
                <div className="flex-1">
                    <input
                        ref={audioInputRef}
                        type="file"
                        accept={ALLOWED_AUDIO_TYPES.join(',')}
                        onChange={(e) => handleFileSelect(e.target.files, 'audio')}
                        className="hidden"
                        disabled={disabled || !canAddAudio}
                    />
                    <button
                        onClick={() => audioInputRef.current?.click()}
                        disabled={disabled || !canAddAudio || !letterId}
                        className="w-full p-4 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center gap-2 hover:border-pink-500/50 hover:bg-pink-500/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Mic className="w-6 h-6 text-pink-400" />
                        <div className="text-sm">
                            <span className="font-medium">添加录音</span>
                            <span className="text-white/50 ml-1">({audioCount}/{maxAudio})</span>
                        </div>
                        <div className="text-xs text-white/40">MP3, WAV, M4A ≤{MAX_AUDIO_SIZE_MB}MB</div>
                    </button>
                </div>
            </div>

            {/* No letterId hint */}
            {!letterId && (attachments.length === 0) && (
                <div className="text-center text-sm text-white/50 py-2">
                    请先填写标题后自动保存，即可添加附件
                </div>
            )}

            {/* Uploading Files */}
            {uploading.length > 0 && (
                <div className="space-y-2">
                    {uploading.map(item => (
                        <div
                            key={item.id}
                            className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
                        >
                            <div className="w-10 h-10 flex items-center justify-center bg-white/10 rounded">
                                {item.error ? (
                                    <AlertCircle className="w-5 h-5 text-red-400" />
                                ) : (
                                    <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{item.file.name}</div>
                                {item.error ? (
                                    <div className="text-xs text-red-400">{item.error}</div>
                                ) : (
                                    <div className="text-xs text-white/50">上传中...</div>
                                )}
                            </div>
                            {item.error && (
                                <button
                                    onClick={() => setUploading(prev => prev.filter(u => u.id !== item.id))}
                                    className="p-1 text-white/50 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Image Attachments */}
            {attachments.filter(a => a.attachmentType === 'image').length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    {attachments
                        .filter(a => a.attachmentType === 'image')
                        .map(attachment => (
                            <div
                                key={attachment.id}
                                className="relative group aspect-square rounded-lg overflow-hidden bg-white/5"
                            >
                                <img
                                    src={getThumbnailUrl(attachment)}
                                    alt={attachment.originalName || 'Image'}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <a
                                        href={getAttachmentUrl(attachment.storageKey)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                                    >
                                        <Upload className="w-4 h-4" />
                                    </a>
                                    {!disabled && (
                                        <button
                                            onClick={() => handleDelete(attachment)}
                                            className="p-2 bg-red-500/50 rounded-full hover:bg-red-500/70 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                                    <div className="text-xs truncate">{attachment.originalName}</div>
                                    <div className="text-xs text-white/50">
                                        {attachment.width}×{attachment.height} · {formatFileSize(attachment.sizeBytes)}
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>
            )}

            {/* Audio Attachments */}
            {attachments.filter(a => a.attachmentType === 'audio').length > 0 && (
                <div className="space-y-2">
                    {attachments
                        .filter(a => a.attachmentType === 'audio')
                        .map(attachment => (
                            <div
                                key={attachment.id}
                                className="flex items-center gap-3 p-3 bg-white/5 rounded-lg group"
                            >
                                <button
                                    onClick={() => toggleAudioPlay(attachment.storageKey)}
                                    className="w-10 h-10 flex items-center justify-center bg-pink-500/20 rounded-full hover:bg-pink-500/30 transition-colors"
                                >
                                    {playingAudio === attachment.storageKey ? (
                                        <Pause className="w-5 h-5 text-pink-400" />
                                    ) : (
                                        <Play className="w-5 h-5 text-pink-400 ml-0.5" />
                                    )}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm truncate">{attachment.originalName || '录音'}</div>
                                    <div className="text-xs text-white/50">
                                        {formatDuration(attachment.durationMs)} · {formatFileSize(attachment.sizeBytes)}
                                    </div>
                                </div>
                                {!disabled && (
                                    <button
                                        onClick={() => handleDelete(attachment)}
                                        className="p-2 opacity-0 group-hover:opacity-100 text-white/50 hover:text-red-400 transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                </div>
            )}
        </div>
    );
}
