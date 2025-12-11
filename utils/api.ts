// Shared API utility functions
export const getApiBase = (): string => {
    if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
    if (typeof window !== 'undefined' && window.location.hostname === 'astralinks.xyz')
        return 'https://astralinks.xyz';
    return 'http://localhost:3001';
};

export const API_BASE = getApiBase();

// Generic fetch wrapper with error handling
export const apiFetch = async <T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return response.json();
};

// Authenticated fetch wrapper
export const authFetch = async <T>(
    endpoint: string,
    token: string | null,
    options: RequestInit = {}
): Promise<T> => {
    if (!token) {
        throw new Error('Authentication required');
    }

    return apiFetch<T>(endpoint, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
        },
    });
};
