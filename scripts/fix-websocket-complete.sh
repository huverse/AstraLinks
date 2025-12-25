#!/bin/bash
# 修复 WebSocket 配置
# 添加 gunzip off 和其他必要设置

CONF="/www/server/panel/vhost/nginx/astralinks.xyz.conf"
BACKUP="${CONF}.bak.$(date +%Y%m%d%H%M%S)"

echo "=== 修复 WebSocket 配置 ==="

# 备份
cp "$CONF" "$BACKUP"
echo "✅ 已备份到: $BACKUP"

# 新的 location 配置
NEW_LOCATION='    # WebSocket 代理 (Socket.IO) - 完整修复
    location /socket.io {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        gzip off;
        gunzip off;
        proxy_redirect off;
    }'

# 使用 perl 进行多行替换
perl -i -p0e 's/# WebSocket.*?location \/socket\.io \{[^}]+\}[^\n]*/$ENV{NEW_LOC}/s' "$CONF"

# 如果 perl 替换失败，尝试简单替换
if ! grep -q "gunzip off" "$CONF"; then
    echo "⚠️ Perl 替换失败，尝试简单方法..."
    
    # 在 proxy_cache off; 后添加新设置
    sed -i '/location \/socket\.io/,/^    }/ {
        s/gzip off;/gzip off;\n        gunzip off;\n        proxy_request_buffering off;\n        proxy_redirect off;/
    }' "$CONF"
fi

# 验证配置
echo ""
echo "📋 新配置:"
grep -A 20 "location /socket.io" "$CONF" | head -25

# 测试 Nginx
echo ""
echo "🔍 测试 Nginx 配置..."
nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 配置有效，正在重载..."
    nginx -s reload
    echo "✅ Nginx 已重载"
else
    echo ""
    echo "❌ 配置错误，正在恢复..."
    cp "$BACKUP" "$CONF"
    echo "已从备份恢复"
fi

echo ""
echo "=== 完成 ==="
echo "请刷新诊断页面测试 WebSocket"
