#!/bin/bash

# Discord Bot PM2 Startup Script
# This script ensures everything is set up correctly before starting with PM2

# Change to the script's directory
cd "$(dirname "$0")"

echo "=========================================="
echo "Discord Bot PM2 Startup Script"
echo "=========================================="

# 1. Create bot-logs directory if it doesn't exist
echo "1. Checking bot-logs directory..."
if [ ! -d "bot-logs" ]; then
    echo "   Creating bot-logs directory..."
    mkdir -p bot-logs
    echo "   ✅ bot-logs directory created"
else
    echo "   ✅ bot-logs directory exists"
fi

# 2. Verify .env file exists
echo "2. Checking .env file..."
if [ ! -f ".env" ]; then
    echo "   ⚠️  WARNING: .env file not found!"
    echo "   Please create .env file from discord-bot.env.example"
    exit 1
else
    echo "   ✅ .env file exists"
fi

# 3. Verify build files exist
echo "3. Checking build files..."
if [ ! -f "build/discord-bot/start.js" ]; then
    echo "   ⚠️  Build files not found. Running npm run build..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "   ❌ Build failed!"
        exit 1
    fi
    echo "   ✅ Build completed"
else
    echo "   ✅ Build files exist"
fi

# 4. Stop any existing bot process
echo "4. Stopping existing bot processes..."
pm2 stop morita-bot 2>/dev/null
pm2 delete morita-bot 2>/dev/null
echo "   ✅ Old processes cleaned up"

# 5. Start bot with PM2
echo "5. Starting bot with PM2..."
pm2 start ecosystem.bot-only.js

# 6. Wait a moment and check status
sleep 2
echo ""
echo "6. Bot status:"
pm2 status morita-bot

# 7. Show logs
echo ""
echo "=========================================="
echo "Recent bot logs (last 20 lines):"
echo "=========================================="
pm2 logs morita-bot --lines 20 --nostream

echo ""
echo "=========================================="
echo "✅ Setup complete!"
echo ""
echo "Useful commands:"
echo "  pm2 status              - Check bot status"
echo "  pm2 logs morita-bot     - View live logs"
echo "  pm2 restart morita-bot  - Restart bot"
echo "  pm2 stop morita-bot     - Stop bot"
echo ""
echo "To save PM2 config (auto-start on reboot):"
echo "  pm2 save"
echo "  pm2 startup"
echo "=========================================="

