# Repository Guidelines

## 项目结构与模块组织
- 根目录为前端（Vite + React），入口 `index.tsx`/`App.tsx`，业务在 `components/`、`contexts/`、`hooks/`、`services/`、`utils/`。
- 资源与样式：`public/`、`app/styles/`，构建产物 `dist/`。
- 后端在 `server/`：核心代码 `server/src/`，迁移脚本 `server/migrations/`，构建产物 `server/dist/`。
- 管理端在 `admin-panel/`。
- 临时报告放 `tempsay/`（本地保留，不推送）。

## 构建、测试与开发命令
- 前端（根目录）：`npm run dev` 本地开发；`npm run build` 生成 `dist/`；`npm run preview` 预览；`npm test`/`npm run test:coverage` 运行 Vitest。
- 后端（`server/`）：`npm run dev` 热重载；`npm run build` 编译并复制场景预设；`npm run start` 运行；`npm run sync` 同步；`npm run test`/`npm run test:coverage` 运行 Jest。
- 管理端（`admin-panel/`）：`npm run dev`/`npm run build`/`npm run preview`；`npm run lint`（ESLint）。

## 编码风格与命名
- TypeScript 为主，组件用 `PascalCase.tsx`，Hook 用 `useX.ts`，工具/服务用 `camelCase` 文件名。
- 缩进保持现状：前端 2 空格，后端 4 空格。
- 仅在复杂逻辑处添加简短注释，避免冗余说明。

## 测试规范
- 前端使用 Vitest，测试文件 `*.test.ts(x)` 或 `*.spec.ts(x)`，通常与组件同目录。
- 后端使用 Jest，测试可放 `server/src/test(s)/` 或与模块同级。
- 修改核心逻辑至少跑对应测试。

## 提交与 PR 指南
- 提交信息常用 `fix:`/`add:`/`debug:`/`workaround:`/`restore:` 前缀，动词开头、简短明确。
- PR 需描述变更、列出测试结果；UI 变更附截图；如有 issue 请关联。

## 安全与部署
- 环境变量：前端构建用根目录 `.env.production`，后端用 `server/.env`，密钥勿提交。
- 部署使用 `deploy.sh`，后端由 PM2 管理。
