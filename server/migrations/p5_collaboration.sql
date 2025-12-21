-- P5 协作功能数据库迁移
-- 运行: mysql -u root -p astralinks < p5_collaboration.sql

-- 工作流协作者表
CREATE TABLE IF NOT EXISTS workflow_collaborators (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    role ENUM('owner', 'editor', 'viewer') DEFAULT 'viewer',
    invited_by VARCHAR(36) NULL,
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP NULL,
    UNIQUE KEY uk_workflow_user (workflow_id, user_id),
    INDEX idx_workflow_id (workflow_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 工作流评论表
CREATE TABLE IF NOT EXISTS workflow_comments (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    node_id VARCHAR(255) NULL,
    user_id VARCHAR(36) NOT NULL,
    content TEXT NOT NULL,
    position_x FLOAT NULL,
    position_y FLOAT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    parent_id VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_workflow_id (workflow_id),
    INDEX idx_node_id (node_id),
    INDEX idx_user_id (user_id),
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
