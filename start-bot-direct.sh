#!/bin/bash

# Discord Bot Direct PM2 Startup (Alternative Method)
# This starts the bot directly without using ecosystem file
# Use this if ecosystem.bot-only.js doesn't work correctly

# Change to the script's directory
cd "$(dirname "$0")"

echo "=========================================="
echo "Discord Bot Direct PM2 Startup"
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

# 4. Stop and delete ALL existing bot processes
echo "4. Stopping existing bot processes..."
pm2 stop morita-bot 2>/dev/null
pm2 delete morita-bot 2>/dev/null
pm2 stop ecosystem.bot-only 2>/dev/null
pm2 delete ecosystem.bot-only 2>/dev/null
pm2 delete 0 2>/dev/null
pm2 kill 2>/dev/null
sleep 1
echo "   ✅ All old processes cleaned up"

# 5. Start bot directly with PM2 (not using ecosystem file)
echo "5. Starting bot directly with PM2..."
pm2 start build/discord-bot/start.js \
    --name morita-bot \
    --cwd "$(pwd)" \
    --error bot-logs/bot-error.log \
    --output bot-logs/bot-out.log \
    --log-date-format "YYYY-MM-DD HH:mm:ss Z" \
    --merge-logs \
    --autorestart \
    --max-restarts 10 \
    --min-uptime 10s \
    --max-memory-restart 300M

# 6. Wait and check status
sleep 3
echo ""
echo "6. Bot status:"
pm2 status morita-bot

# 7. Show logs
echo ""
echo "=========================================="
echo "Recent bot logs (last 30 lines):"
echo "=========================================="
pm2 logs morita-bot --lines 30 --nostream

echo ""
echo "=========================================="
echo "✅ Setup complete!"
echo ""
echo "Useful commands:"
echo "  pm2 status              - Check bot status"
echo "  pm2 logs morita-bot     - View live logs"
echo "  pm2 restart morita-bot  - Restart bot"
echo "=========================================="

