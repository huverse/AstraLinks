import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { Users, Ticket, Flag, Ban, TrendingUp, Activity, MessageSquare, BarChart3, Download, Eye } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

interface AnalyticsSummary {
    totalEvents: number;
    uniqueUsers: number;
    eventsByType: { event_type: string; count: number }[];
    dailyTrend: { date: string; users: number; events: number }[];
    hourlyDistribution: { hour: number; count: number }[];
}

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1'];

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
    const [feedbackStats, setFeedbackStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeUsers, setActiveUsers] = useState(0);

    useEffect(() => {
        Promise.all([
            adminAPI.getStats(),
            adminAPI.getAnalyticsSummary(7).catch(() => null),
            adminAPI.getFeedbackStats().catch(() => null),
            adminAPI.getAnalyticsRealtime().catch(() => ({ activeUsers: 0 }))
        ])
            .then(([statsData, analyticsData, feedbackData, realtimeData]) => {
                setStats(statsData);
                setAnalytics(analyticsData);
                setFeedbackStats(feedbackData);
                setActiveUsers(realtimeData?.activeUsers || 0);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-500 dark:text-gray-400">加载中...</p>
                </div>
            </div>
        );
    }

    const statsCards = [
        { label: '总用户数', value: stats?.totalUsers || 0, icon: Users, gradient: 'from-blue-500 to-cyan-500' },
        { label: '今日新增', value: stats?.todayNewUsers || 0, icon: TrendingUp, gradient: 'from-green-500 to-emerald-500' },
        { label: '实时活跃', value: activeUsers, icon: Activity, gradient: 'from-purple-500 to-pink-500' },
        { label: '待处理举报', value: stats?.pendingReports || 0, icon: Flag, gradient: 'from-orange-500 to-red-500' },
        { label: '活跃封禁', value: stats?.activeBans || 0, icon: Ban, gradient: 'from-red-500 to-rose-500' },
        { label: '未读反馈', value: feedbackStats?.unreadMessages || 0, icon: MessageSquare, gradient: 'from-indigo-500 to-blue-500' },
    ];

    return (
        <div className="space-y-8 text-gray-900 dark:text-gray-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
                <h1 className="text-4xl font-bold mb-2">仪表盘</h1>
                <p className="text-blue-100 text-lg">管理员后台概览 · 实时数据监控</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {statsCards.map((card, i) => {
                    const Icon = card.icon;
                    return (
                        <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-100 dark:border-slate-700">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{card.label}</p>
                                    <p className="text-4xl font-bold text-gray-800 dark:text-gray-100 mt-2">{card.value}</p>
                                </div>
                                <div className={`bg-gradient-to-br ${card.gradient} p-4 rounded-xl shadow-lg`}>
                                    <Icon className="text-white" size={24} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Trend Chart */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <BarChart3 size={20} className="text-blue-500" />
                        7日用户活跃趋势
                    </h3>
                    <div className="h-64">
                        {analytics?.dailyTrend && analytics.dailyTrend.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analytics.dailyTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#9CA3AF"
                                        tickFormatter={(v) => new Date(v).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                                    />
                                    <YAxis stroke="#9CA3AF" />
                                    <Tooltip
                                        contentStyle={{ background: '#1F2937', border: 'none', borderRadius: '8px', color: 'white' }}
                                        labelFormatter={(v) => new Date(v).toLocaleDateString('zh-CN')}
                                    />
                                    <Line type="monotone" dataKey="users" stroke="#3B82F6" strokeWidth={3} dot={{ fill: '#3B82F6' }} name="活跃用户" />
                                    <Line type="monotone" dataKey="events" stroke="#8B5CF6" strokeWidth={2} dot={false} name="事件数" />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
                                暂无数据
                            </div>
                        )}
                    </div>
                </div>

                {/* Event Types Pie Chart */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <Eye size={20} className="text-purple-500" />
                        用户行为分布
                    </h3>
                    <div className="h-64">
                        {analytics?.eventsByType && analytics.eventsByType.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.eventsByType.slice(0, 6)}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="count"
                                        nameKey="event_type"
                                        label={({ event_type }) => event_type}
                                    >
                                        {analytics.eventsByType.slice(0, 6).map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
                                暂无数据
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Hourly Distribution */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Activity size={20} className="text-green-500" />
                    24小时活跃度分布
                </h3>
                <div className="h-48">
                    {analytics?.hourlyDistribution && analytics.hourlyDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics.hourlyDistribution}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="hour" stroke="#9CA3AF" tickFormatter={(v) => `${v}:00`} />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip
                                    contentStyle={{ background: '#1F2937', border: 'none', borderRadius: '8px', color: 'white' }}
                                    labelFormatter={(v) => `${v}:00 - ${v}:59`}
                                />
                                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} name="事件数" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
                            暂无数据
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
                <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Download size={20} className="text-blue-500" />
                    快捷操作
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <a href="/users" className="p-4 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-xl text-center transition-colors border-2 border-blue-200 dark:border-blue-800">
                        <Users className="mx-auto mb-2 text-blue-600 dark:text-blue-400" size={24} />
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">用户管理</p>
                    </a>
                    <a href="/invitations" className="p-4 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-xl text-center transition-colors border-2 border-purple-200 dark:border-purple-800">
                        <Ticket className="mx-auto mb-2 text-purple-600 dark:text-purple-400" size={24} />
                        <p className="text-sm font-semibold text-purple-900 dark:text-purple-300">邀请码</p>
                    </a>
                    <a href="/feedback" className="p-4 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-xl text-center transition-colors border-2 border-green-200 dark:border-green-800">
                        <MessageSquare className="mx-auto mb-2 text-green-600 dark:text-green-400" size={24} />
                        <p className="text-sm font-semibold text-green-900 dark:text-green-300">用户反馈</p>
                    </a>
                    <a href="/analytics" className="p-4 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 rounded-xl text-center transition-colors border-2 border-orange-200 dark:border-orange-800">
                        <BarChart3 className="mx-auto mb-2 text-orange-600 dark:text-orange-400" size={24} />
                        <p className="text-sm font-semibold text-orange-900 dark:text-orange-300">数据分析</p>
                    </a>
                </div>
            </div>
        </div>
    );
}
