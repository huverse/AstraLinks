import { useState, useEffect } from 'react';
import { fetchAPI } from '../services/api';
import { Mail, Clock, CheckCircle, XCircle, Eye, RefreshCw, Filter, Calendar, User, Globe, Package, Truck, Printer, Edit2, Save, X, Search, Trash2 } from 'lucide-react';

interface Letter {
    id: string;
    title: string;
    content: string;
    status: string;
    recipient_type: 'self' | 'other';
    recipient_email: string | null;
    scheduled_local: string;
    scheduled_at_utc: string;
    scheduled_tz: string;
    delivered_at: string | null;
    created_at: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    is_public: boolean;
    review_note: string | null;
    rejected_reason: string | null;
    sender_username: string;
    sender_email: string;
}

interface Stats {
    totalLetters: number;
    pendingReview: number;
    scheduledToday: number;
    deliveredThisMonth: number;
    failedThisMonth: number;
}

interface PhysicalOrder {
    id: number;
    letterId: string;
    letterTitle: string;
    senderUsername: string;
    senderEmail: string;
    recipientName: string | null;
    postalCode: string | null;
    country: string;
    paperType: string | null;
    envelopeType: string | null;
    orderStatus: 'pending' | 'processing' | 'completed' | 'cancelled';
    shippingStatus: 'pending' | 'printing' | 'shipped' | 'in_transit' | 'delivered' | 'returned';
    shippingFee: number | null;
    paid: boolean;
    trackingNumber: string | null;
    carrier: string | null;
    adminNote: string | null;
    createdAt: string;
    updatedAt: string;
}

interface PhysicalStats {
    totalOrders: number;
    pendingOrders: number;
    processingOrders: number;
    completedOrders: number;
    ordersThisMonth: number;
    revenueThisMonth: number;
}

const STATUS_LABELS: Record<string, string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    scheduled: '已排期',
    delivering: '投递中',
    delivered: '已投递',
    failed: '投递失败',
    cancelled: '已取消',
};

const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    pending_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    delivering: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    cancelled: '已取消',
};

const SHIPPING_STATUS_LABELS: Record<string, string> = {
    pending: '待处理',
    printing: '打印中',
    shipped: '已发货',
    in_transit: '运输中',
    delivered: '已送达',
    returned: '已退回',
};

const ORDER_STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

const SHIPPING_STATUS_COLORS: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    printing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    shipped: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    in_transit: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    returned: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

