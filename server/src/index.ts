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
import { initDatabase, initTimezone } from './config/database';
import { runSync } from './services/syncService';
import { initWebSocket } from './services/websocket';
import { initGeminiLiveProxy } from './services/geminiLive';
import { initWorkflowQueue } from './services/workflowQueue';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and start server
async function startServer() {
    try {
        await initDatabase();
        await initTimezone();
        console.log('✅ Database initialized');

        // Initialize WebSocket
        initWebSocket(httpServer);

        // Initialize Gemini Live WebSocket proxy (for China users)
        initGeminiLiveProxy(httpServer);

        // Schedule daily sync at 3:00 AM
        cron.schedule('0 3 * * *', async () => {
            console.log('🔄 Starting scheduled database sync...');
            try {
                await runSync();
                console.log('✅ Scheduled sync completed');
            } catch (error) {
                console.error('❌ Scheduled sync failed:', error);
            }
        });

        httpServer.listen(PORT, async () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`🔌 WebSocket server ready`);
            console.log(`📅 Daily sync scheduled at 3:00 AM`);

            // Initialize workflow queue (Redis)
            const queueReady = await initWorkflowQueue();
            if (queueReady) {
                console.log('✅ Workflow queue ready (Redis)');
            } else {
                console.log('⚠️ Workflow queue disabled (Redis unavailable, using direct execution)');
            }
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

