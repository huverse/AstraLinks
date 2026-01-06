-- Future Letters - Add recipient_deleted_at column for recipient soft delete
-- Created: 2026-01-06
-- Description: Allow recipients to delete received letters from their view

-- Add recipient_deleted_at column if not exists
ALTER TABLE future_letters
ADD COLUMN IF NOT EXISTS recipient_deleted_at DATETIME DEFAULT NULL
    COMMENT 'When recipient deleted the letter (soft delete, sender view unaffected)';

-- Add index for efficient filtering
ALTER TABLE future_letters
ADD INDEX IF NOT EXISTS idx_recipient_deleted (recipient_deleted_at);
