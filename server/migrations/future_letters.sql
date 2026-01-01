-- Future Letters (时光信) Module Migration
-- Created: 2026-01-01
-- Description: Tables for time-capsule letter functionality

-- ============================================
-- Table 1: future_letters (主表)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letters (
    id CHAR(36) PRIMARY KEY,  -- UUID
    sender_user_id INT NOT NULL,

    -- 收件人信息
    recipient_type ENUM('self', 'other') NOT NULL DEFAULT 'self',
    recipient_user_id INT,  -- 站内用户收件
    recipient_email VARCHAR(255),  -- 站外邮箱
    recipient_email_normalized VARCHAR(255),  -- 标准化邮箱(小写)
    recipient_email_hash CHAR(64),  -- SHA256 for indexing
    recipient_name VARCHAR(100),

    -- 内容
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,  -- Markdown原文
    content_html_sanitized TEXT,  -- 净化后的HTML
    content_sha256 CHAR(64),  -- 完整性校验
    template_id INT,  -- 信纸模板

    -- 加密
    is_encrypted BOOLEAN DEFAULT FALSE,
    encryption_scheme ENUM('none', 'client_scrypt', 'server_kms') DEFAULT 'none',
    encrypted_payload BLOB,
    kdf_params JSON,  -- {salt, N, r, p} for scrypt
    encryption_hint VARCHAR(255),  -- 解密提示

    -- 解锁门户
    unlock_token_hash CHAR(64),
    unlock_expires_at DATETIME,
    unlock_used_at DATETIME,

    -- 附件 (deprecated, use future_letter_attachments)
    attachments JSON,  -- Legacy: [{type, url, name}]

    -- 网易云音乐
    music_url VARCHAR(500),
    music_id VARCHAR(50),
    music_name VARCHAR(200),
    music_artist VARCHAR(200),
    music_cover_url VARCHAR(500),

    -- 时间设置
    scheduled_local DATETIME NOT NULL,  -- 用户选择的本地时间
    scheduled_tz VARCHAR(50) DEFAULT 'Asia/Shanghai',  -- IANA时区
    scheduled_at_utc DATETIME NOT NULL,  -- UTC时间(计算得出)
    delivered_at DATETIME,  -- 实际送达时间

    -- 信件类型
    letter_type ENUM('electronic', 'physical') DEFAULT 'electronic',

    -- 状态流转
    status ENUM(
        'draft',           -- 草稿
        'pending_review',  -- 待审核
        'approved',        -- 审核通过
        'rejected',        -- 审核拒绝
        'scheduled',       -- 已排期
        'delivering',      -- 投递中
        'delivered',       -- 已送达
        'failed',          -- 投递失败
        'cancelled'        -- 已取消
    ) DEFAULT 'draft',

    -- 审核信息
    submitted_at DATETIME,
    reviewed_at DATETIME,
    reviewer_user_id INT,
    review_note VARCHAR(500),
    rejected_reason VARCHAR(500),

    -- 投递追踪
    delivery_attempts INT DEFAULT 0,
    last_delivery_error TEXT,
    provider_message_id VARCHAR(200),  -- Resend message ID

    -- AI功能
    ai_opt_in BOOLEAN DEFAULT TRUE,
    ai_suggestions JSON,  -- AI建议记录
    timetrace_data JSON,  -- 时光追溯数据

    -- 人机验证
    turnstile_verified BOOLEAN DEFAULT FALSE,

    -- 并发控制
    version INT DEFAULT 1,

    -- 软删除
    deleted_at DATETIME,

    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 外键
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES future_letter_templates(id) ON DELETE SET NULL,

    -- 索引
    INDEX idx_sender (sender_user_id),
    INDEX idx_recipient_user (recipient_user_id),
    INDEX idx_recipient_email_hash (recipient_email_hash),
    INDEX idx_status (status),
    INDEX idx_scheduled_utc (scheduled_at_utc),
    INDEX idx_submitted (submitted_at),
    INDEX idx_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table 2: future_letter_physical (实体信扩展)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letter_physical (
    id INT AUTO_INCREMENT PRIMARY KEY,
    letter_id CHAR(36) NOT NULL UNIQUE,

    -- 收件地址 (加密存储)
    recipient_address_encrypted TEXT NOT NULL,
    recipient_phone_encrypted VARCHAR(255),
    postal_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'CN',

    -- 邮寄状态
    shipping_status ENUM(
        'pending',    -- 待处理
        'printing',   -- 打印中
        'shipped',    -- 已发货
        'in_transit', -- 运输中
        'delivered',  -- 已送达
        'returned'    -- 已退回
    ) DEFAULT 'pending',
    tracking_number VARCHAR(100),
    carrier VARCHAR(50),  -- 快递公司
    shipped_at DATETIME,
    delivered_at DATETIME,

    -- 费用
    shipping_fee DECIMAL(10,2),
    paid BOOLEAN DEFAULT FALSE,
    paid_at DATETIME,
    payment_id VARCHAR(100),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (letter_id) REFERENCES future_letters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table 3: future_letter_templates (信纸模板)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letter_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    preview_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    css_class VARCHAR(100),
    css_styles TEXT,  -- Custom CSS
    background_url VARCHAR(500),

    category ENUM('classic', 'modern', 'festival', 'romantic', 'business') DEFAULT 'classic',
    is_premium BOOLEAN DEFAULT FALSE,
    price DECIMAL(10,2) DEFAULT 0,

    sort_order INT DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_category (category),
    INDEX idx_enabled_sort (enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table 4: future_letter_settings (系统设置)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letter_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT,
    description VARCHAR(500),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 预置设置
INSERT INTO future_letter_settings (setting_key, setting_value, description) VALUES
('feature_enabled', 'true', '时光信功能总开关'),
('netease_music_enabled', 'true', '网易云音乐功能开关'),
('netease_music_proxy_url', '', '网易云音乐API代理URL'),
('physical_letter_enabled', 'false', '实体信功能开关'),
('physical_letter_base_fee', '15.00', '实体信基础费用(元)'),
('max_scheduled_days', '3650', '最长预约天数(10年)'),
('require_review', 'true', '信件是否需要审核'),
('auto_approve_self', 'true', '写给自己的信自动通过审核'),
('ai_writing_enabled', 'true', 'AI写作助手功能开关'),
('ai_timetrace_enabled', 'true', 'AI时光追溯功能开关'),
('email_from_address', 'timehome@astralinks.xyz', '发件邮箱地址'),
('email_from_name', 'AstraLinks 时光信', '发件人名称'),
('max_images_per_letter', '2', '每封信最大图片数'),
('max_audio_per_letter', '1', '每封信最大音频数'),
('max_image_size_mb', '5', '图片最大尺寸(MB)'),
('max_audio_size_mb', '10', '音频最大尺寸(MB)'),
('max_audio_duration_sec', '180', '音频最大时长(秒)');

-- ============================================
-- Table 5: future_letter_attachments (附件表)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letter_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,

    -- 存储信息
    storage_key VARCHAR(500) NOT NULL,  -- 对象存储key
    original_name VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT NOT NULL,
    sha256 CHAR(64),

    -- 类型特定信息
    attachment_type ENUM('image', 'audio') NOT NULL,
    duration_ms INT,  -- 音频时长
    width INT,  -- 图片宽度
    height INT,  -- 图片高度
    thumbnail_key VARCHAR(500),  -- 缩略图存储key

    -- 安全扫描
    scan_status ENUM('pending', 'scanning', 'clean', 'infected', 'error') DEFAULT 'pending',
    scanned_at DATETIME,
    scan_result JSON,

    -- 排序
    sort_order INT DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (letter_id) REFERENCES future_letters(id) ON DELETE CASCADE,
    INDEX idx_letter (letter_id),
    INDEX idx_scan_status (scan_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table 6: future_letter_queue (任务队列日志)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letter_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,
    job_id VARCHAR(100),  -- BullMQ job ID

    action ENUM(
        'send_email',    -- 发送邮件
        'ai_process',    -- AI处理
        'timetrace',     -- 时光追溯
        'scan_attachment', -- 扫描附件
        'generate_pdf'   -- 生成PDF(实体信)
    ) NOT NULL,

    status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    priority INT DEFAULT 0,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    error_message TEXT,
    error_stack TEXT,

    -- 调度信息
    scheduled_for DATETIME,
    started_at DATETIME,
    completed_at DATETIME,

    -- 结果
    result JSON,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (letter_id) REFERENCES future_letters(id) ON DELETE CASCADE,
    INDEX idx_job (job_id),
    INDEX idx_scheduled (scheduled_for, status),
    INDEX idx_status_action (status, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table 7: future_letter_events (审计日志)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letter_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,

    -- 操作者
    actor_user_id INT,
    actor_type ENUM('user', 'admin', 'system') DEFAULT 'user',

    -- 事件类型
    event_type VARCHAR(50) NOT NULL,  -- created, updated, submitted, approved, rejected, delivered, etc.

    -- 状态变化
    from_status VARCHAR(30),
    to_status VARCHAR(30),

    -- 详情
    metadata JSON,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (letter_id) REFERENCES future_letters(id) ON DELETE CASCADE,
    INDEX idx_letter (letter_id),
    INDEX idx_type (event_type),
    INDEX idx_actor (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table 8: future_letter_delivery_attempts (投递尝试记录)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letter_delivery_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,
    queue_job_id INT,  -- 关联queue表

    -- 投递信息
    provider VARCHAR(50) DEFAULT 'resend',  -- 邮件服务商
    provider_message_id VARCHAR(200),

    -- 结果
    result ENUM('success', 'bounce', 'complaint', 'failed', 'deferred') NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT,

    -- 接收方信息(脱敏)
    recipient_domain VARCHAR(100),  -- 仅存域名

    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (letter_id) REFERENCES future_letters(id) ON DELETE CASCADE,
    FOREIGN KEY (queue_job_id) REFERENCES future_letter_queue(id) ON DELETE SET NULL,
    INDEX idx_letter (letter_id),
    INDEX idx_result (result),
    INDEX idx_provider_msg (provider_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table 9: future_letter_suppression (邮件抑制列表)
-- ============================================
CREATE TABLE IF NOT EXISTS future_letter_suppression (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email_hash CHAR(64) NOT NULL UNIQUE,  -- SHA256 of normalized email

    reason ENUM('bounce', 'complaint', 'unsubscribe', 'manual') NOT NULL,
    source_letter_id CHAR(36),  -- 触发抑制的信件

    -- 详情
    bounce_type VARCHAR(50),  -- hard, soft
    complaint_type VARCHAR(50),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,  -- soft bounce可过期

    INDEX idx_email (email_hash),
    INDEX idx_reason (reason)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 插入默认模板
-- ============================================
INSERT INTO future_letter_templates (name, description, category, css_class, sort_order) VALUES
('经典信纸', '简约大方的经典白色信纸', 'classic', 'template-classic', 1),
('牛皮纸', '复古怀旧的牛皮纸效果', 'classic', 'template-kraft', 2),
('星空', '深邃神秘的星空背景', 'modern', 'template-starry', 3),
('樱花', '浪漫粉嫩的樱花主题', 'romantic', 'template-sakura', 4),
('新年', '喜庆红色的新年主题', 'festival', 'template-newyear', 5),
('商务', '专业简洁的商务风格', 'business', 'template-business', 6);
