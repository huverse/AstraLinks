-- Linux DO OAuth 登录支持
-- 为 users 表添加 Linux DO 相关字段

ALTER TABLE users
ADD COLUMN linux_do_id VARCHAR(64) UNIQUE COMMENT 'Linux DO 用户ID',
ADD COLUMN linux_do_username VARCHAR(100) COMMENT 'Linux DO 用户名';

-- 添加索引以优化查询
CREATE INDEX idx_users_linux_do_id ON users(linux_do_id);

-- 环境变量配置示例 (添加到 .env):
-- LINUX_DO_CLIENT_ID=lMp1gYQDjV7FTmJTqJoIHLsxTmC1DmVYaxhc1RhNhFA
-- LINUX_DO_CLIENT_SECRET=kw2k5MWHYr3aTPYYfG7YVz1DJLpv38Y2n7RCxRUbYdR
-- LINUX_DO_REDIRECT_URI=http://localhost:3001/api/auth/linux-do/callback
