#!/bin/bash

# Discord Bot Startup Script
# This script loads .env and starts the bot

# Change to the script's directory
cd "$(dirname "$0")"

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✓ Environment variables loaded from .env"
else
    echo "✗ .env file not found!"
    exit 1
fi

# Make sure we're in production mode
export NODE_ENV=production

# Start the Discord bot
echo "Starting Discord bot..."
node ./build/discord-bot/start.js
