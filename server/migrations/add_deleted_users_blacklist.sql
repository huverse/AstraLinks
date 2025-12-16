-- 账户删除记录和黑名单系统
-- 用于管理员删除账户时记录原因，以及 QQ/IP 黑名单

-- 删除账户记录表
CREATE TABLE IF NOT EXISTS deleted_users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '原用户ID',
    username VARCHAR(255) NOT NULL COMMENT '用户名',
    email VARCHAR(255) DEFAULT NULL COMMENT '邮箱',
    qq_openid VARCHAR(100) DEFAULT NULL COMMENT 'QQ OpenID',
    reason TEXT NOT NULL COMMENT '删除原因',
    deleted_by_admin_id INT NOT NULL COMMENT '执行删除的管理员ID',
    additional_measures JSON COMMENT '额外措施: {"blacklist_qq": bool, "blacklist_ip": bool}',
    original_user_data JSON COMMENT '用户原始数据备份',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deleted_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_username (username),
    INDEX idx_qq_openid (qq_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 黑名单表 (QQ/IP)
CREATE TABLE IF NOT EXISTS blacklist (
    id INT PRIMARY KEY AUTO_INCREMENT,
    type ENUM('qq', 'ip') NOT NULL COMMENT '黑名单类型',
    value VARCHAR(255) NOT NULL COMMENT 'QQ OpenID 或 IP 地址',
    reason TEXT NOT NULL COMMENT '拉黑原因',
    related_deleted_user_id INT DEFAULT NULL COMMENT '关联的删除用户ID',
    created_by_admin_id INT NOT NULL COMMENT '创建者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否有效',
    FOREIGN KEY (related_deleted_user_id) REFERENCES deleted_users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_type_value (type, value),
    INDEX idx_type (type),
    INDEX idx_value (value),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
