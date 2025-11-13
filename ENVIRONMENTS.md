# 🌍 Multi-Environment Setup Guide

This project supports three environments: **Development**, **Staging**, and **Production**.

## 📋 Environment Files

Create these three environment files in the project root:

### 1. `.env.development` (Local Development)
```env
# Development Environment - Localhost
NODE_ENV=development
PORT=3000

# Database - Local MySQL
DATABASE_URL="mysql://root:password@localhost:3306/morita_dev"

# Discord Bot - Development Bot
DISCORD_BOT_TOKEN="your_dev_bot_token_here"
DISCORD_CLIENT_ID="your_dev_bot_client_id"
DISCORD_GUILD_ID="your_dev_discord_server_id"

# API URLs
API_BASE_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3001"

# Email (can use test credentials)
MAIL_HOST="smtp.mailtrap.io"
MAIL_PORT=2525
MAIL_USER="your_test_email"
MAIL_PASSWORD="your_test_password"

# Other configs...
```

### 2. `.env.staging` (Server - Client Testing)
```env
# Staging Environment - Server for client testing
NODE_ENV=staging
PORT=3001

# Database - Staging Database
DATABASE_URL="mysql://user:password@staging-db-host:3306/morita_staging"

# Discord Bot - STAGING BOT (Different from production!)
DISCORD_BOT_TOKEN="your_staging_bot_token_here"
DISCORD_CLIENT_ID="your_staging_bot_client_id"
DISCORD_GUILD_ID="your_staging_discord_server_id"

# API URLs
API_BASE_URL="https://staging-api.yourdomain.com"
FRONTEND_URL="https://staging.yourdomain.com"

# Email - Real email for testing
MAIL_HOST="mail.yourdomain.com"
MAIL_PORT=465
MAIL_USER="staging@yourdomain.com"
MAIL_PASSWORD="your_staging_email_password"

# Other configs...
```

### 3. `.env.production` (Live Production)
```env
# Production Environment - Live Server
NODE_ENV=production
PORT=3000

# Database - Production Database
DATABASE_URL="mysql://user:password@prod-db-host:3306/morita_production"

# Discord Bot - PRODUCTION BOT
DISCORD_BOT_TOKEN="your_production_bot_token_here"
DISCORD_CLIENT_ID="your_production_bot_client_id"
DISCORD_GUILD_ID="your_production_discord_server_id"

# API URLs
API_BASE_URL="https://api.yourdomain.com"
FRONTEND_URL="https://yourdomain.com"

# Email - Production email
MAIL_HOST="mail.yourdomain.com"
MAIL_PORT=465
MAIL_USER="noreply@yourdomain.com"
MAIL_PASSWORD="your_production_email_password"

# Other configs...
```

## 🤖 Discord Bot Setup

### Create 3 Separate Discord Bots:

1. **Development Bot** (for local testing)
   - Go to: https://discord.com/developers/applications
   - Create a new application: "Morita Bot DEV"
   - Get the token → Use in `.env.development`
   - Invite to your development Discord server

2. **Staging Bot** (for client testing)
   - Create another application: "Morita Bot STAGING"
   - Get the token → Use in `.env.staging`
   - Invite to your staging Discord server (for client testing)

3. **Production Bot** (live)
   - Create application: "Morita Bot"
   - Get the token → Use in `.env.production`
   - Invite to your production Discord server

## 🚀 Running Different Environments

### Development (Localhost)
```bash
# Start development environment
pm2 start ecosystem.config.js --env development

# Or use npm scripts
npm run dev
```

### Staging (Server - Client Testing)
```bash
# On your staging server
pm2 start ecosystem.config.js --env staging

# Check status
pm2 status

# View logs
pm2 logs morita-backend
pm2 logs morita-bot
```

### Production (Live)
```bash
# On your production server
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on server reboot
pm2 startup
```

## 📊 Environment Comparison

| Feature | Development | Staging | Production |
|---------|------------|---------|------------|
| **Purpose** | Local dev & testing | Client testing | Live users |
| **Discord Bot** | Dev Bot | Staging Bot | Production Bot |
| **Database** | Local MySQL | Staging DB | Production DB |
| **Port** | 3000 | 3001 | 3000 |
| **Error Reporting** | Console only | Logs + Email | Full monitoring |
| **Cache** | Disabled | Enabled | Enabled |

## 🔄 Switching Environments

```bash
# Stop all
pm2 stop all

# Start specific environment
pm2 start ecosystem.config.js --env development
pm2 start ecosystem.config.js --env staging
pm2 start ecosystem.config.js --env production

# Restart with environment
pm2 restart morita-backend --env staging
pm2 restart morita-bot --env staging
```

## 📝 Best Practices

1. **Never commit `.env.*` files** - They contain sensitive data
2. **Use different Discord bots** for each environment
3. **Keep staging data separate** from production
4. **Test on staging** before deploying to production
5. **Use staging for client demos** and testing
6. **Monitor logs** for each environment separately

## 🔐 Security Checklist

- [ ] All `.env.*` files added to `.gitignore`
- [ ] Different bot tokens for each environment
- [ ] Different database credentials
- [ ] Staging uses separate Discord server
- [ ] Production secrets are strong and unique
- [ ] Email credentials are environment-specific

## 🛠️ Troubleshooting

### Check which environment is running:
```bash
pm2 status
pm2 env morita-backend
```

### View environment-specific logs:
```bash
pm2 logs morita-backend
pm2 logs morita-bot
```

### Reset and restart:
```bash
pm2 delete all
pm2 start ecosystem.config.js --env staging
```

## 📞 Need Help?

If you encounter issues:
1. Check `pm2 logs` for errors
2. Verify `.env.*` files exist and are correct
3. Ensure Discord bot tokens are valid
4. Check database connectivity
5. Verify ports are not already in use
