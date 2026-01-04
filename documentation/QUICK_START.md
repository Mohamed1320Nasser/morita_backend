# ⚡ Quick Start - Security Fixes

## 🚀 Get Started in 5 Minutes

### 1. Install Dependencies
```bash
cd morita_backend
npm install ioredis class-validator class-transformer
```

### 2. Generate API Key
```bash
# Linux/Mac
export DISCORD_BOT_API_KEY=$(openssl rand -hex 32)
echo "DISCORD_BOT_API_KEY=$DISCORD_BOT_API_KEY" >> .env

# Windows PowerShell
$key = -join ((48..57) + (65..70) | Get-Random -Count 64 | % {[char]$_})
Add-Content -Path .env -Value "DISCORD_BOT_API_KEY=$key"
```

### 3. Set Up Redis (Optional)
```bash
# Mac
brew install redis && brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server && sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:alpine

# Skip Redis (use fallback)
# No action needed - will auto-fallback to in-memory
```

### 4. Run Database Migration
```bash
# Create the migration file first
cat > prisma/migrations/$(date +%Y%m%d%H%M%S)_add_lock_table/migration.sql << 'EOF'
CREATE TABLE IF NOT EXISTS "Lock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Lock_expiresAt_idx" ON "Lock"("expiresAt");
EOF

# Apply migration
npx prisma migrate deploy
```

### 5. Update order.service.ts
```bash
# Open the file
code src/api/order/order.service.ts

# Replace the createOrder method (line ~28-150) with the version from:
# src/api/order/order.service.FIXED.ts
```

### 6. Add API Key to Discord Bot Requests

**Find all axios.create() calls and add:**
```typescript
headers: {
    "X-API-Key": process.env.DISCORD_BOT_API_KEY
}
```

**Files to update:**
- `src/discord-bot/commands/wallet.command.ts`
- `src/discord-bot/commands/create-order.command.ts`
- `src/discord-bot/interactions/modals/create-order-job.modal.ts`
- `src/discord-bot/interactions/buttons/claim-job.button.ts`

**Example:**
```typescript
// Before:
const apiClient = axios.create({
    baseURL: discordConfig.apiBaseUrl,
    timeout: 10000,
});

// After:
const apiClient = axios.create({
    baseURL: discordConfig.apiBaseUrl,
    timeout: 10000,
    headers: {
        "X-API-Key": process.env.DISCORD_BOT_API_KEY || ""
    }
});
```

### 7. Test It Works
```bash
# Start the server
npm run dev

# Test authentication
curl -X GET http://localhost:3000/discord/wallets/balance/123456789 \
  -H "X-API-Key: your_key_here"

# Should return wallet data if key is correct
# Should return 401 if key is missing/wrong
```

### 8. Deploy
```bash
# Set production env vars
export NODE_ENV=production
export DISCORD_BOT_API_KEY=your_prod_key
export REDIS_URL=redis://your-redis-server:6379

# Build
npm run build

# Deploy
npm start
```

---

## ✅ Verification Checklist

After implementation, verify:

- [ ] `npm install` completed successfully
- [ ] API key is set in `.env` (64+ characters)
- [ ] Redis is running OR fallback message in logs
- [ ] Database migration applied (Lock table exists)
- [ ] `createOrder` method replaced with fixed version
- [ ] All axios instances have X-API-Key header
- [ ] Test order creation works
- [ ] Test unauthorized API call returns 401

---

## 🔧 Common Issues

### "Module not found: ioredis"
```bash
npm install ioredis
```

### "Lock table does not exist"
```bash
npx prisma migrate deploy
```

### "Unauthorized" when bot calls API
Add API key header to axios instance

### "Redis connection failed"
Either start Redis or ignore (will use fallback)

---

## 📁 Key Files Created

1. `src/common/constants/security.constants.ts` - All magic numbers
2. `src/common/middlewares/discordAuth.middleware.ts` - API authentication
3. `src/common/services/redis.service.ts` - Caching service
4. `src/common/utils/transaction.util.ts` - Safe transactions
5. `src/common/utils/errorHandler.util.ts` - Error handling
6. `src/common/utils/apiResponse.util.ts` - API responses

---

## 🎯 What This Fixes

✅ **Race Condition:** Orders now created in atomic transaction
✅ **No Auth:** All Discord endpoints require API key
✅ **Worker Balance:** Worker deposits locked immediately
✅ **Data Loss:** Redis persistence (with fallback)
✅ **Input Validation:** Financial limits enforced
✅ **Hardcoded IDs:** All IDs from environment variables

---

## 📊 Before & After

### Before:
```typescript
// ❌ Balance checked outside transaction
const balance = await getBalance();
if (balance < required) throw Error();
// Another request can execute here! ⚠️
await deductBalance();
```

### After:
```typescript
// ✅ Everything atomic
await withTransactionRetry(async (tx) => {
    const check = await checkBalanceWithLock(tx, walletId, amount);
    if (!check.sufficient) throw Error();
    await updateBalance(tx, walletId, -amount);
}); // All or nothing!
```

---

## 🆘 Need Help?

1. **Read:** `SECURITY_FIXES_IMPLEMENTATION_GUIDE.md` (detailed guide)
2. **Check:** `SECURITY_FIXES_SUMMARY.md` (what changed)
3. **Search:** Logs in `logs/` directory
4. **Test:** In development first!

---

## 🎉 You're Done!

Once you complete the 8 steps above, your system will be:
- 🔒 Secure (API authentication)
- 💰 Safe (no double-spending)
- 📦 Reliable (Redis persistence)
- ✅ Production-ready

**Estimated Time:** 30-60 minutes

Good luck! 🚀
