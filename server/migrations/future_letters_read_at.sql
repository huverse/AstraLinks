-- Future Letters - Add recipient_read_at column for unread tracking
-- Created: 2026-01-05
-- Description: Add read tracking for received letters

-- Add recipient_read_at column if not exists
ALTER TABLE future_letters
ADD COLUMN IF NOT EXISTS recipient_read_at DATETIME DEFAULT NULL
    COMMENT 'When recipient first read the letter';

-- Add index for efficient unread queries (using normalized email)
ALTER TABLE future_letters
ADD INDEX IF NOT EXISTS idx_recipient_normalized_read (recipient_email_normalized, status, recipient_read_at);

-- Keep the hash index for backward compatibility with list queries
ALTER TABLE future_letters
ADD INDEX IF NOT EXISTS idx_recipient_read (recipient_email_hash, status, recipient_read_at);
