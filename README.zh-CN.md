# Galaxyous Union AI Mix（中文说明）

Galaxyous Union AI Mix 是一个多模型 AI 平台，覆盖实时聊天、工作流编排、工具集成与多模态生成。仓库包含前端应用、后端服务与独立管理后台，并提供隔离模式（多 Agent 结构化讨论）与 MCP 工具体系。

## 项目定位
- 多模型协作与裁判模式：支持多模型并行会话、自动轮询、投票与裁判调度。
- 隔离模式：面向结构化讨论的会话引擎，提供场景、事件日志与实时 WebSocket 推送。
- 工作流与工具：基于 DAG 的流程编排，支持 LLM、工具调用与沙箱执行。
- 知识库与检索：文档上传与向量检索接口，用于 RAG 场景。
- 多模态中心：图像、音频、视频生成与实时语音代理。
- 管理后台：运维与审计功能、统计视图与配置管理。

## 技术栈
- 前端：React 19、Vite、TypeScript、Lucide、React Router
- 后端：Node.js、Express、Socket.IO、MySQL、Redis、BullMQ
- 其他：Jest/Vitest、ts-node-dev、vm2、YAML

## 目录结构
- `App.tsx`、`index.tsx`：前端入口
- `components/`、`contexts/`、`hooks/`、`services/`、`utils/`：前端业务与通用逻辑
- `server/`：后端服务
  - `server/src/`：API 路由、服务与隔离模式核心实现
  - `server/dist/`：构建产物
- `admin-panel/`：管理后台前端
- `core/`：核心引擎（workflow、mcp、rag、sandbox 等）
- `public/`、`app/styles/`：静态资源与样式
- `dist/`：前端构建产物
- `tempsay/`：本地报告与临时文件，不应提交

## 环境要求
- Node.js 18+
- MySQL 8+
- Redis 6+

## 配置说明
后端环境变量位于 `server/.env`，示例见 `server/.env.example`，包含：
- 数据库连接：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
- JWT：`JWT_SECRET`
- OAuth：`QQ_*`、`GOOGLE_*`
- 邮件服务：`RESEND_API_KEY`、`SENDER_EMAIL`
- 反爬与安全：`TURNSTILE_SECRET_KEY`
- MCP 市场：`SMITHERY_API_KEY`
- 隔离模式加密：`ISOLATION_ENCRYPTION_KEY`

前端构建环境变量位于 `.env.production`，关键项：
- `VITE_API_BASE`、`VITE_PROXY_API_BASE`
- `VITE_ISOLATION_ENCRYPTION_KEY`

注意：`ISOLATION_ENCRYPTION_KEY` 必须与 `VITE_ISOLATION_ENCRYPTION_KEY` 一致，否则隔离模式配置无法解密。

## 本地开发
安装依赖：
```bash
npm install
npm --prefix server install
npm --prefix admin-panel install
```

启动服务：
```bash
# 后端
npm --prefix server run dev

# 前端
npm run dev

# 管理后台（可选）
npm --prefix admin-panel run dev
```

后端默认端口为 `3001`，前端由 Vite 提供本地端口。

## 构建与部署
构建：
```bash
npm run build
npm --prefix server run build
npm --prefix admin-panel run build
```

生产部署使用 `deploy.sh` 与 PM2：
```bash
./deploy.sh
```

`deploy.sh` 会执行 `git reset --hard origin/main`，本地未提交改动将被清理，请确认无未保存内容。

## 运行与维护
- 健康检查：`GET /api/health`
- 讨论与隔离模式 WebSocket：`/isolation` 命名空间
- 查看日志：`pm2 logs astralinks-api`

## 测试
- 前端：`npm test` 或 `npm run test:coverage`
- 后端：`npm --prefix server test` 或 `npm --prefix server run test:coverage`

## 相关文档
- 贡献指南：`AGENTS.md`
- 技术文档：`TECHNICAL_DOCS.md`

## License
Apache License 2.0，详见 `LICENSE`。
