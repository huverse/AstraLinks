import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { Plus, Edit, Trash2, Eye, EyeOff, Clock, Users, Globe, LogIn, UserPlus } from 'lucide-react';

interface Announcement {
    id: number;
    title: string;
    content: string;
    content_type: 'text' | 'markdown' | 'html';
    display_type: 'global' | 'login' | 'register' | 'targeted';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    is_active: boolean;
    start_time: string | null;
    end_time: string | null;
    target_user_ids: number[] | null;
    created_at: string;
    created_by_username: string;
}

const displayTypeIcons = {
    global: Globe,
    login: LogIn,
    register: UserPlus,
    targeted: Users
};

const displayTypeLabels = {
    global: '全局显示',
    login: '登录时显示',
    register: '注册时显示',
    targeted: '定向发送'
};

const priorityColors = {
    low: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
    normal: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
    high: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400',
    urgent: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
};

const priorityLabels = {
    low: '低',
    normal: '普通',
    high: '高',
    urgent: '紧急'
};

// Format time string for display without timezone conversion
// Server returns time in Beijing timezone, so we parse and display directly
const formatDisplayTime = (isoString: string | null): string => {
    if (!isoString) return '-';
    try {
        // Extract date and time parts from ISO string (e.g., "2025-12-03T22:45:00.000Z")
        // Remove the Z suffix to treat as local time
        const cleanStr = isoString.replace('Z', '').replace('.000', '');
        const [datePart, timePart] = cleanStr.split('T');
        if (!datePart || !timePart) return isoString;

        const [year, month, day] = datePart.split('-');
        const [hour, minute] = timePart.split(':');

        return `${year}/${month}/${day} ${hour}:${minute}`;
    } catch {
        return isoString;
    }
};

