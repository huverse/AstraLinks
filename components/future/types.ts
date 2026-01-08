/**
 * Future Letters (时光信) - Frontend Types
 */

// ============================================
// Core Types
// ============================================

export type RecipientType = 'self' | 'other';
export type LetterType = 'electronic' | 'physical';

export type LetterStatus =
    | 'draft'
    | 'pending_review'
    | 'approved'
    | 'rejected'
    | 'scheduled'
    | 'delivering'
    | 'delivered'
    | 'failed'
    | 'cancelled';

export type TemplateCategory = 'classic' | 'modern' | 'festival' | 'romantic' | 'business';

// ============================================
// Letter Types
// ============================================

export interface FutureLetter {
    id: string;
    senderUserId: number;

    recipientType: RecipientType;
    recipientUserId?: number;
    recipientEmail?: string;
    recipientName?: string;

    title: string;
    category?: 'love' | 'family' | 'friendship' | 'growth' | 'gratitude' | 'time' | null;
    content: string;
    contentHtmlSanitized?: string;
    templateId?: number;

    isEncrypted: boolean;
    encryptionHint?: string;

    musicUrl?: string;
    musicId?: string;
    musicName?: string;
    musicArtist?: string;
    musicCoverUrl?: string;

    scheduledLocal: string;
    scheduledTz: string;
    scheduledAtUtc: string;
    deliveredAt?: string;

    letterType: LetterType;
    status: LetterStatus;

    submittedAt?: string;
    reviewedAt?: string;
    reviewNote?: string;
    rejectedReason?: string;

    aiOptIn: boolean;
    turnstileVerified: boolean;

    // 公开信选项
    isPublic?: boolean;
    publicAnonymous?: boolean;
    publicAlias?: string;

    version: number;
    createdAt: string;
    updatedAt: string;
}

export interface FutureLetterSummary {
    id: string;
    title: string;
    recipientType: RecipientType;
    recipientName?: string;
    scheduledAtUtc: string;
    scheduledTz: string;
    status: LetterStatus;
    isEncrypted: boolean;
    hasMusic: boolean;
    attachmentCount: number;
    isPublic: boolean;
    createdAt: string;
}

export interface FutureLetterDetail extends FutureLetter {
    attachmentsList: FutureLetterAttachment[];
    template?: FutureLetterTemplate;
    physicalOrder?: PhysicalOrderResponse;
}

// ============================================
// Template Types
// ============================================

export interface FutureLetterTemplate {
    id: number;
    name: string;
    description?: string;
    previewUrl?: string;
    thumbnailUrl?: string;
    cssClass?: string;
    cssStyles?: string;
    backgroundUrl?: string;

    category: TemplateCategory;
    isPremium: boolean;
    price: number;

    sortOrder: number;
    enabled: boolean;
}

// ============================================
// Attachment Types
// ============================================

export type AttachmentType = 'image' | 'audio';
export type ScanStatus = 'pending' | 'scanning' | 'clean' | 'infected' | 'error';

export interface FutureLetterAttachment {
    id: number;
    letterId: string;
    storageKey: string;
    originalName?: string;
    mimeType: string;
    sizeBytes: number;
    attachmentType: AttachmentType;
    durationMs?: number;
    width?: number;
    height?: number;
    thumbnailKey?: string;
    scanStatus: ScanStatus;
    sortOrder: number;
    createdAt: string;
}

// ============================================
// Music Types
// ============================================

export interface MusicInfo {
    id: string;
    name: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    duration?: number;
    playUrl?: string;
}

// ============================================
// API Request Types
// ============================================

export interface CreateLetterRequest {
    recipientType: RecipientType;
    recipientEmail?: string;
    recipientName?: string;

    title: string;
    content: string;
    templateId?: number;

    isEncrypted?: boolean;
    encryptionHint?: string;

    musicUrl?: string;

    scheduledLocal: string;
    scheduledTz?: string;

    letterType?: LetterType;
    aiOptIn?: boolean;

    // 公开信选项
    isPublic?: boolean;
    publicAnonymous?: boolean;
    publicAlias?: string;
}

export interface UpdateLetterRequest {
    title?: string;
    content?: string;
    templateId?: number;

    recipientEmail?: string;
    recipientName?: string;

    isEncrypted?: boolean;
    encryptionHint?: string;

    musicUrl?: string;

    scheduledLocal?: string;
    scheduledTz?: string;

    aiOptIn?: boolean;

    // 公开信选项
    isPublic?: boolean;
    publicAnonymous?: boolean;
    publicAlias?: string;

    version: number;
}

export interface LetterListQuery {
    type?: 'sent' | 'received' | 'drafts';
    status?: LetterStatus;
    cursor?: string;
    limit?: number;
    sort?: 'created_at' | 'scheduled_at_utc';
    order?: 'asc' | 'desc';
}

export interface LetterListResponse {
    letters: FutureLetterSummary[];
    nextCursor?: string;
    total: number;
}

// ============================================
// AI Feature Types
// ============================================

export interface WritingAssistRequest {
    content: string;
    assistType: 'improve' | 'expand' | 'simplify' | 'emotional';
    context?: string;
}

