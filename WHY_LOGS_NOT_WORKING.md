# Why Logs Are Not Being Created - Root Cause Analysis

## Problem Summary

1. ❌ **PM2 shows process as `ecosystem.bot-only`** instead of `morita-bot`
2. ❌ **No log files created** - `bot-logs/bot-error.log` and `bot-logs/bot-out.log` don't exist
3. ❌ **Bot not working** in Discord
4. ❌ **No output in `pm2 logs morita-bot`**

## Root Causes

### 1. **Missing `bot-logs/` Directory** ⚠️ CRITICAL

**Problem:**

- PM2 config specifies: `error_file: './bot-logs/bot-error.log'`
- But `bot-logs/` directory doesn't exist
- **PM2 does NOT create directories automatically**
- When PM2 tries to write logs, it fails silently because directory doesn't exist

**Evidence:**

```
error_file: './bot-logs/bot-error.log'  ← Directory doesn't exist!
out_file: './bot-logs/bot-out.log'      ← Directory doesn't exist!
```

**Impact:**

- All errors are lost
- No way to debug what's happening
- Bot crashes silently

---

### 2. **Logger Initialization Order Issue** ⚠️ CRITICAL

**Problem:**
In `src/discord-bot/start.ts`:

```typescript
import logger from "../common/loggers"; // ← Imports logger FIRST
// ... then loads .env
config({ path: envPath }); // ← Loads .env AFTER logger import
```

But `logger` imports `Environment`:

```typescript
import Environment from "../config/environment"; // ← This loads dotenv!
```

**What happens:**

1. `start.ts` imports `logger`
2. `logger` imports `Environment`
3. `Environment` calls `dotenv.config()` (but .env might not be in right place yet)
4. Then `start.ts` tries to load .env again
5. **Race condition** - logger might initialize with wrong/missing env vars

**Impact:**

- Logger might fail to initialize
- Bot crashes before it can log anything
- No error messages visible

---

### 3. **PM2 Process Name Mismatch** ⚠️ WARNING

**Problem:**

- PM2 shows process as `ecosystem.bot-only` instead of `morita-bot`
- This suggests PM2 might be treating the ecosystem file as a script

**Possible causes:**

- PM2 cache issue - old process name
- PM2 not reading `module.exports` correctly
- File extension confusion

**Impact:**

- Hard to identify the correct process
- Commands like `pm2 logs morita-bot` don't work (process is named differently)

---

### 4. **Silent Crash Before Logs** ⚠️ CRITICAL

**What's happening:**

1. PM2 starts the bot process
2. Bot tries to initialize logger → **FAILS** (env vars not loaded properly)
3. Bot tries to write error to `./bot-logs/bot-error.log` → **FAILS** (directory doesn't exist)
4. Bot crashes immediately
5. PM2 restarts it (autorestart: true)
6. Same cycle repeats
7. **No logs anywhere** - neither in PM2 nor in files

---

## Why You See Nothing

### In PM2 Logs:

```
pm2 logs morita-bot
[TAILING] Tailing last 15 lines for [morita-bot] process
(empty - nothing there)
```

**Why:** Process name is `ecosystem.bot-only`, not `morita-bot`. Also, if bot crashes immediately, there's no output.

### In Log Files:

```
bot-logs/bot-error.log  ← File doesn't exist (directory missing)
bot-logs/bot-out.log    ← File doesn't exist (directory missing)
```

**Why:** PM2 can't create files in non-existent directory.

### In Discord:

Bot doesn't respond to commands.

**Why:** Bot is crashing immediately on startup, never connects to Discord.

---

## The Fix Needed

### 1. Create `bot-logs/` Directory

```bash
mkdir -p bot-logs
```

### 2. Fix Logger Initialization Order

- Load .env BEFORE importing logger
- Or use console.log for initial debugging

### 3. Fix PM2 Process Name

- Delete old process: `pm2 delete all`
- Restart with correct config: `pm2 start ecosystem.bot-only.js`

### 4. Add Immediate Console Logging

- Add `console.log()` at the very start (before logger)
- This will show in PM2 logs even if logger fails

---

## Quick Test to Confirm

Run bot directly (not via PM2) to see actual errors:

```bash
cd /home/morita/public_html/morita_backend
node build/discord-bot/start.js
```

This will show you:

- If .env loads correctly
- If logger initializes
- Actual error messages
- Why bot crashes

---

## Summary

**Main Issues:**

1. ❌ `bot-logs/` directory doesn't exist → PM2 can't write logs
2. ❌ Logger imports before .env loads → initialization fails
3. ❌ Bot crashes silently → no error messages visible
4. ❌ PM2 process name wrong → can't view correct logs

**Result:** Bot crashes immediately, no logs anywhere, no way to debug.
