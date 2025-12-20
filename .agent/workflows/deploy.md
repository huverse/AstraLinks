---
description: 服务器部署和更新流程
---

# 生产部署工作流

## 快速部署（推荐）
// turbo-all
```bash
cd /www/wwwroot/AstraLinks && bash deploy.sh
```

## 手动部署步骤

### 1. 拉取最新代码
```bash
cd /www/wwwroot/AstraLinks
git pull origin main
```

### 2. 构建前端
```bash
npm install
npm run build
```

### 3. 构建后端（关键！）
```bash
cd server
npm install
npm run build
```

### 4. 重启后端服务
```bash
pm2 restart astralinks-api
```

### 5. 验证部署
```bash
pm2 logs astralinks-api --lines 20
```

## 注意事项

- **不要使用 `npm run dev`**：开发模式使用 ts-node-dev，热重载不稳定
- **必须执行 `npm run build`**：将 TypeScript 编译为 JavaScript
- PM2 应运行编译后的 `dist/index.js`，不是源代码

## PM2 首次配置

如果 PM2 进程不存在，首次启动：
```bash
cd /www/wwwroot/AstraLinks/server
pm2 start dist/index.js --name astralinks-api
pm2 save
```
