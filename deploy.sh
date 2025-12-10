#!/bin/bash
# Galaxyous Union AI Mix - Deployment Script
# 用法: ./deploy.sh

set -e

echo "========================================"
echo "🚀 Galaxyous 部署脚本"
echo "========================================"

# 进入项目目录
cd "$(dirname "$0")"

echo ""
echo "🔄 拉取最新代码..."
git pull origin main

echo ""
echo "📦 更新主前端依赖..."
npm install --legacy-peer-deps

echo ""
echo "🔨 构建主前端..."
npm run build

echo ""
echo "📦 更新管理后台依赖..."
cd admin-panel
npm install --legacy-peer-deps

echo ""
echo "🔨 构建管理后台..."
npm run build

echo ""
echo "📦 更新后端依赖..."
cd ../server
npm install

echo ""
echo "🔨 编译后端 TypeScript..."
npm run build 2>/dev/null || echo "跳过 TypeScript 编译 (使用 ts-node)"

echo ""
echo "🔄 重启 PM2 服务..."
pm2 restart galaxyous-api || pm2 start npm --name "galaxyous-api" -- run start

echo ""
echo "========================================"
echo "✅ 部署完成!"
echo "========================================"
echo "主站: https://astralinks.xyz"
echo "管理后台: https://astralinks.xyz/admin"
echo "========================================"
