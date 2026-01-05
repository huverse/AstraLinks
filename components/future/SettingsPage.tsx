/**
 * Future Letters - Settings Page
 * 用户设置页面
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    ArrowLeft,
    Settings,
    Mail,
    Bell,
    Globe,
    Palette,
    Music,
    Trash2,
    Save,
    Loader2,
    Sun,
    Moon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE } from '../../utils/api';
import { useToast } from './ToastProvider';
import { useTheme } from './ThemeProvider';
import type { ThemeType } from './ThemeProvider';

interface UserSettings {
    defaultEmail: string;
    notifyOnDelivery: boolean;
    timezone: string;
    theme: 'purple' | 'starry' | 'ocean' | 'cloud';
    darkMode: boolean;
}

interface SettingsPageProps {
    onBack: () => void;
}

const TIMEZONES = [
    { value: 'Asia/Shanghai', label: '北京时间 (UTC+8)' },
    { value: 'Asia/Tokyo', label: '东京时间 (UTC+9)' },
    { value: 'America/New_York', label: '纽约时间 (UTC-5)' },
    { value: 'America/Los_Angeles', label: '洛杉矶时间 (UTC-8)' },
    { value: 'Europe/London', label: '伦敦时间 (UTC+0)' },
    { value: 'Europe/Paris', label: '巴黎时间 (UTC+1)' },
];

const THEMES = [
    { value: 'purple', label: '紫色渐变', description: '默认主题', icon: '💜' },
    { value: 'starry', label: '星空', description: '璀璨星河', icon: '✨' },
    { value: 'ocean', label: '大海', description: '蔚蓝深邃', icon: '🌊' },
    { value: 'cloud', label: '云层遨游', description: '轻盈自在', icon: '☁️' },
];

export default function SettingsPage({ onBack }: SettingsPageProps) {
    const { token, user } = useAuth();
    const toast = useToast();
    const { theme: currentTheme, darkMode: currentDarkMode, setTheme, setDarkMode } = useTheme();
    const [settings, setSettings] = useState<UserSettings>({
        defaultEmail: user?.email || '',
        notifyOnDelivery: true,
        timezone: 'Asia/Shanghai',
        theme: currentTheme,
        darkMode: currentDarkMode,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Load settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const response = await fetch(`${API_BASE}/api/future/user-settings`, {
                    credentials: 'include',
                    headers,
                });

                if (response.ok) {
                    const data = await response.json();
                    const loadedTheme = data.theme || 'purple';
                    const loadedDarkMode = data.darkMode ?? false;

                    setSettings(prev => ({
                        ...prev,
                        defaultEmail: data.defaultEmail || prev.defaultEmail,
                        notifyOnDelivery: data.notifyOnDelivery ?? true,
                        timezone: data.timezone || 'Asia/Shanghai',
                        theme: loadedTheme,
                        darkMode: loadedDarkMode,
                    }));

                    // Sync theme context with loaded settings
                    setTheme(loadedTheme as ThemeType);
                    setDarkMode(loadedDarkMode);
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadSettings();
    }, [token, user?.email, setTheme, setDarkMode]);

    const handleChange = useCallback(<K extends keyof UserSettings>(
        key: K,
        value: UserSettings[K]
    ) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);

        // Immediately apply theme/dark mode changes via context
        if (key === 'theme') {
            setTheme(value as ThemeType);
        } else if (key === 'darkMode') {
            setDarkMode(value as boolean);
        }
    }, [setTheme, setDarkMode]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/user-settings`, {
                method: 'PUT',
                credentials: 'include',
                headers,
                body: JSON.stringify(settings),
            });

            if (!response.ok) {
                throw new Error('保存失败');
            }

            toast.success('设置已保存');
            setHasChanges(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '保存失败');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteData = async () => {
        if (!confirm('确定要删除所有时光信数据吗？此操作不可恢复！')) return;
        if (!confirm('再次确认：这将删除您的所有信件、草稿和设置。确定继续？')) return;

        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/user-data`, {
                method: 'DELETE',
                credentials: 'include',
                headers,
            });

            if (!response.ok) {
                throw new Error('删除失败');
            }

            toast.success('数据已删除');
            onBack();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '删除失败');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-[100dvh] text-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] text-white relative z-10">
            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>返回</span>
                    </button>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        设置
                    </h1>
                    <button
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                        {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">保存</span>
                    </button>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
                {/* Email Settings */}
                <section className="bg-white/5 rounded-2xl p-6 border border-white/10">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Mail className="w-5 h-5 text-blue-400" />
                        邮箱设置
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-white/70 mb-2">默认收件邮箱</label>
                            <input
                                type="email"
                                value={settings.defaultEmail}
                                onChange={(e) => handleChange('defaultEmail', e.target.value)}
                                placeholder="your@email.com"
                                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400 transition-colors"
                            />
                            <p className="text-xs text-white/50 mt-2">给自己写信时默认使用此邮箱</p>
                        </div>
                    </div>
                </section>

                {/* Notification Settings */}
                <section className="bg-white/5 rounded-2xl p-6 border border-white/10">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-amber-400" />
                        通知偏好
                    </h2>
                    <div className="space-y-4">
                        <label className="flex items-center justify-between cursor-pointer">
                            <div>
                                <p className="font-medium">信件送达通知</p>
                                <p className="text-sm text-white/50">当信件送达时发送邮件提醒</p>
                            </div>
                            <div
                                className={`relative w-12 h-6 rounded-full transition-colors ${
                                    settings.notifyOnDelivery ? 'bg-purple-500' : 'bg-white/20'
                                }`}
                                onClick={() => handleChange('notifyOnDelivery', !settings.notifyOnDelivery)}
                            >
                                <div
                                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                        settings.notifyOnDelivery ? 'translate-x-7' : 'translate-x-1'
                                    }`}
                                />
                            </div>
                        </label>
                    </div>
                </section>

                {/* Timezone Settings */}
                <section className="bg-white/5 rounded-2xl p-6 border border-white/10">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-emerald-400" />
                        时区设置
                    </h2>
                    <div>
                        <select
                            value={settings.timezone}
                            onChange={(e) => handleChange('timezone', e.target.value)}
                            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400 transition-colors appearance-none cursor-pointer"
                        >
                            {TIMEZONES.map(tz => (
                                <option key={tz.value} value={tz.value} className="bg-slate-800">
                                    {tz.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-white/50 mt-2">信件送达时间将按此时区显示</p>
                    </div>
                </section>

                {/* Theme Settings */}
                <section className="bg-white/5 rounded-2xl p-6 border border-white/10">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Palette className="w-5 h-5 text-pink-400" />
                        主题设置
                    </h2>
                    <div className="space-y-4">
                        {/* Dark Mode Toggle */}
                        <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-3">
                                {settings.darkMode ? (
                                    <Moon className="w-5 h-5 text-blue-400" />
                                ) : (
                                    <Sun className="w-5 h-5 text-amber-400" />
                                )}
                                <div>
                                    <p className="font-medium">深色模式</p>
                                    <p className="text-sm text-white/50">切换明暗主题</p>
                                </div>
                            </div>
                            <div
                                className={`relative w-12 h-6 rounded-full transition-colors ${
                                    settings.darkMode ? 'bg-purple-500' : 'bg-white/20'
                                }`}
                                onClick={() => handleChange('darkMode', !settings.darkMode)}
                            >
                                <div
                                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                        settings.darkMode ? 'translate-x-7' : 'translate-x-1'
                                    }`}
                                />
                            </div>
                        </label>

                        {/* Theme Selection */}
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            {THEMES.map(theme => (
                                <button
                                    key={theme.value}
                                    onClick={() => handleChange('theme', theme.value as any)}
                                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                                        settings.theme === theme.value
                                            ? 'border-purple-400 bg-purple-500/20'
                                            : 'border-white/10 hover:border-white/30 bg-white/5'
                                    }`}
                                >
                                    <span className="text-2xl">{theme.icon}</span>
                                    <p className="font-medium mt-2">{theme.label}</p>
                                    <p className="text-xs text-white/50">{theme.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Background Music */}
                <section className="bg-white/5 rounded-2xl p-6 border border-white/10">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Music className="w-5 h-5 text-purple-400" />
                        背景音乐
                    </h2>
                    <p className="text-sm text-white/50">
                        背景音乐由管理员在后台配置，您可以在右下角的播放器中控制播放。
                    </p>
                </section>

                {/* Danger Zone */}
                <section className="bg-red-500/10 rounded-2xl p-6 border border-red-500/30">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-400">
                        <Trash2 className="w-5 h-5" />
                        危险操作
                    </h2>
                    <p className="text-sm text-white/70 mb-4">
                        删除您在时光信中的所有数据，包括已发送、已收到的信件和草稿。此操作不可恢复。
                    </p>
                    <button
                        onClick={handleDeleteData}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors border border-red-500/30"
                    >
                        删除所有数据
                    </button>
                </section>
            </main>
        </div>
    );
}