export interface WritingAssistResponse {
    suggestion: string;
    provider?: string;
    modelName?: string;
}

export interface SuggestTimeResponse {
    suggestions: {
        datetime: string;
        reason: string;
        significance: string;
    }[];
}

// ============================================
// View State Types
// ============================================

export type FutureView = 'home' | 'compose' | 'sent' | 'received' | 'drafts' | 'detail' | 'settings' | 'public' | 'physical';

export interface FutureLetterState {
    view: FutureView;
    selectedLetterId?: string;
    isLoading: boolean;
    error?: string;
}

export interface ComposeState {
    recipientType: RecipientType;
    recipientEmail: string;
    recipientName: string;
    title: string;
    content: string;
    templateId?: number;
    scheduledLocal: string;
    scheduledTz: string;
    isEncrypted: boolean;
    encryptionHint: string;
    musicUrl: string;
    musicInfo?: MusicInfo;
    letterType: LetterType;
    aiOptIn: boolean;
    attachments: File[];
    isDirty: boolean;
    isSaving: boolean;
    isSubmitting: boolean;
    draftId?: string;
    version: number;
    // 公开信选项
    isPublic: boolean;
    publicAnonymous: boolean;
    publicAlias: string;
    // 信件分类（公开信墙用）
    category?: 'love' | 'family' | 'friendship' | 'growth' | 'gratitude' | 'time';
}

// ============================================
// Settings Types
// ============================================

export interface FutureLetterSettings {
    featureEnabled: boolean;
    neteaseMusicEnabled: boolean;
    neteaseMusicProxyUrl: string;
    physicalLetterEnabled: boolean;
    physicalLetterBaseFee: string;
    maxScheduledDays: string;
    requireReview: boolean;
    autoApproveSelf: boolean;
    aiWritingEnabled: boolean;
    aiTimetraceEnabled: boolean;
    emailFromAddress: string;
    emailFromName: string;
    maxImagesPerLetter: string;
    maxAudioPerLetter: string;
    maxImageSizeMb: string;
    maxAudioSizeMb: string;
    maxAudioDurationSec: string;
}

// ============================================
// Status Helpers
// ============================================

export const STATUS_LABELS: Record<LetterStatus, string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    scheduled: '已排期',
    delivering: '投递中',
    delivered: '已送达',
    failed: '投递失败',
    cancelled: '已取消',
};

export const STATUS_COLORS: Record<LetterStatus, string> = {
    draft: 'gray',
    pending_review: 'yellow',
    approved: 'green',
    rejected: 'red',
    scheduled: 'blue',
    delivering: 'purple',
    delivered: 'green',
    failed: 'red',
    cancelled: 'gray',
};

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
    classic: '经典',
    modern: '现代',
    festival: '节日',
    romantic: '浪漫',
    business: '商务',
};

// ============================================
// Physical Letter Types
// ============================================

export type ShippingStatus =
    | 'pending'
    | 'printing'
    | 'shipped'
    | 'in_transit'
    | 'delivered'
    | 'returned';

export type OrderStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'cancelled';

export interface PhysicalOptionItem {
    value: string;
    label: string;
    price?: number;
}

export interface PhysicalOptionsResponse {
    paperTypes: PhysicalOptionItem[];
    envelopeTypes: PhysicalOptionItem[];
}

export interface PhysicalOrderRequest {
    letterId: string;
    recipientName: string;
    recipientAddress: string;
    recipientPhone?: string;
    postalCode?: string;
    country?: string;
    paperType: string;
    envelopeType: string;
}

export interface PhysicalOrderResponse {
    id: number;
    letterId: string;
    recipientName?: string;
    postalCode?: string;
    country: string;
    paperType?: string;
    envelopeType?: string;
    orderStatus: OrderStatus;
    shippingStatus: ShippingStatus;
    shippingFee?: number;
    paid: boolean;
    trackingNumber?: string;
    carrier?: string;
    adminNote?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PricingResponse {
    baseFee: number;
    paperFee: number;
    envelopeFee: number;
    totalFee: number;
    currency: string;
}

export const SHIPPING_STATUS_LABELS: Record<ShippingStatus, string> = {
    pending: '待处理',
    printing: '打印中',
    shipped: '已发货',
    in_transit: '运输中',
    delivered: '已送达',
    returned: '已退回',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    cancelled: '已取消',
};

// ============================================
// Timezone Helpers
// ============================================

export const COMMON_TIMEZONES = [
    { value: 'Asia/Shanghai', label: '北京时间 (UTC+8)' },
    { value: 'Asia/Tokyo', label: '东京时间 (UTC+9)' },
    { value: 'America/New_York', label: '纽约时间 (UTC-5/-4)' },
    { value: 'America/Los_Angeles', label: '洛杉矶时间 (UTC-8/-7)' },
    { value: 'Europe/London', label: '伦敦时间 (UTC+0/+1)' },
    { value: 'Europe/Paris', label: '巴黎时间 (UTC+1/+2)' },
    { value: 'Australia/Sydney', label: '悉尼时间 (UTC+10/+11)' },
];
