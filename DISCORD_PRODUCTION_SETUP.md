# 🚀 MORITA DISCORD BOT - PRODUCTION SETUP GUIDE

## 📋 STEP 1: CREATE DISCORD BOT

### 1.1 Go to Discord Developer Portal
1. Visit: https://discord.com/developers/applications
2. Click **"New Application"**
3. Name: `Morita Bot` (or your choice)
4. Click **Create**

### 1.2 Get Bot Token
1. Click **"Bot"** tab on left sidebar
2. Click **"Reset Token"** → Copy and save this token
3. **IMPORTANT:** Save this as `DISCORD_BOT_TOKEN` in your `.env` file

### 1.3 Enable Required Intents
Scroll down to **"Privileged Gateway Intents"** and enable:
- ✅ **PRESENCE INTENT**
- ✅ **SERVER MEMBERS INTENT**
- ✅ **MESSAGE CONTENT INTENT**

Click **Save Changes**

### 1.4 Get Application ID
1. Go to **"General Information"** tab
2. Copy **APPLICATION ID**
3. Save as `DISCORD_CLIENT_ID` in your `.env` file

### 1.5 Set Bot Permissions
1. Go to **"Bot"** tab
2. Scroll to **"Bot Permissions"**
3. Select these permissions:

**Text Permissions:**
- ✅ Send Messages
- ✅ Send Messages in Threads
- ✅ Create Public Threads
- ✅ Create Private Threads
- ✅ Embed Links
- ✅ Attach Files
- ✅ Add Reactions
- ✅ Use External Emojis
- ✅ Mention @everyone, @here, and All Roles
- ✅ Manage Messages
- ✅ Manage Threads
- ✅ Read Message History
- ✅ Use Slash Commands

**Channel Permissions:**
- ✅ View Channels
- ✅ Manage Channels

**Member Permissions:**
- ✅ Manage Roles

**General Permissions:**
- ✅ Administrator (recommended for simplicity)
  - **OR** select individual permissions above

### 1.6 Invite Bot to Server
1. Go to **"OAuth2"** → **"URL Generator"**
2. Select **SCOPES:**
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select **BOT PERMISSIONS:** (same as above or Administrator)
4. Copy generated URL at bottom
5. Open URL in browser → Select your server → Authorize

---

## 🏗️ STEP 2: CREATE DISCORD SERVER STRUCTURE

### 2.1 Create Roles

**Go to Server Settings → Roles → Create Role**

#### Role 1: Admin
- Name: `Admin`
- Color: Red `#E74C3C`
- Permissions: Administrator
- **Copy Role ID** → Save as `DISCORD_ADMIN_ROLE_ID`

#### Role 2: Support
- Name: `Support`
- Color: Blue `#3498DB`
- Permissions:
  - ✅ Manage Messages
  - ✅ Manage Threads
  - ✅ Manage Channels
  - ✅ Kick Members
  - ✅ View Channel
- **Copy Role ID** → Save as `DISCORD_SUPPORT_ROLE_ID`

#### Role 3: Workers
- Name: `Workers`
- Color: Green `#2ECC71`
- Permissions: Default
- **Copy Role ID** → Save as `DISCORD_WORKERS_ROLE_ID`

**How to copy Role ID:**
1. Enable Developer Mode: User Settings → Advanced → Developer Mode
2. Right-click role → Copy ID

---

### 2.2 Create Categories and Channels

## CATEGORY 1: 📢 INFORMATION
Create this category first, then create channels inside it.

**Channels:**

#### 1. 📢 announcements
- Type: Text
- Permissions:
  - @everyone: ❌ Send Messages, ✅ View Channel
  - Bot: ✅ Send Messages
- **Copy Channel ID** → Save as `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`

#### 2. 💰 pricing
- Type: Text
- Permissions:
  - @everyone: ❌ Send Messages, ✅ View Channel
  - Bot: ✅ Send Messages, Manage Messages
- **Copy Channel ID** → Save as `DISCORD_PRICING_CHANNEL_ID`

