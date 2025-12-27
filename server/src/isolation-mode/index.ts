/**
 * 隔离模式 - 多 Agent 结构化讨论引擎
 *
 * @module server/src/isolation-mode
 * @description 作为独立模块嵌入 Galaxyous 后端
 */

import { Router } from 'express';
import sessionRoutes from './api/routes/session.routes';
import agentRoutes from './api/routes/agent.routes';
import eventRoutes from './api/routes/event.routes';
import { discussionLoop } from './orchestrator/DiscussionLoop';
import { registerDiscussionLoopLauncher } from './orchestrator/DiscussionLoopLauncher';

// 注册讨论循环启动器（解决循环依赖）
registerDiscussionLoopLauncher(discussionLoop);

// 创建隔离模式路由
const isolationRouter = Router();

// 挂载子路由
isolationRouter.use('/sessions', sessionRoutes);
isolationRouter.use('/agents', agentRoutes);
isolationRouter.use('/events', eventRoutes);

// 导出模块
export { isolationRouter };
export * from './core/types';
export * from './core/interfaces';
