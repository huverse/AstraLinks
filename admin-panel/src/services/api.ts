const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

let authToken: string | null = localStorage.getItem('admin_token');

export const setAuthToken = (token: string | null) => {
    authToken = token;
    if (token) {
        localStorage.setItem('admin_token', token);
    } else {
        localStorage.removeItem('admin_token');
    }
};

export const getAuthToken = () => authToken;

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        setAuthToken(null);
        window.location.href = '/login';
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

export const adminAPI = {
    // Auth
    login: (username: string, password: string) =>
        fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        }).then(r => r.json()),

    // Stats
    getStats: () => fetchAPI('/api/admin/stats'),

    // Users
    getUsers: (page = 1, limit = 20, search = '') =>
        fetchAPI(`/api/admin/users?page=${page}&limit=${limit}&search=${search}`),
    getUser: (id: number) => fetchAPI(`/api/admin/users/${id}`),
    updateUser: (id: number, data: any) =>
        fetchAPI(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteUser: (id: number) =>
        fetchAPI(`/api/admin/users/${id}`, { method: 'DELETE' }),

    // Invitation Codes
    getCodes: (page = 1, filter = 'all') =>
        fetchAPI(`/api/admin/invitation-codes?page=${page}&filter=${filter}`),
    generateCodes: (count: number) =>
        fetchAPI('/api/admin/invitation-codes/generate', { method: 'POST', body: JSON.stringify({ count }) }),
    deleteCode: (id: number) =>
        fetchAPI(`/api/admin/invitation-codes/${id}`, { method: 'DELETE' }),

    // Reports
    getReports: (page = 1, status = '') =>
        fetchAPI(`/api/admin/reports?page=${page}${status ? `&status=${status}` : ''}`),
    getReport: (id: number) => fetchAPI(`/api/admin/reports/${id}`),
    updateReportStatus: (id: number, status: string, admin_notes: string) =>
        fetchAPI(`/api/admin/reports/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, admin_notes })
        }),

    // Bans
    getBans: (page = 1, active = false) =>
        fetchAPI(`/api/admin/bans?page=${page}${active ? '&active=true' : ''}`),
    createBan: (data: any) =>
        fetchAPI('/api/admin/bans', { method: 'POST', body: JSON.stringify(data) }),
    liftBan: (id: number) =>
        fetchAPI(`/api/admin/bans/${id}/lift`, { method: 'PATCH' }),
    deleteBan: (id: number) =>
        fetchAPI(`/api/admin/bans/${id}`, { method: 'DELETE' }),

    // Logs
    getLogs: (page = 1) => fetchAPI(`/api/admin/logs?page=${page}`),

    // Analytics
    getAnalyticsSummary: (days = 7) => fetchAPI(`/api/analytics/admin/summary?days=${days}`),
    getAnalyticsRealtime: () => fetchAPI('/api/analytics/admin/realtime'),
    getUserAnalytics: (userId: number, limit = 100) => fetchAPI(`/api/analytics/admin/users/${userId}?limit=${limit}`),
    exportAnalytics: (days = 30, format = 'json') => fetchAPI(`/api/analytics/admin/export?days=${days}&format=${format}`),

    // Feedback
    getFeedbackThreads: (page = 1, status = 'all') => fetchAPI(`/api/feedback/admin/all?page=${page}&status=${status}`),
    getFeedbackThread: (threadId: string) => fetchAPI(`/api/feedback/admin/thread/${threadId}`),
    replyToFeedback: (threadId: string, content: string) =>
        fetchAPI(`/api/feedback/admin/thread/${threadId}/reply`, { method: 'POST', body: JSON.stringify({ content }) }),
    deleteFeedbackThread: (threadId: string) =>
        fetchAPI(`/api/feedback/admin/thread/${threadId}`, { method: 'DELETE' }),
    getFeedbackStats: () => fetchAPI('/api/feedback/admin/stats'),

    // Pending Operations (Undo)
    getPendingOperations: () => fetchAPI('/api/admin/pending-operations'),
    cancelOperation: (id: number) =>
        fetchAPI(`/api/admin/pending-operations/${id}/cancel`, { method: 'POST' }),
    createBanWithUndo: (data: { user_id: number; reason: string; ban_type: string; duration_days?: number; undo_window?: number }) =>
        fetchAPI('/api/admin/bans/with-undo', { method: 'POST', body: JSON.stringify(data) }),

    // Announcements
    getAnnouncements: () => fetchAPI('/api/announcements/admin/list'),
    createAnnouncement: (data: any) =>
        fetchAPI('/api/announcements/admin/create', { method: 'POST', body: JSON.stringify(data) }),
    updateAnnouncement: (id: number, data: any) =>
        fetchAPI(`/api/announcements/admin/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteAnnouncement: (id: number) =>
        fetchAPI(`/api/announcements/admin/${id}`, { method: 'DELETE' }),

    // Site Settings
    getSetting: (key: string) => fetchAPI(`/api/settings/${key}`),
    updateSetting: (key: string, value: string) =>
        fetchAPI(`/api/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),

    // Config Templates
    getConfigTemplates: () => fetchAPI('/api/config-templates/admin/list'),
    createConfigTemplate: (data: any) =>
        fetchAPI('/api/config-templates/admin/create', { method: 'POST', body: JSON.stringify(data) }),
    updateConfigTemplate: (id: number, data: any) =>
        fetchAPI(`/api/config-templates/admin/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteConfigTemplate: (id: number) =>
        fetchAPI(`/api/config-templates/admin/${id}`, { method: 'DELETE' }),

    // Model Tiers
    getModelTiers: () => fetchAPI('/api/config-templates/admin/model-tiers'),
    createModelTier: (data: { model_pattern: string; tier: string; description?: string }) =>
        fetchAPI('/api/config-templates/admin/model-tiers', { method: 'POST', body: JSON.stringify(data) }),
    deleteModelTier: (id: number) =>
        fetchAPI(`/api/config-templates/admin/model-tiers/${id}`, { method: 'DELETE' }),

    // Export
    exportUsers: (format = 'csv') => fetchAPI(`/api/admin/export/users?format=${format}`),
    exportLogs: (days = 30, format = 'csv') => fetchAPI(`/api/admin/export/logs?days=${days}&format=${format}`)
};


