import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { createServer } from 'http';

import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import proxyRoutes from './routes/proxy';
import debugRoutes from './routes/debug';
import configRoutes from './routes/configs';
import feedbackRoutes from './routes/feedback';
import analyticsRoutes from './routes/analytics';
import announcementsRoutes from './routes/announcements';
import settingsRoutes from './routes/settings';
import configTemplatesRoutes from './routes/configTemplates';
import splitInvitationRoutes from './routes/splitInvitation';
import profileRoutes from './routes/profile';
import mcpRoutes from './routes/mcp';
import mcpRegistryRoutes from './routes/mcpRegistry';
import workspacesRoutes from './routes/workspaces';
import workflowsRoutes from './routes/workflows';
import syncRoutes from './routes/sync';
import workspaceConfigRoutes from './routes/workspace-config';
import adminWorkflowsRoutes from './routes/admin-workflows';
import adminMcpRoutes from './routes/admin-mcp';
import promptRoutes from './routes/prompt';
import knowledgeRoutes from './routes/knowledge';
import mcpMarketplaceRoutes from './routes/mcp-marketplace';
import workspaceProjectsRoutes from './routes/workspace-projects';
import codeRoutes from './routes/code';
import webhookRoutes from './routes/webhooks';
import collaborationRoutes from './routes/collaboration';
import databaseRoutes from './routes/database';
import worldEngineRoutes from './routes/world-engine';
import { initDatabase, initTimezone } from './config/database';
import { runSync } from './services/syncService';
import { initWebSocket } from './services/websocket';
import { initGeminiLiveProxy } from './services/geminiLive';
import { initWorkflowQueue, setSocketIO } from './services/workflowQueue';
import { initScheduler } from './services/scheduler';
import { initWorldEngineSocket } from './isolation-mode/websocket';
import { initializeWebSocketGateway } from './isolation-mode/api/websocket/DiscussionGateway';
import { sessionRoutes as isolationSessionRoutes, agentRoutes as isolationAgentRoutes, eventRoutes as isolationEventRoutes, scenarioRoutes as isolationScenarioRoutes } from './isolation-mode/api/routes';
import futureRoutes from './routes/future';
import { discussionLoop } from './isolation-mode/orchestrator/DiscussionLoop';
import { registerDiscussionLoopLauncher } from './isolation-mode/orchestrator/DiscussionLoopLauncher';
import { validateConfig, isProductionLike } from './config/world-engine.config';
import { appLogger, logStartup } from './services/world-engine-logger';
import { warnEnvDuplicates, warnInsecureTlsSetting } from './config/env.guard';

dotenv.config();
warnEnvDuplicates();
warnInsecureTlsSetting();
registerDiscussionLoopLauncher(discussionLoop);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: isProductionLike
        ? ['https://astralinks.xyz', 'https://www.astralinks.xyz']
        : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/workflows', adminWorkflowsRoutes);
app.use('/api/admin/mcp-registry', adminMcpRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/configs', configRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/config-templates', configTemplatesRoutes);
app.use('/api/split-invitation', splitInvitationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/mcp-registry', mcpRegistryRoutes);
app.use('/api/workspaces', workspacesRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/workspace-config', workspaceConfigRoutes);
app.use('/api/prompt', promptRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/mcp-marketplace', mcpMarketplaceRoutes);
app.use('/api/workspace-projects', workspaceProjectsRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/workflows', collaborationRoutes); // P5 协作功能 (嵌套在 workflows 下)
app.use('/api/database', databaseRoutes); // P7 数据库连接器
app.use('/api/v1/world-engine', worldEngineRoutes); // World Engine API v1
app.use('/api/future', futureRoutes); // 时光信 API

// 隔离模式 API
app.use('/api/isolation/sessions', isolationSessionRoutes);
app.use('/api/isolation/agents', isolationAgentRoutes);
app.use('/api/isolation/events', isolationEventRoutes);
app.use('/api/isolation/scenarios', isolationScenarioRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and start server
async function startServer() {
    try {
        // P1: 配置校验 (生产环境必须通过)
        const validation = validateConfig();
        if (!validation.valid) {
            appLogger.error({ errors: validation.errors }, 'config_validation_failed');
            if (isProductionLike) {
                process.exit(1);
            }
        }

        // P1: 启动日志
        logStartup();

        await initDatabase();
        await initTimezone();
        appLogger.info('database_initialized');

        // Initialize WebSocket
        const io = initWebSocket(httpServer);

        // Initialize World Engine WebSocket namespace
        initWorldEngineSocket(io);
        // Initialize Isolation Mode WebSocket namespace
        initializeWebSocketGateway(io);

        // Initialize Gemini Live WebSocket proxy (for China users)
        initGeminiLiveProxy(httpServer);

        // Schedule daily sync at 3:00 AM
        cron.schedule('0 3 * * *', async () => {
            appLogger.info('starting_scheduled_database_sync');
            try {
                await runSync();
                appLogger.info('scheduled_sync_completed');
            } catch (error) {
                appLogger.error({ error: (error as Error).message }, 'scheduled_sync_failed');
            }
        });

        httpServer.listen(PORT, async () => {
            appLogger.info({ port: PORT }, 'server_running');
            appLogger.info('websocket_server_ready');
            appLogger.info('daily_sync_scheduled');

            // Initialize workflow queue (Redis)
            const queueReady = await initWorkflowQueue();
            if (queueReady) {
                appLogger.info('workflow_queue_ready');

                // Initialize scheduler for cron-based triggers
                await initScheduler();
                appLogger.info('workflow_scheduler_initialized');
            } else {
                appLogger.warn('workflow_queue_disabled_redis_unavailable');
            }
        });
    } catch (error) {
        appLogger.error({ error: (error as Error).message }, 'failed_to_start_server');
        process.exit(1);
    }
}

startServer();

