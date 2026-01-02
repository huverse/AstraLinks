/**
 * Future Letters (时光信) - Type Definitions
 */

// ============================================
// Database Types
// ============================================

export type RecipientType = 'self' | 'other';
export type EncryptionScheme = 'none' | 'client_scrypt' | 'server_kms';
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

export type ShippingStatus =
    | 'pending'
    | 'printing'
    | 'shipped'
    | 'in_transit'
    | 'delivered'
    | 'returned';

export type AttachmentType = 'image' | 'audio';
export type ScanStatus = 'pending' | 'scanning' | 'clean' | 'infected' | 'error';
export type QueueAction = 'send_email' | 'ai_process' | 'timetrace' | 'scan_attachment' | 'generate_pdf';
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type DeliveryResult = 'success' | 'bounce' | 'complaint' | 'failed' | 'deferred';
export type SuppressionReason = 'bounce' | 'complaint' | 'unsubscribe' | 'manual';
export type TemplateCategory = 'classic' | 'modern' | 'festival' | 'romantic' | 'business';
export type ActorType = 'user' | 'admin' | 'system';

// ============================================
// Entity Interfaces
// ============================================

export interface FutureLetter {
    id: string;  // UUID
    senderUserId: number;

    // 收件人
    recipientType: RecipientType;
    recipientUserId?: number;
    recipientEmail?: string;
    recipientEmailNormalized?: string;
    recipientEmailHash?: string;
    recipientName?: string;

    // 内容
    title: string;
    content: string;
    contentHtmlSanitized?: string;
    contentSha256?: string;
    templateId?: number;

    // 加密
    isEncrypted: boolean;
    encryptionScheme: EncryptionScheme;
    encryptedPayload?: Buffer;
    kdfParams?: KdfParams;
    encryptionHint?: string;

    // 解锁门户
    unlockTokenHash?: string;
    unlockExpiresAt?: Date;
    unlockUsedAt?: Date;

    // 附件 (legacy)
    attachments?: LegacyAttachment[];

    // 音乐
    musicUrl?: string;
    musicId?: string;
    musicName?: string;
    musicArtist?: string;
    musicCoverUrl?: string;

    // 时间
    scheduledLocal: Date;
    scheduledTz: string;
    scheduledAtUtc: Date;
    deliveredAt?: Date;

    // 类型和状态
    letterType: LetterType;
    status: LetterStatus;

    // 审核
    submittedAt?: Date;
    reviewedAt?: Date;
    reviewerUserId?: number;
    reviewNote?: string;
    rejectedReason?: string;

    // 投递
    deliveryAttempts: number;
    lastDeliveryError?: string;
    providerMessageId?: string;

    // AI
    aiOptIn: boolean;
    aiSuggestions?: AiSuggestion[];
    timetraceData?: TimetraceData;

    // 验证
    turnstileVerified: boolean;

    // 公开信选项
    isPublic: boolean;
    publicAnonymous: boolean;
    publicAlias?: string;

    // 元数据
    version: number;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface FutureLetterPhysical {
    id: number;
    letterId: string;

    recipientAddressEncrypted: string;
    recipientPhoneEncrypted?: string;
    postalCode?: string;
    country: string;

    shippingStatus: ShippingStatus;
    trackingNumber?: string;
    carrier?: string;
    shippedAt?: Date;
    deliveredAt?: Date;

    shippingFee?: number;
    paid: boolean;
    paidAt?: Date;
    paymentId?: string;

    createdAt: Date;
    updatedAt: Date;
}

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

    createdAt: Date;
    updatedAt: Date;
}

export interface FutureLetterAttachment {
    id: number;
    letterId: string;

    storageKey: string;
    originalName?: string;
    mimeType: string;
    sizeBytes: number;
    sha256?: string;

    attachmentType: AttachmentType;
    durationMs?: number;
    width?: number;
    height?: number;
    thumbnailKey?: string;

    scanStatus: ScanStatus;
    scannedAt?: Date;
    scanResult?: object;

    sortOrder: number;
    createdAt: Date;
}

export interface FutureLetterQueue {
    id: number;
    letterId: string;
    jobId?: string;

    action: QueueAction;
    status: QueueStatus;
    priority: number;
    attempts: number;
    maxAttempts: number;
    errorMessage?: string;
    errorStack?: string;

    scheduledFor?: Date;
    startedAt?: Date;
    completedAt?: Date;

    result?: object;
    createdAt: Date;
}

export interface FutureLetterEvent {
    id: number;
    letterId: string;

    actorUserId?: number;
    actorType: ActorType;

    eventType: string;
    fromStatus?: string;
    toStatus?: string;

    metadata?: object;
    ipAddress?: string;
    userAgent?: string;

    createdAt: Date;
}

