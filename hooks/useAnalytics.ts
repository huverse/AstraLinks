import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// @ts-ignore - Vite env
const PROXY_API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

interface TrackEventOptions {
    eventType: string;
    eventData?: Record<string, any>;
    pagePath?: string;
}

/**
 * Hook for tracking user behavior analytics
 * Only tracks authenticated users
 */
export function useAnalytics() {
    const { isAuthenticated, token } = useAuth();
    const lastPageRef = useRef<string>('');
    const sessionStartRef = useRef<number>(Date.now());

    // Track event helper
    const track = useCallback(async (options: TrackEventOptions) => {
        if (!isAuthenticated || !token) return;

        const { eventType, eventData = {}, pagePath } = options;

        try {
            await fetch(`${PROXY_API_BASE}/api/analytics/track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    event_type: eventType,
                    page_path: pagePath || window.location.pathname,
                    event_data: {
                        ...eventData,
                        session_duration: Math.floor((Date.now() - sessionStartRef.current) / 1000),
                        user_agent: navigator.userAgent,
                        screen_width: window.innerWidth,
                        screen_height: window.innerHeight
                    }
                })
            });
        } catch (err) {
            // Silently fail - analytics shouldn't break the app
            console.debug('Analytics track failed:', err);
        }
    }, [isAuthenticated, token]);

    // Track page views
    const trackPageView = useCallback((pagePath?: string) => {
        const path = pagePath || window.location.pathname;
        if (path !== lastPageRef.current) {
            lastPageRef.current = path;
            track({ eventType: 'page_view', pagePath: path });
        }
    }, [track]);

    // Track user actions
    const trackAction = useCallback((action: string, data?: Record<string, any>) => {
        track({ eventType: action, eventData: data });
    }, [track]);

    // Track button clicks
    const trackClick = useCallback((buttonName: string, data?: Record<string, any>) => {
        track({ eventType: 'button_click', eventData: { button: buttonName, ...data } });
    }, [track]);

    // Track feature usage
    const trackFeature = useCallback((featureName: string, data?: Record<string, any>) => {
        track({ eventType: 'feature_use', eventData: { feature: featureName, ...data } });
    }, [track]);

    // Track errors
    const trackError = useCallback((error: string, data?: Record<string, any>) => {
        track({ eventType: 'error', eventData: { error, ...data } });
    }, [track]);

    // Auto-track page views on mount
    useEffect(() => {
        if (isAuthenticated) {
            trackPageView();
        }
    }, [isAuthenticated, trackPageView]);

    // Track session start
    useEffect(() => {
        if (isAuthenticated) {
            track({ eventType: 'session_start' });

            // Track session end on unload
            const handleUnload = () => {
                // Use sendBeacon for reliable delivery
                if (navigator.sendBeacon && token) {
                    const data = JSON.stringify({
                        event_type: 'session_end',
                        page_path: window.location.pathname,
                        event_data: {
                            session_duration: Math.floor((Date.now() - sessionStartRef.current) / 1000)
                        }
                    });
                    navigator.sendBeacon(
                        `${PROXY_API_BASE}/api/analytics/track`,
                        new Blob([data], { type: 'application/json' })
                    );
                }
            };

            window.addEventListener('beforeunload', handleUnload);
            return () => window.removeEventListener('beforeunload', handleUnload);
        }
    }, [isAuthenticated, token, track]);

    return {
        track,
        trackPageView,
        trackAction,
        trackClick,
        trackFeature,
        trackError
    };
}

export default useAnalytics;
