-- Migration: workflow system upgrade (ALTER workflows + new tables)
-- Notes: MySQL 8.0+, InnoDB, utf8mb4_unicode_ci, idempotent DDL

SET NAMES utf8mb4;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- Upgrade existing workflows table
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS workflow_type ENUM('dag','agent') DEFAULT 'dag';
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS agent_config JSON;
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS collaboration_models JSON;
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS validation_mode ENUM('strict','balanced','fast') DEFAULT 'balanced';

-- Versions
CREATE TABLE IF NOT EXISTS workflow_versions (
  id VARCHAR(36) PRIMARY KEY,
  workflow_id VARCHAR(36) NOT NULL,
  version INT NOT NULL,
  graph_json JSON NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  is_draft BOOLEAN DEFAULT TRUE,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP NULL,
  UNIQUE KEY uk_workflow_version (workflow_id, version),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Runs
CREATE TABLE IF NOT EXISTS workflow_runs (
  id VARCHAR(36) PRIMARY KEY,
  workflow_id VARCHAR(36) NOT NULL,
  version_id VARCHAR(36) NOT NULL,
  user_id INT NOT NULL,
  status ENUM('pending','planning','running','verifying','fixing','paused','completed','failed','cancelled') NOT NULL,
  input_json JSON,
  output_json JSON,
  context_json JSON,
  current_node_id VARCHAR(36),
  total_tokens INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workflow (workflow_id),
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_workflow_status_created (workflow_id, status, created_at),
  INDEX idx_user_status_created (user_id, status, created_at),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES workflow_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Node runs
CREATE TABLE IF NOT EXISTS workflow_node_runs (
  id VARCHAR(36) PRIMARY KEY,
  run_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  status ENUM('pending','running','completed','failed','skipped') NOT NULL,
  input_json JSON,
  output_json JSON,
  tokens_used INT DEFAULT 0,
  latency_ms INT,
  retry_count INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  INDEX idx_run (run_id),
  INDEX idx_node (run_id, node_id),
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Schedules
CREATE TABLE IF NOT EXISTS workflow_schedules (
  id VARCHAR(36) PRIMARY KEY,
  workflow_id VARCHAR(36) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
  input_json JSON,
  is_enabled BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMP NULL,
  next_run_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workflow (workflow_id),
  INDEX idx_next_run (next_run_at),
  INDEX idx_enabled_next_run (is_enabled, next_run_at),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
