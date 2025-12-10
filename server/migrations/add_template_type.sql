-- Add template_type column to config_templates table
-- Run this migration on your database

ALTER TABLE config_templates 
ADD COLUMN template_type ENUM('participant', 'multimodal') NOT NULL DEFAULT 'participant' 
AFTER is_active;

-- Optional: Add index for faster filtering
CREATE INDEX idx_config_templates_type ON config_templates(template_type);