#### 3. 🧮 calculator
- Type: Text
- Permissions:
  - @everyone: ✅ Send Messages, View Channel
  - Bot: ✅ Send Messages, Manage Messages
- **Copy Channel ID** → Save as `DISCORD_CALCULATOR_CHANNEL_ID`

---

## CATEGORY 2: 🎫 CREATE TICKET
Create this category with these channels:

**Permissions for category:**
- @everyone: ✅ View Channel, ❌ Send Messages
- Bot: ✅ All permissions

**Copy Category ID** → Save as `DISCORD_CREATE_TICKET_CATEGORY_ID`

**Channels:**

#### 1. 🛒 purchase-services
- Type: Text
- Description: "Click button below to open ticket for purchasing services"
- **Copy Channel ID** → Save as `DISCORD_PURCHASE_SERVICES_CHANNEL_ID`

#### 2. 💰 purchase-gold
- Type: Text
- Description: "Click button below to open ticket for buying gold"
- **Copy Channel ID** → Save as `DISCORD_PURCHASE_GOLD_CHANNEL_ID`

#### 3. 💸 sell-gold
- Type: Text
- Description: "Click button below to open ticket for selling gold"
- **Copy Channel ID** → Save as `DISCORD_SELL_GOLD_CHANNEL_ID`

#### 4. 🔄 swap-crypto
- Type: Text
- Description: "Click button below to open ticket for crypto swap"
- **Copy Channel ID** → Save as `DISCORD_SWAP_CRYPTO_CHANNEL_ID`

---

## CATEGORY 3: 🎫 TICKETS (Active Tickets)
Create empty category for active tickets.

**Permissions:**
- @everyone: ❌ View Channel
- Admin: ✅ All permissions
- Support: ✅ All permissions
- Bot: ✅ All permissions

**Copy Category ID** → Save as `DISCORD_TICKETS_CATEGORY_ID`

**Note:** Ticket channels will be created automatically by bot (e.g., `ticket-0001`)

---

## CATEGORY 4: 🔒 CLOSED TICKETS
Create empty category for closed tickets.

**Permissions:**
- @everyone: ❌ View Channel
- Admin: ✅ View Channel
- Support: ✅ View Channel
- Bot: ✅ All permissions

**Copy Category ID** → Save as `DISCORD_CLOSED_TICKETS_CATEGORY_ID`

**Note:** Closed tickets moved here automatically (e.g., `closed-ticket-0001`)

---

## CATEGORY 5: 📦 ORDERS
Create empty category for order channels.

**Permissions:**
- @everyone: ❌ View Channel
- Workers: ❌ View Channel (will be added per channel)
- Admin: ✅ All permissions
- Support: ✅ All permissions
- Bot: ✅ All permissions

**Copy Category ID** → Save as `DISCORD_ORDERS_CATEGORY_ID`

**Note:** Order channels created automatically when jobs claimed

---

## CATEGORY 6: 💼 JOBS
Create this category for job claiming system.

**Channels:**

#### 1. 🔔 job-claiming
- Type: Text
- Description: "Available jobs are posted here. Click Claim to accept a job!"
- Permissions:
  - @everyone: ❌ Send Messages, ❌ View Channel
  - Workers: ✅ View Channel, ❌ Send Messages
  - Admin: ✅ All permissions
  - Bot: ✅ All permissions
- **Copy Channel ID** → Save as `DISCORD_JOB_CLAIMING_CHANNEL_ID`

---

## CATEGORY 7: 📊 LOGS (Admin Only)
Create this category for system logs.

**Permissions:**
- @everyone: ❌ View Channel
- Admin: ✅ View Channel
- Bot: ✅ Send Messages

**Channels:**

#### 1. 📋 bot-logs
- Type: Text
- Description: "Bot activity logs"
- **Copy Channel ID** → Save as `DISCORD_LOGS_CHANNEL_ID`

#### 2. 🎫 ticket-logs
- Type: Text
- Description: "Ticket open/close events"
- **Copy Channel ID** → Save as `DISCORD_TICKET_LOG_CHANNEL_ID`

---

