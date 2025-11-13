# Discord Bot Integrated in Backend - Setup Guide

## ✅ Implementation Complete!

The Discord bot is now integrated into `app.ts` and will start automatically with the backend API.

## How It Works

1. **Backend starts** → Express server initializes
2. **Server listens** → HTTP server starts on port 3000
3. **Bot starts automatically** → Discord bot initializes after server is ready
4. **Both run together** → Same Node.js process, managed by cPanel

## Benefits

✅ **No PM2 needed** - Everything managed by cPanel  
✅ **Auto-restart** - When backend restarts, bot restarts automatically  
✅ **Error handling** - Bot failures won't crash backend  
✅ **Single process** - Easier to manage and monitor  
✅ **Shared resources** - Same .env, database, logging  

## Setup Instructions

### 1. Build the Project

```bash
cd /home/morita/public_html/morita_backend
npm run build
```

### 2. Restart Backend in cPanel

1. Go to **cPanel → Setup Node.js App**
2. Find your backend app (`api.morita.vip`)
3. Click **RESTART**

The bot will start automatically!

### 3. Verify Bot is Running

**Check cPanel Logs:**
- Go to **cPanel → Setup Node.js App**
- Click **OPEN** next to your app
- Look for: `"Discord bot started successfully"`

**Or check in Discord:**
- Bot should appear online (green dot)
- Try a command: `/help` or `!s agility 82-90`

## Environment Variables

The bot uses the same `.env` file as the backend. Make sure you have:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_server_id
API_BASE_URL=https://api.morita.vip
```

### Optional: Disable Bot

If you need to disable the bot temporarily:

```env
DISCORD_BOT_ENABLED=false
```

Set this in your `.env` file or cPanel environment variables.

## How to Restart Bot

Since bot runs with backend, just restart the backend:

**In cPanel:**
1. Go to **Setup Node.js App**
2. Click **RESTART**

**Via SSH (if needed):**
```bash
# Create restart trigger file
touch /home/morita/public_html/morita_backend/tmp/restart.txt
```

## Troubleshooting

### Bot Not Starting?

**Check logs in cPanel:**
1. Go to **Setup Node.js App**
2. Click **OPEN** (log file)
3. Look for errors about Discord bot

**Common issues:**

1. **Missing DISCORD_BOT_TOKEN**
   ```
   Error: Discord bot configuration is invalid
   ```
   **Fix:** Add `DISCORD_BOT_TOKEN` to `.env` or cPanel environment variables

2. **Invalid Token**
   ```
   Error: Invalid token
   ```
   **Fix:** Check your bot token in Discord Developer Portal

3. **Backend API Not Accessible**
   ```
   Error: Backend API health check failed
   ```
   **Fix:** Make sure backend API is running and accessible

### Bot Crashes?

The bot is designed to **not crash the backend**. If bot fails:
- ✅ Backend continues running
- ✅ Error is logged
- ✅ You can fix the issue and restart backend

### Check Bot Status

**In Discord:**
- Bot should show as online
- Try commands to verify it's working

**In Logs:**
- Look for: `"Discord bot started successfully"`
- Look for: `"Discord bot ready! Logged in as..."`

## Migration from PM2

If you were using PM2 before:

1. **Stop PM2 bot:**
   ```bash
   pm2 stop morita-bot
   pm2 delete morita-bot
   ```

2. **Restart backend in cPanel** - Bot will start automatically

3. **Verify:** Check Discord and logs

## Architecture

```
┌─────────────────────────────────────┐
│   cPanel Node.js App                │
│   (Single Process)                  │
├─────────────────────────────────────┤
│   Express Backend API               │
│   - HTTP Server (Port 3000)         │
│   - REST API Endpoints              │
│   - Database Connections            │
├─────────────────────────────────────┤
│   Discord Bot                       │
│   - Discord.js Client               │
│   - Slash Commands                  │
│   - Event Handlers                  │
│   - Channel Management              │
└─────────────────────────────────────┘
```

Both run in the same Node.js process, managed by cPanel.

## Advantages Over PM2

| Feature | Integrated (app.ts) | PM2 |
|---------|---------------------|-----|
| Setup | ✅ Simple | ❌ Complex |
| SSH Required | ❌ No | ✅ Yes |
| cPanel Integration | ✅ Perfect | ❌ Separate |
| Auto-Restart | ✅ Yes | ⚠️ Manual |
| Error Handling | ✅ Built-in | ⚠️ Manual |
| Logs | ✅ Same as backend | ⚠️ Separate |

## Summary

✅ **Bot is now integrated** - Starts automatically with backend  
✅ **No PM2 needed** - Everything managed by cPanel  
✅ **Error handling** - Bot failures won't crash backend  
✅ **Easy restart** - Just restart backend in cPanel  
✅ **Production ready** - Proper error handling and logging  

Just restart your backend in cPanel and the bot will start automatically! 🎉

