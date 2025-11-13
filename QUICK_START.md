# 🚀 Quick Start - Multi-Environment Setup

## Step 1: Create Your Environment Files

Copy the example files and fill in your values:

```bash
# Development (localhost)
cp .env.development.example .env.development
# Edit .env.development with your local database and dev bot token

# Staging (server for client testing)
cp .env.staging.example .env.staging
# Edit .env.staging with staging database and staging bot token

# Production (live)
cp .env.example .env.production
# Edit .env.production with production database and production bot token
```

## Step 2: Create Discord Bots

Go to https://discord.com/developers/applications and create:

1. **"Morita Bot DEV"** → Use token in `.env.development`
2. **"Morita Bot STAGING"** → Use token in `.env.staging`
3. **"Morita Bot"** → Use token in `.env.production`

## Step 3: Run Your Environment

```bash
# Development (localhost)
pm2 start ecosystem.config.js --env development

# Staging (server)
pm2 start ecosystem.config.js --env staging

# Production (live)
pm2 start ecosystem.config.js --env production
```

## 📊 Quick Commands

```bash
# View status
pm2 status

# View logs
pm2 logs morita-backend
pm2 logs morita-bot

# Restart specific environment
pm2 restart all --env staging

# Stop all
pm2 stop all

# Delete all processes
pm2 delete all
```

## 🎯 Environment Summary

| Environment | Port | Purpose | Discord Bot |
|-------------|------|---------|-------------|
| **Development** | 3000 | Local testing | Dev Bot |
| **Staging** | 3001 | Client testing | Staging Bot |
| **Production** | 3000 | Live users | Production Bot |

## ✅ Checklist

- [ ] Created 3 Discord bots (dev, staging, production)
- [ ] Created `.env.development` with dev bot token
- [ ] Created `.env.staging` with staging bot token
- [ ] Created `.env.production` with production bot token
- [ ] Configured database for each environment
- [ ] Tested development environment locally
- [ ] Deployed staging for client testing
- [ ] Production is ready for launch

## 🔥 Common Use Cases

### Local Development
```bash
# Start development
pm2 start ecosystem.config.js --env development
pm2 logs
```

### Client Testing on Server
```bash
# On your server, start staging
pm2 start ecosystem.config.js --env staging
pm2 save
pm2 startup
```

### Production Deployment
```bash
# Deploy to production
git pull
npm install
npm run build
pm2 restart all --env production
```

## 📞 Need Help?

Read the full guide: [ENVIRONMENTS.md](./ENVIRONMENTS.md)
