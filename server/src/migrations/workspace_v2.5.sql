-- ============================================
-- 工作区系统增强 v2.5
-- 添加项目管理、任务追踪、沙箱执行表
-- ============================================

-- 项目表 (Project Management)
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('planning', 'active', 'paused', 'completed', 'archived') DEFAULT 'planning',
    progress INT DEFAULT 0,
    start_date DATE,
    due_date DATE,
    color VARCHAR(20) DEFAULT '#8B5CF6',
    icon VARCHAR(50) DEFAULT '📁',
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    INDEX idx_projects_workspace (workspace_id),
    INDEX idx_projects_status (status)
);

-- 任务表 (Task Tracking)
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('todo', 'in_progress', 'review', 'done', 'cancelled') DEFAULT 'todo',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    due_date DATETIME,
    completed_at DATETIME,
    assignee VARCHAR(255),
    tags JSON,
    -- 工作流集成
    trigger_workflow_id VARCHAR(36),
    on_complete_workflow_id VARCHAR(36),
    auto_create_rule JSON,
    -- 排序
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    INDEX idx_tasks_workspace (workspace_id),
    INDEX idx_tasks_project (project_id),
    INDEX idx_tasks_status (status),
    INDEX idx_tasks_due_date (due_date)
);

-- 沙箱执行记录
CREATE TABLE IF NOT EXISTS sandbox_executions (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL,
    name VARCHAR(255),
    language ENUM('javascript', 'python') DEFAULT 'javascript',
    code TEXT NOT NULL,
    input JSON,
    output TEXT,
    error TEXT,
    execution_time_ms INT,
    memory_used_kb INT,
    status ENUM('success', 'error', 'timeout') DEFAULT 'success',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    INDEX idx_sandbox_workspace (workspace_id),
    INDEX idx_sandbox_created (created_at)
);

-- 沙箱代码片段保存
CREATE TABLE IF NOT EXISTS sandbox_snippets (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    language ENUM('javascript', 'python') DEFAULT 'javascript',
    code TEXT NOT NULL,
    is_template BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    INDEX idx_snippets_workspace (workspace_id)
);
