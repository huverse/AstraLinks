#!/bin/bash
# fix-websocket-nginx.sh
# 修复 Nginx WebSocket 代理配置

set -e

NGINX_CONF="/www/server/panel/vhost/nginx/astralinks.xyz.conf"
BACKUP_CONF="${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"

echo "=== 修复 Nginx WebSocket 配置 ==="

# 备份原配置
if [ -f "$NGINX_CONF" ]; then
    echo "备份原配置到: $BACKUP_CONF"
    cp "$NGINX_CONF" "$BACKUP_CONF"
else
    echo "错误: 找不到 Nginx 配置文件: $NGINX_CONF"
    exit 1
fi

# 检查是否已有 socket.io location
if grep -q "location /socket.io" "$NGINX_CONF"; then
    echo "已存在 /socket.io location，尝试修复..."
    
    # 使用 sed 替换整个 socket.io location 块
    # 这比较复杂，先删除后添加更安全
    # 暂时跳过，手动检查
    echo "请手动检查配置是否正确"
else
    echo "添加 /socket.io location..."
    
    # 在第一个 location 前插入 socket.io 配置
    # 查找 "location /" 并在其前插入
    sed -i '/location \/ {/i \
    # WebSocket 代理 (Socket.IO)\
    location /socket.io {\
        proxy_pass http://127.0.0.1:3001;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
        proxy_read_timeout 86400s;\
        proxy_send_timeout 86400s;\
    }\
' "$NGINX_CONF"
fi

# 测试 Nginx 配置
echo "测试 Nginx 配置..."
nginx -t

if [ $? -eq 0 ]; then
    echo "配置测试通过，重载 Nginx..."
    systemctl reload nginx
    echo "=== 完成! ==="
    echo "请刷新页面验证 WebSocket 连接"
else
    echo "配置测试失败! 恢复备份..."
    cp "$BACKUP_CONF" "$NGINX_CONF"
    exit 1
fi
