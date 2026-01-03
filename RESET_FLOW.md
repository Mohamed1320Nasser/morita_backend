# Select Menu Reset Flow - Visual Guide

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER CLICKS DROPDOWN                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  improved-pricing-service-select.selectMenu.ts                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Defer reply (prevents checkmark immediately)         │   │
│  │ 2. Fetch service data from API                          │   │
│  │ 3. Build embed with pricing                             │   │
│  │ 4. Send ephemeral reply to user                         │   │
│  │ 5. Schedule reset (NON-BLOCKING)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              SelectMenuResetManager.scheduleReset()             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Validate message and message ID                      │   │
│  │ 2. Clear existing timer if present (DEBOUNCE)           │   │
│  │ 3. Set new timer (800ms delay)                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Wait 800ms (debounce)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│         SelectMenuResetManager.executeResetWithRetry()          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ FOR attempt = 0 to 3:                                    │   │
│  │   ┌──────────────────────────────────────────────────┐   │   │
│  │   │ If retry: Wait exponential backoff               │   │   │
│  │   │   (500ms, 1000ms, 2000ms)                        │   │   │
│  │   ├──────────────────────────────────────────────────┤   │   │
│  │   │ Call executeReset()                              │   │   │
│  │   │   ├─ Success? → Mark success, DONE              │   │   │
│  │   │   └─ Failed? → Log warning, continue loop       │   │   │
│  │   └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │ If all 3 retries fail:                                   │   │
│  │   → Log error, cleanup, mark failure                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│            SelectMenuResetManager.executeReset()                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1️⃣ CHECK LOCK                                            │   │
│  │    └─ Already locked? → Skip (prevent race)             │   │
│  │                                                          │   │
│  │ 2️⃣ ACQUIRE LOCK                                          │   │
│  │    operationLocks.set(messageId, true)                  │   │
│  │                                                          │   │
│  │ 3️⃣ GET CATEGORY IDS                                      │   │
│  │    └─ From messageCategoryMap                           │   │
│  │    └─ Not found? → THROW ERROR (will retry)             │   │
│  │                                                          │   │
│  │ 4️⃣ FETCH FRESH MESSAGE                                   │   │
│  │    freshMessage = channel.messages.fetch(messageId)     │   │
│  │    └─ Prevents stale message object issues              │   │
│  │                                                          │   │
│  │ 5️⃣ FETCH FRESH CATEGORIES                                │   │
│  │    categories = getFreshCategories()                    │   │
│  │    └─ BYPASSES CACHE (always fresh data)                │   │
│  │    └─ Updates cache after fetch                         │   │
│  │                                                          │   │
│  │ 6️⃣ FILTER CATEGORIES                                     │   │
│  │    groupCategories = filter(cat => categoryIds.has)     │   │
│  │    └─ No matches? → THROW ERROR (will retry)            │   │
│  │                                                          │   │
│  │ 7️⃣ BUILD COMPONENTS                                      │   │
│  │    FOR each category:                                   │   │
│  │      components.push(buildCategorySelectMenu())         │   │
│  │    └─ No components? → THROW ERROR (will retry)         │   │
│  │                                                          │   │
│  │ 8️⃣ EDIT MESSAGE                                          │   │
│  │    freshMessage.edit({ components })                    │   │
│  │    └─ Discord API call (can fail → retry)               │   │
│  │                                                          │   │
│  │ 9️⃣ INVALIDATE CACHE                                      │   │
│  │    categoryCache = null                                 │   │
│  │    └─ Ensures next fetch gets fresh data                │   │
│  │                                                          │   │
│  │ 🔟 CLEANUP                                               │   │
│  │    resetTimers.delete(messageId)                        │   │
│  │                                                          │   │
│  │ ✅ RELEASE LOCK (in finally block)                       │   │
│  │    operationLocks.delete(messageId)                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   ✅ DROPDOWN RESET!
                   (Checkmark removed)
```

---

## 🔍 Before vs After Comparison

### ❌ OLD FLOW (Buggy)
```
User clicks → Defer reply → Send embed → Schedule reset (1.5s)
                                              ↓
                                    Wait 1.5 seconds
                                              ↓
                              Get categories (maybe cached)
                                              ↓
                              Build components
                                              ↓
                              Edit message (stale ref)
                                              ↓
                              Failed? → Log error ❌
                              Success? → Done ✅
```

**Problems:**
- ❌ No retry on failure
- ❌ Uses stale message reference
- ❌ Cache might be expired
- ❌ Silent failures
- ❌ No lock (race conditions)
- ❌ Slow (1.5s delay)

### ✅ NEW FLOW (Fixed)
```
User clicks → Defer reply → Send embed → Schedule reset (0.8s, non-blocking)
                                              ↓
                                    Wait 800ms (debounce)
                                              ↓
                                    ┌─ Attempt 1 (immediate)
                                    ├─ Attempt 2 (wait 500ms)
                                    ├─ Attempt 3 (wait 1000ms)
                                    └─ Attempt 4 (wait 2000ms)
                                              ↓
                              Check lock (prevent race)
                                              ↓
                              Fetch FRESH message
                                              ↓
                              Fetch FRESH categories
                                              ↓
                              Build components
                                              ↓
                              Edit message
                                              ↓
                              Invalidate cache
                                              ↓
                              Failed? → Retry ↻
                              Success? → Done ✅
