-- ============================================
-- Workspace 系统数据库迁移脚本
-- 版本: v2.2
-- 日期: 2024-12-13
-- ============================================

-- 注意: 此脚本仅添加新表和字段，不会修改现有数据

-- ============================================
-- 1. Workspace 主表
-- ============================================

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('WORKFLOW', 'PROJECT', 'TASK', 'SANDBOX') NOT NULL,
  owner_id VARCHAR(36) NOT NULL,
  
  -- 隔离配置 (JSON)
  isolation_config JSON NOT NULL DEFAULT '{"contextIsolated": true, "fileIsolated": true}',
  
  -- 元数据
  description TEXT,
  tags JSON DEFAULT '[]',
  icon VARCHAR(50),
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 软删除
  is_deleted BOOLEAN DEFAULT FALSE,
  
  INDEX idx_owner (owner_id),
  INDEX idx_type (type),
  INDEX idx_created (created_at),
  
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. Workspace 配置表
-- ============================================

CREATE TABLE IF NOT EXISTS workspace_configs (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL UNIQUE,
  
  -- 模型配置 (JSON)
  model_configs JSON DEFAULT '[]',
  default_model_id VARCHAR(36),
  
  -- MCP 配置
  enabled_mcps JSON DEFAULT '[]',
  mcp_overrides JSON DEFAULT '{}',
  
  -- 功能开关
  features JSON DEFAULT '{"promptOptimization": false, "autoSave": true, "versionHistory": true}',
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. Workspace 文件表
-- ============================================

CREATE TABLE IF NOT EXISTS workspace_files (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  
  name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  type ENUM('INPUT', 'OUTPUT', 'INTERMEDIATE', 'CONFIG') NOT NULL,
  mime_type VARCHAR(100),
  size BIGINT DEFAULT 0,
  storage_url VARCHAR(500),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_workspace (workspace_id),
  UNIQUE INDEX idx_workspace_path (workspace_id, path),
  
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. 工作流定义表
-- ============================================

CREATE TABLE IF NOT EXISTS workflows (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version INT DEFAULT 1,
  
  -- 图结构 (JSON)
  nodes JSON NOT NULL DEFAULT '[]',
  edges JSON NOT NULL DEFAULT '[]',
  variables JSON DEFAULT '{}',
  
  -- 标记
  is_template BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  -- 元数据
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_workspace (workspace_id),
  INDEX idx_template (is_template),
  
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. 工作流版本表
-- ============================================

CREATE TABLE IF NOT EXISTS workflow_versions (
  id VARCHAR(36) PRIMARY KEY,
  workflow_id VARCHAR(36) NOT NULL,
  version INT NOT NULL,
  
  -- 快照 (JSON)
  snapshot JSON NOT NULL,
  
  -- 变更说明
  change_log TEXT,
  is_auto_save BOOLEAN DEFAULT FALSE,
  
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_workflow (workflow_id),
  UNIQUE INDEX idx_workflow_version (workflow_id, version),
  
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. 工作流执行记录表
-- ============================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  workflow_id VARCHAR(36) NOT NULL,
  workflow_version INT NOT NULL,
  
  -- 状态
  status ENUM('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'QUEUED',
  progress TINYINT UNSIGNED DEFAULT 0,
  current_node_id VARCHAR(36),
  
  -- 输入输出 (JSON)
  input JSON,
  output JSON,
  node_states JSON DEFAULT '{}',
  
  -- 资源使用
  token_usage JSON DEFAULT '{"promptTokens": 0, "completionTokens": 0, "totalTokens": 0}',
  estimated_cost DECIMAL(10, 4),
  
  -- 时间
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_workspace (workspace_id),
  INDEX idx_workflow (workflow_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. 执行日志表
-- ============================================

CREATE TABLE IF NOT EXISTS execution_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  execution_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36),
  
  level ENUM('DEBUG', 'INFO', 'WARN', 'ERROR') DEFAULT 'INFO',
  message TEXT,
  data JSON,
  
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  
  INDEX idx_execution (execution_id),
  INDEX idx_created (created_at),
  
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. 云端同步表
-- ============================================

CREATE TABLE IF NOT EXISTS config_syncs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  workspace_id VARCHAR(36),
  
  sync_type ENUM('FULL', 'WORKSPACE', 'WORKFLOW') DEFAULT 'FULL',
  
  -- 加密数据
  encrypted_data LONGBLOB,
  checksum VARCHAR(64),
  file_size BIGINT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  
  INDEX idx_user (user_id),
  INDEX idx_workspace (workspace_id),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 9. MCP 注册表
-- ============================================

CREATE TABLE IF NOT EXISTS mcp_registry (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50),
  source ENUM('BUILTIN', 'MARKETPLACE', 'USER_UPLOADED') NOT NULL,
  
  -- 连接配置 (JSON)
  connection_config JSON NOT NULL,
  capabilities JSON DEFAULT '[]',
  permissions JSON DEFAULT '[]',
  
  -- 状态
  is_enabled BOOLEAN DEFAULT TRUE,
  health_status ENUM('HEALTHY', 'DEGRADED', 'OFFLINE') DEFAULT 'HEALTHY',
  last_health_check TIMESTAMP NULL,
  
  -- 所有者 (NULL for BUILTIN)
  owner_id VARCHAR(36),
  
  -- 元数据
  description TEXT,
  documentation_url VARCHAR(500),
  icon VARCHAR(100),
  tags JSON DEFAULT '[]',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_source (source),
  INDEX idx_owner (owner_id),
  
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 10. 用户表扩展字段
-- ============================================

-- 添加 MCP 设置字段
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS mcp_settings JSON DEFAULT '{"enableSmitheryMarket": false, "installedMCPs": [], "customMCPs": []}';

-- 添加提示词设置字段
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS prompt_settings JSON DEFAULT '{"enablePromptOptimization": false}';

-- 添加当前活动 Workspace ID
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS active_workspace_id VARCHAR(36);

-- ============================================
-- 11. 初始化内置 MCP
-- ============================================

INSERT IGNORE INTO mcp_registry (id, name, version, source, connection_config, capabilities, permissions, description, is_enabled)
VALUES (
  'mcp-trends-hub',
  'Trends Hub',
  '1.0.0',
  'BUILTIN',
  '{"type": "STDIO", "command": "npx mcp-trends-hub"}',
  '[]',
  '["NETWORK"]',
  '获取微博、抖音等平台的实时热搜数据',
  TRUE
);

-- ============================================
-- 完成
-- ============================================

SELECT 'Workspace 数据库迁移完成!' AS status;