export interface FutureLetterDeliveryAttempt {
    id: number;
    letterId: string;
    queueJobId?: number;

    provider: string;
    providerMessageId?: string;

    result: DeliveryResult;
    errorCode?: string;
    errorMessage?: string;

    recipientDomain?: string;
    attemptedAt: Date;
}

export interface FutureLetterSuppression {
    id: number;
    emailHash: string;

    reason: SuppressionReason;
    sourceLetterId?: string;

    bounceType?: string;
    complaintType?: string;

    createdAt: Date;
    expiresAt?: Date;
}

// ============================================
// Nested Types
// ============================================

export interface KdfParams {
    salt: string;  // base64
    N: number;
    r: number;
    p: number;
}

export interface LegacyAttachment {
    type: 'image' | 'audio';
    url: string;
    name: string;
}

export interface AiSuggestion {
    type: 'writing' | 'time' | 'emotion';
    content: string;
    timestamp: string;
    applied: boolean;
}

export interface TimetraceData {
    generatedAt: string;
    events: TimetraceEvent[];
    summary?: string;
}

export interface TimetraceEvent {
    date: string;
    type: string;
    description: string;
}

// ============================================
// API Request/Response Types
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

    scheduledLocal: string;  // ISO datetime
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

    version: number;  // 乐观锁
}

export interface SubmitLetterRequest {
    turnstileToken: string;
}

export interface UnlockLetterRequest {
    password?: string;  // 客户端加密时
    token?: string;  // 门户链接token
}

export interface LetterListQuery {
    status?: LetterStatus;
    type?: 'sent' | 'received' | 'drafts';
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
    createdAt: string;
}

export interface FutureLetterDetail extends FutureLetter {
    attachmentsList: FutureLetterAttachment[];
    template?: FutureLetterTemplate;
    physicalInfo?: FutureLetterPhysical;
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
    changes: TextChange[];
}

export interface TextChange {
    type: 'insert' | 'delete' | 'replace';
    position: number;
    oldText?: string;
    newText?: string;
}

export interface SuggestTimeRequest {
    content: string;
    recipientType: RecipientType;
    recipientInfo?: string;
}

export interface SuggestTimeResponse {
    suggestions: TimeSuggestion[];
}

export interface TimeSuggestion {
    datetime: string;  // ISO
    reason: string;
    significance: string;
}

export interface TimetraceRequest {
    letterId: string;
    depth?: 'brief' | 'detailed';
}

export interface TimetraceResponse {
    data: TimetraceData;
}

export interface SpeechToTextRequest {
    audioUrl: string;
    language?: string;
}

export interface SpeechToTextResponse {
    text: string;
    confidence: number;
    segments?: SpeechSegment[];
}

export interface SpeechSegment {
    start: number;
    end: number;
    text: string;
}

// ============================================
// Music Types
// ============================================

export interface ParseMusicRequest {
    url: string;
}

export interface ParseMusicResponse {
    id: string;
    name: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    duration?: number;
    playUrl?: string;  // May require auth
}

export interface SearchMusicRequest {
    query: string;
    limit?: number;
}

export interface SearchMusicResponse {
    results: ParseMusicResponse[];
}

// ============================================
// Admin Types
// ============================================

export interface AdminLetterQuery extends LetterListQuery {
    userId?: number;
    dateFrom?: string;
    dateTo?: string;
    reviewStatus?: 'pending' | 'approved' | 'rejected';
}

export interface ReviewLetterRequest {
    action: 'approve' | 'reject';
    note?: string;
    reason?: string;
}

export interface AdminSettingsUpdate {
    settings: Record<string, string>;
}

export interface AdminStats {
    totalLetters: number;
    pendingReview: number;
    scheduledToday: number;
    deliveredThisMonth: number;
    failedThisMonth: number;
    topTemplates: { templateId: number; name: string; count: number }[];
}

// ============================================
// Upload Types
// ============================================

export interface UploadPresignedUrlRequest {
    letterId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    attachmentType: AttachmentType;
}

export interface UploadPresignedUrlResponse {
    uploadUrl: string;
    storageKey: string;
    expiresAt: string;
}

export interface ConfirmUploadRequest {
    letterId: string;
    storageKey: string;
    sha256?: string;
}

// ============================================
// Error Types
// ============================================

export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
        requestId?: string;
    };
}

export const ErrorCodes = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    FORBIDDEN: 'FORBIDDEN',
    CONFLICT: 'CONFLICT',
    RATE_LIMITED: 'RATE_LIMITED',
    TURNSTILE_FAILED: 'TURNSTILE_FAILED',
    SUPPRESSED_EMAIL: 'SUPPRESSED_EMAIL',
    ATTACHMENT_INFECTED: 'ATTACHMENT_INFECTED',
    ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
    DELIVERY_FAILED: 'DELIVERY_FAILED',
} as const;
