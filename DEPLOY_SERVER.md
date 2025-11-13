# 🚀 Deploy to Server (cPanel/VPS)

## ⚠️ IMPORTANT: You Need Both!

Your Discord bot **requires** the Backend API to work:

```
Discord Bot → calls → Backend API → reads → Database
```

If you only run the bot, service prices won't work!

## 📦 What to Deploy

1. **Backend API** (Port 3000) - Handles all data and calculations
2. **Discord Bot** - Connects to Discord and uses Backend API

## 🔧 Step-by-Step Deployment

### 1️⃣ Upload Files to Server

Upload your project to your server:
```bash
# On your server
cd /home/morita/public_html/morita_backend

# Or clone from git
git clone your-repo-url .
```

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Configure Environment

Create `.env` file on server:
```bash
nano .env
```

Add your production settings:
```env
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL="mysql://username:password@localhost:3306/morita_db"

# Discord Bot
DISCORD_BOT_TOKEN="your_production_bot_token"
DISCORD_CLIENT_ID="your_bot_client_id"
DISCORD_GUILD_ID="your_discord_server_id"

# API URL
API_BASE_URL="http://localhost:3000"

# Email
MAIL_HOST="mail.yourdomain.com"
MAIL_PORT=465
MAIL_USER="noreply@yourdomain.com"
MAIL_PASSWORD="your_email_password"

# JWT
JWT_SECRET="your-production-secret-key-here"
JWT_EXPIRES_IN="7d"
```

Save with `Ctrl+X`, then `Y`, then `Enter`

### 4️⃣ Build Project

```bash
npm run build
```

### 5️⃣ Run Database Migrations

```bash
npx prisma migrate deploy
```

### 6️⃣ Start with PM2

**Stop any existing processes first:**
```bash
pm2 stop all
pm2 delete all
```

**Start both Backend + Bot:**
```bash
pm2 start ecosystem.server.js
```

**Save PM2 configuration:**
```bash
pm2 save
```

**Auto-start on server reboot:**
```bash
pm2 startup
# Copy and run the command it gives you
```

### 7️⃣ Verify Everything is Running

```bash
pm2 status
```

You should see:
```
┌─────┬──────────────────┬─────────┬─────────┐
│ id  │ name             │ status  │ uptime  │
├─────┼──────────────────┼─────────┼─────────┤
│ 0   │ morita-backend   │ online  │ 5s      │
│ 1   │ morita-bot       │ online  │ 5s      │
└─────┴──────────────────┴─────────┴─────────┘
```

**Check logs:**
```bash
pm2 logs morita-backend
pm2 logs morita-bot
```

### 8️⃣ Test the Bot

In Discord, try:
```
!s agility 82-90
```

If it works, you'll see service prices! 🎉

## 🔍 Troubleshooting

### Problem: Bot shows "Service prices not found"

**Solution:**
```bash
# Check if backend is running
pm2 status

# Check backend logs for errors
pm2 logs morita-backend

# Restart backend
pm2 restart morita-backend
```

### Problem: "Cannot connect to database"

**Solution:**
```bash
# Check .env file
cat .env | grep DATABASE_URL

# Test database connection
npx prisma db pull

# Check MySQL is running
systemctl status mysql
```

### Problem: Bot not connecting to Discord

**Solution:**
```bash
# Check bot logs
pm2 logs morita-bot

# Verify bot token in .env
cat .env | grep DISCORD_BOT_TOKEN

# Restart bot
pm2 restart morita-bot
```

## 📊 Port Configuration

| Service | Port | Purpose |
|---------|------|---------|
| Backend API | 3000 | Internal API (bot uses this) |
| Discord Bot | - | Connects to Discord + Backend |

**Note:** Backend API only needs to be accessible from localhost (bot uses it internally)

## 🔄 Updating Your Server

When you make changes:

```bash
# 1. Pull latest code
git pull

# 2. Install any new dependencies
npm install

# 3. Rebuild
npm run build

# 4. Run migrations (if any)
npx prisma migrate deploy

# 5. Restart
pm2 restart all

# 6. Check status
pm2 status
pm2 logs
```

## ⚡ Quick Commands

```bash
# Start everything
pm2 start ecosystem.server.js

# Stop everything
pm2 stop all

# Restart everything
pm2 restart all

# Delete all processes
pm2 delete all

# View logs
pm2 logs

# View specific service logs
pm2 logs morita-backend
pm2 logs morita-bot

# Monitor in real-time
pm2 monit
```

## ✅ Deployment Checklist

- [ ] Project uploaded to server
- [ ] `npm install` completed
- [ ] `.env` file created with production values
- [ ] `npm run build` completed successfully
- [ ] Database migrations applied
- [ ] Both backend + bot started with PM2
- [ ] `pm2 save` executed
- [ ] `pm2 startup` configured
- [ ] Bot responds to commands in Discord
- [ ] Service prices display correctly

## 🆘 Still Having Issues?

1. Check PM2 logs: `pm2 logs`
2. Verify `.env` file has correct values
3. Ensure database is accessible
4. Make sure port 3000 is not blocked
5. Confirm Discord bot token is correct

## 📝 Files Overview

```
morita_backend/
├── .env                      # Production environment variables
├── ecosystem.server.js       # PM2 config (both backend + bot)
├── ecosystem.bot-only.js     # ❌ Don't use (bot only)
├── build/                    # Compiled code
│   ├── app.js               # Backend API entry
│   └── discord-bot/start.js # Bot entry
└── logs/                     # PM2 logs
    ├── backend-error.log
    ├── backend-out.log
    ├── bot-error.log
    └── bot-out.log
```

## 🎯 Remember

**The Discord bot NEEDS the Backend API to work!**
Always run both together using `ecosystem.server.js`