export default function Announcements() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditor, setShowEditor] = useState(false);
    const [editingItem, setEditingItem] = useState<Announcement | null>(null);

    // Form state with proper types
    const [form, setForm] = useState<{
        title: string;
        content: string;
        content_type: 'text' | 'markdown' | 'html';
        display_type: 'global' | 'login' | 'register' | 'targeted';
        priority: 'low' | 'normal' | 'high' | 'urgent';
        is_active: boolean;
        start_time: string;
        end_time: string;
        target_user_ids: string;
    }>({
        title: '',
        content: '',
        content_type: 'markdown',
        display_type: 'global',
        priority: 'normal',
        is_active: true,
        start_time: '',
        end_time: '',
        target_user_ids: ''
    });

    const loadAnnouncements = async () => {
        setLoading(true);
        try {
            const data = await adminAPI.getAnnouncements();
            setAnnouncements(data.announcements || []);
        } catch (err) {
            console.error('Failed to load announcements:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAnnouncements(); }, []);

    const resetForm = () => {
        setForm({
            title: '',
            content: '',
            content_type: 'markdown',
            display_type: 'global',
            priority: 'normal',
            is_active: true,
            start_time: '',
            end_time: '',
            target_user_ids: ''
        });
        setEditingItem(null);
    };

    // Convert UTC ISO string to local datetime-local format (YYYY-MM-DDTHH:mm)
    const utcToLocalDateTime = (utcString: string | null): string => {
        if (!utcString) return '';
        const date = new Date(utcString);
        // Format as local datetime-local value
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const openEditor = (item?: Announcement) => {
        if (item) {
            setEditingItem(item);
            setForm({
                title: item.title,
                content: item.content,
                content_type: item.content_type,
                display_type: item.display_type,
                priority: item.priority,
                is_active: item.is_active,
                start_time: utcToLocalDateTime(item.start_time),
                end_time: utcToLocalDateTime(item.end_time),
                target_user_ids: item.target_user_ids ? item.target_user_ids.join(', ') : ''
            });
        } else {
            resetForm();
        }
        setShowEditor(true);
    };

    const handleSave = async () => {
        if (!form.title || !form.content) {
            alert('标题和内容为必填项');
            return;
        }

        try {
            // Convert local datetime-local values to ISO format with timezone
            // datetime-local gives us local time, we need to send it as-is to preserve user intent
            // The backend should store it directly and compare with server local time
            const formatDateTime = (dt: string) => {
                if (!dt) return null;
                // datetime-local format: "2025-12-03T22:45"
                // Convert to full ISO with Z suffix is wrong, keep local time
                // Just append :00 for seconds if needed
                return dt.includes(':') && dt.split(':').length === 2 ? dt + ':00' : dt;
            };

            const data = {
                ...form,
                start_time: formatDateTime(form.start_time),
                end_time: formatDateTime(form.end_time),
                target_user_ids: form.target_user_ids
                    ? form.target_user_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
                    : null
            };

            if (editingItem) {
                await adminAPI.updateAnnouncement(editingItem.id, data);
            } else {
                await adminAPI.createAnnouncement(data);
            }

            setShowEditor(false);
            resetForm();
            loadAnnouncements();
        } catch (err: any) {
            alert('保存失败：' + err.message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('确定删除此公告？')) return;

        try {
            await adminAPI.deleteAnnouncement(id);
            loadAnnouncements();
        } catch (err: any) {
            alert('删除失败：' + err.message);
        }
    };

    const toggleActive = async (item: Announcement) => {
        try {
            await adminAPI.updateAnnouncement(item.id, { is_active: !item.is_active });
            loadAnnouncements();
        } catch (err: any) {
            alert('操作失败：' + err.message);
        }
    };

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">公告管理</h1>
                <button
                    onClick={() => openEditor()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus size={18} />
                    发布公告
                </button>
            </div>

            {/* Announcements List */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                {loading ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                ) : announcements.length === 0 ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">暂无公告</div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-slate-700">
                        {announcements.map(item => {
                            const TypeIcon = displayTypeIcons[item.display_type];
                            return (
                                <div key={item.id} className={`p-6 ${!item.is_active ? 'opacity-50' : ''}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-semibold">{item.title}</h3>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityColors[item.priority]}`}>
                                                    {priorityLabels[item.priority]}
                                                </span>
                                                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                                    <TypeIcon size={14} />
                                                    {displayTypeLabels[item.display_type]}
                                                </span>
                                            </div>
                                            <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2 mb-2">{item.content}</p>
                                            <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                                                <span>创建者: {item.created_by_username}</span>
                                                <span>创建时间: {formatDisplayTime(item.created_at)}</span>
                                                {item.start_time && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={12} />
                                                        开始: {formatDisplayTime(item.start_time)}
                                                    </span>
                                                )}
                                                {item.end_time && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={12} />
                                                        结束: {formatDisplayTime(item.end_time)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            <button
                                                onClick={() => toggleActive(item)}
                                                className={`p-2 rounded ${item.is_active ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                                                title={item.is_active ? '点击隐藏' : '点击显示'}
                                            >
                                                {item.is_active ? <Eye size={18} /> : <EyeOff size={18} />}
                                            </button>
                                            <button
                                                onClick={() => openEditor(item)}
                                                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                                                title="编辑"
                                            >
                                                <Edit size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                                title="删除"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Editor Modal */}
            {showEditor && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b dark:border-slate-700">
                            <h2 className="text-xl font-bold">{editingItem ? '编辑公告' : '发布公告'}</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">标题 *</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    placeholder="公告标题"
                                />
                            </div>

                            {/* Content */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">内容 *</label>
                                <textarea
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                    rows={6}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    placeholder="支持 Markdown 格式"
                                />
                            </div>

                            {/* Type & Priority Row */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">内容格式</label>
                                    <select
                                        value={form.content_type}
                                        onChange={e => setForm({ ...form, content_type: e.target.value as any })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    >
                                        <option value="markdown">Markdown</option>
                                        <option value="html">HTML</option>
                                        <option value="text">纯文本</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">显示时机</label>
                                    <select
                                        value={form.display_type}
                                        onChange={e => setForm({ ...form, display_type: e.target.value as any })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    >
                                        <option value="global">全局显示</option>
                                        <option value="login">登录时显示</option>
                                        <option value="register">注册时显示</option>
                                        <option value="targeted">定向发送</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">优先级</label>
                                    <select
                                        value={form.priority}
                                        onChange={e => setForm({ ...form, priority: e.target.value as any })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    >
                                        <option value="low">低</option>
                                        <option value="normal">普通</option>
                                        <option value="high">高</option>
                                        <option value="urgent">紧急</option>
                                    </select>
                                </div>
                            </div>

                            {/* Timing */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">开始时间 (可选)</label>
                                    <input
                                        type="datetime-local"
                                        value={form.start_time}
                                        onChange={e => setForm({ ...form, start_time: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">结束时间 (可选)</label>
                                    <input
                                        type="datetime-local"
                                        value={form.end_time}
                                        onChange={e => setForm({ ...form, end_time: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                    />
                                </div>
                            </div>

                            {/* Target Users */}
                            {form.display_type === 'targeted' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">目标用户ID (逗号分隔)</label>
                                    <input
                                        type="text"
                                        value={form.target_user_ids}
                                        onChange={e => setForm({ ...form, target_user_ids: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                                        placeholder="例如: 1, 2, 3"
                                    />
                                </div>
                            )}

                            {/* Active Toggle */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={form.is_active}
                                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 rounded"
                                />
                                <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">立即启用</label>
                            </div>
                        </div>
                        <div className="p-6 border-t dark:border-slate-700 flex justify-end gap-3">
                            <button
                                onClick={() => { setShowEditor(false); resetForm(); }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
