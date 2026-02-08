#!/bin/bash

echo "================================================"
echo "🔧 FIXING CRYPTO MONITORING ERRORS"
echo "================================================"
echo ""

# Get the current directory
BACKEND_DIR=$(pwd)

echo "📍 Working directory: $BACKEND_DIR"
echo ""

# Step 1: Install missing dependencies
echo "📦 Step 1: Installing cron package..."
npm install cron
npm install --save-dev @types/cron

if [ $? -eq 0 ]; then
    echo "✅ cron installed successfully"
else
    echo "❌ Failed to install cron"
    exit 1
fi

echo ""

# Step 2: Verify the fixes are in place
echo "🔍 Step 2: Verifying file fixes..."

# Check if crypto-notification.service.ts has correct import
if grep -q 'import discordClient from "../index"' src/discord-bot/services/crypto-notification.service.ts; then
    echo "✅ Discord client import is correct"
else
    echo "⚠️  Discord client import needs manual fix"
    echo "   Edit: src/discord-bot/services/crypto-notification.service.ts"
    echo "   Change: import { discordClient } from '../clients/DiscordClient';"
    echo "   To:     import discordClient from '../index';"
fi

# Check if embed.toJSON() is used
if grep -q 'embeds: \[embed.toJSON()\]' src/discord-bot/services/crypto-notification.service.ts; then
    echo "✅ Embed toJSON() is correct"
else
    echo "⚠️  Embed needs manual fix"
    echo "   Edit: src/discord-bot/services/crypto-notification.service.ts"
    echo "   Change: embeds: [embed],"
    echo "   To:     embeds: [embed.toJSON()],"
fi

echo ""

# Step 3: Try to compile
echo "🔨 Step 3: Checking TypeScript compilation..."
npx tsc --noEmit 2>&1 | grep -E "(error TS|Found [0-9]+ error)" | head -10

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ TypeScript compilation successful!"
else
    echo "⚠️  TypeScript has errors (see above)"
    echo ""
    echo "Run 'npx tsc --noEmit' to see full error list"
fi

echo ""
echo "================================================"
echo "✅ FIX SCRIPT COMPLETE"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Run: npm run dev"
echo "2. Check logs for: '✅ Crypto transaction monitoring started'"
echo "3. If errors persist, check the output above"
echo ""
