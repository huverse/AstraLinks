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
