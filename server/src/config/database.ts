import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// New database connection pool
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'galaxyous_new',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Old WordPress database connection (for sync)
export const oldDbPool = mysql.createPool({
  host: process.env.OLD_DB_HOST || '60.205.182.113',
  port: parseInt(process.env.OLD_DB_PORT || '3306'),
  user: process.env.OLD_DB_USER || 'galaxyous_com',
  password: process.env.OLD_DB_PASSWORD || '',
  database: process.env.OLD_DB_NAME || 'galaxyous_com',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

// Initialize database schema
export async function initDatabase(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    // Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(60) NOT NULL UNIQUE,
        email VARCHAR(100) UNIQUE,
        password_hash VARCHAR(255),
        qq_openid VARCHAR(100),
        invitation_code_used VARCHAR(8),
        wp_user_id BIGINT,
        device_fingerprint VARCHAR(64),
        is_admin BOOLEAN DEFAULT FALSE,
        needs_password_reset BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        INDEX idx_username (username),
        INDEX idx_wp_user_id (wp_user_id),
        INDEX idx_qq_openid (qq_openid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Invitation codes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invitation_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(8) NOT NULL UNIQUE,
        is_used BOOLEAN DEFAULT FALSE,
        used_by_user_id INT,
        used_device_fingerprint VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP NULL,
        INDEX idx_code (code),
        FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Sync logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        users_synced INT DEFAULT 0,
        status ENUM('success', 'failed') NOT NULL,
        error_message TEXT,
        INDEX idx_sync_time (sync_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Reports table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reporter_user_id INT NOT NULL,
        reported_user_id INT NOT NULL,
        report_type ENUM('spam', 'abuse', 'inappropriate', 'harassment', 'other') NOT NULL,
        content TEXT NOT NULL,
        evidence_urls JSON,
        status ENUM('pending', 'reviewing', 'resolved', 'dismissed') DEFAULT 'pending',
        admin_notes TEXT,
        resolved_by_admin_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL,
        INDEX idx_reporter (reporter_user_id),
        INDEX idx_reported (reported_user_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Bans table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS bans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        reason TEXT NOT NULL,
        banned_by_admin_id INT,
        ban_type ENUM('temporary', 'permanent') NOT NULL,
        expires_at TIMESTAMP NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        lifted_at TIMESTAMP NULL,
        lifted_by_admin_id INT,
        INDEX idx_user_id (user_id),
        INDEX idx_active (is_active),
        INDEX idx_expires_at (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (banned_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (lifted_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Admin logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        target_type VARCHAR(50),
        target_id INT,
        details JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin (admin_id),
        INDEX idx_action_type (action_type),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // User configs table (cloud storage)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        config_name VARCHAR(100) NOT NULL,
        config_data LONGTEXT NOT NULL,
        encrypted BOOLEAN DEFAULT FALSE,
        config_type ENUM('participant', 'multimodal', 'session') DEFAULT 'participant',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_config_type (config_type),
        UNIQUE KEY unique_user_config (user_id, config_name),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // User analytics table (behavior tracking)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_analytics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        session_id VARCHAR(64),
        event_type VARCHAR(50) NOT NULL,
        event_data JSON,
        page_path VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_event_type (event_type),
        INDEX idx_created_at (created_at),
        INDEX idx_session (session_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Feedback messages table (real-time chat style)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS feedback_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        thread_id VARCHAR(64) NOT NULL,
        user_id INT NOT NULL,
        admin_id INT,
        content TEXT NOT NULL,
        is_from_admin BOOLEAN DEFAULT FALSE,
        is_read BOOLEAN DEFAULT FALSE,
        priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        category ENUM('bug', 'feature', 'question', 'suggestion', 'other') DEFAULT 'other',
        attachments JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_thread_id (thread_id),
        INDEX idx_user_id (user_id),
        INDEX idx_is_read (is_read),
        INDEX idx_priority (priority),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Pending operations table (undo functionality)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pending_operations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        operation_type VARCHAR(50) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id INT,
        target_data JSON NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        executed BOOLEAN DEFAULT FALSE,
        cancelled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin_id (admin_id),
        INDEX idx_expires_at (expires_at),
        INDEX idx_executed (executed),
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Announcements table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        content_type ENUM('text', 'markdown', 'html') DEFAULT 'markdown',
        display_type ENUM('global', 'login', 'register', 'targeted') DEFAULT 'global',
        priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        is_active BOOLEAN DEFAULT TRUE,
        start_time TIMESTAMP NULL,
        end_time TIMESTAMP NULL,
        target_user_ids JSON,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_is_active (is_active),
        INDEX idx_display_type (display_type),
        INDEX idx_start_time (start_time),
        INDEX idx_end_time (end_time),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // User announcement reads table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_announcement_reads (
        user_id INT NOT NULL,
        announcement_id INT NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, announcement_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Site settings table (for terms, privacy policy, etc.)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS site_settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value LONGTEXT,
        updated_by INT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add user_tier column to users if not exists
    try {
      await connection.execute(`
        ALTER TABLE users ADD COLUMN user_tier ENUM('free', 'pro', 'ultra') DEFAULT 'free'
      `);
      await connection.execute(`
        ALTER TABLE users ADD COLUMN monthly_token_usage BIGINT DEFAULT 0
      `);
      await connection.execute(`
        ALTER TABLE users ADD COLUMN token_reset_date DATE
      `);
    } catch (e: any) {
      // Columns may already exist
      if (!e.message.includes('Duplicate column')) {
        console.log('User tier columns may already exist');
      }
    }

    // Config templates table (admin-managed public configs)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS config_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        config_data LONGTEXT NOT NULL,
        tier_required ENUM('free', 'pro', 'ultra') DEFAULT 'free',
        allowed_models JSON,
        token_limit INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        download_count INT DEFAULT 0,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tier (tier_required),
        INDEX idx_active (is_active),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Model tiers table (defines which models belong to which tier)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS model_tiers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        model_pattern VARCHAR(100) NOT NULL,
        tier ENUM('free', 'pro', 'ultra') DEFAULT 'free',
        description VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tier (tier)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Seed default model tiers if empty
    const [existingTiers] = await connection.execute('SELECT COUNT(*) as count FROM model_tiers');
    if ((existingTiers as any)[0].count === 0) {
      await connection.execute(`
        INSERT INTO model_tiers (model_pattern, tier, description) VALUES
        ('gemini-2.0-flash', 'free', 'Google Gemini 2.0 Flash'),
        ('gemini-2.5-flash', 'free', 'Google Gemini 2.5 Flash'),
        ('gpt-4o-mini', 'free', 'OpenAI GPT-4o Mini'),
        ('deepseek-chat', 'free', 'DeepSeek Chat'),
        ('qwen-*', 'free', '通义千问系列'),
        ('gpt-4o', 'pro', 'OpenAI GPT-4o'),
        ('gemini-2.5-pro', 'pro', 'Google Gemini 2.5 Pro'),
        ('claude-3-5-sonnet', 'pro', 'Anthropic Claude 3.5 Sonnet'),
        ('deepseek-reasoner', 'pro', 'DeepSeek Reasoner'),
        ('o1-*', 'ultra', 'OpenAI o1系列'),
        ('o3-*', 'ultra', 'OpenAI o3系列'),
        ('claude-3-5-opus', 'ultra', 'Anthropic Claude 3.5 Opus'),
        ('gemini-2.0-flash-thinking', 'ultra', 'Gemini Thinking')
      `);
    }

    // ==================================================================================
    // SPLIT INVITATION SYSTEM (分裂邀请码系统)
    // ==================================================================================

    // Split invitation trees table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS split_invitation_trees (
        id VARCHAR(36) PRIMARY KEY,
        root_code_id INT,
        created_by_admin_id INT,
        is_banned BOOLEAN DEFAULT FALSE,
        banned_reason TEXT,
        banned_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin (created_by_admin_id),
        INDEX idx_banned (is_banned),
        FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Split invitation codes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS split_invitation_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(12) NOT NULL UNIQUE,
        tree_id VARCHAR(36) NOT NULL,
        creator_user_id INT,
        used_by_user_id INT,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP NULL,
        INDEX idx_code (code),
        INDEX idx_tree_id (tree_id),
        INDEX idx_creator (creator_user_id),
        FOREIGN KEY (tree_id) REFERENCES split_invitation_trees(id) ON DELETE CASCADE,
        FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Admin root code creation cooldown tracking
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_split_cooldowns (
        admin_id INT PRIMARY KEY,
        last_root_code_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add split invitation columns to users
    try {
      await connection.execute(`
        ALTER TABLE users ADD COLUMN split_code_used VARCHAR(12)
      `);
    } catch (e: any) {
      if (!e.message.includes('Duplicate column')) console.log('split_code_used may exist');
    }

    try {
      await connection.execute(`
        ALTER TABLE users ADD COLUMN split_tree_id VARCHAR(36)
      `);
    } catch (e: any) {
      if (!e.message.includes('Duplicate column')) console.log('split_tree_id may exist');
    }

    try {
      await connection.execute(`
        ALTER TABLE users ADD COLUMN split_codes_generated INT DEFAULT 0
      `);
    } catch (e: any) {
      if (!e.message.includes('Duplicate column')) console.log('split_codes_generated may exist');
    }

    // Add profile columns to users
    try {
      await connection.execute(`
        ALTER TABLE users ADD COLUMN phone VARCHAR(20)
      `);
    } catch (e: any) {
      if (!e.message.includes('Duplicate column')) console.log('phone may exist');
    }

    try {
      await connection.execute(`
        ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255)
      `);
    } catch (e: any) {
      if (!e.message.includes('Duplicate column')) console.log('avatar_url may exist');
    }

    // Seed split invitation settings
    try {
      await connection.execute(`
        INSERT IGNORE INTO site_settings (setting_key, setting_value)
        VALUES 
          ('split_invitation_enabled', 'false'),
          ('split_invitation_code_limit', '2')
      `);
    } catch (e) {
      // Settings may already exist
    }

    console.log('📊 Database tables verified/created (users, invitations, sync_logs, reports, bans, admin_logs, user_configs, user_analytics, feedback_messages, pending_operations, announcements, site_settings, config_templates, model_tiers, split_invitation_trees, split_invitation_codes)');
  } finally {
    connection.release();
  }
}

