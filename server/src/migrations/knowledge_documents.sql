-- ============================================
-- 知识库数据库迁移脚本
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  
  name VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  type VARCHAR(20) NOT NULL DEFAULT 'txt',
  content LONGTEXT,
  chunk_count INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_workspace (workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
