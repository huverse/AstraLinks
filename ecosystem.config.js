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
            // 使用 dotenv 加载 .env 文件
            node_args: '-r dotenv/config',
            env: {
                NODE_ENV: 'production',
            }
        }
    ]
};
