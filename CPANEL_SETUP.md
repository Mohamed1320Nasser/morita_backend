# 🎯 cPanel Setup Guide

## 📋 Your Current Setup

Based on your cPanel configuration:

- **Backend API**: Running via cPanel Node.js App
  - URL: `https://api.morita.vip`
  - Application root: `public_html/morita_backend`
  - Startup file: `build/app.js`
  - Node.js: 20.19.4
  - Mode: Production

- **Discord Bot**: Running via PM2
  - Needs to connect to the Backend API above

## ✅ Complete Setup Steps

### 1️⃣ Backend API (cPanel Node.js App) - DONE ✓

Your backend is already running via cPanel. Good!

Make sure in cPanel Node.js App settings:
- ✅ Application root: `public_html/morita_backend`
- ✅ Application URL: `api.morita.vip`
- ✅ Application startup file: `build/app.js`
- ✅ Node.js version: 20.19.4 (recommended)
- ✅ Application mode: Production

### 2️⃣ Environment Variables (cPanel)

In cPanel Node.js App, add these environment variables:

**Click "Run NPM Install" first, then add variables:**

```
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=mysql://username:password@localhost:3306/morita_db

# Discord (not needed for API, but good to have)
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_server_id

# JWT
JWT_SECRET=your-production-secret-key
JWT_EXPIRES_IN=7d

# Email
MAIL_HOST=mail.yourdomain.com
MAIL_PORT=465
MAIL_USER=noreply@yourdomain.com
MAIL_PASSWORD=your_password
EMAIL=noreply@yourdomain.com
```

**After adding variables, click "RESTART" in cPanel**

### 3️⃣ Discord Bot (PM2)

**SSH into your server:**

```bash
cd /home/morita/public_html/morita_backend

# Stop any existing bot
pm2 stop all
pm2 delete all

# Start bot with correct API URL
pm2 start ecosystem.bot-only.js

# Save PM2 config
pm2 save

# Auto-start on reboot
pm2 startup
```

### 4️⃣ Verify Setup

**Check Backend API:**
```bash
curl https://api.morita.vip/health
# Should return: {"status":"ok"}
```

**Check Discord Bot:**
```bash
pm2 status
# Should show: morita-bot | online

pm2 logs morita-bot
# Should show: Bot logged in as YourBot#1234
```

**Test in Discord:**
```
!s agility 82-90
```

## 🔄 How It Works

```
Discord User
    ↓
Discord Bot (PM2)
    ↓
    → Calls: https://api.morita.vip/api/pricing/...
         ↓
    Backend API (cPanel Node.js App)
         ↓
    MySQL Database
```

## 🛠️ Common Tasks

### Restart Backend API
In cPanel:
1. Go to "Setup Node.js App"
2. Click on "api.morita.vip"
3. Click "RESTART"

Or via SSH:
```bash
# Find the PM2 process for backend (if any)
pm2 list

# Or restart via cPanel command
touch /home/morita/public_html/morita_backend/tmp/restart.txt
```

### Restart Discord Bot
```bash
pm2 restart morita-bot
```

### Update Code
```bash
cd /home/morita/public_html/morita_backend

# Pull latest changes
git pull

# Install dependencies
npm install

# Build
npm run build

# Restart backend (in cPanel click RESTART)
# Or create restart trigger:
touch tmp/restart.txt

# Restart bot
pm2 restart morita-bot
```

### View Logs

**Backend API logs (cPanel):**
- cPanel → Setup Node.js App → Click "OPEN" log file

**Discord Bot logs:**
```bash
pm2 logs morita-bot
pm2 logs morita-bot --lines 100
```

## 📊 File Structure

```
/home/morita/public_html/morita_backend/
├── .env                          # Environment variables
├── build/
│   ├── app.js                   # Backend API (runs via cPanel)
│   └── discord-bot/start.js     # Discord Bot (runs via PM2)
├── ecosystem.bot-only.js        # PM2 config for bot
├── logs/
│   ├── bot-error.log           # Bot error logs
│   └── bot-out.log             # Bot output logs
└── tmp/
    └── restart.txt             # Touch this to restart cPanel app
```

## ⚠️ Important Notes

1. **Backend API** runs via cPanel Node.js App
   - Restarts automatically on file changes
   - Managed by cPanel
   - URL: https://api.morita.vip

2. **Discord Bot** runs via PM2
   - Needs manual restart after code changes
   - Connects to Backend API at https://api.morita.vip
   - Auto-restarts if it crashes

3. **Don't run Backend API with PM2**
   - cPanel already manages it
   - Running both will cause port conflicts

## 🔍 Troubleshooting

### Problem: Bot says "Cannot connect to API"

**Check:**
```bash
# Test if backend is accessible
curl https://api.morita.vip/health

# Check bot logs
pm2 logs morita-bot

# Verify API_BASE_URL in ecosystem.bot-only.js
cat ecosystem.bot-only.js | grep API_BASE_URL
```

**Fix:**
```bash
# Edit ecosystem.bot-only.js
nano ecosystem.bot-only.js
# Make sure API_BASE_URL is: https://api.morita.vip

# Restart bot
pm2 restart morita-bot
```

### Problem: Backend API not responding

**In cPanel:**
1. Go to Setup Node.js App
2. Click "RESTART"
3. Check logs for errors

**Via SSH:**
```bash
# Check if process is running
ps aux | grep node

# Create restart trigger
touch /home/morita/public_html/morita_backend/tmp/restart.txt
```

### Problem: Database connection failed

**Check .env or cPanel environment variables:**
```bash
# In cPanel, verify DATABASE_URL is correct
# Format: mysql://user:pass@localhost:3306/database_name

# Test database connection
cd /home/morita/public_html/morita_backend
npx prisma db pull
```

## ✅ Quick Checklist

- [ ] Backend API running in cPanel (https://api.morita.vip)
- [ ] Environment variables set in cPanel Node.js App
- [ ] Backend API responds to: `curl https://api.morita.vip/health`
- [ ] Discord bot running via PM2: `pm2 status`
- [ ] Bot connects to API (check `pm2 logs morita-bot`)
- [ ] Bot responds to commands in Discord
- [ ] Service prices display correctly

## 🚀 Quick Commands Reference

```bash
# Check what's running
pm2 status

# View bot logs
pm2 logs morita-bot

# Restart bot
pm2 restart morita-bot

# Stop bot
pm2 stop morita-bot

# Delete bot process
pm2 delete morita-bot

# Start bot again
pm2 start ecosystem.bot-only.js

# Save PM2 config
pm2 save

# Test backend API
curl https://api.morita.vip/health
```

## 📞 Need Help?

1. Check cPanel Node.js App logs
2. Check bot logs: `pm2 logs morita-bot`
3. Verify backend is accessible: `curl https://api.morita.vip/health`
4. Check Discord bot token is correct
5. Verify database connection in .env
