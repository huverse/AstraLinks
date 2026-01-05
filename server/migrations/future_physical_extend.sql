-- Future Physical Letter Extension
-- Created: 2026-01-06
-- Description: Extend future_letter_physical for order metadata and add options settings

-- 扩展实体信表字段
ALTER TABLE future_letter_physical
    ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(100) AFTER letter_id,
    ADD COLUMN IF NOT EXISTS paper_type VARCHAR(50) DEFAULT 'standard' AFTER country,
    ADD COLUMN IF NOT EXISTS envelope_type VARCHAR(50) DEFAULT 'standard' AFTER paper_type,
    ADD COLUMN IF NOT EXISTS order_status ENUM('pending', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'pending' AFTER shipping_status,
    ADD COLUMN IF NOT EXISTS admin_note TEXT AFTER order_status;

-- 纸张选项设置
INSERT INTO future_letter_settings (setting_key, setting_value, description) VALUES
    ('paper_types', '[{"value":"standard","label":"标准纸张","price":0},{"value":"premium","label":"精品纸张","price":5},{"value":"vintage","label":"复古纸张","price":8}]', '实体信纸张选项(JSON)')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- 信封选项设置
INSERT INTO future_letter_settings (setting_key, setting_value, description) VALUES
    ('envelope_types', '[{"value":"standard","label":"标准信封","price":0},{"value":"classic","label":"经典信封","price":3},{"value":"wax_seal","label":"火漆封印","price":10}]', '实体信信封选项(JSON)')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
