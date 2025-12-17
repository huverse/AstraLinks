-- ============================================
-- AI 配置中心数据库迁移脚本
-- 版本: v2.3
-- 日期: 2024-12-17
-- ============================================

-- AI 配置表
CREATE TABLE IF NOT EXISTS workspace_ai_configs (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  
  -- 配置信息
  name VARCHAR(255) NOT NULL DEFAULT 'default',
  provider VARCHAR(50) NOT NULL DEFAULT 'openai',
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  
  -- 敏感信息 (加密存储)
  api_key TEXT,
  base_url VARCHAR(500),
  
  -- 参数
  temperature DECIMAL(3, 2) DEFAULT 0.7,
  max_tokens INT DEFAULT 4096,
  
  -- 状态
  is_active BOOLEAN DEFAULT FALSE,
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_workspace (workspace_id),
  INDEX idx_active (workspace_id, is_active),
  
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 完成
-- ============================================

SELECT 'workspace_ai_configs 表创建完成!' AS status;
