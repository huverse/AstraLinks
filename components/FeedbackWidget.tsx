import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Minimize2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Message {
    id: number;
    content: string;
    is_from_admin: boolean;
    created_at: string;
}

interface Thread {
    thread_id: string;
    unread_count: number;
}

// @ts-ignore - Vite env
const PROXY_API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

export default function FeedbackWidget() {
    const { isAuthenticated, token } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [currentThread, setCurrentThread] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [sending, setSending] = useState(false);
    const [category, setCategory] = useState<string>('suggestion');
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when new messages
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Load threads when authenticated and widget opens
    useEffect(() => {
        if (isOpen && isAuthenticated && token) {
            loadThreads();
        } else if (!isOpen) {
            // Reset state when widget closes
            setMessages([]);
            setCurrentThread(null);
            setInputValue('');
        }
    }, [isOpen, isAuthenticated, token]);

    // Poll for new messages when widget is open
    useEffect(() => {
        if (!isOpen || !isAuthenticated || !currentThread) return;

        const interval = setInterval(() => {
            loadMessages(currentThread);
        }, 10000); // Poll every 10 seconds

        return () => clearInterval(interval);
    }, [isOpen, isAuthenticated, currentThread]);

    const loadThreads = async () => {
        if (!token) return;
        try {
            const response = await fetch(`${PROXY_API_BASE}/api/feedback/threads`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setThreads(data.threads || []);

                // Calculate unread
                const total = data.threads?.reduce((sum: number, t: Thread) => sum + (t.unread_count || 0), 0) || 0;
                setUnreadCount(total);

                // Auto-select first thread if exists
                if (data.threads?.length > 0 && !currentThread) {
                    setCurrentThread(data.threads[0].thread_id);
                    loadMessages(data.threads[0].thread_id);
                }
            }
        } catch (err) {
            console.error('Failed to load threads:', err);
        }
    };

    const loadMessages = async (threadId: string) => {
        if (!token) return;
        try {
            const response = await fetch(`${PROXY_API_BASE}/api/feedback/thread/${threadId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMessages(data.messages || []);
                setUnreadCount(0); // Clear unread since we just viewed
            }
        } catch (err) {
            console.error('Failed to load messages:', err);
        }
    };

    const sendMessage = async () => {
        if (!inputValue.trim() || sending) return;

        setSending(true);
        try {
            const endpoint = currentThread
                ? `${PROXY_API_BASE}/api/feedback/thread/${currentThread}`
                : `${PROXY_API_BASE}/api/feedback`;

            const body = currentThread
                ? { content: inputValue }
                : { content: inputValue, category, priority: 'normal' };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                const data = await response.json();
                setInputValue('');

                if (!currentThread && data.thread_id) {
                    setCurrentThread(data.thread_id);
                }

                // Reload messages
                if (data.thread_id || currentThread) {
                    loadMessages(data.thread_id || currentThread!);
                }
            }
        } catch (err) {
            console.error('Failed to send message:', err);
        } finally {
            setSending(false);
        }
    };

    // Widget button (always visible)
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 group"
                title="意见反馈"
            >
                <MessageCircle size={24} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                        {unreadCount}
                    </span>
                )}
                <span className="absolute right-full mr-3 bg-gray-900 dark:bg-gray-700 text-white px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-sm hidden md:block">
                    意见反馈
                </span>
            </button>
        );
    }

    // Not authenticated
    if (!isAuthenticated) {
        return (
            <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-[calc(100vw-2rem)] md:w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-[slideUp_0.3s_ease-out]">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-white flex items-center justify-between">
                    <h3 className="font-bold">意见反馈</h3>
                    <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 text-center">
                    <p className="text-gray-600 dark:text-gray-300 mb-4">请先登录后再提交反馈</p>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        关闭
                    </button>
                </div>
            </div>
        );
    }

    // Minimized state
    if (isMinimized) {
        return (
            <div
                onClick={() => setIsMinimized(false)}
                className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-full shadow-lg cursor-pointer hover:shadow-xl transition-all flex items-center gap-2"
            >
                <MessageCircle size={18} />
                <span className="text-sm font-medium">反馈对话</span>
                {unreadCount > 0 && (
                    <span className="bg-red-500 text-xs w-5 h-5 rounded-full flex items-center justify-center">
                        {unreadCount}
                    </span>
                )}
            </div>
        );
    }

    // Full widget
    return (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-[calc(100vw-2rem)] md:w-96 max-h-[60vh] md:max-h-[500px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-[slideUp_0.3s_ease-out]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-white flex items-center justify-between shrink-0">
                <h3 className="font-bold flex items-center gap-2">
                    <MessageCircle size={20} />
                    意见反馈
                </h3>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsMinimized(true)} className="hover:bg-white/20 p-1 rounded">
                        <Minimize2 size={18} />
                    </button>
                    <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Category selector for new conversation */}
            {!currentThread && messages.length === 0 && (
                <div className="p-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 shrink-0">
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                    >
                        <option value="suggestion">💡 建议</option>
                        <option value="bug">🐛 Bug报告</option>
                        <option value="feature">✨ 功能请求</option>
                        <option value="question">❓ 问题咨询</option>
                        <option value="other">📝 其他</option>
                    </select>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] bg-white dark:bg-slate-800">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-400 dark:text-gray-500 py-8">
                        <MessageCircle size={40} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">有什么想说的？</p>
                        <p className="text-xs">我们会认真阅读每一条反馈</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.is_from_admin ? 'justify-start' : 'justify-end'}`}
                        >
                            <div
                                className={`max-w-[80%] p-3 rounded-2xl ${msg.is_from_admin
                                    ? 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-100 rounded-bl-none'
                                    : 'bg-blue-500 text-white rounded-br-none'
                                    }`}
                            >
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                <p className={`text-xs mt-1 ${msg.is_from_admin ? 'text-gray-400 dark:text-gray-500' : 'text-blue-100'}`}>
                                    {new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="输入您的反馈..."
                        className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    />
                    <button
                        onClick={sendMessage}
                        disabled={sending || !inputValue.trim()}
                        className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