## 📝 STEP 3: CONFIGURE ENVIRONMENT VARIABLES

Create/update your `.env` file with all these values:

```env
# ===================================
# DISCORD BOT CONFIGURATION
# ===================================

# Bot Credentials (from Discord Developer Portal)
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
DISCORD_GUILD_ID=your_server_id_here

# Role IDs (from Server Settings → Roles)
DISCORD_ADMIN_ROLE_ID=123456789012345678
DISCORD_SUPPORT_ROLE_ID=123456789012345678
DISCORD_WORKERS_ROLE_ID=123456789012345678

# Category IDs
DISCORD_CREATE_TICKET_CATEGORY_ID=123456789012345678
DISCORD_TICKETS_CATEGORY_ID=123456789012345678
DISCORD_CLOSED_TICKETS_CATEGORY_ID=123456789012345678
DISCORD_ORDERS_CATEGORY_ID=123456789012345678

# Channel IDs - Information
DISCORD_ANNOUNCEMENTS_CHANNEL_ID=123456789012345678
DISCORD_PRICING_CHANNEL_ID=123456789012345678
DISCORD_CALCULATOR_CHANNEL_ID=123456789012345678

# Channel IDs - Create Ticket Category
DISCORD_PURCHASE_SERVICES_CHANNEL_ID=123456789012345678
DISCORD_PURCHASE_GOLD_CHANNEL_ID=123456789012345678
DISCORD_SELL_GOLD_CHANNEL_ID=123456789012345678
DISCORD_SWAP_CRYPTO_CHANNEL_ID=123456789012345678

# Channel IDs - Jobs & Logs
DISCORD_JOB_CLAIMING_CHANNEL_ID=123456789012345678
DISCORD_LOGS_CHANNEL_ID=123456789012345678
DISCORD_TICKET_LOG_CHANNEL_ID=123456789012345678

# Bot Settings (Optional - has defaults)
BOT_PREFIX=!
EMBED_COLOR=#FFD700
BRAND_LOGO_URL=https://your-logo-url.com/logo.png

# API Settings
API_BASE_URL=http://localhost:3000
API_AUTH_TOKEN=your_secure_api_token_here

# Ticket Settings (Optional)
CLOSED_TICKET_ARCHIVE_AFTER_HOURS=72
```

**How to get Server ID (Guild ID):**
1. Enable Developer Mode in Discord
2. Right-click your server icon → Copy ID
3. Save as `DISCORD_GUILD_ID`

---

## 🎨 STEP 4: FINAL SERVER SETUP

### 4.1 Server Icon & Banner
1. Upload server icon (recommended: 512x512px)
2. Add server banner if you have boost level 2+

### 4.2 Verification Level
Server Settings → Moderation → Verification Level → **Medium** (recommended)

### 4.3 Bot Position
1. Go to Server Settings → Roles
2. Drag **Morita Bot** role above all user roles
3. This ensures bot can manage permissions properly

---

## ▶️ STEP 5: START THE BOT

### 5.1 Install Dependencies
```bash
cd /path/to/morita_backend
npm install
```

### 5.2 Setup Database
```bash
npx prisma generate
npx prisma db push
```

### 5.3 Start Bot
```bash
npm run dev:bot
```

### 5.4 Check Bot is Online
- Bot should show **Online** (green status) in Discord
- Check `#bot-logs` channel for startup messages

---

## ✅ STEP 6: INITIALIZE BOT COMMANDS

### 6.1 Setup Ticket Buttons
Run this command in Discord:
```
/setup-ticket-buttons
```

This will post buttons in all CREATE TICKET channels:
- purchase-services
- purchase-gold
- sell-gold
- swap-crypto

### 6.2 Test Commands
Try these commands to verify bot works:

```
/ping         - Check bot is responding
/wallet       - Check wallet system
/help         - See all commands
```

---

## 📊 COMPLETE CHANNEL STRUCTURE

Your server should look like this:

