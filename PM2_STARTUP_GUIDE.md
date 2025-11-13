# How to Make Discord Bot Always Run with PM2

## Quick Start

### Option 1: Direct PM2 Start (Recommended - if ecosystem file doesn't work)

If PM2 shows process as `ecosystem.bot-only` instead of `morita-bot`, use this:

```bash
cd /home/morita/public_html/morita_backend
./start-bot-direct.sh
```

Or:
```bash
npm run start:pm2:bot:direct
```

This starts the bot directly without using the ecosystem file.

### Option 2: Ecosystem File Start

Try this first, but if PM2 shows wrong process name, use Option 1:

```bash
cd /home/morita/public_html/morita_backend
./start-bot-pm2.sh
```

Or:
```bash
npm run start:pm2:bot:setup
```

This script will:
1. ✅ Create `bot-logs/` directory if needed
2. ✅ Verify `.env` file exists
3. ✅ Build project if needed
4. ✅ Stop old PM2 processes
5. ✅ Start bot with PM2
6. ✅ Show status and logs

---

## Manual Setup (Step by Step)

### 1. Create bot-logs Directory

```bash
cd /home/morita/public_html/morita_backend
mkdir -p bot-logs
```

**Why:** PM2 needs this directory to exist before it can write log files.

### 2. Build the Project

```bash
npm run build
```

**Why:** PM2 runs the compiled JavaScript files from `build/` directory.

### 3. Stop Old PM2 Processes

```bash
pm2 stop morita-bot
pm2 delete morita-bot
```

**Why:** Clean up any old/corrupted processes.

### 4. Start Bot with PM2

```bash
pm2 start ecosystem.bot-only.js
```

**Why:** This reads the PM2 config and starts the bot properly.

### 5. Verify It's Running

```bash
pm2 status
```

You should see:
```
┌─────┬─────────────┬─────────┬─────────┬──────────┐
│ id  │ name        │ status  │ cpu     │ memory   │
├─────┼─────────────┼─────────┼─────────┼──────────┤
│ 0   │ morita-bot  │ online  │ 0%      │ 45.2mb   │
└─────┴─────────────┴─────────┴─────────┴──────────┘
```

### 6. View Logs

```bash
pm2 logs morita-bot
```

You should see:
- `[BOT-START] Starting Discord bot...`
- `[BOT-START] Successfully loaded .env from explicit path`
- `Discord bot ready! Logged in as YourBot#1234`

---

## Make Bot Start Automatically on Server Reboot

### Step 1: Save PM2 Configuration

```bash
pm2 save
```

This saves the current PM2 process list.

### Step 2: Setup PM2 Startup Script

```bash
pm2 startup
```

This will output a command like:
```
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u morita --hp /home/morita
```

**Copy and run that command** (it will be different for your system).

### Step 3: Verify Auto-Start

```bash
# Reboot server or simulate:
pm2 kill
pm2 resurrect

# Check if bot is running:
pm2 status
```

---

## Common Commands

```bash
# Check bot status
pm2 status morita-bot

# View live logs
pm2 logs morita-bot

# View last 50 lines
pm2 logs morita-bot --lines 50

# Restart bot
pm2 restart morita-bot

# Stop bot
pm2 stop morita-bot

# Start bot (if stopped)
pm2 start morita-bot

# Delete bot process
pm2 delete morita-bot

# View all PM2 processes
pm2 list

# Monitor resources
pm2 monit
```

---

## Troubleshooting

### PM2 Shows Wrong Process Name (`ecosystem.bot-only` instead of `morita-bot`)?

**Problem:** PM2 is treating the ecosystem file as a script instead of reading the config.

**Solution:** Use the direct startup method:
```bash
./start-bot-direct.sh
# or
npm run start:pm2:bot:direct
```

This bypasses the ecosystem file and starts the bot directly with all PM2 options specified.

### Bot Not Starting?

1. **Check logs:**
   ```bash
   pm2 logs morita-bot --lines 100
   ```

2. **Check if bot-logs directory exists:**
   ```bash
   ls -la bot-logs/
   ```

3. **Check .env file:**
   ```bash
   ls -la .env
   grep DISCORD_BOT_TOKEN .env
   ```

4. **Try running directly first:**
   ```bash
   node build/discord-bot/start.js
   ```
   If this works, the issue is with PM2 config.

### Bot Keeps Restarting?

Check error logs:
```bash
pm2 logs morita-bot --err --lines 50
cat bot-logs/bot-error.log
```

Common causes:
- Missing `.env` file
- Invalid `DISCORD_BOT_TOKEN`
- Backend API not accessible
- Database connection issues

### PM2 Shows Wrong Process Name?

If PM2 shows `ecosystem.bot-only` instead of `morita-bot`:

```bash
pm2 delete all
pm2 start ecosystem.bot-only.js
pm2 status
```

### No Logs in PM2?

1. **Check log files directly:**
   ```bash
   cat bot-logs/bot-error.log
   cat bot-logs/bot-out.log
   ```

2. **Check if directory exists:**
   ```bash
   ls -la bot-logs/
   ```

3. **Check PM2 logs:**
   ```bash
   pm2 logs morita-bot --lines 100
   ```

---

## Verify Bot is Working

### In Discord:
- Bot should appear online (green dot)
- Try a command: `/help` or `!s agility 82-90`
- Bot should respond

### In PM2:
```bash
pm2 status morita-bot
# Should show: status: online, uptime: X minutes
```

### In Logs:
```bash
pm2 logs morita-bot
# Should show: "Discord bot ready! Logged in as..."
```

---

## Summary

**To make bot always run:**

1. ✅ Use `./start-bot-pm2.sh` script (easiest)
2. ✅ Or follow manual steps above
3. ✅ Run `pm2 save` and `pm2 startup` for auto-start on reboot
4. ✅ Verify with `pm2 status` and `pm2 logs morita-bot`

The bot will now:
- ✅ Run continuously via PM2
- ✅ Auto-restart if it crashes
- ✅ Start automatically on server reboot
- ✅ Log everything to `bot-logs/` directory
- ✅ Show logs in PM2 for easy debugging