export default function FutureLetters() {
    // Tab management
    const [activeTab, setActiveTab] = useState<'letters' | 'physical'>('letters');

    // Letters state
    const [letters, setLetters] = useState<Letter[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending_review');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [actionType, setActionType] = useState<'approve' | 'reject' | 'view'>('view');
    const [rejectReason, setRejectReason] = useState('');
    const [reviewNote, setReviewNote] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Physical orders state
    const [physicalOrders, setPhysicalOrders] = useState<PhysicalOrder[]>([]);
    const [physicalStats, setPhysicalStats] = useState<PhysicalStats | null>(null);
    const [physicalLoading, setPhysicalLoading] = useState(false);
    const [physicalFilter, setPhysicalFilter] = useState<string>('all');
    const [physicalShippingFilter, setPhysicalShippingFilter] = useState<string>('all');
    const [physicalPage, setPhysicalPage] = useState(1);
    const [physicalTotalPages, setPhysicalTotalPages] = useState(1);
    const [editingOrder, setEditingOrder] = useState<PhysicalOrder | null>(null);
    const [editForm, setEditForm] = useState({
        orderStatus: '',
        shippingStatus: '',
        trackingNumber: '',
        carrier: '',
        adminNote: '',
    });
    const [editSaving, setEditSaving] = useState(false);

    const loadStats = async () => {
        try {
            const data = await fetchAPI('/api/future/admin/stats');
            setStats(data);
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    };

    const loadLetters = async () => {
        setLoading(true);
        try {
            const endpoint = filter === 'pending_review'
                ? '/api/future/admin/letters/pending-review'
                : `/api/future/admin/letters?status=${filter}&page=${page}&limit=20`;
            const data = await fetchAPI(endpoint);
            setLetters(data.letters);
            setTotalPages(data.totalPages || 1);
        } catch (error) {
            console.error('Failed to load letters:', error);
        } finally {
            setLoading(false);
        }
    };

    // Physical orders functions
    const loadPhysicalStats = async () => {
        try {
            const data = await fetchAPI('/api/future/admin/physical/stats');
            setPhysicalStats(data);
        } catch (error) {
            console.error('Failed to load physical stats:', error);
        }
    };

    const loadPhysicalOrders = async () => {
        setPhysicalLoading(true);
        try {
            const params = new URLSearchParams();
            if (physicalFilter !== 'all') params.set('status', physicalFilter);
            if (physicalShippingFilter !== 'all') params.set('shippingStatus', physicalShippingFilter);
            params.set('page', physicalPage.toString());
            params.set('limit', '20');

            const data = await fetchAPI(`/api/future/admin/physical/orders?${params.toString()}`);
            setPhysicalOrders(data.orders || []);
            setPhysicalTotalPages(data.totalPages || 1);
        } catch (error) {
            console.error('Failed to load physical orders:', error);
        } finally {
            setPhysicalLoading(false);
        }
    };

    const handleEditOrder = (order: PhysicalOrder) => {
        setEditingOrder(order);
        setEditForm({
            orderStatus: order.orderStatus,
            shippingStatus: order.shippingStatus,
            trackingNumber: order.trackingNumber || '',
            carrier: order.carrier || '',
            adminNote: order.adminNote || '',
        });
    };

    const handleSaveOrder = async () => {
        if (!editingOrder) return;
        setEditSaving(true);
        try {
            await fetchAPI(`/api/future/admin/physical/orders/${editingOrder.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    orderStatus: editForm.orderStatus,
                    shippingStatus: editForm.shippingStatus,
                    trackingNumber: editForm.trackingNumber || undefined,
                    carrier: editForm.carrier || undefined,
                    adminNote: editForm.adminNote || undefined,
                }),
            });
            setEditingOrder(null);
            loadPhysicalOrders();
            loadPhysicalStats();
        } catch (error) {
            console.error('Failed to update order:', error);
            alert('更新失败: ' + (error as Error).message);
        } finally {
            setEditSaving(false);
        }
    };

    useEffect(() => {
        loadStats();
        loadPhysicalStats();
    }, []);

    useEffect(() => {
        loadLetters();
    }, [filter, page]);

    useEffect(() => {
        if (activeTab === 'physical') {
            loadPhysicalOrders();
        }
    }, [activeTab, physicalFilter, physicalShippingFilter, physicalPage]);

    const handleApprove = async () => {
        if (!selectedLetter) return;
        setActionLoading(true);
        try {
            await fetchAPI(`/api/future/admin/letters/${selectedLetter.id}/approve`, {
                method: 'POST',
                body: JSON.stringify({ note: reviewNote }),
            });
            setShowModal(false);
            setSelectedLetter(null);
            setReviewNote('');
            loadLetters();
            loadStats();
        } catch (error) {
            console.error('Failed to approve:', error);
            alert('审核失败: ' + (error as Error).message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!selectedLetter || !rejectReason.trim()) {
            alert('请填写拒绝原因');
            return;
        }
        setActionLoading(true);
        try {
            await fetchAPI(`/api/future/admin/letters/${selectedLetter.id}/reject`, {
                method: 'POST',
                body: JSON.stringify({ reason: rejectReason }),
            });
            setShowModal(false);
            setSelectedLetter(null);
            setRejectReason('');
            loadLetters();
            loadStats();
        } catch (error) {
            console.error('Failed to reject:', error);
            alert('拒绝失败: ' + (error as Error).message);
        } finally {
            setActionLoading(false);
        }
    };

    const openModal = (letter: Letter, action: 'approve' | 'reject' | 'view') => {
        setSelectedLetter(letter);
        setActionType(action);
        setShowModal(true);
        setRejectReason('');
        setReviewNote('');
    };

    const handleDelete = async (letterId: string) => {
        setDeleteLoading(true);
        try {
            await fetchAPI(`/api/future/admin/letters/${letterId}`, {
                method: 'DELETE',
            });
            setDeleteConfirm(null);
            loadLetters();
            loadStats();
        } catch (error) {
            console.error('Failed to delete:', error);
            alert('删除失败: ' + (error as Error).message);
        } finally {
            setDeleteLoading(false);
        }
    };

    // Filter letters by search query
    const filteredLetters = letters.filter(letter => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
            letter.title.toLowerCase().includes(query) ||
            letter.sender_username.toLowerCase().includes(query) ||
            letter.sender_email.toLowerCase().includes(query) ||
            (letter.recipient_email && letter.recipient_email.toLowerCase().includes(query)) ||
            letter.id.toLowerCase().includes(query)
        );
    });

    const formatDate = (dateStr: string | null, timezone?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone || 'Asia/Shanghai',
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">时光信管理</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">管理时光信审核和实体信订单</p>
                </div>
                <button
                    onClick={() => {
                        if (activeTab === 'letters') {
                            loadLetters();
                            loadStats();
                        } else {
                            loadPhysicalOrders();
                            loadPhysicalStats();
                        }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                    <RefreshCw size={16} />
                    刷新
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
                <button
                    onClick={() => setActiveTab('letters')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                        activeTab === 'letters'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Mail size={16} />
                        时光信审核
                        {stats && stats.pendingReview > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded-full">
                                {stats.pendingReview}
                            </span>
                        )}
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('physical')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                        activeTab === 'physical'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Package size={16} />
                        实体信订单
                        {physicalStats && physicalStats.pendingOrders > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded-full">
                                {physicalStats.pendingOrders}
                            </span>
                        )}
                    </div>
                </button>
            </div>

            {/* Letters Tab Content */}
            {activeTab === 'letters' && (
                <>
                    {/* Stats Cards */}
                    {stats && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                                <Mail className="text-blue-600 dark:text-blue-400" size={20} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">总信件数</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalLetters}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                                <Clock className="text-yellow-600 dark:text-yellow-400" size={20} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">待审核</p>
                                <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pendingReview}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                                <Calendar className="text-purple-600 dark:text-purple-400" size={20} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">今日排期</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.scheduledToday}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                                <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">本月已投递</p>
                                <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.deliveredThisMonth}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                                <XCircle className="text-red-600 dark:text-red-400" size={20} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">本月失败</p>
                                <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.failedThisMonth}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter */}
            <div className="flex flex-wrap items-center gap-4">
                {/* Search Input */}
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜索标题、发件人、收件人..."
                        className="pl-9 pr-4 py-2 w-64 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-gray-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">筛选:</span>
                    {['pending_review', 'approved', 'rejected', 'delivered', 'all'].map(f => (
                        <button
                            key={f}
                            onClick={() => { setFilter(f); setPage(1); }}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                filter === f
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            {f === 'all' ? '全部' : STATUS_LABELS[f] || f}
                        </button>
                    ))}
                </div>

                {/* Search Results Count */}
                {searchQuery && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        找到 {filteredLetters.length} 条结果
                    </span>
                )}
            </div>

            {/* Letters Table */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">加载中...</div>
                ) : filteredLetters.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Mail size={48} className="mx-auto mb-4 opacity-50" />
                        <p>{searchQuery ? '没有找到匹配的信件' : `暂无${STATUS_LABELS[filter] || ''}信件`}</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">标题</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">发件人</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">收件人</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">排期时间</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">状态</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {filteredLetters.map(letter => (
                                <tr key={letter.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                                                {letter.title}
                                            </span>
                                            {letter.is_public && (
                                                <span title="公开信">
                                                    <Globe size={14} className="text-blue-500" />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <User size={14} className="text-gray-400" />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                                {letter.sender_username}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                        {letter.recipient_type === 'self' ? '自己' : letter.recipient_email || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                        {formatDate(letter.scheduled_at_utc, letter.scheduled_tz)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[letter.status] || ''}`}>
                                            {STATUS_LABELS[letter.status] || letter.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openModal(letter, 'view')}
                                                className="p-1.5 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                                title="查看详情"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            {letter.status === 'pending_review' && (
                                                <>
                                                    <button
                                                        onClick={() => openModal(letter, 'approve')}
                                                        className="p-1.5 text-gray-500 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                                                        title="通过"
                                                    >
                                                        <CheckCircle size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => openModal(letter, 'reject')}
                                                        className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                                        title="拒绝"
                                                    >
                                                        <XCircle size={16} />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => setDeleteConfirm(letter.id)}
                                                className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                                title="删除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-50"
                        >
                            上一页
                        </button>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            第 {page} / {totalPages} 页
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-50"
                        >
                            下一页
                        </button>
                    </div>
                )}
            </div>
                </>
            )}

            {/* Physical Orders Tab Content */}
            {activeTab === 'physical' && (
                <>
                    {/* Physical Stats Cards */}
                    {physicalStats && (
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                                        <Package className="text-blue-600 dark:text-blue-400" size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">总订单</p>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{physicalStats.totalOrders}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                                        <Clock className="text-yellow-600 dark:text-yellow-400" size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">待处理</p>
                                        <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{physicalStats.pendingOrders}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                                        <Printer className="text-purple-600 dark:text-purple-400" size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">处理中</p>
                                        <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{physicalStats.processingOrders}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                                        <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">已完成</p>
                                        <p className="text-xl font-bold text-green-600 dark:text-green-400">{physicalStats.completedOrders}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                                        <Calendar className="text-indigo-600 dark:text-indigo-400" size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">本月订单</p>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{physicalStats.ordersThisMonth}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900 rounded-lg">
                                        <span className="text-emerald-600 dark:text-emerald-400 text-lg font-bold">¥</span>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">本月收入</p>
                                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">¥{physicalStats.revenueThisMonth.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Physical Orders Filters */}
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-gray-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">订单状态:</span>
                            {['all', 'pending', 'processing', 'completed', 'cancelled'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => { setPhysicalFilter(f); setPhysicalPage(1); }}
                                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                        physicalFilter === f
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                    }`}
                                >
                                    {f === 'all' ? '全部' : ORDER_STATUS_LABELS[f] || f}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <Truck size={16} className="text-gray-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">物流状态:</span>
                            {['all', 'pending', 'printing', 'shipped', 'in_transit', 'delivered'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => { setPhysicalShippingFilter(f); setPhysicalPage(1); }}
                                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                        physicalShippingFilter === f
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                    }`}
                                >
                                    {f === 'all' ? '全部' : SHIPPING_STATUS_LABELS[f] || f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Physical Orders Table */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                        {physicalLoading ? (
                            <div className="p-8 text-center text-gray-500">加载中...</div>
                        ) : physicalOrders.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <Package size={48} className="mx-auto mb-4 opacity-50" />
                                <p>暂无实体信订单</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-slate-700">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">订单ID</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">信件</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">用户</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">收件人</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">订单状态</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">物流状态</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">费用</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-300">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                    {physicalOrders.map(order => (
                                        <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">#{order.id}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px] block">
                                                    {order.letterTitle || order.letterId.substring(0, 8)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <User size={14} className="text-gray-400" />
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        {order.senderUsername}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {order.recipientName || '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[order.orderStatus] || ''}`}>
                                                    {ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${SHIPPING_STATUS_COLORS[order.shippingStatus] || ''}`}>
                                                    {SHIPPING_STATUS_LABELS[order.shippingStatus] || order.shippingStatus}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={order.paid ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}>
                                                    ¥{(order.shippingFee || 0).toFixed(2)}
                                                    {order.paid && <CheckCircle size={12} className="inline ml-1" />}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => handleEditOrder(order)}
                                                    className="p-1.5 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                                    title="编辑"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {/* Physical Pagination */}
                        {physicalTotalPages > 1 && (
                            <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                                <button
                                    onClick={() => setPhysicalPage(p => Math.max(1, p - 1))}
                                    disabled={physicalPage === 1}
                                    className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-50"
                                >
                                    上一页
                                </button>
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                    第 {physicalPage} / {physicalTotalPages} 页
                                </span>
                                <button
                                    onClick={() => setPhysicalPage(p => Math.min(physicalTotalPages, p + 1))}
                                    disabled={physicalPage === physicalTotalPages}
                                    className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-50"
                                >
                                    下一页
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Edit Physical Order Modal */}
            {editingOrder && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full">
                        <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">编辑订单 #{editingOrder.id}</h2>
                            <button
                                onClick={() => setEditingOrder(null)}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">订单状态</label>
                                    <select
                                        value={editForm.orderStatus}
                                        onChange={e => setEditForm(f => ({ ...f, orderStatus: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="pending">待处理</option>
                                        <option value="processing">处理中</option>
                                        <option value="completed">已完成</option>
                                        <option value="cancelled">已取消</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">物流状态</label>
                                    <select
                                        value={editForm.shippingStatus}
                                        onChange={e => setEditForm(f => ({ ...f, shippingStatus: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="pending">待处理</option>
                                        <option value="printing">打印中</option>
                                        <option value="shipped">已发货</option>
                                        <option value="in_transit">运输中</option>
                                        <option value="delivered">已送达</option>
                                        <option value="returned">已退回</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">快递单号</label>
                                    <input
                                        type="text"
                                        value={editForm.trackingNumber}
                                        onChange={e => setEditForm(f => ({ ...f, trackingNumber: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                        placeholder="输入快递单号"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">快递公司</label>
                                    <input
                                        type="text"
                                        value={editForm.carrier}
                                        onChange={e => setEditForm(f => ({ ...f, carrier: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                        placeholder="如: 顺丰、中通、圆通"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">管理员备注</label>
                                <textarea
                                    value={editForm.adminNote}
                                    onChange={e => setEditForm(f => ({ ...f, adminNote: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    rows={3}
                                    placeholder="内部备注，用户不可见"
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingOrder(null)}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveOrder}
                                disabled={editSaving}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {editSaving ? (
                                    <RefreshCw size={16} className="animate-spin" />
                                ) : (
                                    <Save size={16} />
                                )}
                                {editSaving ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && selectedLetter && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {actionType === 'view' ? '信件详情' : actionType === 'approve' ? '审核通过' : '拒绝信件'}
                            </h2>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">标题</label>
                                <p className="text-gray-900 dark:text-white mt-1">{selectedLetter.title}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">发件人</label>
                                    <p className="text-gray-900 dark:text-white mt-1">
                                        {selectedLetter.sender_username} ({selectedLetter.sender_email})
                                    </p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">收件人</label>
                                    <p className="text-gray-900 dark:text-white mt-1">
                                        {selectedLetter.recipient_type === 'self' ? '自己' : selectedLetter.recipient_email}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">排期时间</label>
                                    <p className="text-gray-900 dark:text-white mt-1">
                                        {formatDate(selectedLetter.scheduled_at_utc, selectedLetter.scheduled_tz)}
                                    </p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">提交时间</label>
                                    <p className="text-gray-900 dark:text-white mt-1">
                                        {formatDate(selectedLetter.submitted_at, selectedLetter.scheduled_tz)}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">内容</label>
                                <div className="mt-1 p-4 bg-gray-50 dark:bg-slate-700 rounded-lg max-h-60 overflow-y-auto">
                                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                                        {selectedLetter.content}
                                    </p>
                                </div>
                            </div>

                            {selectedLetter.is_public && (
                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                    <Globe size={16} />
                                    <span className="text-sm">此信件将在公开信墙展示</span>
                                </div>
                            )}

                            {actionType === 'approve' && (
                                <div>
                                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">审核备注 (可选)</label>
                                    <textarea
                                        value={reviewNote}
                                        onChange={e => setReviewNote(e.target.value)}
                                        className="w-full mt-1 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                        rows={2}
                                        placeholder="添加审核备注..."
                                    />
                                </div>
                            )}

                            {actionType === 'reject' && (
                                <div>
                                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">拒绝原因 (必填)</label>
                                    <textarea
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                        className="w-full mt-1 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                        rows={3}
                                        placeholder="请说明拒绝原因，用户将看到此内容..."
                                        required
                                    />
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            {actionType === 'approve' && (
                                <button
                                    onClick={handleApprove}
                                    disabled={actionLoading}
                                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                                >
                                    {actionLoading ? '处理中...' : '确认通过'}
                                </button>
                            )}
                            {actionType === 'reject' && (
                                <button
                                    onClick={handleReject}
                                    disabled={actionLoading || !rejectReason.trim()}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                                >
                                    {actionLoading ? '处理中...' : '确认拒绝'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                                    <Trash2 className="text-red-600 dark:text-red-400" size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">确认删除</h2>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                确定要删除这封信件吗？此操作不可恢复。
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                    disabled={deleteLoading}
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => handleDelete(deleteConfirm)}
                                    disabled={deleteLoading}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {deleteLoading ? (
                                        <RefreshCw size={16} className="animate-spin" />
                                    ) : (
                                        <Trash2 size={16} />
                                    )}
                                    {deleteLoading ? '删除中...' : '确认删除'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
