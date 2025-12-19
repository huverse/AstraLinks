module.exports = {
    apps: [
        {
            name: 'astralinks-api',
            script: './dist/index.js',
            cwd: '/www/wwwroot/AstraLinks/server',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                PORT: 3001,

                // Database
                DB_HOST: 'localhost',
                DB_PORT: 3306,
                DB_USER: 'root',
                DB_PASSWORD: '', // 填写你的数据库密码
                DB_NAME: 'galaxyous_new',

                // JWT
                JWT_SECRET: 'your-jwt-secret-here', // 请修改为安全的密钥

                // Cloudflare Turnstile
                TURNSTILE_SECRET_KEY: '0x4AAAAAACHmC9HzP5-XLQV6vLH5XzmJq3I',

                // QQ OAuth (可选)
                QQ_APP_ID: '',
                QQ_APP_KEY: '',
                QQ_REDIRECT_URI: 'https://astralinks.xyz/api/auth/qq/callback',
                FRONTEND_URL: 'https://astralinks.xyz',

                // Redis (可选，用于工作流队列)
                REDIS_HOST: '127.0.0.1',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: '',

                // 其他配置
                CONFIG_ENCRYPTION_KEY: 'galaxyous-config-encryption-key-32b',
                WORKSPACE_FILES_PATH: '/www/wwwroot/AstraLinks/workspaces',
                VECTOR_STORE_PATH: '/www/wwwroot/AstraLinks/data/vectors',
            }
        }
    ]
};
