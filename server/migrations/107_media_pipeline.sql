-- Migration: media pipeline (multimedia creation)
-- Notes: MySQL 8.0+, InnoDB, utf8mb4_unicode_ci, idempotent DDL
-- Note: encryption_keys table is created in 100_unified_adapter.sql

SET NAMES utf8mb4;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- Media assets
CREATE TABLE IF NOT EXISTS media_assets (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('image','video','audio') NOT NULL,
  storage_url VARCHAR(1000) NOT NULL,
  thumbnail_url VARCHAR(1000),
  metadata JSON,
  file_size BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_type (type),
  INDEX idx_user_type (user_id, type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Media asset storage';

-- Media jobs
CREATE TABLE IF NOT EXISTS media_jobs (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  workflow_run_id VARCHAR(36),
  pipeline_type ENUM('image_gen','image_edit','video_gen','audio_gen','tts','composite') NOT NULL,
  status ENUM('pending','processing','streaming','completed','failed','cancelled') NOT NULL,
  input_asset_id VARCHAR(36),
  input_prompt TEXT,
  output_asset_id VARCHAR(36),
  progress INT DEFAULT 0,
  provider_id VARCHAR(36),
  model VARCHAR(100),
  error_message TEXT,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_workflow (workflow_run_id),
  INDEX idx_user_status (user_id, status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (input_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (output_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Media generation jobs';

-- Media pipeline steps (for continuous creation)
CREATE TABLE IF NOT EXISTS media_pipeline_steps (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL,
  step_order INT NOT NULL,
  step_type ENUM('generate','edit','transform','merge') NOT NULL,
  input_asset_id VARCHAR(36),
  output_asset_id VARCHAR(36),
  params_json JSON,
  status ENUM('pending','processing','completed','failed') NOT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  INDEX idx_job (job_id),
  INDEX idx_job_order (job_id, step_order),
  FOREIGN KEY (job_id) REFERENCES media_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (input_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (output_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pipeline step tracking';

-- Unified artifacts reference system
CREATE TABLE IF NOT EXISTS artifacts (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('file','image','video','audio','code','preview_snapshot','annotation') NOT NULL,
  name VARCHAR(255) NOT NULL,
  storage_url VARCHAR(1000) NOT NULL,
  mime_type VARCHAR(100),
  file_size BIGINT,
  metadata JSON,
  context_type ENUM('workflow','conversation','knowledge','mcp') NOT NULL,
  context_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_context (context_type, context_id),
  INDEX idx_user_type (user_id, type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Unified artifact references';
