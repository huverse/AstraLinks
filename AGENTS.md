# Repository Guidelines

## 项目结构与模块组织
- 前端在仓库根目录：`App.tsx`、`components/`、`hooks/`、`contexts/`、`core/`、`services/`、`utils/`。
- 资源与样式：`public/`、`app/styles/`、`index.html`。
- 后端在 `server/`：核心代码 `server/src/`，数据库变更 `server/migrations/`。
- 管理端在 `admin-panel/`。
- 文档与脚本：`docs/`、`TECHNICAL_DOCS.md`、`scripts/`、`deploy.sh`。
- 临时报告放 `tempsay/`。

## 构建、测试与开发命令
- 前端（根目录）：`npm run dev` 启动 Vite；`npm run build` 生成 `dist/`；`npm test`/`npm run test:coverage` 运行 Vitest。
- 后端（`server/`）：`npm run dev` 本地开发；`npm run build` 编译；`npm run start` 运行；`npm run test`/`npm run test:coverage` 运行 Jest；`npm run sync` 同步脚本。
- 管理端（`admin-panel/`）：`npm run dev`/`npm run build`/`npm run preview`；`npm run lint`。

## 编码风格与命名
- TypeScript 优先；沿用现有格式（前端 2 空格缩进，后端 4 空格缩进）。
- 组件用 `PascalCase.tsx`，Hook 用 `useX.ts`，服务/工具用 `camelCase` 文件名。
- 仅在已有文件使用中文时再新增中文注释，避免过度解释。

## 测试规范
- 前端使用 Vitest（`vitest.config.ts`），测试命名 `*.test.ts` / `*.spec.ts`。
- 后端使用 Jest（`server/jest.config.js`），测试放在 `server/src/test` 或 `server/src/tests`。
- 修改核心逻辑请至少跑一次对应测试。

## 提交与 PR 指南
- 近期提交前缀多为 `fix:`、`add:`、`debug:`、`workaround:`、`restore:`，保持简短、动词开头。
- PR 需描述变更、列出测试、UI 改动附截图，并关联 issue（如有）。

## 隔离模式说明
- 场景配置当前以 `server/src/isolation-mode/scenarios/presets/*.scenario.yaml` 为主；`config/scenarios` 为实验目录，使用前请先统一格式。
- 前端入口在 `components/isolation-mode/`，Socket 客户端在 `services/isolationSocket.ts`。

## 安全与部署
- 环境变量：根目录 `.env.production` 与 `server/.env`（避免提交密钥）。
- 部署推荐：`bash deploy.sh`；手动流程见 `deploy.sh` 与 `docs/`。
