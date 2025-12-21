-- ================================================
-- Workflow Triggers Table (触发器系统)
-- ================================================

CREATE TABLE IF NOT EXISTS workflow_triggers (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    type ENUM('webhook', 'schedule', 'event') NOT NULL,
    name VARCHAR(100) DEFAULT NULL,
    config JSON DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Webhook 专用
    webhook_token VARCHAR(64) UNIQUE DEFAULT NULL,
    
    -- 定时任务专用
    cron_expression VARCHAR(100) DEFAULT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
    
    -- 统计
    trigger_count INT DEFAULT 0,
    last_triggered_at TIMESTAMP DEFAULT NULL,
    last_error TEXT DEFAULT NULL,
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- 外键
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    
    -- 索引
    INDEX idx_workflow_id (workflow_id),
    INDEX idx_webhook_token (webhook_token),
    INDEX idx_type_active (type, is_active)
);

-- 触发历史表
CREATE TABLE IF NOT EXISTS trigger_history (
    id VARCHAR(36) PRIMARY KEY,
    trigger_id VARCHAR(36) NOT NULL,
    workflow_id VARCHAR(36) NOT NULL,
    execution_id VARCHAR(36) DEFAULT NULL,
    status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
    input JSON DEFAULT NULL,
    output JSON DEFAULT NULL,
    error TEXT DEFAULT NULL,
    duration INT DEFAULT NULL,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (trigger_id) REFERENCES workflow_triggers(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    
    INDEX idx_trigger_id (trigger_id),
    INDEX idx_workflow_id (workflow_id),
    INDEX idx_triggered_at (triggered_at)
);
