# Isolation Mode 部署指南

## 一、前端构建

```bash
# 在项目根目录
npm install
npm run build
```

构建产物位于 `dist/` 目录。

---

## 二、主站集成

### 方式 A: Express 静态资源

```javascript
// server/src/index.ts
import express from 'express';
import path from 'path';

// 静态资源服务
app.use(express.static(path.join(__dirname, '../../dist')));

// SPA 路由回退
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
});
```

### 方式 B: Nginx 反向代理

```nginx
# /etc/nginx/sites-available/astralinks
server {
    listen 443 ssl;
    server_name astralinks.xyz;

    # 静态资源
    location / {
        root /www/wwwroot/AstraLinks/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket 代理
    location /socket.io {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## 三、环境变量

### 前端 (.env.production)
```env
VITE_API_BASE=https://astralinks.xyz
```

### 后端 (.env)
```env
# EventLogService 存储
WE_EVENT_STORE=redis
REDIS_URL=redis://127.0.0.1:6379

# 加密密钥
ISOLATION_ENCRYPTION_KEY=your-32-char-random-key

# LLM (可选)
WE_LLM_ENABLED=false
WE_LLM_KEY=your-api-key
```

---

## 四、部署脚本

```bash
#!/bin/bash
# deploy.sh
cd /www/wwwroot/AstraLinks

# 拉取代码
git pull origin main

# 前端构建
npm install
npm run build

# 后端构建
cd server
npm install
npm run build

# 重启服务
pm2 restart astralinks-api

# 验证
pm2 logs astralinks-api --lines 10
```

---

## 五、验证清单

- [ ] 访问 https://astralinks.xyz 正常加载
- [ ] 登录后进入隔离模式
- [ ] WebSocket 连接成功 (绿色图标)
- [ ] 创建会话正常
- [ ] 断网后自动重连 (显示重连状态)
