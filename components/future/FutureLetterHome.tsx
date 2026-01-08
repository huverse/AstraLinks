/**
 * Future Letters - Home Page (Entry with flip animation)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Mail,
    Send,
    Inbox,
    FileText,
    Settings,
    Plus,
    ChevronRight,
    ArrowLeft,
    Globe,
} from 'lucide-react';
import type { FutureView } from './types';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE } from '../../utils/api';

interface FutureLetterHomeProps {
    onBack: () => void;
    onNavigate: (view: FutureView, letterId?: string) => void;
}

export default function FutureLetterHome({ onBack, onNavigate }: FutureLetterHomeProps) {
    const { token } = useAuth();
    const [stats, setStats] = useState({
        drafts: 0,
        scheduled: 0,
        delivered: 0,
        receivedUnread: 0,
    });
    const [isLoading, setIsLoading] = useState(true);

    const loadHomeData = useCallback(async () => {
        setIsLoading(true);
        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const statsRes = await fetch(`${API_BASE}/api/future/stats`, {
                credentials: 'include',
                headers,
            });

            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats({
                    drafts: statsData.drafts || 0,
                    scheduled: (statsData.sent || 0) + (statsData.scheduled || 0),
                    delivered: statsData.received || 0,
                    receivedUnread: statsData.receivedUnread || 0,
                });
            }
        } catch (error) {
            console.error('Failed to load home data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadHomeData();
    }, [loadHomeData]);

    const menuItems = [
        {
            icon: Plus,
            label: '写一封信',
            description: '给未来的自己或他人写信',
            color: 'from-purple-500 to-pink-500',
            onClick: () => onNavigate('compose'),
        },
        {
            icon: Send,
            label: '已发送',
            description: '查看发出的信件',
            color: 'from-blue-500 to-cyan-500',
            count: stats.scheduled,
            onClick: () => onNavigate('sent'),
        },
        {
            icon: Inbox,
            label: '已收到',
            description: '来自过去的信件',
            color: 'from-green-500 to-emerald-500',
            count: stats.receivedUnread,
            onClick: () => onNavigate('received'),
        },
        {
            icon: FileText,
            label: '草稿箱',
            description: '未完成的信件',
            color: 'from-orange-500 to-amber-500',
            count: stats.drafts,
            onClick: () => onNavigate('drafts'),
        },
        {
            icon: Globe,
            label: '公开信墙',
            description: '浏览公开分享的信件',
            color: 'from-indigo-500 to-purple-500',
            onClick: () => onNavigate('public'),
        },
    ];

    return (
        <div className="min-h-[100dvh] text-white relative z-10">
            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>返回</span>
                    </button>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                        时光信
                    </h1>
                    <button
                        onClick={() => onNavigate('settings')}
                        className="p-2 text-white/70 hover:text-white transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-6 shadow-lg shadow-purple-500/30">
                        <Mail className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-bold mb-3">
                        给未来写一封信
                    </h2>
                    <p className="text-white/60 max-w-md mx-auto">
                        时光信会在你指定的时间送达，穿越时间与自己或他人对话
                    </p>
                </div>

                {/* Menu Grid */}
                <div className="grid grid-cols-2 gap-4 mb-12">
                    {menuItems.map((item, index) => (
                        <button
                            key={index}
                            onClick={item.onClick}
                            className="relative group bg-white/5 hover:bg-white/10 rounded-2xl p-6 text-left transition-all duration-300 border border-white/10 hover:border-white/20 overflow-hidden"
                        >
                            {/* Gradient Background */}
                            <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-10 transition-opacity`} />

                            {/* Content */}
                            <div className="relative">
                                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${item.color} mb-4`}>
                                    <item.icon className="w-6 h-6" />
                                </div>
                                <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                                    {item.label}
                                    {item.count !== undefined && item.count > 0 && (
                                        <span className="text-sm px-2 py-0.5 bg-white/20 rounded-full">
                                            {item.count}
                                        </span>
                                    )}
                                </h3>
                                <p className="text-white/50 text-sm">{item.description}</p>
                            </div>

                            {/* Arrow */}
                            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                        </button>
                    ))}
                </div>

            </main>

            {/* 底部安全区域 */}
            <div className="pb-24" />
        </div>
    );
}
