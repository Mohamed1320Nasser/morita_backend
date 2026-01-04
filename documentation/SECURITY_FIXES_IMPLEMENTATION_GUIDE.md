# 🔒 Security Fixes Implementation Guide

## Overview

This guide provides step-by-step instructions to implement all critical security fixes, bug fixes, and architectural improvements for the Discord bot system.

**Estimated Implementation Time:** 4-6 hours
**Priority:** 🔴 CRITICAL - Implement immediately

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [New Dependencies](#new-dependencies)
3. [Environment Variables](#environment-variables)
4. [Database Changes](#database-changes)
5. [Implementation Steps](#implementation-steps)
6. [Testing](#testing)
7. [Deployment Checklist](#deployment-checklist)

---

## Prerequisites

- Node.js >= 16.x
- PostgreSQL or MySQL database
- Redis server (for production) or fallback to in-memory cache
- Access to environment configuration
- Backup of production database

---

## New Dependencies

### Install Required Packages

```bash
cd morita_backend

# Install production dependencies
npm install ioredis class-validator class-transformer

# Install development dependencies (optional but recommended)
npm install --save-dev @types/ioredis
```

### Package Versions

```json
{
  "dependencies": {
    "ioredis": "^5.3.2",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1"
  }
}
```

---

## Environment Variables

### Add to `.env` file

```bash
# ========================================
# CRITICAL SECURITY SETTINGS
# ========================================

# Discord Bot API Key (REQUIRED - minimum 32 characters)
# Generate with: openssl rand -hex 32
DISCORD_BOT_API_KEY=your_secure_api_key_here_minimum_32_characters

# Redis Configuration
REDIS_URL=redis://localhost:6379
# For production with password:
# REDIS_URL=redis://:password@hostname:6379

# ========================================
# DISCORD CONFIGURATION (REQUIRED)
# ========================================

# Remove hardcoded fallbacks - these MUST be set
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id

# Role IDs
DISCORD_WORKERS_ROLE_ID=your_workers_role_id
DISCORD_ADMIN_ROLE_ID=your_admin_role_id
DISCORD_SUPPORT_ROLE_ID=your_support_role_id

# Channel IDs
DISCORD_JOB_CLAIMING_CHANNEL_ID=your_job_claiming_channel_id
DISCORD_TICKET_CATEGORY_ID=your_ticket_category_id
DISCORD_LOGS_CHANNEL_ID=your_logs_channel_id

# ========================================
# OPTIONAL SECURITY ENHANCEMENTS
# ========================================

# IP Whitelist (comma-separated, leave empty to disable)
DISCORD_BOT_ALLOWED_IPS=127.0.0.1,::1

# Rate Limiting (requests per minute)
API_RATE_LIMIT=60

# Node Environment
NODE_ENV=production
```

---

## Database Changes

### Required Database Migration

Create a new migration file: `prisma/migrations/add_lock_table.sql`

```sql
-- Create Lock table for distributed locking
CREATE TABLE IF NOT EXISTS "Lock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient cleanup
CREATE INDEX IF NOT EXISTS "Lock_expiresAt_idx" ON "Lock"("expiresAt");

-- Add comments
COMMENT ON TABLE "Lock" IS 'Distributed locks for preventing concurrent operations';
```

### Apply Migration

```bash
# Generate Prisma client
npx prisma generate

# Apply migration
npx prisma migrate deploy

# Or for development
npx prisma migrate dev --name add-lock-table
```

---

## Implementation Steps

### Step 1: Add New Utility Files ✅ (Already Created)

The following files have been created:

1. ✅ `src/common/constants/security.constants.ts`
2. ✅ `src/common/middlewares/discordAuth.middleware.ts`
3. ✅ `src/common/services/redis.service.ts`
4. ✅ `src/common/utils/apiResponse.util.ts`
5. ✅ `src/common/utils/errorHandler.util.ts`
6. ✅ `src/common/utils/transaction.util.ts`
7. ✅ `src/api/order/order.service.FIXED.ts` (template for fixes)

**Action:** These files are ready to use - no changes needed.

---

### Step 2: Update Order Service (CRITICAL)

**File:** `src/api/order/order.service.ts`

**Replace the entire `createOrder` method** with the fixed version from `order.service.FIXED.ts`

#### Changes:
1. Wrap entire operation in `withTransactionRetry`
2. Use `checkWalletBalanceWithLock` for atomic balance checks
3. Lock worker balance when order is assigned
4. Use atomic `updateWalletBalance` operations
5. Add input validation with financial limits

**Location:** Lines 25-150 (approximately)

**Verification:**
```bash
# Search for race condition indicators
grep -n "getWalletByUserId" src/api/order/order.service.ts
grep -n "withTransactionRetry" src/api/order/order.service.ts
```

---

### Step 3: Update Discord Wallet Controller (CRITICAL)

**File:** `src/api/wallet/wallet.discord.controller.ts`

✅ **Already Updated** - Authentication middleware added

**Verification:**
```typescript
// Should see these imports
import { DiscordAuthMiddleware, DiscordRateLimitMiddleware } from "../../common/middlewares/discordAuth.middleware";

// Should see these decorators on the class
@UseBefore(DiscordAuthMiddleware)
@UseBefore(DiscordRateLimitMiddleware)
```

---

### Step 4: Update Discord Bot to Use API Key

**File:** `src/discord-bot/services/api.service.ts` (or wherever axios instances are created)

**Add API key to all API requests:**

```typescript
import { discordConfig } from "../config/discord.config";

const apiClient = axios.create({
    baseURL: discordConfig.apiBaseUrl,
    timeout: 10000,
    headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.DISCORD_BOT_API_KEY || discordConfig.apiAuthToken
    }
});
```

**Files to update:**
- `src/discord-bot/commands/wallet.command.ts` (line 34)
- `src/discord-bot/commands/create-order.command.ts` (line 110)
- `src/discord-bot/interactions/modals/create-order-job.modal.ts` (line 45)
- `src/discord-bot/interactions/buttons/claim-job.button.ts` (line 24)
- Any other file creating axios instances

---

### Step 5: Replace In-Memory Cache with Redis

**File:** `src/discord-bot/interactions/modals/create-order-job.modal.ts`

**Replace lines 8-15:**

```typescript
// OLD (REMOVE THIS):
const orderDataCache = new Map<string, any>();

export function storeOrderData(key: string, data: any) {
    orderDataCache.set(key, data);
    setTimeout(() => orderDataCache.delete(key), 600000);
}
```

**With:**

```typescript
// NEW:
import { getRedisService } from "../../../common/services/redis.service";

const redisService = getRedisService();

export async function storeOrderData(key: string, data: any) {
    await redisService.storeOrderData(key, data);
}
```

**Update the handler function** (line 24-34):

```typescript
// OLD:
const orderData = orderDataCache.get(orderKey);
if (!orderData) {
    await interaction.editReply({
        content: `❌ **Order data expired**\n\nPlease try again.`,
    });
    return;
}
orderDataCache.delete(orderKey);
```

**With:**

```typescript
// NEW:
const orderData = await redisService.getOrderData(orderKey);
if (!orderData) {
    await interaction.editReply({
        content: `❌ **Order data expired**\n\nPlease try again.`,
    });
    return;
}
await redisService.deleteOrderData(orderKey);
```

---

### Step 6: Update Discord Config

✅ **Already Updated** - Hardcoded values removed

**Verification:**
```bash
# Should NOT find hardcoded Discord IDs
grep -E "[0-9]{17,19}" src/discord-bot/config/discord.config.ts
```

---

### Step 7: Update Error Handling

**Create new error handler wrapper for Discord interactions:**

**Example usage in button handlers:**

```typescript
// OLD:
export async function handleClaimJobButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });
        // ... logic ...
    } catch (error) {
        logger.error("Error:", error);
        await interaction.reply({ content: "Error occurred" });
    }
}
```

**NEW:**

```typescript
import { DiscordErrorHandler } from "../../../common/utils/errorHandler.util";

export async function handleClaimJobButton(interaction: ButtonInteraction): Promise<void> {
    await DiscordErrorHandler.safeHandle(interaction, async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        // ... logic ...
    }, "ClaimJob");
}
```

**Files to update:**
- All files in `src/discord-bot/interactions/buttons/`
- All files in `src/discord-bot/interactions/modals/`
- All files in `src/discord-bot/commands/`

---

### Step 8: Add Input Validation

**Example for CreateOrderDto:**

Create file: `src/api/order/dtos/validation.dto.ts`

```typescript
import { IsNumber, IsString, IsOptional, IsUUID, Min, Max, Length, Matches } from "class-validator";
import { FINANCIAL_LIMITS, VALIDATION_PATTERNS } from "../../../common/constants/security.constants";

export class CreateOrderValidatedDto {
    @IsNumber()
    @IsPositive()
    customerId: number;

    @IsNumber()
    @Min(FINANCIAL_LIMITS.MIN_ORDER_VALUE)
    @Max(FINANCIAL_LIMITS.MAX_ORDER_VALUE)
    orderValue: number;

    @IsNumber()
    @Min(FINANCIAL_LIMITS.MIN_DEPOSIT)
    @Max(FINANCIAL_LIMITS.MAX_DEPOSIT)
    depositAmount: number;

    @IsOptional()
    @IsString()
    @Length(1, 2000)
    @Matches(VALIDATION_PATTERNS.SAFE_TEXT)
    jobDetails?: string;

    // ... other fields
}
```

---

## Testing

### Unit Tests

```bash
# Test wallet transactions
npm test -- wallet.service.test

# Test order creation
npm test -- order.service.test

# Test authentication middleware
npm test -- discordAuth.middleware.test
```

### Integration Tests

```bash
# Test order creation flow end-to-end
npm run test:integration -- order-flow.test

# Test concurrent order creation (race condition test)
npm run test:integration -- concurrent-orders.test
```

### Manual Testing Checklist

- [ ] Create order with insufficient balance (should fail immediately)
- [ ] Create 2 orders simultaneously with same customer (should not allow double-spending)
- [ ] Call Discord API endpoint without API key (should return 401)
- [ ] Call Discord API endpoint with wrong API key (should return 401)
- [ ] Create order with worker assigned (worker balance should be locked)
- [ ] Complete order (payouts should be processed atomically)
- [ ] Cancel order (refund should work correctly)
- [ ] Restart bot (order data should persist in Redis)

---

## Deployment Checklist

### Pre-Deployment

- [ ] Backup production database
- [ ] Set up Redis server (or verify fallback works)
- [ ] Generate strong API key (`openssl rand -hex 32`)
- [ ] Update all environment variables
- [ ] Run database migrations
- [ ] Review all changed files
- [ ] Run full test suite

### Deployment

- [ ] Deploy to staging first
- [ ] Run smoke tests on staging
- [ ] Monitor logs for errors
- [ ] Test critical flows (order creation, wallet operations)
- [ ] Deploy to production
- [ ] Monitor for 24 hours

### Post-Deployment

- [ ] Verify authentication is working (check logs for "Request authenticated")
- [ ] Monitor Redis connection status
- [ ] Check for any transaction deadlocks
- [ ] Verify no race conditions occurring
- [ ] Monitor error rates

---

## Verification Commands

```bash
# Check if all required files exist
ls -la src/common/constants/security.constants.ts
ls -la src/common/middlewares/discordAuth.middleware.ts
ls -la src/common/services/redis.service.ts
ls -la src/common/utils/transaction.util.ts

# Check if API key is set
echo $DISCORD_BOT_API_KEY | wc -c  # Should be >= 64 (32 bytes hex = 64 chars)

# Check Redis connection
redis-cli ping  # Should return "PONG"

# Check database migration
npx prisma studio  # Should show Lock table

# Check for hardcoded IDs (should return nothing)
grep -r "143196" src/discord-bot/config/

# Check for unprotected as any (fix these)
grep -r "as any" src/ | wc -l
```

---

## Troubleshooting

### Error: "DISCORD_BOT_API_KEY not set"

**Solution:** Add to `.env`:
```bash
DISCORD_BOT_API_KEY=$(openssl rand -hex 32)
```

### Error: "Redis connection failed"

**Solutions:**
1. Install Redis: `brew install redis` (Mac) or `apt-get install redis` (Linux)
2. Start Redis: `redis-server`
3. Or set `REDIS_URL=` to use fallback in-memory cache

### Error: "Lock table does not exist"

**Solution:** Run migration:
```bash
npx prisma migrate deploy
```

### Error: "Unauthorized" when bot tries to call API

**Solution:** Ensure bot is sending API key in headers:
```typescript
headers: {
    "X-API-Key": process.env.DISCORD_BOT_API_KEY
}
```

---

## Performance Impact

### Expected Changes:

- **Order Creation:** +20-50ms (due to transaction overhead) - WORTH IT for security
- **Wallet Operations:** +10-30ms (due to row locking) - WORTH IT to prevent race conditions
- **API Calls:** +5-10ms (due to authentication check) - Negligible
- **Redis:** -50-100ms (compared to API calls for order data) - IMPROVEMENT

### Monitoring

```bash
# Add performance logging
logger.info("[Perf] Order creation took ${duration}ms");

# Monitor transaction durations
# Check Prisma query logs
```

---

## Rollback Plan

If issues occur after deployment:

1. **Immediate:** Revert to previous deployment
2. **Database:** Restore from backup (transactions should have prevented corruption)
3. **Config:** Revert environment variables
4. **Code:** `git revert <commit-hash>`

### Rollback Commands

```bash
# Revert code changes
git log --oneline | head -5  # Find commit to revert
git revert <commit-hash>

# Restore database (if needed)
# This depends on your backup strategy
```

---

## Summary of Critical Changes

| File | Change | Priority |
|------|--------|----------|
| `order.service.ts` | Add transaction with locking | 🔴 CRITICAL |
| `wallet.discord.controller.ts` | Add authentication | 🔴 CRITICAL |
| `discord.config.ts` | Remove hardcoded IDs | 🔴 CRITICAL |
| `create-order-job.modal.ts` | Replace in-memory cache | 🟠 HIGH |
| All axios instances | Add API key header | 🟠 HIGH |
| Error handlers | Use DiscordErrorHandler | 🟡 MEDIUM |
| DTOs | Add validation decorators | 🟡 MEDIUM |

---

## Next Steps After Implementation

1. **Monitor for 1 week:**
   - Check error logs daily
   - Monitor transaction deadlocks
   - Track API response times

2. **Optimization:**
   - Tune Redis cache TTLs
   - Adjust rate limits based on usage
   - Add database query indexes if slow

3. **Additional Improvements:**
   - Add automated tests for race conditions
   - Set up alerting for security events
   - Implement audit logging for sensitive operations

---

## Support

For questions or issues during implementation:

1. Check this guide's troubleshooting section
2. Review error logs: `tail -f logs/error.log`
3. Test in development environment first
4. Monitor Prisma query logs

**Remember:** All critical fixes are in place. Take time to test thoroughly before deploying to production!
