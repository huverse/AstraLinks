#!/bin/bash
# WebSocket 诊断脚本
# 用于定位 Nginx WebSocket 代理问题

echo "=== WebSocket 诊断 ==="
echo ""

# 1. Nginx 版本
echo "1. Nginx 版本:"
nginx -v 2>&1
echo ""

# 2. 检查 /socket.io location 配置
echo "2. Socket.IO Location 配置:"
grep -A 20 "location /socket.io" /www/server/panel/vhost/nginx/astralinks.xyz.conf
echo ""

# 3. 检查全局 gzip 设置
echo "3. 全局 gzip 设置:"
grep -E "gzip|gunzip" /www/server/nginx/conf/nginx.conf 2>/dev/null || echo "未找到 gzip 设置"
echo ""

# 4. 检查是否有 proxy_pass 相关的全局设置
echo "4. 全局 proxy 设置:"
grep -E "proxy_buffering|proxy_cache|proxy_http" /www/server/nginx/conf/nginx.conf 2>/dev/null || echo "未找到全局 proxy 设置"
echo ""

# 5. 检查 TLS 版本
echo "5. TLS 设置:"
grep -E "ssl_protocols|ssl_ciphers" /www/server/panel/vhost/nginx/astralinks.xyz.conf
echo ""

# 6. 检查是否有 waf 或安全模块
echo "6. 安全模块检查:"
nginx -V 2>&1 | grep -i "waf\|security\|naxsi\|modsecurity" || echo "未检测到安全模块"
echo ""

# 7. 测试直接 WebSocket 连接(绕过 Nginx)
echo "7. 测试直接后端连接 (需要安装 websocat):"
if command -v websocat &> /dev/null; then
    echo "尝试直接连接后端..."
    timeout 5 websocat -1 "ws://127.0.0.1:3001/socket.io/?EIO=4&transport=websocket" 2>&1 || echo "连接超时或失败"
else
    echo "websocat 未安装，跳过直接连接测试"
    echo "安装命令: cargo install websocat 或 apt install websocat"
fi
echo ""

# 8. 检查编译模块
echo "8. Nginx 编译模块:"
nginx -V 2>&1 | tr ' ' '\n' | grep "with" | head -20
echo ""

echo "=== 诊断完成 ==="
