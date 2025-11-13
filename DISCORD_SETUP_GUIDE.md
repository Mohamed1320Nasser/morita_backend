# Discord Bot Setup Guide - Quick Reference

## 1. Create Discord Application & Bot

### Step 1: Create Application

1. Go to https://discord.com/developers/applications
2. Click **"New Application"**
3. Give it a name (e.g., "Morita Bot")
4. Click **"Create"**

### Step 2: Create Bot

1. In your application, go to **"Bot"** tab (left sidebar)
2. Click **"Add Bot"** → **"Yes, do it!"**
3. **IMPORTANT:** Under "Token", click **"Reset Token"** or **"Copy"** to get your bot token
    - ⚠️ **Save this token immediately** - you'll need it for `.env` file
    - This is your `DISCORD_BOT_TOKEN`

### Step 3: Get Client ID

1. Go to **"General Information"** tab
2. Copy the **"Application ID"** - this is your `DISCORD_CLIENT_ID`

### Step 4: Get Guild (Server) ID

1. In Discord, enable Developer Mode:
    - Settings → Advanced → Developer Mode (ON)
2. Right-click your Discord server → **"Copy Server ID"**
    - This is your `DISCORD_GUILD_ID`

---

## 2. Set Bot Permissions

### In Discord Developer Portal:

1. Go to **"Bot"** tab
2. Under **"Privileged Gateway Intents"**, enable:
    - ✅ **MESSAGE CONTENT INTENT** (Required for reading messages)
    - ✅ **SERVER MEMBERS INTENT** (If you need member info)

### Bot Permissions (OAuth2 URL Generator):

1. Go to **"OAuth2"** → **"URL Generator"**
2. Select scopes:
    - ✅ `bot`
    - ✅ `applications.commands` (for slash commands)
3. Select bot permissions:
    - ✅ **Read Messages/View Channels**
    - ✅ **Send Messages**
    - ✅ **Embed Links**
    - ✅ **Attach Files**
    - ✅ **Read Message History**
    - ✅ **Manage Channels** (if creating channels)
    - ✅ **Manage Messages** (if needed)
    - ✅ **Manage Roles** (if assigning roles)
4. Copy the generated URL at the bottom
5. Open URL in browser to invite bot to your server

---

## 3. Setup .env File

### Step 1: Copy Example File

```bash
cd morita_backend
cp discord-bot.env.example .env
```

### Step 2: Fill Required Values

Open `.env` and update these **REQUIRED** values:

```env
# REQUIRED - Get from Discord Developer Portal
DISCORD_BOT_TOKEN="your-bot-token-from-step-2"
DISCORD_CLIENT_ID="your-application-id-from-step-3"
DISCORD_GUILD_ID="your-server-id-from-step-4"

# REQUIRED - Your backend API
API_BASE_URL="http://localhost:3000"
API_AUTH_TOKEN="your-api-auth-token-if-needed"
```

### Step 3: Optional Values (Get IDs from Discord)

To get Channel/Role IDs:

1. Enable Developer Mode (Settings → Advanced → Developer Mode)
2. Right-click channel/role → **"Copy ID"**

```env
# Optional - Get by right-clicking in Discord (with Developer Mode ON)
DISCORD_WORKERS_ROLE_ID="right-click-role-copy-id"
DISCORD_ADMIN_ROLE_ID="right-click-role-copy-id"
DISCORD_SUPPORT_ROLE_ID="right-click-role-copy-id"
DISCORD_ORDERS_CATEGORY_ID="right-click-category-copy-id"
DISCORD_LOGS_CHANNEL_ID="right-click-channel-copy-id"
DISCORD_ANNOUNCEMENTS_CHANNEL_ID="right-click-channel-copy-id"
DISCORD_PRICING_CHANNEL_ID="right-click-channel-copy-id"
```

---

## 4. How to Access .env Data in Code

Your code already uses `dotenv` to load environment variables:

```typescript
import { config } from "dotenv";
config(); // Loads .env file

// Access values:
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
```

**In your project**, the config is already set up in:

- `src/discord-bot/config/discord.config.ts` - Reads from `process.env.*`

---

## Quick Checklist

- [ ] Created Discord Application
- [ ] Created Bot and copied token
- [ ] Enabled MESSAGE CONTENT INTENT
- [ ] Copied Client ID (Application ID)
- [ ] Copied Guild ID (Server ID)
- [ ] Generated invite URL with permissions
- [ ] Invited bot to server
- [ ] Created `.env` file from `discord-bot.env.example`
- [ ] Filled all required values in `.env`
- [ ] Bot is online and responding

---

## Troubleshooting

**Bot not connecting?**

- Check `DISCORD_BOT_TOKEN` is correct
- Make sure token doesn't have extra spaces/quotes

**Bot can't read messages?**

- Enable **MESSAGE CONTENT INTENT** in Developer Portal → Bot tab

**Commands not working?**

- Make sure bot has `applications.commands` scope when invited
- Check bot has proper permissions in your server

**Can't find IDs?**

- Enable Developer Mode: Settings → Advanced → Developer Mode
- Right-click → Copy ID
