-- Migration: key pool system (encrypted + risk control)
-- Notes: MySQL 8.0+, InnoDB, utf8mb4_unicode_ci, idempotent DDL

SET NAMES utf8mb4;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- Key pool entries
CREATE TABLE IF NOT EXISTS key_pool_entries (
  id VARCHAR(36) PRIMARY KEY,
  contributor_id INT NOT NULL,
  provider_id VARCHAR(36) NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  encrypted_base_url TEXT,
  encrypted_headers TEXT,
  key_fingerprint VARCHAR(64) NOT NULL,
  encryption_key_id VARCHAR(36) NOT NULL,
  encryption_nonce BINARY(12) NOT NULL,
  masked_key VARCHAR(50) NOT NULL,
  status ENUM('active','exhausted','invalid','banned','withdrawn') DEFAULT 'active',
  models_supported JSON,
  daily_quota INT DEFAULT 10000,
  total_contributed BIGINT DEFAULT 0,
  total_calls BIGINT DEFAULT 0,
  success_rate DECIMAL(5,4) DEFAULT 1.0000,
  avg_latency_ms INT DEFAULT 0,
  risk_score INT DEFAULT 0,
  last_used_at TIMESTAMP NULL,
  last_check_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fingerprint (key_fingerprint),
  INDEX idx_contributor (contributor_id),
  INDEX idx_provider (provider_id),
  INDEX idx_status (status),
  INDEX idx_provider_status (provider_id, status),
  INDEX idx_risk_score (risk_score),
  INDEX idx_encryption_key (encryption_key_id),
  FOREIGN KEY (contributor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE,
  FOREIGN KEY (encryption_key_id) REFERENCES encryption_keys(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Shared API key pool';

-- Key pool usage logs
CREATE TABLE IF NOT EXISTS key_pool_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  key_id VARCHAR(36) NOT NULL,
  user_id INT NOT NULL,
  tokens_used INT NOT NULL,
  status ENUM('success','failed') NOT NULL,
  error_code VARCHAR(50),
  latency_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_key_created (key_id, created_at),
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_status_created (status, created_at),
  FOREIGN KEY (key_id) REFERENCES key_pool_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Key pool usage tracking';

-- Key pool risk events
CREATE TABLE IF NOT EXISTS key_pool_risk_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  key_id VARCHAR(36) NOT NULL,
  rule_name VARCHAR(100) NOT NULL,
  severity ENUM('low','medium','high','critical') NOT NULL,
  details JSON,
  action_taken ENUM('none','warned','throttled','suspended','banned') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_key_created (key_id, created_at),
  INDEX idx_severity (severity),
  INDEX idx_severity_created (severity, created_at),
  FOREIGN KEY (key_id) REFERENCES key_pool_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Risk control events';

-- Key pool leaderboard
CREATE TABLE IF NOT EXISTS key_pool_leaderboard (
  user_id INT PRIMARY KEY,
  total_keys INT DEFAULT 0,
  active_keys INT DEFAULT 0,
  total_tokens_contributed BIGINT DEFAULT 0,
  total_calls_served BIGINT DEFAULT 0,
  avg_success_rate DECIMAL(5,4) DEFAULT 0,
  rank_score BIGINT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rank (rank_score DESC),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Contributor leaderboard';
