-- QQ OAuth 登录支持
-- 为 users 表添加 QQ 相关字段

ALTER TABLE users
ADD COLUMN qq_openid VARCHAR(64) UNIQUE COMMENT 'QQ互联OpenID',
ADD COLUMN qq_nickname VARCHAR(100) COMMENT 'QQ昵称',
ADD COLUMN avatar_url VARCHAR(500) COMMENT '头像URL';

-- 添加索引以优化查询
CREATE INDEX idx_users_qq_openid ON users(qq_openid);
