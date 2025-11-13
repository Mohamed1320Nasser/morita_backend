# PM2 Discord Bot Configuration Fix

## Problem Fixed

PM2 doesn't support the `env_file` option that was in `ecosystem.bot-only.js`. This caused the Discord bot to fail loading environment variables from `.env` file when running via PM2.

## Changes Made

### 1. Fixed `ecosystem.bot-only.js`

- ✅ Removed invalid `env_file: '.env'` option (PM2 doesn't support this)
- ✅ Added `cwd` option to ensure PM2 runs from project root directory
- ✅ Added comments explaining how .env loading works

### 2. Enhanced `src/discord-bot/start.ts`

- ✅ Added explicit path resolution to load `.env` from project root
- ✅ Added fallback to `process.cwd()` if explicit path fails
- ✅ Added logging for debugging .env loading issues

### 3. Updated `package.json`

- ✅ Added `start:pm2:bot` script for easy PM2 bot startup
- ✅ Added `restart:pm2:bot` script for easy bot restart
- ✅ Added `logs:pm2:bot` script for easy log viewing

## How It Works Now

1. **PM2 Configuration**: Sets `cwd` to project root, ensuring correct working directory
2. **Dotenv Loading**: `start.ts` explicitly loads `.env` from project root using `resolve(__dirname, '../../.env')`
3. **Fallback**: If explicit path fails, tries loading from `process.cwd()/.env` (which PM2 sets via `cwd` option)

## Testing the Fix

### 1. Build the project

```bash
npm run build
```

### 2. Make sure .env file exists

```bash
# Verify .env file is in project root
ls -la .env
```

### 3. Start bot with PM2

```bash
# Stop any existing bot
pm2 stop morita-bot
pm2 delete morita-bot

# Start bot using the fixed config
npm run start:pm2:bot

# Or directly:
pm2 start ecosystem.bot-only.js
```

### 4. Check bot status

```bash
pm2 status
# Should show: morita-bot | online
```

### 5. View logs

```bash
npm run logs:pm2:bot

# Or directly:
pm2 logs morita-bot
```

### 6. Verify bot connected

Look for these messages in the logs:

- ✅ "Discord bot startup script loaded"
- ✅ "Discord bot ready! Logged in as YourBot#1234"
- ✅ No errors about missing environment variables

### 7. Test in Discord

Try a bot command in your Discord server to verify it's working.

## Troubleshooting

### Bot still not loading .env?

1. **Check .env file location**:

    ```bash
    # Should be in project root
    pwd
    ls -la .env
    ```

2. **Check PM2 working directory**:

    ```bash
    pm2 describe morita-bot
    # Look for "cwd" field - should point to project root
    ```

3. **Check logs for .env loading errors**:

    ```bash
    pm2 logs morita-bot --lines 50
    # Look for warnings about .env file loading
    ```

4. **Verify .env file has correct values**:
    ```bash
    # Check if DISCORD_BOT_TOKEN is set
    grep DISCORD_BOT_TOKEN .env
    ```

### Bot connects but commands don't work?

- Check API connection: Verify `API_BASE_URL` in `.env` is correct
- Check backend is running: `curl https://api.morita.vip/health`
- Check bot logs for API errors

## Quick Commands Reference

```bash
# Start bot
npm run start:pm2:bot

# Restart bot
npm run restart:pm2:bot

# View logs
npm run logs:pm2:bot

# Stop bot
pm2 stop morita-bot

# Delete bot process
pm2 delete morita-bot

# Save PM2 config (for auto-start on reboot)
pm2 save
pm2 startup
```

## Next Steps

If PM2 configuration still doesn't work, we can try the alternative approach:

- Import bot in `app.ts` so it runs with the backend API
- This would make bot and API run in the same process
