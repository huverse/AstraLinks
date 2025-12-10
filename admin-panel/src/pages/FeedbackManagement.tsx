import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { MessageSquare, Send, User, Trash2 } from 'lucide-react';

interface Thread {
    thread_id: string;
    user_id: number;
    username: string;
    last_message_at: string;
    message_count: number;
    unread_from_user: number;
    category: string;
    priority: string;
    last_message: string;
}

interface Message {
    id: number;
    content: string;
    is_from_admin: boolean;
    created_at: string;
    user_username?: string;
    admin_username?: string;
}

const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    normal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
    urgent: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
};

export default function FeedbackManagement() {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [selectedThread, setSelectedThread] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [replyContent, setReplyContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    useEffect(() => {
        loadThreads();
    }, [filter]);

    const loadThreads = async () => {
        try {
            const data = await adminAPI.getFeedbackThreads(1, filter);
            setThreads(data.threads || []);
        } catch (error) {
            console.error('Failed to load threads:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = async (threadId: string) => {
        try {
            const data = await adminAPI.getFeedbackThread(threadId);
            setMessages(data.messages || []);
            setSelectedThread(threadId);
            // Refresh threads to update unread count
            loadThreads();
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    };

    const sendReply = async () => {
        if (!selectedThread || !replyContent.trim()) return;

        setSending(true);
        try {
            await adminAPI.replyToFeedback(selectedThread, replyContent);
            setReplyContent('');
            loadMessages(selectedThread);
        } catch (error) {
            console.error('Failed to send reply:', error);
            alert('发送失败');
        } finally {
            setSending(false);
        }
    };

    const deleteThread = async (threadId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent selecting the thread
        if (!window.confirm('确定删除此对话？删除后无法恢复。')) return;

        try {
            await adminAPI.deleteFeedbackThread(threadId);
            // Clear selection if deleted thread was selected
            if (selectedThread === threadId) {
                setSelectedThread(null);
                setMessages([]);
            }
            loadThreads();
        } catch (error) {
            console.error('Failed to delete thread:', error);
            alert('删除失败');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-2xl p-6 text-white shadow-xl">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <MessageSquare size={32} />
                    用户反馈管理
                </h1>
                <p className="text-green-100">实时查看和回复用户的反馈与建议</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                        }`}
                >
                    全部
                </button>
                <button
                    onClick={() => setFilter('unread')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'unread' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                        }`}
                >
                    未读
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Thread List */}
                <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                        <h3 className="font-bold text-gray-800 dark:text-gray-100">对话列表</h3>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
                        {threads.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 dark:text-gray-500">
                                <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
                                <p>暂无反馈</p>
                            </div>
                        ) : (
                            threads.map((thread) => (
                                <div
                                    key={thread.thread_id}
                                    onClick={() => loadMessages(thread.thread_id)}
                                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${selectedThread === thread.thread_id ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500' : ''
                                        }`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <User size={16} className="text-gray-400 dark:text-gray-500" />
                                            <span className="font-medium text-gray-800 dark:text-gray-200">{thread.username || `用户${thread.user_id}`}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {thread.unread_from_user > 0 && (
                                                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                                                    {thread.unread_from_user}
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => deleteThread(thread.thread_id, e)}
                                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                                title="删除对话"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate mb-2">{thread.last_message}</p>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className={`px-2 py-0.5 rounded ${priorityColors[thread.priority] || priorityColors.normal}`}>
                                            {thread.priority}
                                        </span>
                                        <span className="text-gray-400 dark:text-gray-500">
                                            {new Date(thread.last_message_at).toLocaleString('zh-CN')}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Message View */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden flex flex-col">
                    {selectedThread ? (
                        <>
                            {/* Messages */}
                            <div className="flex-1 p-4 overflow-y-auto max-h-[500px] space-y-4">
                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.is_from_admin ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[70%] p-4 rounded-2xl ${msg.is_from_admin
                                                ? 'bg-blue-500 text-white rounded-br-none'
                                                : 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
                                                }`}
                                        >
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                            <p className={`text-xs mt-2 ${msg.is_from_admin ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
                                                {msg.is_from_admin ? `${msg.admin_username || '管理员'}` : `${msg.user_username || '用户'}`}
                                                {' · '}
                                                {new Date(msg.created_at).toLocaleString('zh-CN')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Reply Input */}
                            <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={replyContent}
                                        onChange={(e) => setReplyContent(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && sendReply()}
                                        placeholder="输入回复内容..."
                                        className="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        onClick={sendReply}
                                        disabled={sending || !replyContent.trim()}
                                        className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        <Send size={18} />
                                        发送
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                            <div className="text-center">
                                <MessageSquare size={64} className="mx-auto mb-4 opacity-50" />
                                <p>选择一个对话开始回复</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