```
📢 INFORMATION
  ├─ 📢 announcements
  ├─ 💰 pricing
  └─ 🧮 calculator

🎫 CREATE TICKET
  ├─ 🛒 purchase-services
  ├─ 💰 purchase-gold
  ├─ 💸 sell-gold
  └─ 🔄 swap-crypto

🎫 TICKETS
  └─ (empty - tickets created automatically)

🔒 CLOSED TICKETS
  └─ (empty - closed tickets moved here)

📦 ORDERS
  └─ (empty - order channels created automatically)

💼 JOBS
  └─ 🔔 job-claiming

📊 LOGS
  ├─ 📋 bot-logs
  └─ 🎫 ticket-logs
```

---

## 🔑 COMPLETE ENVIRONMENT VARIABLES CHECKLIST

### Required (Bot won't start without these):
- [ ] `DISCORD_BOT_TOKEN`
- [ ] `DISCORD_CLIENT_ID`
- [ ] `DISCORD_GUILD_ID`

### Roles (Required for commands):
- [ ] `DISCORD_ADMIN_ROLE_ID`
- [ ] `DISCORD_SUPPORT_ROLE_ID`
- [ ] `DISCORD_WORKERS_ROLE_ID`

### Categories (Required for functionality):
- [ ] `DISCORD_CREATE_TICKET_CATEGORY_ID`
- [ ] `DISCORD_TICKETS_CATEGORY_ID`
- [ ] `DISCORD_CLOSED_TICKETS_CATEGORY_ID`
- [ ] `DISCORD_ORDERS_CATEGORY_ID`

### Channels (Required):
- [ ] `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`
- [ ] `DISCORD_PRICING_CHANNEL_ID`
- [ ] `DISCORD_CALCULATOR_CHANNEL_ID`
- [ ] `DISCORD_PURCHASE_SERVICES_CHANNEL_ID`
- [ ] `DISCORD_PURCHASE_GOLD_CHANNEL_ID`
- [ ] `DISCORD_SELL_GOLD_CHANNEL_ID`
- [ ] `DISCORD_SWAP_CRYPTO_CHANNEL_ID`
- [ ] `DISCORD_JOB_CLAIMING_CHANNEL_ID`
- [ ] `DISCORD_LOGS_CHANNEL_ID`
- [ ] `DISCORD_TICKET_LOG_CHANNEL_ID`

### API (Required):
- [ ] `API_BASE_URL`
- [ ] `API_AUTH_TOKEN`

---

## 🎯 QUICK SUMMARY

1. ✅ Create bot at Discord Developer Portal
2. ✅ Enable intents (Presence, Members, Message Content)
3. ✅ Invite bot to server with Administrator permission
4. ✅ Create 3 roles: Admin, Support, Workers
5. ✅ Create 7 categories + 14 channels
6. ✅ Copy all IDs to `.env` file
7. ✅ Start bot with `npm run dev:bot`
8. ✅ Run `/setup-ticket-buttons` command
9. ✅ Test with `/ping` and `/wallet`

---

## 🆘 TROUBLESHOOTING

### Bot is Offline
- Check `DISCORD_BOT_TOKEN` is correct
- Check bot has been invited to server
- Check `.env` file is in correct location

### Commands Not Working
- Check bot has Administrator permission
- Check slash commands are registered (wait 5 minutes after starting bot)
- Try kicking and re-inviting bot

### Can't Create Channels
- Check bot role is above other roles in Server Settings → Roles
- Check bot has "Manage Channels" permission
- Check category IDs are correct in `.env`

### Missing IDs
- Enable Developer Mode: User Settings → Advanced → Developer Mode
- Right-click on role/channel/category → Copy ID

### Permissions Issues
- Make sure bot role is positioned above Admin, Support, and Workers roles
- Check category permissions allow bot to manage channels
- Verify bot has Administrator permission

---

## 📞 SUPPORT

If you encounter any issues during setup:
1. Check bot logs in `#bot-logs` channel
2. Check backend console/terminal for error messages
3. Verify all environment variables are set correctly
4. Ensure bot has proper permissions

---

**Setup Complete!** 🎉

Your Morita Discord bot is now ready for production use.
