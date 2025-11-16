# Tools to Keep Discord Bot Always Running

## Available Options

### 1. ✅ **Integrated in app.ts** (Current - RECOMMENDED for cPanel)

**How it works:**

- Bot starts automatically with backend
- Both run in same process
- Managed by cPanel Node.js App

**Pros:**

- ✅ Simplest - no extra tools needed
- ✅ Auto-restart with backend
- ✅ No SSH required
- ✅ Works with cPanel

**Cons:**

- ❌ Can't restart bot independently
- ❌ If backend crashes, bot crashes

**Setup:**
Already done! Just restart backend in cPanel.

---

### 2. **PM2** (Process Manager)

**What it is:**

- Production process manager for Node.js
- Keeps apps running, auto-restarts on crash

**How to use:**

```bash
# Install PM2 globally
npm install -g pm2

# Start bot
pm2 start build/discord-bot/start.js --name morita-bot

# Make it start on server reboot
pm2 startup
pm2 save

# View logs
pm2 logs morita-bot

# Restart
pm2 restart morita-bot
```

**Pros:**

- ✅ Auto-restart on crash
- ✅ Auto-start on server reboot
- ✅ Good logging
- ✅ Process monitoring

**Cons:**

- ❌ Requires SSH access
- ❌ Separate from cPanel management
- ❌ You had issues with ecosystem file parsing

**Best for:** VPS/dedicated servers with SSH access

---

### 3. **Forever** (Alternative to PM2)

**What it is:**

- Simple CLI tool to keep Node.js scripts running

**How to use:**

```bash
# Install
npm install -g forever

# Start bot
forever start build/discord-bot/start.js

# List running processes
forever list

# Stop
forever stop build/discord-bot/start.js

# View logs
forever logs build/discord-bot/start.js
```

**Pros:**

- ✅ Simple to use
- ✅ Auto-restart on crash
- ✅ Lightweight

**Cons:**

- ❌ Requires SSH access
- ❌ Less features than PM2
- ❌ No built-in clustering

**Best for:** Simple setups, alternative to PM2

---

### 4. **nodemon** (Development Only)

**What it is:**

- Auto-restarts on file changes
- **NOT for production** - development tool only

**How to use:**

```bash
# Install
npm install -g nodemon

# Run bot
nodemon build/discord-bot/start.js
```

**Pros:**

- ✅ Auto-restart on code changes
- ✅ Great for development

**Cons:**

- ❌ NOT for production
- ❌ Watches files (wastes resources)
- ❌ Not designed for always-on

**Best for:** Local development only

---

### 5. **systemd** (Linux Service)

**What it is:**

- Linux system service manager
- Built into most Linux servers

**How to use:**
Create service file: `/etc/systemd/system/morita-bot.service`

```ini
[Unit]
Description=Morita Discord Bot
After=network.target

[Service]
Type=simple
User=morita
WorkingDirectory=/home/morita/public_html/morita_backend
ExecStart=/usr/bin/node build/discord-bot/start.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
# Enable service
sudo systemctl enable morita-bot

# Start service
sudo systemctl start morita-bot

# Check status
sudo systemctl status morita-bot

# View logs
sudo journalctl -u morita-bot -f
```

**Pros:**

- ✅ Native Linux solution
- ✅ Auto-start on boot
- ✅ System-level management

**Cons:**

- ❌ Requires root/sudo access
- ❌ More complex setup
- ❌ May not work with cPanel

**Best for:** Dedicated servers, VPS with root access

---

### 6. **cPanel Node.js App** (Separate App)

**What it is:**

- Create second Node.js App in cPanel
- Bot runs as separate app

**How to use:**

1. Go to **cPanel → Setup Node.js App**
2. Click **"Create Application"**
3. Set:
    - Application root: `public_html/morita_backend`
    - Application URL: `bot.morita.vip` (or any subdomain)
    - Startup file: `build/discord-bot/start.js`
4. Add environment variables
5. Start app

**Pros:**

- ✅ Managed via cPanel UI
- ✅ No SSH needed
- ✅ Independent from backend

**Cons:**

- ❌ Two apps to manage
- ❌ More resources used
- ❌ Some hosts limit Node.js apps

**Best for:** cPanel hosting, need independent restart

---

### 7. **node directly** (Not Recommended)

**What it is:**

- Just run `node build/discord-bot/start.js`
- Process stops when terminal closes

**Why NOT recommended:**

- ❌ Stops when terminal closes
- ❌ No auto-restart on crash
- ❌ No auto-start on reboot
- ❌ Not production-ready

**Only use for:** Quick testing

---

## Comparison Table

| Tool                    | Auto-Restart | Auto-Start on Boot | cPanel Compatible | SSH Required | Best For                 |
| ----------------------- | ------------ | ------------------ | ----------------- | ------------ | ------------------------ |
| **Integrated (app.ts)** | ✅ Yes       | ✅ Yes             | ✅ Perfect        | ❌ No        | **cPanel (RECOMMENDED)** |
| **PM2**                 | ✅ Yes       | ✅ Yes             | ⚠️ Separate       | ✅ Yes       | VPS/SSH access           |
| **Forever**             | ✅ Yes       | ⚠️ Manual          | ⚠️ Separate       | ✅ Yes       | Simple SSH setup         |
| **nodemon**             | ✅ Yes       | ❌ No              | ❌ No             | ✅ Yes       | Development only         |
| **systemd**             | ✅ Yes       | ✅ Yes             | ⚠️ May conflict   | ✅ Yes       | Dedicated servers        |
| **cPanel App**          | ✅ Yes       | ✅ Yes             | ✅ Perfect        | ❌ No        | cPanel, independent      |
| **node direct**         | ❌ No        | ❌ No              | ❌ No             | ✅ Yes       | Testing only             |

---

## 🏆 Recommendation for Your Setup

### **Option 1: Integrated in app.ts** ⭐ BEST

**Why:**

- You're using cPanel
- Simplest solution
- Already implemented
- No extra tools needed

**How:**

- Just restart backend in cPanel
- Bot starts automatically
- Done!

---

### **Option 2: Separate cPanel Node.js App**

**If you need:**

- Independent bot restart
- Separate monitoring
- Different restart schedule

**How:**

1. Create new Node.js App in cPanel
2. Point to `build/discord-bot/start.js`
3. Add environment variables
4. Start app

---

### **Option 3: PM2 (If you have SSH)**

**If you have SSH access and want:**

- Advanced monitoring
- Process management
- Better logging

**How:**

```bash
npm install -g pm2
pm2 start build/discord-bot/start.js --name morita-bot
pm2 startup
pm2 save
```

---

## Quick Answer

**For cPanel (your setup):**

- ✅ **Use integrated approach** (already done!)
- ✅ Or create separate cPanel Node.js App

**For VPS/SSH:**

- ✅ Use **PM2** (best option)
- ✅ Or use **Forever** (simpler alternative)

**For development:**

- ✅ Use **nodemon**

**Never use:**

- ❌ `node` directly (stops when terminal closes)
- ❌ nodemon in production (wastes resources)

---

## Current Status

Your bot is **already set up** to run automatically with the backend via `app.ts`. Just restart the backend in cPanel and the bot will start!

If it's not working, check:

1. Environment variables in cPanel
2. `.env` file exists
3. cPanel logs for errors


