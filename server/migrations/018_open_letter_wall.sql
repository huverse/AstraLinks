-- Open Letter Wall Feature Migration
-- Created: 2026-01-02
-- Description: Add public letter fields to future_letters table

-- Add public letter columns
ALTER TABLE future_letters
    ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether the letter is visible on the public wall',
    ADD COLUMN public_anonymous BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether to hide sender name on public wall',
    ADD COLUMN public_alias VARCHAR(100) DEFAULT NULL COMMENT 'Display name override for public wall';

-- Add index for efficient public letter queries
ALTER TABLE future_letters
    ADD INDEX idx_public_delivered (is_public, status, delivered_at, deleted_at);

-- Add setting for open letter wall feature
INSERT INTO future_letter_settings (setting_key, setting_value, description) VALUES
    ('open_letter_wall_enabled', 'true', '公开信墙功能开关'),
    ('open_letter_require_review', 'true', '公开信是否需要审核')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
