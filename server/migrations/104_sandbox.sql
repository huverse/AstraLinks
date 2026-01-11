-- Migration: sandbox system (Docker + gVisor sessions)
-- Notes: MySQL 8.0+, InnoDB, utf8mb4_unicode_ci, idempotent DDL

SET NAMES utf8mb4;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- Sandbox sessions
CREATE TABLE IF NOT EXISTS sandbox_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  language ENUM('python','nodejs','web') NOT NULL,
  container_id VARCHAR(100),
  status ENUM('creating','running','stopped','error') NOT NULL,
  resource_limits JSON,
  network_policy ENUM('none','internal','external') DEFAULT 'none',
  started_at TIMESTAMP NULL,
  stopped_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_user_status (user_id, status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sandboxed execution sessions';

-- Sandbox artifacts
CREATE TABLE IF NOT EXISTS sandbox_artifacts (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(50),
  file_size INT,
  checksum VARCHAR(64),
  storage_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_session_type (session_id, file_type),
  FOREIGN KEY (session_id) REFERENCES sandbox_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Artifacts from sandbox sessions';
