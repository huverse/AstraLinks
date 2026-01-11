-- Migration: knowledge base upgrade (training + mindmap + RAG)
-- Notes: MySQL 8.0+, InnoDB, utf8mb4_unicode_ci, idempotent DDL

SET NAMES utf8mb4;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- Upgrade existing knowledge_documents table
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS source_type ENUM('file','url','api') DEFAULT 'file';
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS source_url VARCHAR(1000);
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS mindmap_json JSON;
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100);
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS embedding_provider VARCHAR(36);

-- Knowledge training jobs
CREATE TABLE IF NOT EXISTS knowledge_training_jobs (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  topic VARCHAR(200) NOT NULL,
  search_keywords JSON,
  source_urls JSON,
  status ENUM('pending','searching','crawling','processing','completed','failed') NOT NULL,
  documents_found INT DEFAULT 0,
  documents_added INT DEFAULT 0,
  schedule_cron VARCHAR(100),
  is_enabled BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMP NULL,
  next_run_at TIMESTAMP NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workspace (workspace_id),
  INDEX idx_status (status),
  INDEX idx_enabled_next_run (is_enabled, next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Knowledge base training jobs';

-- Knowledge training history (auditable/reversible)
CREATE TABLE IF NOT EXISTS knowledge_training_history (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL,
  document_id VARCHAR(36) NOT NULL,
  source_url VARCHAR(1000),
  title VARCHAR(500),
  summary TEXT,
  status ENUM('added','rejected','reverted') DEFAULT 'added',
  reviewed_by INT,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job (job_id),
  INDEX idx_document (document_id),
  INDEX idx_job_status (job_id, status),
  FOREIGN KEY (job_id) REFERENCES knowledge_training_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Training history with audit trail';
