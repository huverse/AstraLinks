#!/bin/bash
# AstraLinks 部署脚本
# 使用方法: ./deploy.sh

set -e

echo "🚀 开始部署 AstraLinks..."

# 1. 拉取最新代码
echo "📥 拉取最新代码..."
git fetch origin
git reset --hard origin/main

# 2. 安装依赖（如果有新依赖）
echo "📦 安装依赖..."
npm install --production=false

# 3. 构建前端
echo "🔨 构建前端..."
npm run build

# 4. 构建管理后台
echo "🔨 构建管理后台..."
cd admin-panel
npm install --production=false
npm run build
cd ..

# 5. 构建后端
echo "🔨 构建后端..."
cd server
npm install --production=false
npm run build

# 5. 重启 PM2 进程
echo "🔄 重启服务..."
pm2 restart astralinks-api || pm2 start dist/index.js --name astralinks-api

echo "✅ 部署完成！"
echo "📊 查看日志: pm2 logs astralinks-api"
