import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { BarChart3, Users, Activity, Download, Calendar, TrendingUp, Clock, Eye } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';

interface AnalyticsSummary {
    period: string;
    totalEvents: number;
    uniqueUsers: number;
    eventsByType: { event_type: string; count: number }[];
    dailyTrend: { date: string; users: number; events: number }[];
    popularPages: { page_path: string; views: number }[];
    hourlyDistribution: { hour: number; count: number }[];
}

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#EF4444', '#14B8A6'];

export default function Analytics() {
    const [data, setData] = useState<AnalyticsSummary | null>(null);
    const [days, setDays] = useState(7);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        loadData();
    }, [days]);

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await adminAPI.getAnalyticsSummary(days);
            setData(result);
        } catch (error) {
            console.error('Failed to load analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async (format: 'json' | 'csv') => {
        setExporting(true);
        try {
            const result = await adminAPI.exportAnalytics(days, format);
            if (format === 'csv') {
                // CSV is returned as string, trigger download
                const blob = new Blob([result], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics-${days}days.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                // JSON download
                const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics-${days}days.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('导出失败');
        } finally {
            setExporting(false);
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
            <div className="bg-gradient-to-r from-orange-500 to-pink-500 rounded-2xl p-6 text-white shadow-xl">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <BarChart3 size={32} />
                    数据分析
                </h1>
                <p className="text-orange-100">深度用户行为分析与数据可视化</p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow">
                    <Calendar size={18} className="text-gray-400 dark:text-gray-500" />
                    <select
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className="border-none outline-none bg-transparent font-medium text-gray-800 dark:text-gray-200"
                    >
                        <option value={7}>最近 7 天</option>
                        <option value={14}>最近 14 天</option>
                        <option value={30}>最近 30 天</option>
                        <option value={90}>最近 90 天</option>
                    </select>
                </div>

                <div className="flex gap-2 ml-auto">
                    <button
                        onClick={() => handleExport('csv')}
                        disabled={exporting}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50"
                    >
                        <Download size={18} />
                        导出 CSV
                    </button>
                    <button
                        onClick={() => handleExport('json')}
                        disabled={exporting}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50"
                    >
                        <Download size={18} />
                        导出 JSON
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">总事件数</p>
                            <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{data?.totalEvents?.toLocaleString() || 0}</p>
                        </div>
                        <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-xl">
                            <Activity size={24} className="text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">独立用户</p>
                            <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{data?.uniqueUsers?.toLocaleString() || 0}</p>
                        </div>
                        <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-xl">
                            <Users size={24} className="text-purple-600 dark:text-purple-400" />
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">日均事件</p>
                            <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">
                                {data?.totalEvents ? Math.round(data.totalEvents / days).toLocaleString() : 0}
                            </p>
                        </div>
                        <div className="bg-green-100 dark:bg-green-900/50 p-3 rounded-xl">
                            <TrendingUp size={24} className="text-green-600 dark:text-green-400" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Daily Trend Chart */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-blue-500" />
                    用户活跃趋势
                </h3>
                <div className="h-80">
                    {data?.dailyTrend && data.dailyTrend.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailyTrend}>
                                <defs>
                                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-slate-600" />
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
                                <Area type="monotone" dataKey="users" stroke="#3B82F6" fillOpacity={1} fill="url(#colorUsers)" name="活跃用户" />
                                <Area type="monotone" dataKey="events" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorEvents)" name="事件数" />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">暂无数据</div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Event Types */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <Eye size={20} className="text-purple-500" />
                        事件类型分布
                    </h3>
                    <div className="h-64">
                        {data?.eventsByType && data.eventsByType.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.eventsByType.slice(0, 8)} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-slate-600" />
                                    <XAxis type="number" stroke="#9CA3AF" />
                                    <YAxis dataKey="event_type" type="category" stroke="#9CA3AF" width={100} />
                                    <Tooltip contentStyle={{ background: '#1F2937', border: 'none', borderRadius: '8px', color: 'white' }} />
                                    <Bar dataKey="count" name="次数" radius={[0, 4, 4, 0]}>
                                        {data.eventsByType.slice(0, 8).map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">暂无数据</div>
                        )}
                    </div>
                </div>

                {/* Popular Pages */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <Eye size={20} className="text-green-500" />
                        热门页面
                    </h3>
                    <div className="space-y-3">
                        {data?.popularPages && data.popularPages.length > 0 ? (
                            data.popularPages.slice(0, 8).map((page, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className="w-6 h-6 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{page.page_path || '/'}</p>
                                    </div>
                                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{page.views}</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-gray-400 dark:text-gray-500 py-8">暂无数据</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Hourly Distribution */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Clock size={20} className="text-orange-500" />
                    24小时活跃分布
                </h3>
                <div className="h-48">
                    {data?.hourlyDistribution && data.hourlyDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.hourlyDistribution}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-slate-600" />
                                <XAxis dataKey="hour" stroke="#9CA3AF" tickFormatter={(v) => `${v}:00`} />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip
                                    contentStyle={{ background: '#1F2937', border: 'none', borderRadius: '8px', color: 'white' }}
                                    labelFormatter={(v) => `${v}:00 - ${v}:59`}
                                />
                                <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} name="事件数" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">暂无数据</div>
                    )}
                </div>
            </div>
        </div>
    );
}
