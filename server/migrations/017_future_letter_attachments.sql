-- Future Letter Attachments
-- Created: 2026-01-01
-- Description: Attachment metadata for time-capsule letters

CREATE TABLE IF NOT EXISTS future_letter_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,

    -- Storage info
    storage_key VARCHAR(500) NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL,
    sha256 CHAR(64),

    -- Attachment type and media metadata
    attachment_type ENUM('image', 'audio') NOT NULL,
    duration_ms INT UNSIGNED,           -- For audio files
    width INT UNSIGNED,                 -- For images
    height INT UNSIGNED,                -- For images
    thumbnail_key VARCHAR(500),         -- Thumbnail storage key for images

    -- Virus scan status
    scan_status ENUM('pending', 'scanning', 'clean', 'infected', 'error') DEFAULT 'pending',
    scanned_at DATETIME,
    scan_result JSON,

    -- Ordering and timestamps
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key
    FOREIGN KEY (letter_id) REFERENCES future_letters(id) ON DELETE CASCADE,

    -- Indexes
    INDEX idx_letter_id (letter_id),
    INDEX idx_scan_status (scan_status),
    INDEX idx_storage_key (storage_key(255)),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default settings for attachment limits
INSERT INTO future_letter_settings (setting_key, setting_value) VALUES
    ('max_images_per_letter', '2'),
    ('max_audio_per_letter', '1'),
    ('max_image_size_mb', '5'),
    ('max_audio_size_mb', '10'),
    ('max_audio_duration_sec', '180')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
