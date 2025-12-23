/**
 * PM2 Configuration for World Engine
 * 
 * 用法:
 * pm2 start ecosystem.config.js --env internal
 * pm2 start ecosystem.config.js --env production
 */

module.exports = {
    apps: [{
        name: 'world-engine',
        script: 'dist/index.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',

        // 环境变量
        env: {
            NODE_ENV: 'development',
            PORT: 3001
        },

        env_internal: {
            NODE_ENV: 'internal',
            PORT: 3001,
            WE_LOG_LEVEL: 'info',
            WE_LLM_ENABLED: 'false'
        },

        env_production: {
            NODE_ENV: 'production',
            PORT: 3001,
            WE_LOG_LEVEL: 'warn',
            WE_LLM_ENABLED: 'false'
        },

        // 日志配置
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        error_file: 'logs/error.log',
        out_file: 'logs/out.log',
        merge_logs: true,

        // 启动配置
        wait_ready: true,
        listen_timeout: 10000,
        kill_timeout: 5000
    }]
};
