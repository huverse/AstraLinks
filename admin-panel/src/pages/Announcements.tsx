import { useEffect, useState, useMemo, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parse, isValid } from 'date-fns';
import { adminAPI } from '../services/api';
import { Plus, Edit, Trash2, Eye, EyeOff, Clock, Users, Globe, LogIn, UserPlus, Search, Filter, CheckSquare, Square, RefreshCw, FileText, Code, Type, AlertTriangle, Bell, Zap, Calendar, X, Loader2, Save, ChevronDown, ChevronUp, Play, XCircle } from 'lucide-react';

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

// Format time string for display - convert to local time
const formatDisplayTime = (isoString: string | null): string => {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return isoString;
    }
};

// Parse datetime string safely using date-fns to avoid DST/browser quirks
const parseDateTimeString = (dtString: string): Date | null => {
    if (!dtString) return null;
    // Expected format: "YYYY-MM-DDTHH:mm" (datetime-local format)
    const parsed = parse(dtString, "yyyy-MM-dd'T'HH:mm", new Date());
    return isValid(parsed) ? parsed : null;
};

export default function Announcements() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditor, setShowEditor] = useState(false);
    const [editingItem, setEditingItem] = useState<Announcement | null>(null);

    // 搜索和筛选状态
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDisplayType, setFilterDisplayType] = useState<string>('all');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [filterActive, setFilterActive] = useState<string>('all');

    // 批量操作状态
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [batchLoading, setBatchLoading] = useState(false);

    // 编辑器增强状态
    const [previewMode, setPreviewMode] = useState(false);
    const [saving, setSaving] = useState(false);

    // 定时发布队列状态
    const [showScheduledQueue, setShowScheduledQueue] = useState(true);
    const [scheduledOperating, setScheduledOperating] = useState<number | null>(null);

    // 筛选后的公告列表
    const filteredAnnouncements = useMemo(() => {
        return announcements.filter(item => {
            // 搜索过滤
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                if (!item.title.toLowerCase().includes(query) &&
                    !item.content.toLowerCase().includes(query)) {
                    return false;
                }
            }
            // 显示类型过滤
            if (filterDisplayType !== 'all' && item.display_type !== filterDisplayType) {
                return false;
            }
            // 优先级过滤
            if (filterPriority !== 'all' && item.priority !== filterPriority) {
                return false;
            }
            // 状态过滤
            if (filterActive === 'active' && !item.is_active) return false;
            if (filterActive === 'inactive' && item.is_active) return false;
            return true;
        });
    }, [announcements, searchQuery, filterDisplayType, filterPriority, filterActive]);

    // 定时发布队列 - start_time > NOW() 且已启用的公告
    const scheduledAnnouncements = useMemo(() => {
        const now = new Date();
        return announcements
            .filter(item => {
                if (!item.start_time) return false;
                const startTime = new Date(item.start_time);
                return startTime > now;
            })
            .sort((a, b) => {
                const timeA = new Date(a.start_time!).getTime();
                const timeB = new Date(b.start_time!).getTime();
                return timeA - timeB; // 按时间升序排列
            });
    }, [announcements]);

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
        setPreviewMode(false);
        setShowEditor(true);
    };

    const handleSave = async () => {
        if (!form.title || !form.content) {
            alert('标题和内容为必填项');
            return;
        }

        setSaving(true);
        try {
            // Convert local datetime to MySQL TIMESTAMP format
            // MySQL accepts 'YYYY-MM-DD HH:mm:ss' format
            const formatDateTime = (dt: string) => {
                if (!dt) return null;
                // datetime-local format: "2025-12-03T22:45"
                // Convert to MySQL TIMESTAMP format: "YYYY-MM-DD HH:mm:ss"
                const localDate = new Date(dt);
                const year = localDate.getFullYear();
                const month = String(localDate.getMonth() + 1).padStart(2, '0');
                const day = String(localDate.getDate()).padStart(2, '0');
                const hours = String(localDate.getHours()).padStart(2, '0');
                const minutes = String(localDate.getMinutes()).padStart(2, '0');
                const seconds = '00';
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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
        } finally {
            setSaving(false);
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

    // 批量选择操作
    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredAnnouncements.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredAnnouncements.map(a => a.id)));
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`确定删除选中的 ${selectedIds.size} 条公告？`)) return;

        setBatchLoading(true);
        try {
            await Promise.all(Array.from(selectedIds).map(id => adminAPI.deleteAnnouncement(id)));
            setSelectedIds(new Set());
            loadAnnouncements();
        } catch (err: any) {
            alert('批量删除失败：' + err.message);
        } finally {
            setBatchLoading(false);
        }
    };

    const handleBatchToggle = async (active: boolean) => {
        if (selectedIds.size === 0) return;

        setBatchLoading(true);
        try {
            await Promise.all(Array.from(selectedIds).map(id =>
                adminAPI.updateAnnouncement(id, { is_active: active })
            ));
            setSelectedIds(new Set());
            loadAnnouncements();
        } catch (err: any) {
            alert('批量操作失败：' + err.message);
        } finally {
            setBatchLoading(false);
        }
    };

    const clearFilters = () => {
        setSearchQuery('');
        setFilterDisplayType('all');
        setFilterPriority('all');
        setFilterActive('all');
    };

    // 定时队列操作：立即发布（设置 start_time = NOW）
    const handlePublishNow = async (item: Announcement) => {
        if (!confirm(`确定立即发布「${item.title}」？`)) return;
        setScheduledOperating(item.id);
        try {
            const now = new Date();
            const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
            await adminAPI.updateAnnouncement(item.id, { start_time: formatted, is_active: true });
            loadAnnouncements();
        } catch (err: any) {
            alert('立即发布失败：' + err.message);
        } finally {
            setScheduledOperating(null);
        }
    };

    // 定时队列操作：取消定时（清除 start_time）
    const handleCancelSchedule = async (item: Announcement) => {
        if (!confirm(`确定取消「${item.title}」的定时发布？公告将变为草稿状态。`)) return;
        setScheduledOperating(item.id);
        try {
            await adminAPI.updateAnnouncement(item.id, { start_time: null, is_active: false });
            loadAnnouncements();
        } catch (err: any) {
            alert('取消定时失败：' + err.message);
        } finally {
            setScheduledOperating(null);
        }
    };

    // 计算距离发布的相对时间
    const getTimeUntilPublish = (startTime: string): string => {
        const now = new Date();
        const target = new Date(startTime);
        const diffMs = target.getTime() - now.getTime();
        if (diffMs <= 0) return '即将发布';

        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        if (diffMinutes < 60) return `${diffMinutes}分钟后`;

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}小时后`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}天后`;
    };

    // 快捷时间设置
    const setQuickTime = useCallback((type: 'start' | 'end', preset: string) => {
        const now = new Date();
        let targetDate: Date;

        switch (preset) {
            case 'now':
                targetDate = now;
                break;
            case '1h':
                targetDate = new Date(now.getTime() + 60 * 60 * 1000);
                break;
            case '24h':
                targetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                break;
            case '7d':
                targetDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                targetDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                return;
        }

        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        const hours = String(targetDate.getHours()).padStart(2, '0');
        const minutes = String(targetDate.getMinutes()).padStart(2, '0');
        const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;

        if (type === 'start') {
            setForm(prev => ({ ...prev, start_time: formatted }));
        } else {
            setForm(prev => ({ ...prev, end_time: formatted }));
        }
    }, []);

    // 简单Markdown渲染
    const renderMarkdown = (text: string): string => {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-slate-600 px-1 rounded">$1</code>')
            .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-3 mb-1">$1</h3>')
            .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
            .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
            .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
            .replace(/\n/g, '<br/>');
    };

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">公告管理</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadAnnouncements}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        title="刷新"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => openEditor()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={18} />
                        发布公告
                    </button>
                </div>
            </div>

            {/* 搜索和筛选栏 */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
                <div className="flex flex-wrap gap-4 items-center">
                    {/* 搜索框 */}
                    <div className="flex-1 min-w-[200px] relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="搜索标题或内容..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                        />
                    </div>

                    {/* 显示类型筛选 */}
                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-gray-400" />
                        <select
                            value={filterDisplayType}
                            onChange={e => setFilterDisplayType(e.target.value)}
                            className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 text-sm"
                        >
                            <option value="all">全部类型</option>
                            <option value="global">全局显示</option>
                            <option value="login">登录时显示</option>
                            <option value="register">注册时显示</option>
                            <option value="targeted">定向发送</option>
                        </select>
                    </div>

                    {/* 优先级筛选 */}
                    <select
                        value={filterPriority}
                        onChange={e => setFilterPriority(e.target.value)}
                        className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 text-sm"
                    >
                        <option value="all">全部优先级</option>
                        <option value="low">低</option>
                        <option value="normal">普通</option>
                        <option value="high">高</option>
                        <option value="urgent">紧急</option>
                    </select>

                    {/* 状态筛选 */}
                    <select
                        value={filterActive}
                        onChange={e => setFilterActive(e.target.value)}
                        className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 text-sm"
                    >
                        <option value="all">全部状态</option>
                        <option value="active">已启用</option>
                        <option value="inactive">已禁用</option>
                    </select>

                    {/* 清除筛选 */}
                    {(searchQuery || filterDisplayType !== 'all' || filterPriority !== 'all' || filterActive !== 'all') && (
                        <button
                            onClick={clearFilters}
                            className="text-sm text-blue-500 hover:text-blue-600"
                        >
                            清除筛选
                        </button>
                    )}
                </div>

                {/* 结果统计 */}
                <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    共 {filteredAnnouncements.length} 条公告
                    {filteredAnnouncements.length !== announcements.length && (
                        <span> (筛选自 {announcements.length} 条)</span>
                    )}
                </div>
            </div>

            {/* 批量操作栏 */}
            {selectedIds.size > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                            已选择 {selectedIds.size} 项
                        </span>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            取消选择
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleBatchToggle(true)}
                            disabled={batchLoading}
                            className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Eye size={14} className="inline mr-1" />
                            批量启用
                        </button>
                        <button
                            onClick={() => handleBatchToggle(false)}
                            disabled={batchLoading}
                            className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            <EyeOff size={14} className="inline mr-1" />
                            批量禁用
                        </button>
                        <button
                            onClick={handleBatchDelete}
                            disabled={batchLoading}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Trash2 size={14} className="inline mr-1" />
                            批量删除
                        </button>
                    </div>
                </div>
            )}

            {/* 定时发布队列面板 */}
            {scheduledAnnouncements.length > 0 && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4 overflow-hidden">
                    <button
                        onClick={() => setShowScheduledQueue(!showScheduledQueue)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Calendar size={18} className="text-amber-600 dark:text-amber-400" />
                            <span className="font-medium text-amber-800 dark:text-amber-200">定时发布队列</span>
                            <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 text-xs rounded-full font-medium">
                                {scheduledAnnouncements.length} 条待发布
                            </span>
                        </div>
                        {showScheduledQueue ? <ChevronUp size={18} className="text-amber-600" /> : <ChevronDown size={18} className="text-amber-600" />}
                    </button>
                    {showScheduledQueue && (
                        <div className="border-t border-amber-200 dark:border-amber-800 divide-y divide-amber-100 dark:divide-amber-800/50">
                            {scheduledAnnouncements.map(item => {
                                const TypeIcon = displayTypeIcons[item.display_type];
                                const isOperating = scheduledOperating === item.id;
                                return (
                                    <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-amber-100/30 dark:hover:bg-amber-900/20">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Clock size={14} className="text-amber-500 flex-shrink-0" />
                                                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                                    {formatDisplayTime(item.start_time)}
                                                </span>
                                                <span className="text-xs text-amber-500 dark:text-amber-400">
                                                    ({getTimeUntilPublish(item.start_time!)})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{item.title}</span>
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityColors[item.priority]}`}>
                                                    {priorityLabels[item.priority]}
                                                </span>
                                                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                                    <TypeIcon size={12} />
                                                    {displayTypeLabels[item.display_type]}
                                                </span>
                                                {!item.is_active && (
                                                    <span className="text-xs text-gray-400">(已禁用)</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => openEditor(item)}
                                                disabled={isOperating}
                                                className="p-1.5 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors disabled:opacity-50"
                                                title="修改时间"
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                onClick={() => handlePublishNow(item)}
                                                disabled={isOperating}
                                                className="p-1.5 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                                                title="立即发布"
                                            >
                                                {isOperating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                                            </button>
                                            <button
                                                onClick={() => handleCancelSchedule(item)}
                                                disabled={isOperating}
                                                className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                                                title="取消定时"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Announcements List */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                {loading ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                ) : filteredAnnouncements.length === 0 ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                        {announcements.length === 0 ? '暂无公告' : '没有匹配的公告'}
                    </div>
                ) : (
                    <>
                        {/* 全选头部 */}
                        <div className="px-6 py-3 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600 flex items-center gap-3">
                            <button
                                onClick={selectAll}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                {selectedIds.size === filteredAnnouncements.length && filteredAnnouncements.length > 0
                                    ? <CheckSquare size={18} className="text-blue-500" />
                                    : <Square size={18} />}
                            </button>
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                                {selectedIds.size === filteredAnnouncements.length && filteredAnnouncements.length > 0
                                    ? '取消全选'
                                    : '全选'}
                            </span>
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-slate-700">
                            {filteredAnnouncements.map(item => {
                                const TypeIcon = displayTypeIcons[item.display_type];
                                const isSelected = selectedIds.has(item.id);
                                return (
                                    <div key={item.id} className={`p-6 ${!item.is_active ? 'opacity-50' : ''} ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}>
                                        <div className="flex justify-between items-start">
                                            {/* 复选框 */}
                                            <button
                                                onClick={() => toggleSelect(item.id)}
                                                className="mr-4 mt-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                            >
                                                {isSelected
                                                    ? <CheckSquare size={18} className="text-blue-500" />
                                                    : <Square size={18} />}
                                            </button>
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
                    </>
                )}
            </div>

            {/* Editor Modal */}
            {showEditor && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                        {/* Header */}
                        <div className="px-6 py-4 border-b dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                            <div>
                                <h2 className="text-xl font-bold">{editingItem ? '编辑公告' : '发布新公告'}</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">填写公告信息并选择发布设置</p>
                            </div>
                            <button
                                onClick={() => { setShowEditor(false); resetForm(); }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Title with character count */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">公告标题 <span className="text-red-500">*</span></label>
                                    <span className="text-xs text-gray-400">{form.title.length}/100</span>
                                </div>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value.slice(0, 100) })}
                                    className="w-full px-4 py-3 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 text-lg"
                                    placeholder="输入简洁明了的公告标题..."
                                />
                            </div>

                            {/* Content with tabs */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">公告内容 <span className="text-red-500">*</span></label>
                                        <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
                                            <button
                                                onClick={() => setPreviewMode(false)}
                                                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                                    !previewMode ? 'bg-white dark:bg-slate-600 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                <FileText size={12} className="inline mr-1" />编辑
                                            </button>
                                            <button
                                                onClick={() => setPreviewMode(true)}
                                                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                                    previewMode ? 'bg-white dark:bg-slate-600 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                <Eye size={12} className="inline mr-1" />预览
                                            </button>
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-400">{form.content.length} 字符</span>
                                </div>
                                {previewMode ? (
                                    <div
                                        className="w-full min-h-[180px] px-4 py-3 border border-gray-200 dark:border-slate-600 rounded-xl bg-gray-50 dark:bg-slate-900 prose prose-sm dark:prose-invert max-w-none"
                                        dangerouslySetInnerHTML={{ __html: form.content_type === 'html' ? form.content : renderMarkdown(form.content) }}
                                    />
                                ) : (
                                    <textarea
                                        value={form.content}
                                        onChange={e => setForm({ ...form, content: e.target.value })}
                                        rows={7}
                                        className="w-full px-4 py-3 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                                        placeholder={form.content_type === 'markdown' ? '支持 Markdown 格式...\n\n# 标题\n**加粗** *斜体* `代码`\n- 列表项' : '输入公告内容...'}
                                    />
                                )}
                            </div>

                            {/* Content Type */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">内容格式</label>
                                <div className="flex gap-2">
                                    {[
                                        { value: 'markdown', icon: FileText, label: 'Markdown' },
                                        { value: 'html', icon: Code, label: 'HTML' },
                                        { value: 'text', icon: Type, label: '纯文本' }
                                    ].map(type => (
                                        <button
                                            key={type.value}
                                            onClick={() => setForm({ ...form, content_type: type.value as any })}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                                                form.content_type === type.value
                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                    : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                                            }`}
                                        >
                                            <type.icon size={16} />
                                            <span className="text-sm font-medium">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Display Type Cards */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">显示时机</label>
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        { value: 'global', icon: Globe, label: '全局', desc: '所有页面显示' },
                                        { value: 'login', icon: LogIn, label: '登录', desc: '登录页显示' },
                                        { value: 'register', icon: UserPlus, label: '注册', desc: '注册页显示' },
                                        { value: 'targeted', icon: Users, label: '定向', desc: '指定用户' }
                                    ].map(type => (
                                        <button
                                            key={type.value}
                                            onClick={() => setForm({ ...form, display_type: type.value as any })}
                                            className={`p-3 rounded-xl border-2 transition-all text-center ${
                                                form.display_type === type.value
                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                                    : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                                            }`}
                                        >
                                            <type.icon size={20} className={`mx-auto mb-1 ${form.display_type === type.value ? 'text-blue-500' : 'text-gray-400'}`} />
                                            <div className={`text-sm font-medium ${form.display_type === type.value ? 'text-blue-600 dark:text-blue-400' : ''}`}>{type.label}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">{type.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Target Users - only when targeted */}
                            {form.display_type === 'targeted' && (
                                <div className="animate-in slide-in-from-top-2 duration-200">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">目标用户ID</label>
                                    <input
                                        type="text"
                                        value={form.target_user_ids}
                                        onChange={e => setForm({ ...form, target_user_ids: e.target.value })}
                                        className="w-full px-4 py-3 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700"
                                        placeholder="输入用户ID，多个用逗号分隔，如: 1, 2, 3"
                                    />
                                </div>
                            )}

                            {/* Priority Cards */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">优先级</label>
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        { value: 'low', icon: Bell, label: '低', color: 'gray' },
                                        { value: 'normal', icon: Bell, label: '普通', color: 'blue' },
                                        { value: 'high', icon: AlertTriangle, label: '高', color: 'orange' },
                                        { value: 'urgent', icon: Zap, label: '紧急', color: 'red' }
                                    ].map(p => {
                                        const isSelected = form.priority === p.value;
                                        const colorClasses = {
                                            gray: isSelected ? 'border-gray-400 bg-gray-50 dark:bg-gray-800' : '',
                                            blue: isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : '',
                                            orange: isSelected ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30' : '',
                                            red: isSelected ? 'border-red-500 bg-red-50 dark:bg-red-900/30' : ''
                                        };
                                        const iconColors = {
                                            gray: isSelected ? 'text-gray-500' : 'text-gray-300',
                                            blue: isSelected ? 'text-blue-500' : 'text-gray-300',
                                            orange: isSelected ? 'text-orange-500' : 'text-gray-300',
                                            red: isSelected ? 'text-red-500' : 'text-gray-300'
                                        };
                                        return (
                                            <button
                                                key={p.value}
                                                onClick={() => setForm({ ...form, priority: p.value as any })}
                                                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center ${
                                                    colorClasses[p.color as keyof typeof colorClasses] || (isSelected ? '' : 'border-gray-200 dark:border-slate-600 hover:border-gray-300')
                                                }`}
                                            >
                                                <p.icon size={20} className={iconColors[p.color as keyof typeof iconColors]} />
                                                <span className={`text-sm font-medium mt-1 ${isSelected ? `text-${p.color}-600 dark:text-${p.color}-400` : ''}`}>{p.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Time Settings */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">开始时间</label>
                                        <div className="flex gap-1">
                                            {[{ label: '立即', value: 'now' }, { label: '+1h', value: '1h' }, { label: '+24h', value: '24h' }].map(q => (
                                                <button
                                                    key={q.value}
                                                    onClick={() => setQuickTime('start', q.value)}
                                                    className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors"
                                                >
                                                    {q.label}
                                                </button>
                                            ))}
                                            {form.start_time && (
                                                <button
                                                    onClick={() => setForm({ ...form, start_time: '' })}
                                                    className="px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                                >
                                                    清除
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <DatePicker
                                            selected={parseDateTimeString(form.start_time)}
                                            onChange={(date: Date | null) => {
                                                if (!date) {
                                                    setForm({ ...form, start_time: '' });
                                                    return;
                                                }
                                                const year = date.getFullYear();
                                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                                const day = String(date.getDate()).padStart(2, '0');
                                                const hours = String(date.getHours()).padStart(2, '0');
                                                const minutes = String(date.getMinutes()).padStart(2, '0');
                                                setForm({ ...form, start_time: `${year}-${month}-${day}T${hours}:${minutes}` });
                                            }}
                                            showTimeSelect
                                            timeIntervals={5}
                                            dateFormat="yyyy-MM-dd HH:mm"
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700"
                                            wrapperClassName="w-full"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">结束时间</label>
                                        <div className="flex gap-1">
                                            {[{ label: '+7天', value: '7d' }, { label: '+30天', value: '30d' }].map(q => (
                                                <button
                                                    key={q.value}
                                                    onClick={() => setQuickTime('end', q.value)}
                                                    className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors"
                                                >
                                                    {q.label}
                                                </button>
                                            ))}
                                            {form.end_time && (
                                                <button
                                                    onClick={() => setForm({ ...form, end_time: '' })}
                                                    className="px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                                >
                                                    清除
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <DatePicker
                                            selected={parseDateTimeString(form.end_time)}
                                            onChange={(date: Date | null) => {
                                                if (!date) {
                                                    setForm({ ...form, end_time: '' });
                                                    return;
                                                }
                                                const year = date.getFullYear();
                                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                                const day = String(date.getDate()).padStart(2, '0');
                                                const hours = String(date.getHours()).padStart(2, '0');
                                                const minutes = String(date.getMinutes()).padStart(2, '0');
                                                setForm({ ...form, end_time: `${year}-${month}-${day}T${hours}:${minutes}` });
                                            }}
                                            showTimeSelect
                                            timeIntervals={5}
                                            dateFormat="yyyy-MM-dd HH:mm"
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700"
                                            wrapperClassName="w-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Active Toggle - Modern Switch */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                                <div>
                                    <div className="font-medium text-gray-900 dark:text-gray-100">立即启用</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">开启后公告将立即对用户可见</div>
                                </div>
                                <button
                                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                                    className={`relative w-14 h-8 rounded-full transition-colors ${
                                        form.is_active ? 'bg-blue-500' : 'bg-gray-300 dark:bg-slate-600'
                                    }`}
                                >
                                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                                        form.is_active ? 'translate-x-7' : 'translate-x-1'
                                    }`} />
                                </button>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-slate-800/50">
                            <div className="text-xs text-gray-400">
                                提示: 支持 Markdown 格式，如 **加粗** *斜体* `代码`
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setShowEditor(false); resetForm(); }}
                                    className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors font-medium"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !form.title || !form.content}
                                    className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
                                >
                                    {saving ? (
                                        <><Loader2 size={16} className="animate-spin" />保存中...</>
                                    ) : (
                                        <><Save size={16} />{editingItem ? '更新公告' : '发布公告'}</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
