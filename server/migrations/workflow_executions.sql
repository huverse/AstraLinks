-- ============================================
-- 工作流执行历史表
-- ============================================
-- 运行此迁移: mysql -u root -p astralinks < workflow_executions.sql

CREATE TABLE IF NOT EXISTS workflow_executions (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    user_id INT NOT NULL,
    job_id VARCHAR(100) DEFAULT NULL COMMENT 'BullMQ Job ID',
    status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    input JSON COMMENT '执行输入',
    output JSON COMMENT '执行输出',
    error TEXT COMMENT '错误信息',
    node_states JSON COMMENT '各节点执行状态',
    logs JSON COMMENT '执行日志',
    total_tokens INT DEFAULT 0 COMMENT '总Token消耗',
    duration_ms INT DEFAULT 0 COMMENT '执行时长(毫秒)',
    retry_count INT DEFAULT 0 COMMENT '重试次数',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL COMMENT '开始执行时间',
    completed_at TIMESTAMP NULL COMMENT '完成时间',
    
    INDEX idx_workflow_id (workflow_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 添加注释
ALTER TABLE workflow_executions COMMENT '工作流执行历史记录';
