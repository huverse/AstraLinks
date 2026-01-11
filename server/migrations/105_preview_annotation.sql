-- Migration: preview annotation system (web preview + selection)
-- Notes: MySQL 8.0+, InnoDB, utf8mb4_unicode_ci, idempotent DDL

SET NAMES utf8mb4;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- Preview sessions
CREATE TABLE IF NOT EXISTS preview_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  workflow_run_id VARCHAR(36),
  sandbox_session_id VARCHAR(36),
  preview_url VARCHAR(1000) NOT NULL,
  snapshot_url VARCHAR(1000),
  status ENUM('active','closed') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  INDEX idx_user (user_id),
  INDEX idx_workflow (workflow_run_id),
  INDEX idx_user_status (user_id, status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (sandbox_session_id) REFERENCES sandbox_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Web preview sessions';

-- Preview annotations
CREATE TABLE IF NOT EXISTS preview_annotations (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  annotation_type ENUM('rectangle','freehand','point') NOT NULL,
  bbox_json JSON,
  path_data TEXT,
  dom_selector VARCHAR(500),
  dom_xpath VARCHAR(1000),
  source_file VARCHAR(500),
  source_lines JSON,
  screenshot_url VARCHAR(500),
  quote_text TEXT,
  referenced_in VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_session_type (session_id, annotation_type),
  FOREIGN KEY (session_id) REFERENCES preview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Annotations on preview snapshots';
