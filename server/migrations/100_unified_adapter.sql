-- Migration: unified adapter (ai_providers, ai_credentials, ai_usage_logs, encryption_keys)
-- Notes:
-- - MySQL 8.0+, InnoDB, utf8mb4_unicode_ci
-- - Id types align with project plan (VARCHAR(36)) for consistency across FKs
-- - DDL is idempotent via IF NOT EXISTS
-- - encryption_keys table created here for FK dependencies

SET NAMES utf8mb4;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- CREATE: encryption_keys (needed for FK references)
CREATE TABLE IF NOT EXISTS encryption_keys (
  id VARCHAR(36) PRIMARY KEY,
  key_type ENUM('master','dek') NOT NULL,
  encrypted_key BLOB NOT NULL,
  key_version INT DEFAULT 1,
  status ENUM('active','rotating','retired') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  rotated_at TIMESTAMP NULL,
  INDEX idx_type_status (key_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Encryption key management';

-- CREATE: ai_providers
CREATE TABLE IF NOT EXISTS ai_providers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type ENUM('openai_compatible', 'gemini', 'claude', 'custom') NOT NULL,
  base_url VARCHAR(500),
  default_headers JSON,
  capabilities JSON,
  default_models JSON,
  is_builtin BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (type),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System-level AI provider configs';

-- CREATE: ai_credentials
CREATE TABLE IF NOT EXISTS ai_credentials (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  provider_id VARCHAR(36) NOT NULL,
  name VARCHAR(100),
  encrypted_api_key TEXT NOT NULL,
  encrypted_headers TEXT,
  custom_base_url VARCHAR(500),
  endpoint_id VARCHAR(100),
  key_fingerprint VARCHAR(64) NOT NULL,
  encryption_key_id VARCHAR(36) NOT NULL,
  encryption_nonce BINARY(12) NOT NULL,
  encryption_tag BINARY(16),
  status ENUM('active', 'invalid', 'expired', 'revoked') DEFAULT 'active',
  last_used_at TIMESTAMP NULL,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_provider_name (user_id, provider_id, name),
  UNIQUE KEY uk_fingerprint (key_fingerprint),
  INDEX idx_user (user_id),
  INDEX idx_provider (provider_id),
  INDEX idx_encryption_key (encryption_key_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE,
  FOREIGN KEY (encryption_key_id) REFERENCES encryption_keys(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Per-user encrypted AI credentials';

-- CREATE: ai_usage_logs
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  credential_id VARCHAR(36),
  provider_id VARCHAR(36) NOT NULL,
  model VARCHAR(100) NOT NULL,
  request_type ENUM('chat', 'embedding', 'image', 'audio', 'video', 'tool') NOT NULL,
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  latency_ms INT,
  status ENUM('success', 'failed', 'timeout', 'rate_limited') NOT NULL,
  error_code VARCHAR(50),
  error_message TEXT,
  request_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_provider_created (provider_id, created_at),
  INDEX idx_status_created (status, created_at),
  INDEX idx_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE,
  FOREIGN KEY (credential_id) REFERENCES ai_credentials(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI usage logs';