```

**Solutions:**
- ✅ 3 automatic retries
- ✅ Always fresh message
- ✅ Always fresh data
- ✅ Errors trigger retry
- ✅ Lock prevents races
- ✅ Fast (800ms delay)

---

## 🎯 Race Condition Prevention

### Scenario: Two Users Click Same Dropdown

```
Time    User A                 User B                 Lock Status
----    ------                 ------                 -----------
T+0     Click dropdown         -                      🔓 Unlocked
T+1     Schedule reset (800ms) -                      🔓 Unlocked
T+100   -                      Click dropdown         🔓 Unlocked
T+101   -                      Schedule reset (800ms) 🔓 Unlocked
        (User A's timer cancelled by debounce)
T+900   -                      Timer fires            🔓 Unlocked
T+901   -                      Acquire lock           🔒 LOCKED
T+902   -                      Fetch fresh message    🔒 LOCKED
T+950   -                      Edit message           🔒 LOCKED
T+1000  -                      Release lock           🔓 Unlocked
                               ✅ SUCCESS
```

**Key Protection:**
1. **Debouncing**: Only last click triggers reset
2. **Locking**: Only one reset executes at a time
3. **Fresh data**: Each reset gets latest state

---

## 📊 Cache Strategy

### Before (Buggy)
```
┌──────────────┐
│ First Reset  │ → API call → Cache (60s TTL) → Edit message
└──────────────┘

┌──────────────┐
│ Second Reset │ → Use cache (maybe stale) → Edit with old data ❌
└──────────────┘   (within 60s)
```

### After (Fixed)
```
┌──────────────┐
│ First Reset  │ → API call → Cache (45s TTL) → Edit → Invalidate cache
└──────────────┘

┌──────────────┐
│ Second Reset │ → API call (cache invalidated) → Fresh data → Edit ✅
└──────────────┘
```

---

## 🔄 Retry Flow Example

### Scenario: Discord API is slow/failing

```
Attempt 1 (T+0ms):
  ├─ Fetch message → ❌ Timeout
  └─ FAIL → Proceed to retry

Wait 500ms...

Attempt 2 (T+500ms):
  ├─ Fetch message → ✅ Success
  ├─ Fetch categories → ❌ 500 error
  └─ FAIL → Proceed to retry

Wait 1000ms...

Attempt 3 (T+1500ms):
  ├─ Fetch message → ✅ Success
  ├─ Fetch categories → ✅ Success
  ├─ Edit message → ✅ Success
  └─ SUCCESS! 🎉
```

**Total time**: 1.5s (acceptable)
**Without retry**: Would fail permanently ❌

---

## 📈 Metrics Flow

```
Every reset attempt:
  ├─ metrics.totalResets++
  │
  ├─ IF attempt > 0:
  │    └─ metrics.retries++
  │
  ├─ IF cache hit:
  │    └─ metrics.cacheHits++
  │
  ├─ IF cache miss:
  │    └─ metrics.cacheMisses++
  │
  ├─ IF success:
  │    └─ metrics.successfulResets++
  │
  └─ IF all retries fail:
       └─ metrics.failedResets++

Every 60 seconds:
  ResetManagerMonitor.logHealthCheck()
    ├─ Calculate success rate
    ├─ Calculate cache hit rate
    ├─ Check for anomalies
    └─ Log to console + alerts
```

---

## 🧠 Memory Management

```
Message Lifecycle:
┌─────────────────────────────────────────────────────────┐
│ 1. User clicks dropdown                                 │
│    └─ registerGroupedMessage(messageId, categoryIds)   │
│       └─ messageCategoryMap.set()                      │
│                                                         │
│ 2. Reset scheduled                                      │
│    └─ resetTimers.set(messageId, timeout)              │
│                                                         │
│ 3. Reset executing                                      │
│    └─ operationLocks.set(messageId, true)              │
│                                                         │
│ 4. Reset complete                                       │
│    ├─ resetTimers.delete(messageId)                    │
│    └─ operationLocks.delete(messageId)                 │
│       └─ messageCategoryMap remains (for future resets) │
│                                                         │
│ 5. Cleanup job (every 5 min)                            │
│    └─ Clear stale locks                                │
│    └─ Prevent memory leaks                             │
└─────────────────────────────────────────────────────────┘
```

---

## 🚨 Error Handling

```
Try:
  ├─ Validate inputs
  ├─ Check lock
  ├─ Fetch fresh data
  ├─ Build components
  └─ Edit message

Catch specific errors:
  ├─ Network timeout → Retry ↻
  ├─ Message deleted → Log + cleanup ✓
  ├─ Invalid data → Throw (will retry) ↻
  └─ Unknown error → Log + retry ↻

Finally:
  └─ ALWAYS release lock 🔓
     (prevents deadlock)
```

---

## 💡 Key Design Decisions

| Decision | Reason | Alternative Considered |
|----------|--------|----------------------|
| 800ms debounce | Balance between UX and load | 500ms (too fast), 1500ms (too slow) |
| 3 retries | Enough for transient failures | 5 (overkill), 1 (insufficient) |
| Exponential backoff | Standard practice for retries | Linear (less effective) |
| Fresh message fetch | Prevents stale refs | Trust provided message (buggy) |
| Cache invalidation | Ensures correctness | Keep cache (fast but wrong) |
| Non-blocking schedule | Better UX | Blocking (slower response) |

---

**Visual guide version**: 1.0
**Last updated**: 2026-01-03
**Status**: ✅ Production Ready
