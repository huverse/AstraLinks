/**
 * Preview Container - 网页预览圈选容器
 *
 * 包含 iframe 预览、标注画布、DOM 检查器
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    X, Square, Pencil, MousePointer2, Copy, Link2,
    Maximize2, Minimize2, RefreshCw, Camera, Trash2,
    ChevronRight, Code, FileText, Eye
} from 'lucide-react';
import { API_BASE, authFetch } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

interface Annotation {
    id: string;
    annotationType: 'rectangle' | 'freehand' | 'point';
    bbox: { x: number; y: number; width: number; height: number } | null;
    pathData: string | null;
    domSelector: string | null;
    domXpath: string | null;
    sourceFile: string | null;
    sourceLines: { start: number; end: number } | null;
    quoteText: string | null;
    screenshotUrl: string | null;
}

interface PreviewContainerProps {
    previewUrl: string;
    sessionId?: string;
    workflowRunId?: string;
    sandboxSessionId?: string;
    onClose: () => void;
    onAnnotationSelect?: (annotation: Annotation) => void;
    onQuote?: (text: string, annotation: Annotation) => void;
}

export default function PreviewContainer({
    previewUrl,
    sessionId: initialSessionId,
    workflowRunId,
    sandboxSessionId,
    onClose,
    onAnnotationSelect,
    onQuote
}: PreviewContainerProps) {
    const { token } = useAuth();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [selectedTool, setSelectedTool] = useState<'select' | 'rectangle' | 'freehand'>('select');
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showAnnotations, setShowAnnotations] = useState(true);
    const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
    const [hoveredElement, setHoveredElement] = useState<string | null>(null);
    const [iframeLoaded, setIframeLoaded] = useState(false);

    // 创建或获取会话
    useEffect(() => {
        const initSession = async () => {
            if (sessionId) {
                // 加载已有会话
                await loadSession();
            } else {
                // 创建新会话
                await createSession();
            }
        };
        initSession();
    }, []);

    const createSession = async () => {
        if (!token) return;
        try {
            const data = await authFetch<{ success: boolean; session: { id: string } }>(
                '/api/preview/sessions',
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({ previewUrl, workflowRunId, sandboxSessionId })
                }
            );
            setSessionId(data.session.id);
        } catch (err) {
            console.error('[Preview] Create session error:', err);
        }
    };

    const loadSession = async () => {
        if (!token || !sessionId) return;
        try {
            const data = await authFetch<{ success: boolean; annotations: Annotation[] }>(
                `/api/preview/sessions/${sessionId}`,
                token
            );
            setAnnotations(data.annotations);
        } catch (err) {
            console.error('[Preview] Load session error:', err);
        }
    };

    // 画布绘制逻辑
    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (selectedTool === 'select') return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsDrawing(true);
        setDrawStart({ x, y });

        if (selectedTool === 'freehand') {
            setCurrentPath(`M ${x} ${y}`);
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !drawStart) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (selectedTool === 'freehand') {
            setCurrentPath(prev => `${prev} L ${x} ${y}`);
        }

        // 重绘画布
        redrawCanvas(x, y);
    };

    const handleCanvasMouseUp = async (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !drawStart) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsDrawing(false);

        // 创建标注
        if (selectedTool === 'rectangle') {
            const bbox = {
                x: Math.min(drawStart.x, x),
                y: Math.min(drawStart.y, y),
                width: Math.abs(x - drawStart.x),
                height: Math.abs(y - drawStart.y)
            };

            if (bbox.width > 5 && bbox.height > 5) {
                await createAnnotation('rectangle', bbox, null);
            }
        } else if (selectedTool === 'freehand' && currentPath) {
            await createAnnotation('freehand', null, currentPath);
        }

        setDrawStart(null);
        setCurrentPath('');
    };

    const redrawCanvas = useCallback((currentX?: number, currentY?: number) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 绘制已有标注
        if (showAnnotations) {
            annotations.forEach(ann => {
                ctx.strokeStyle = ann.id === selectedAnnotation ? '#fbbf24' : '#3b82f6';
                ctx.lineWidth = 2;

                if (ann.annotationType === 'rectangle' && ann.bbox) {
                    ctx.strokeRect(ann.bbox.x, ann.bbox.y, ann.bbox.width, ann.bbox.height);
                } else if (ann.annotationType === 'freehand' && ann.pathData) {
                    const path = new Path2D(ann.pathData);
                    ctx.stroke(path);
                }
            });
        }

        // 绘制当前正在绘制的形状
        if (isDrawing && drawStart) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            if (selectedTool === 'rectangle' && currentX !== undefined && currentY !== undefined) {
                ctx.strokeRect(
                    Math.min(drawStart.x, currentX),
                    Math.min(drawStart.y, currentY),
                    Math.abs(currentX - drawStart.x),
                    Math.abs(currentY - drawStart.y)
                );
            } else if (selectedTool === 'freehand' && currentPath) {
                const path = new Path2D(currentPath);
                ctx.stroke(path);
            }

            ctx.setLineDash([]);
        }
    }, [annotations, showAnnotations, selectedAnnotation, isDrawing, drawStart, selectedTool, currentPath]);

    useEffect(() => {
        redrawCanvas();
    }, [redrawCanvas]);

    const createAnnotation = async (
        annotationType: 'rectangle' | 'freehand' | 'point',
        bbox: Annotation['bbox'],
        pathData: string | null
    ) => {
        if (!token || !sessionId) return;

        try {
            const data = await authFetch<{ success: boolean; annotation: Annotation }>(
                '/api/preview/annotations',
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        sessionId,
                        annotationType,
                        bbox,
                        pathData
                    })
                }
            );
            setAnnotations(prev => [...prev, data.annotation]);
        } catch (err) {
            console.error('[Preview] Create annotation error:', err);
        }
    };

    const deleteAnnotation = async (annotationId: string) => {
        if (!token) return;

        try {
            await authFetch(`/api/preview/annotations/${annotationId}`, token, { method: 'DELETE' });
            setAnnotations(prev => prev.filter(a => a.id !== annotationId));
            if (selectedAnnotation === annotationId) {
                setSelectedAnnotation(null);
            }
        } catch (err) {
            console.error('[Preview] Delete annotation error:', err);
        }
    };

    const handleAnnotationClick = (annotation: Annotation) => {
        setSelectedAnnotation(annotation.id);
        onAnnotationSelect?.(annotation);
    };

    const copySelector = (annotation: Annotation) => {
        const text = annotation.domSelector ?? annotation.domXpath ?? '';
        navigator.clipboard.writeText(text);
    };

    const quoteAnnotation = (annotation: Annotation) => {
        if (annotation.quoteText) {
            onQuote?.(annotation.quoteText, annotation);
        }
    };

    const handleIframeLoad = () => {
        setIframeLoaded(true);

        // 调整画布大小匹配 iframe
        if (canvasRef.current && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            canvasRef.current.width = rect.width;
            canvasRef.current.height = rect.height - 48; // 减去工具栏高度
        }
    };

    const refreshPreview = () => {
        if (iframeRef.current) {
            iframeRef.current.src = previewUrl;
        }
    };

    const takeScreenshot = async () => {
        // 这里可以集成 html2canvas 或后端截图服务
        console.log('[Preview] Screenshot requested');
    };

    return (
        <div
            ref={containerRef}
            className={`bg-slate-900 rounded-xl border border-white/10 overflow-hidden flex flex-col ${
                isFullscreen ? 'fixed inset-4 z-50' : 'h-[600px]'
            }`}
        >
            {/* 工具栏 */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-white/10">
                <div className="flex items-center gap-2">
                    {/* 工具选择 */}
                    <div className="flex bg-black/30 rounded-lg p-0.5">
                        {[
                            { id: 'select', icon: MousePointer2, title: '选择' },
                            { id: 'rectangle', icon: Square, title: '矩形选区' },
                            { id: 'freehand', icon: Pencil, title: '自由绘制' }
                        ].map(tool => (
                            <button
                                key={tool.id}
                                onClick={() => setSelectedTool(tool.id as any)}
                                className={`p-2 rounded transition-colors ${
                                    selectedTool === tool.id
                                        ? 'bg-blue-500 text-white'
                                        : 'text-slate-400 hover:text-white hover:bg-white/10'
                                }`}
                                title={tool.title}
                            >
                                <tool.icon size={16} />
                            </button>
                        ))}
                    </div>

                    <div className="h-4 w-px bg-white/10" />

                    {/* 操作按钮 */}
                    <button
                        onClick={() => setShowAnnotations(!showAnnotations)}
                        className={`p-2 rounded transition-colors ${
                            showAnnotations ? 'text-blue-400' : 'text-slate-500'
                        } hover:bg-white/10`}
                        title="显示/隐藏标注"
                    >
                        <Eye size={16} />
                    </button>
                    <button
                        onClick={refreshPreview}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="刷新预览"
                    >
                        <RefreshCw size={16} />
                    </button>
                    <button
                        onClick={takeScreenshot}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="截图"
                    >
                        <Camera size={16} />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {/* URL 显示 */}
                    <div className="text-xs text-slate-500 max-w-[300px] truncate" title={previewUrl}>
                        {previewUrl}
                    </div>

                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title={isFullscreen ? '退出全屏' : '全屏'}
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* 预览区域 */}
            <div className="flex-1 relative">
                {/* iframe */}
                <iframe
                    ref={iframeRef}
                    src={previewUrl}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    onLoad={handleIframeLoad}
                />

                {/* 标注画布覆盖层 */}
                <canvas
                    ref={canvasRef}
                    className={`absolute inset-0 ${
                        selectedTool === 'select' ? 'pointer-events-none' : 'cursor-crosshair'
                    }`}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={() => setIsDrawing(false)}
                />
            </div>

            {/* 标注列表 */}
            {annotations.length > 0 && (
                <div className="border-t border-white/10 bg-slate-800/50 p-2 max-h-32 overflow-auto">
                    <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                        <FileText size={12} />
                        {annotations.length} 个标注
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {annotations.map(ann => (
                            <div
                                key={ann.id}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                                    selectedAnnotation === ann.id
                                        ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                }`}
                                onClick={() => handleAnnotationClick(ann)}
                            >
                                {ann.annotationType === 'rectangle' ? <Square size={10} /> : <Pencil size={10} />}
                                <span>#{ann.id.slice(0, 4)}</span>
                                {ann.domSelector && (
                                    <button
                                        onClick={e => { e.stopPropagation(); copySelector(ann); }}
                                        className="ml-1 hover:text-white"
                                        title="复制选择器"
                                    >
                                        <Copy size={10} />
                                    </button>
                                )}
                                {ann.quoteText && (
                                    <button
                                        onClick={e => { e.stopPropagation(); quoteAnnotation(ann); }}
                                        className="hover:text-white"
                                        title="引用到对话"
                                    >
                                        <Link2 size={10} />
                                    </button>
                                )}
                                <button
                                    onClick={e => { e.stopPropagation(); deleteAnnotation(ann.id); }}
                                    className="hover:text-red-400"
                                    title="删除"
                                >
                                    <Trash2 size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
