#!/bin/bash
# Kill any existing Discord bot instances before starting a new one

echo "🔍 Checking for existing Discord bot processes..."

# Method 1: Kill by port 3002
PORT_PID=$(lsof -ti:3002 2>/dev/null)
if [ ! -z "$PORT_PID" ]; then
    echo "⚠️  Found bot running on port 3002 (PID: $PORT_PID)"
    kill -9 $PORT_PID 2>/dev/null
    echo "✅ Killed bot on port 3002"
fi

# Method 2: Kill by process name
PROC_PIDS=$(pgrep -f "discord-bot/start.ts" 2>/dev/null)
if [ ! -z "$PROC_PIDS" ]; then
    echo "⚠️  Found Discord bot processes: $PROC_PIDS"
    pkill -9 -f "discord-bot/start.ts" 2>/dev/null
    echo "✅ Killed all Discord bot processes"
fi

# Wait a moment for processes to clean up
sleep 1

# Verify all killed
REMAINING=$(lsof -ti:3002 2>/dev/null)
if [ -z "$REMAINING" ]; then
    echo "✅ All Discord bot instances stopped successfully"
    exit 0
else
    echo "⚠️  Warning: Some processes may still be running"
    exit 1
fi
