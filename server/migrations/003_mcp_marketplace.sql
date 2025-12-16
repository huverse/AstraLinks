-- MCP 系统扩展迁移 SQL
-- 执行日期: 2025-12-16
-- 功能: 支持 Smithery 市场集成和用户 MCP 安装

-- 1. 扩展 mcp_registry 表
ALTER TABLE mcp_registry 
ADD COLUMN IF NOT EXISTS source ENUM('BUILTIN', 'MARKETPLACE', 'USER_UPLOADED') DEFAULT 'USER_UPLOADED',
ADD COLUMN IF NOT EXISTS marketplace_id VARCHAR(255) DEFAULT NULL COMMENT 'Smithery 市场 ID',
ADD COLUMN IF NOT EXISTS installed_by INT DEFAULT NULL COMMENT '安装者用户ID',
ADD COLUMN IF NOT EXISTS installed_at DATETIME DEFAULT NULL;

-- 2. 创建用户 MCP 安装记录表
CREATE TABLE IF NOT EXISTS user_mcp_installs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    mcp_id VARCHAR(255) NOT NULL COMMENT 'MCP 标识符 (Smithery qualifiedName)',
    mcp_name VARCHAR(255) DEFAULT NULL COMMENT 'MCP 名称',
    mcp_description TEXT DEFAULT NULL COMMENT 'MCP 描述',
    source VARCHAR(50) DEFAULT 'marketplace' COMMENT '来源: marketplace, custom',
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    enabled BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    custom_config JSON DEFAULT NULL COMMENT '用户自定义配置',
    UNIQUE KEY unique_user_mcp (user_id, mcp_id),
    INDEX idx_user_id (user_id),
    INDEX idx_mcp_id (mcp_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户 MCP 安装记录';

-- 3. 更新现有 mcp_registry 表中的内置 MCP 来源
UPDATE mcp_registry SET source = 'BUILTIN' WHERE id LIKE 'mcp-%' AND source IS NULL;
