-- Model Tiers Table Migration
-- This table stores model tier rules for access control
-- Rules are persistent and survive deployments

CREATE TABLE IF NOT EXISTS model_tiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_pattern VARCHAR(255) NOT NULL COMMENT '模型匹配模式，支持通配符 * 如 gpt-* 或 claude-3-5-sonnet',
    tier ENUM('free', 'pro', 'ultra') NOT NULL DEFAULT 'free' COMMENT '所需用户等级',
    description VARCHAR(500) NULL COMMENT '规则描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_pattern (model_pattern),
    INDEX idx_tier (tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default tier rules if table is empty
INSERT IGNORE INTO model_tiers (model_pattern, tier, description) VALUES
    -- Free tier models
    ('deepseek-chat', 'free', 'DeepSeek Chat'),
    ('gemini-2.0-flash', 'free', 'Google Gemini 2.0 Flash'),
    ('gemini-2.5-flash', 'free', 'Google Gemini 2.5 Flash'),
    ('gpt-4o-mini', 'free', 'OpenAI GPT-4o Mini'),
    ('qwen-*', 'free', '通义千问系列'),
    
    -- Pro tier models
    ('claude-3-5-sonnet', 'pro', 'Anthropic Claude 3.5 Sonnet'),
    ('deepseek-reasoner', 'pro', 'DeepSeek Reasoner'),
    ('gemini-2.5-pro', 'pro', 'Google Gemini 2.5 Pro'),
    ('gpt-4o', 'pro', 'OpenAI GPT-4o'),
    
    -- Ultra tier models
    ('claude-3-5-opus', 'ultra', 'Anthropic Claude 3.5 Opus'),
    ('gemini-2.0-flash-thinking', 'ultra', 'Gemini Thinking'),
    ('o1-*', 'ultra', 'OpenAI o1系列'),
    ('o3-*', 'ultra', 'OpenAI o3系列');
