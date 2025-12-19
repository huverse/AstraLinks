# Git-Crypt 安全加密设置指南

本项目使用 [git-crypt](https://github.com/AGWA/git-crypt) 来加密敏感配置文件。

## 安装 Git-Crypt

### Windows (使用 Chocolatey)
```bash
choco install git-crypt
```

### Windows (使用 Scoop)
```bash
scoop install git-crypt
```

### Linux
```bash
sudo apt-get install git-crypt  # Debian/Ubuntu
sudo yum install git-crypt      # CentOS/RHEL
```

### macOS
```bash
brew install git-crypt
```

## 初始化 Git-Crypt

在项目根目录运行：

```bash
# 初始化 git-crypt（只需运行一次）
git-crypt init

# 导出密钥（保存到安全位置！）
git-crypt export-key ../git-crypt-key.key
```

> ⚠️ **重要**: 密钥文件 `git-crypt-key.key` 必须安全保存，丢失后无法解密文件！

## 配置加密文件

项目根目录下的 `.gitattributes` 文件定义了需要加密的文件：

```
server/.env filter=git-crypt diff=git-crypt
*.secret filter=git-crypt diff=git-crypt
secrets/** filter=git-crypt diff=git-crypt
```

## 服务器部署

### 方法 1: 使用密钥文件
```bash
# 在服务器上解锁仓库
git-crypt unlock /path/to/git-crypt-key.key
```

### 方法 2: 使用 GPG 密钥（推荐）
```bash
# 在本地添加 GPG 用户
git-crypt add-gpg-user YOUR_GPG_KEY_ID

# 服务器上（需要有对应的 GPG 私钥）
git-crypt unlock
```

## 当前安全策略

1. **环境变量**: 敏感信息存储在 `.env` 文件中
2. **Gitignore**: `.env` 文件默认在 `.gitignore` 中
3. **无硬编码**: 代码中不包含任何硬编码的密钥
4. **Git-Crypt**: 可选的加密层，用于需要版本控制的敏感配置

## 敏感信息清单

需要安全保护的配置：
- `TURNSTILE_SECRET_KEY` - Cloudflare Turnstile 密钥
- `DB_PASSWORD` - 数据库密码
- `JWT_SECRET` - JWT 签名密钥
- `QQ_APP_KEY` - QQ OAuth 密钥
