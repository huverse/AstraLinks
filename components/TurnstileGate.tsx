import React, { useState, useEffect, useRef } from 'react';
import { Shield, AlertCircle, CheckCircle } from 'lucide-react';

// Note: Window.turnstile type is declared in LoginModal.tsx

interface TurnstileGateProps {
    children: React.ReactNode;
}

const VERIFIED_KEY = 'turnstile_site_verified';
const DEFAULT_EXPIRY_HOURS = 24;

type StorageMode = 'session' | 'persistent';

// Helper to get storage based on mode
function getStorage(mode: StorageMode): Storage {
    return mode === 'persistent' ? localStorage : sessionStorage;
}

// Helper to check if user is logged in
function isUserLoggedIn(): boolean {
    return !!localStorage.getItem('galaxyous_token');
}

export default function TurnstileGate({ children }: TurnstileGateProps) {
    const [loading, setLoading] = useState(true);
    const [siteEnabled, setSiteEnabled] = useState(false);
    const [siteKey, setSiteKey] = useState('');
    const [expiryHours, setExpiryHours] = useState(DEFAULT_EXPIRY_HOURS);
    const [storageMode, setStorageMode] = useState<StorageMode>('session');
    const [skipForLoggedIn, setSkipForLoggedIn] = useState(false);
    const [verified, setVerified] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const turnstileWidgetId = useRef<string | null>(null);
    const turnstileContainerRef = useRef<HTMLDivElement>(null);

    // Fetch Turnstile settings first
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch('/api/settings/public/turnstile');
                if (response.ok) {
                    const data = await response.json();
                    setSiteEnabled(data.siteEnabled);
                    setSiteKey(data.siteKey);
                    if (data.expiryHours !== undefined) {
                        setExpiryHours(data.expiryHours);
                    }
                    if (data.storageMode) {
                        setStorageMode(data.storageMode);
                    }
                    if (data.skipForLoggedIn !== undefined) {
                        setSkipForLoggedIn(data.skipForLoggedIn);
                    }

                    // Check if user is logged in and skipForLoggedIn is enabled
                    if (data.skipForLoggedIn && isUserLoggedIn()) {
                        setVerified(true);
                        setLoading(false);
                        return;
                    }

                    // Determine which storage to use
                    const storage = getStorage(data.storageMode || 'session');

                    // Check if already verified (with dynamic expiry)
                    // expiryHours === 0 means "every visit" mode - never use cached verification
                    const stored = storage.getItem(VERIFIED_KEY);
                    if (stored && data.siteEnabled && data.expiryHours > 0) {
                        try {
                            const storedData = JSON.parse(stored);
                            const expiryMs = data.expiryHours * 60 * 60 * 1000;
                            if (storedData.timestamp && Date.now() - storedData.timestamp < expiryMs) {
                                setVerified(true);
                            } else {
                                storage.removeItem(VERIFIED_KEY);
                            }
                        } catch {
                            storage.removeItem(VERIFIED_KEY);
                        }
                    } else if (data.expiryHours === 0) {
                        // Every visit mode - clear any stored verification from both storages
                        sessionStorage.removeItem(VERIFIED_KEY);
                        localStorage.removeItem(VERIFIED_KEY);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch Turnstile settings:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    // Initialize Turnstile widget
    useEffect(() => {
        if (loading || !siteEnabled || verified || !siteKey) return;

        const initTurnstile = () => {
            if (window.turnstile && turnstileContainerRef.current && !turnstileWidgetId.current) {
                turnstileWidgetId.current = window.turnstile.render(turnstileContainerRef.current, {
                    sitekey: siteKey,
                    callback: (token: string) => {
                        // Token received, user verified
                        // Only store if expiryHours > 0 (not "every visit" mode)
                        if (expiryHours > 0) {
                            const storage = getStorage(storageMode);
                            storage.setItem(VERIFIED_KEY, JSON.stringify({ timestamp: Date.now() }));
                        }
                        setVerified(true);
                    },
                    'error-callback': () => {
                        setError('验证失败，请刷新页面重试');
                    },
                    'expired-callback': () => {
                        setError('验证已过期，请重新验证');
                        if (turnstileWidgetId.current && window.turnstile) {
                            window.turnstile.reset(turnstileWidgetId.current);
                        }
                    },
                    theme: 'auto',
                });
            }
        };

        // Wait for turnstile script to load
        const checkTurnstile = setInterval(() => {
            if (window.turnstile) {
                clearInterval(checkTurnstile);
                initTurnstile();
            }
        }, 100);

        const timeout = setTimeout(() => {
            clearInterval(checkTurnstile);
            if (!window.turnstile) {
                setError('验证服务加载超时，请刷新页面');
            }
        }, 10000);

        return () => {
            clearInterval(checkTurnstile);
            clearTimeout(timeout);
            if (turnstileWidgetId.current && window.turnstile) {
                window.turnstile.remove(turnstileWidgetId.current);
                turnstileWidgetId.current = null;
            }
        };
    }, [loading, siteEnabled, verified, siteKey, expiryHours, storageMode]);

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                <div className="text-white text-lg">加载中...</div>
            </div>
        );
    }

    // If site-wide Turnstile is not enabled, or already verified, show children
    if (!siteEnabled || verified) {
        return <>{children}</>;
    }

    // Show Turnstile gate
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                {/* Logo / Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                        <Shield size={40} className="text-white" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    安全验证
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                    请完成以下验证以访问网站
                </p>

                {/* Error message */}
                {error && (
                    <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg mb-6">
                        <AlertCircle size={20} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Turnstile widget container */}
                <div className="flex justify-center mb-6">
                    <div ref={turnstileContainerRef} className="cf-turnstile" />
                </div>

                {/* Footer */}
                <p className="text-xs text-gray-500 dark:text-gray-500">
                    由 Cloudflare Turnstile 提供保护
                </p>
            </div>
        </div>
    );
}
