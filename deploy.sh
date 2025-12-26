#!/bin/bash
# AstraLinks deployment script
# Usage: ./deploy.sh

set -e

echo ">>> Starting AstraLinks deploy..."

echo ">>> Fetch latest code"
git fetch origin
git reset --hard origin/main

echo ">>> Install root dependencies"
npm install --production=false

echo ">>> Build frontend"
npm run build
rm -f dist/ws-debug.html

echo ">>> Build admin panel"
pushd admin-panel >/dev/null
npm install --production=false
npm run build
popd >/dev/null
rm -rf admin-panel/node_modules

echo ">>> Build server"
pushd server >/dev/null
npm install --production=false
npm run build
popd >/dev/null

echo ">>> Restart pm2"
pm2 restart astralinks-api || pm2 start dist/index.js --name astralinks-api

echo ">>> Deploy finished"
echo ">>> Logs: pm2 logs astralinks-api"
