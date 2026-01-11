-- Migration: MCP dual architecture (workspace + chat)
-- Notes: MySQL 8.0+, InnoDB, utf8mb4_unicode_ci, idempotent DDL

SET NAMES utf8mb4;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- Upgrade existing mcp_registry table
ALTER TABLE mcp_registry
  ADD COLUMN IF NOT EXISTS scope ENUM('workspace','chat','both') DEFAULT 'both';
ALTER TABLE mcp_registry
  ADD COLUMN IF NOT EXISTS manifest_json JSON;
ALTER TABLE mcp_registry
  ADD COLUMN IF NOT EXISTS test_cases JSON;
ALTER TABLE mcp_registry
  ADD COLUMN IF NOT EXISTS examples JSON;
ALTER TABLE mcp_registry
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE mcp_registry
  ADD COLUMN IF NOT EXISTS rating_score DECIMAL(3,2) DEFAULT 0;
ALTER TABLE mcp_registry
  ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0;

-- MCP user installs
CREATE TABLE IF NOT EXISTS mcp_user_installs (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  mcp_id VARCHAR(100) NOT NULL,
  scope ENUM('workspace','chat','both') DEFAULT 'both',
  config_json JSON,
  is_enabled BOOLEAN DEFAULT TRUE,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  UNIQUE KEY uk_user_mcp (user_id, mcp_id),
  INDEX idx_user (user_id),
  INDEX idx_mcp (mcp_id),
  INDEX idx_user_enabled (user_id, is_enabled),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User MCP installations';

-- MCP call logs
CREATE TABLE IF NOT EXISTS mcp_call_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  mcp_id VARCHAR(100) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  scope ENUM('workspace','chat') NOT NULL,
  params_json JSON,
  result_json JSON,
  status ENUM('success','failed','timeout','permission_denied') NOT NULL,
  latency_ms INT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_mcp_created (mcp_id, created_at),
  INDEX idx_status_created (status, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MCP tool call logs';

-- MCP marketplace sources
CREATE TABLE IF NOT EXISTS mcp_marketplace_sources (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type ENUM('official','smithery','mcp_so','mcp_market','custom') NOT NULL,
  base_url VARCHAR(500) NOT NULL,
  api_key_encrypted TEXT,
  is_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_type (type),
  INDEX idx_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MCP marketplace data sources';
