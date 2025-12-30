import { useEffect, useState, useMemo } from 'react';
import { adminAPI } from '../services/api';
import { Plus, Edit, Trash2, Eye, EyeOff, Clock, Users, Globe, LogIn, UserPlus, Search, Filter, CheckSquare, Square, RefreshCw } from 'lucide-react';

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
