# 📋 Order Completion Flow - Comprehensive Review & Analysis

**Date:** 2025-12-30
**Reviewed By:** Claude Code Assistant
**Purpose:** Full audit of order completion cycle, UI/UX, messages, buttons, and status transitions

---

## 📊 ORDER STATUS LIFECYCLE

### Complete Order Flow
```
PENDING → ASSIGNED → IN_PROGRESS → AWAITING_CONFIRM → COMPLETED
    ↓         ↓            ↓              ↓              ↓
 Cancel   Cancel      Cancel        Dispute         Final
```

### Status Definitions
| Status | Color | Icon | Who Controls | Description |
|--------|-------|------|--------------|-------------|
| **PENDING** | Gray `#95a5a6` | ⏳ | System | Order created, no worker assigned |
| **ASSIGNED** | Blue `#3498db` | 📋 | Support/Admin | Worker assigned, not started |
| **IN_PROGRESS** | Yellow `#f1c40f` | 🟡 | Worker | Worker actively working |
| **AWAITING_CONFIRM** | Orange `#f39c12` | 🟠 | Customer | Worker completed, awaiting customer confirmation |
| **COMPLETED** | Green `#2ecc71` | ✅ | System | Customer confirmed, payouts distributed |
| **CANCELLED** | Red `#e74c3c` | ❌ | Admin/System | Order cancelled |
| **DISPUTED** | Dark Red `#c0392b` | 🔴 | Customer/Support | Customer reported issue |
| **REFUNDED** | Purple | 💜 | Admin | Order refunded |

---

## 🎯 CRITICAL WORKFLOW: Order Completion

### Phase 1: Worker Completes Order
**Trigger:** `/complete-work order-number:11` OR Button "Mark Complete"

#### Worker Actions Available:
1. **Command:** `/complete-work`
   - Parameters: `order-number` (required), `notes` (optional)
   - Validates: Worker is assigned, status is `IN_PROGRESS`

2. **Button:** "Mark Complete" (from pinned message)
   - Opens modal with confirmation text + notes
   - Requires typing "COMPLETE" exactly

#### What Happens:
1. **Worker sees** (ephemeral):
   ```
   ✅ Work Completed!

   Previous Status: `In Progress`
   New Status: `Awaiting Confirmation`

   💰 Your Payout: $X.XX USD (80%)
   Next Step: Waiting for customer to confirm completion

   📝 Your Notes: [if provided]
   ```

2. **Pinned Message Updated** (visible to all):
   ```
   📦 ORDER #11 - ⚠️ AWAITING CONFIRMATION

   The worker has marked this order as complete.
   Customer is reviewing the work.

   👤 Customer: @customer
   👷 Worker: @worker
   💰 Order Value: $X.XX USD
   📊 Status: 🟠 AWAITING CONFIRMATION

   📝 Completion Notes: [if provided]
   ```
   **Buttons:** NONE (all removed)

3. **Thread Created** (public thread type 11):
   - Name: "Order #11 - Completion Review"
   - Auto-archive: 60 minutes

4. **Thread Message 1** (order info):
   ```
   🔔 @customer

   📦 Order #11 Completed

   @customer, the worker has finished your order!

   👤 Customer: @customer
   👷 Worker: @worker
   💰 Order Value: $X.XX USD
   📊 Status: 🟠 Awaiting Your Confirmation

   📝 Completion Notes from Worker: [if provided]
   ```
   **Buttons:** NONE

5. **Thread Message 2** (action buttons):
   ```
   Please review the work and take action:

   [✅ Confirm Complete] [❌ Report Issue] [📊 Order Details]
   ```
   **Buttons:** 3 active, clickable buttons

---

### Phase 2: Customer Reviews & Confirms
**Trigger:** Customer clicks "✅ Confirm Complete" button

#### Customer Actions Available:
1. **✅ Confirm Complete** - Approves work, triggers payouts
2. **❌ Report Issue** - Opens modal to describe problem
3. **📊 Order Details** - Shows full order information

#### What Happens on Confirm:
1. **Customer sees** (ephemeral):
   ```
   ✅ Order Confirmed!

   Thank you for confirming completion of Order #11!
   Payouts have been automatically distributed.

   📦 Order: #11
   💰 Order Value: $X.XX USD
   📊 Status: ✅ COMPLETED

   💸 Payout Distribution:
   • 👷 Worker: $X.XX (80%)
   • 🎧 Support: $X.XX (5%)
   • 🏢 System: $X.XX (15%)

   ⭐ Rate Your Experience
   Please take a moment to rate this order!

   [⭐ Leave Review]
   ```

2. **Customer receives DM**:
   ```
   🎉 Order Completed Successfully!

   Thank you for confirming completion of your order!
   We hope you're satisfied with the service.

   📦 Order Number: #11
   💰 Order Value: $X.XX USD
   📊 Status: ✅ COMPLETED
   👷 Worker: WorkerUsername

   🌟 What's Next?
   • Please rate your experience in the ticket!
   • Use /close-ticket when you're done
   • All payouts have been processed
   • Feel free to place another order anytime!

   📝 Final Notes from Worker: [if provided]

   Thank you for choosing our service! ❤️
   ```

3. **Pinned Message Updated** (visible to all):
   ```
   📦 ORDER #11 - ✅ COMPLETED

   This order has been successfully completed and confirmed!
   Payouts have been automatically distributed.

   👤 Customer: @customer
   👷 Worker: @worker
   💰 Total Value: $X.XX USD
   📊 Final Status: ✅ COMPLETED & PAID

   💸 Payouts Processed:
   ✅ Worker received: $X.XX USD (80%)
   ✅ Support received: $X.XX USD (5%)
   ✅ System collected: $X.XX USD (15%)
   🔄 Deposit returned: $X.XX USD

   📝 Completion Notes: [if provided]

   Order #11 • Completed
   ```
   **Buttons:** NONE (all removed)

4. **Celebration Message Sent** (in channel):
   ```
   🎉 Order #11 Complete!

   Thank you @customer for confirming!
   Great work @worker!
   ```

5. **Backend Actions:**
   - Status: `AWAITING_CONFIRM` → `COMPLETED`
   - Payout 80% order value to worker's balance
   - Payout 5% to support's balance
   - Payout 15% to system
   - Return worker's deposit (100%)
   - Record transaction history
   - Set `confirmedAt` timestamp

---

### Phase 3: Customer Reports Issue (Alternative Path)
**Trigger:** Customer clicks "❌ Report Issue" button

#### What Happens:
1. **Modal Opens:**
   ```
   ❌ Report Order Issue

   Describe the issue:
   [Paragraph text input - min 10, max 1000 chars]
   "Please describe what's wrong with the order..."
   ```

2. **On Submit:**
   - Status: `AWAITING_CONFIRM` → `DISPUTED`
   - Support team notified
   - Order frozen (no payouts)
   - Manual investigation required

---

## 🎨 UI/UX ANALYSIS

### ✅ STRENGTHS

#### 1. Clear Status Visualization
- Color-coded statuses (gray → blue → yellow → orange → green)
- Emoji indicators (⏳ → 📋 → 🟡 → 🟠 → ✅)
- Consistent status display across all messages

#### 2. Thread Organization
- ✅ **EXCELLENT:** Two-message structure prevents confusion
- ✅ Message 1: Information only (no disabled buttons)
- ✅ Message 2: Active buttons only
- ✅ Customer sees clean, organized flow

#### 3. Progressive Disclosure
- Worker sees payout info (relevant to them)
- Customer doesn't see detailed payout breakdown until confirmation
- Support/Admin can see full details via `/order-status`

#### 4. Confirmation Safeguards
- Modal requires typing "COMPLETE" exactly
- Prevents accidental completion
- Notes are optional but encouraged

#### 5. Timeline Tracking
- `createdAt`, `assignedAt`, `startedAt`, `completedAt`, `confirmedAt`
- Order Info button shows relative timestamps ("2 hours ago")
- Absolute timestamps also shown

---

### ⚠️ ISSUES & IMPROVEMENTS NEEDED

#### 🔴 CRITICAL ISSUES

##### 1. **Buttons Not Disabled After Customer Confirms**
**Problem:** Customer can click "Confirm Complete" multiple times, potentially causing duplicate transactions.

**Current State:**
- Buttons remain active after confirmation
- No visual feedback that action was taken
- Thread buttons stay clickable

**Fix Required:**
```typescript
// In confirm-complete.button.ts, after successful confirmation:
// Update the button message to disable buttons
const originalMessage = interaction.message;
await originalMessage.edit({
    content: `✅ Order confirmed successfully!`,
    components: [] // Remove all buttons
});
```

**Impact:** HIGH - Risk of duplicate payouts or errors

---

##### 2. **Inconsistent Customer Notification**
**Problem:** Customer might not see completion notification if they're not actively watching the channel.

**Current State:**
- Thread ping: `🔔 @customer`
- No direct DM when worker completes (only when customer confirms)
- Thread might auto-archive if customer doesn't respond

**Fix Required:**
- Send DM to customer when worker marks complete
- Add "Order #11 needs your review!" notification
- Include link to thread or ticket

**Impact:** MEDIUM - Customer might miss completion notification

---

##### 3. **No Broadcast to Support/Admin**
**Problem:** Support and Admin don't get notified about order status changes.

**Current State:**
- Only worker gets ephemeral confirmation
- Only customer gets thread ping
- Support/Admin must manually check orders

**Fix Required:**
- Send notifications to support role when:
  - Work started
  - Work completed
  - Order confirmed
  - Issue reported
- Create admin notification channel

**Impact:** MEDIUM - Poor visibility for support team

---

##### 4. **Payout Details Visible to Customer After Confirmation**
**Problem:** Customer sees detailed payout breakdown (worker 80%, support 5%, system 15%) after confirming.

**Current State:**
- Pinned message shows full breakdown
- Customer ephemeral message shows breakdown
- This exposes business margins

**Fix Required:**
- Remove payout breakdown from customer-facing messages
- Show only: "Payouts have been processed"
- Keep breakdown for worker (they need to know their payout)
- Support/Admin can see via `/order-info`

**Impact:** LOW - Business information exposure

---

#### 🟡 MEDIUM PRIORITY ISSUES

##### 5. **No Timeout/Escalation for Customer Confirmation**
**Problem:** Order can stay in `AWAITING_CONFIRM` indefinitely if customer doesn't respond.

**Suggestions:**
- Auto-confirm after 48-72 hours
- Send reminder DMs to customer (24h, 48h)
- Escalate to support after 72h
- Worker gets deposit back regardless (it's locked unnecessarily)

**Impact:** MEDIUM - Worker payout delayed, poor UX

---

##### 6. **Thread Auto-Archive Too Short**
**Current:** 60 minutes (1 hour)
**Problem:** Thread archives before customer might see it

**Suggestions:**
- Increase to 1440 minutes (24 hours)
- Or 4320 minutes (3 days)
- Matches customer confirmation timeframe

**Impact:** LOW - Thread might archive before customer responds

---

##### 7. **No Edit/Cancel for Worker After Completion**
**Problem:** Worker can't undo completion if they made mistake.

**Current State:**
- Once clicked "Complete", status changes to `AWAITING_CONFIRM`
- Worker can't take it back
- Requires support intervention

**Suggestions:**
- Add "Undo Completion" button for worker (only visible before customer confirms)
- Time limit: 5-10 minutes
- Reverts to `IN_PROGRESS`

**Impact:** LOW - Worker mistake recovery

---

##### 8. **Completion Notes Character Limit**
**Current:** Modal allows long text, but display truncates at 1024 chars

**Problem:**
- Worker might write more than 1024 chars
- Display shows "..." but full text lost
- No warning in modal

**Fix:**
- Add character counter in modal
- Set modal max length to 1024
- Show "X/1024 characters" live counter

**Impact:** LOW - Content might be truncated

---

#### 🟢 LOW PRIORITY ENHANCEMENTS

##### 9. **No Visual Indicator of Order Value in Thread**
**Current:** Thread title is "Order #11 - Completion Review"

**Suggestion:**
- Include value in thread name: "Order #11 ($45.00) - Completion Review"
- Helps customer prioritize if multiple orders
- Quick reference without opening thread

**Impact:** VERY LOW - Nice to have

---

##### 10. **Order Info Button Redundant in Thread**
**Current:** Thread has "Order Details" button

**Observation:**
- Thread message 1 already shows all key info
- Button shows same info in ephemeral message
- Clicking button feels redundant

**Suggestions:**
- Remove "Order Details" button from thread
- Keep only "Confirm Complete" and "Report Issue"
- Or make it show additional info (timeline, full job description)

**Impact:** VERY LOW - UI cleanliness

---

##### 11. **No Estimate of Payout Time**
**Current:** "Payouts have been automatically distributed"

**Customer Question:** When will worker get paid?

**Suggestion:**
- Add: "Worker will receive funds within 5 minutes"
- Set expectations clearly
- Reduces support tickets

**Impact:** VERY LOW - Clarity improvement

---

##### 12. **No Link to Worker Profile/Rating**
**Current:** Just mentions `@worker`

**Future Enhancement:**
- Show worker's average rating
- Link to worker profile/past orders
- Builds trust and transparency

**Impact:** VERY LOW - Future feature

---

## 🎭 MESSAGE CONTENT REVIEW

### Worker Messages (Ephemeral)

#### `/complete-work` Success Response
```
✅ Work Completed!

You've marked Order #11 as complete!
The customer has been notified and will confirm completion soon.

Previous Status: `In Progress`
New Status: `Awaiting Confirmation`

💰 Your Payout: $36.00 USD (80%)
Next Step: Waiting for customer to confirm completion

📝 Your Notes: > [completion notes]
```

**Rating:** ⭐⭐⭐⭐⭐ (5/5)
- Clear, concise
- Shows payout (relevant to worker)
- Next steps explained
- Good use of formatting

**Improvements:** None needed

---

#### `/start-work` Success Response
```
🚀 Work Started!

You've started working on Order #11!

Previous Status: `Assigned`
New Status: `In Progress`

Next Step: Use `/complete-work` when finished
```

**Rating:** ⭐⭐⭐⭐⭐ (5/5)
- Simple, direct
- Shows next command
- Good emoji usage

**Improvements:** None needed

---

### Customer Messages

#### Thread Message 1 (Order Info)
```
🔔 @customer

📦 Order #11 Completed

@customer, the worker has finished your order!

👤 Customer: @customer
👷 Worker: @worker
💰 Order Value: $45.00 USD
📊 Status: 🟠 Awaiting Your Confirmation

📝 Completion Notes from Worker:
[notes here]
```

**Rating:** ⭐⭐⭐⭐☆ (4/5)
- Clear, professional
- All key info present
- Good structure

**Improvements:**
- Add urgency: "Please review within 48 hours"
- Add worker's reputation: "⭐ 4.8/5 rating"

---

#### Thread Message 2 (Action Buttons)
```
**Please review the work and take action:**

[✅ Confirm Complete] [❌ Report Issue] [📊 Order Details]
```

**Rating:** ⭐⭐⭐☆☆ (3/5)
- Simple, functional
- Buttons are clear

**Improvements:**
- Add more context: "Review the completed work above, then choose an action:"
- Reduce buttons: Remove "Order Details" (redundant)
- Add countdown: "Please respond within 48 hours"

---

#### Confirmation Success (Ephemeral)
```
✅ Order Confirmed!

Thank you for confirming completion of Order #11!
Payouts have been automatically distributed.

📦 Order: #11
💰 Order Value: $45.00 USD
📊 Status: ✅ COMPLETED

💸 Payout Distribution:
• 👷 Worker: $36.00 (80%)
• 🎧 Support: $2.25 (5%)
• 🏢 System: $6.75 (15%)

⭐ Rate Your Experience
Please take a moment to rate this order!

[⭐ Leave Review]
```

**Rating:** ⭐⭐⭐☆☆ (3/5)
- Professional, complete
- Review button present

**Improvements:**
- **REMOVE payout distribution** (exposes business margins)
- Change to: "Payouts have been processed. Worker received $36.00."
- Focus on customer action: "Please rate your experience!"

---

#### Celebration DM
```
🎉 Order Completed Successfully!

Thank you for confirming completion of your order!
We hope you're satisfied with the service.

📦 Order Number: #11
💰 Order Value: $45.00 USD
📊 Status: ✅ COMPLETED
👷 Worker: WorkerUsername

🌟 What's Next?
• Please rate your experience in the ticket!
• Use /close-ticket when you're done
• All payouts have been processed
• Feel free to place another order anytime!

📝 Final Notes from Worker: [notes]

Thank you for choosing our service! ❤️
```

**Rating:** ⭐⭐⭐⭐⭐ (5/5)
- Warm, friendly
- Clear next steps
- Encourages repeat business
- Good tone

**Improvements:** None needed

---

### Pinned Messages

#### AWAITING_CONFIRM Status
```
📦 ORDER #11 - ⚠️ AWAITING CONFIRMATION

The worker has marked this order as complete.
Customer is reviewing the work.

👤 Customer: @customer
👷 Worker: @worker
💰 Order Value: $45.00 USD
📊 Status: 🟠 AWAITING CONFIRMATION

📝 Completion Notes: [notes]
```

**Rating:** ⭐⭐⭐⭐⭐ (5/5)
- Clean, informative
- No buttons (prevents confusion)
- Status clear
- No payout details exposed

**Improvements:** None needed

---

#### COMPLETED Status
```
📦 ORDER #11 - ✅ COMPLETED

This order has been successfully completed and confirmed!
Payouts have been automatically distributed.

👤 Customer: @customer
👷 Worker: @worker
💰 Total Value: $45.00 USD
📊 Final Status: ✅ COMPLETED & PAID

💸 Payouts Processed:
✅ Worker received: $36.00 USD (80%)
✅ Support received: $2.25 USD (5%)
✅ System collected: $6.75 USD (15%)
🔄 Deposit returned: $10.00 USD

📝 Completion Notes: [notes]

Order #11 • Completed
```

**Rating:** ⭐⭐☆☆☆ (2/5)
- Complete information
- Clear final status

**Issues:**
- **TOO MUCH FINANCIAL DETAIL** exposed publicly
- Customer, worker, AND anyone else in channel sees breakdown
- Exposes business margins (15% system cut)
- Exposes support commission (5%)

**Improvements:**
```
📦 ORDER #11 - ✅ COMPLETED

This order has been successfully completed and confirmed!

👤 Customer: @customer
👷 Worker: @worker
💰 Order Value: $45.00 USD
📊 Final Status: ✅ COMPLETED & PAID

✅ All payouts have been processed
🔄 Worker deposit returned

📝 Completion Notes: [notes]

Order #11 • Completed
```

**Rationale:**
- Payout details should be private (ephemeral or DM)
- Worker sees their payout in ephemeral message
- Customer sees basic confirmation
- Support can view details via admin commands

---

## 🎮 COMMAND REVIEW

### Worker Commands

| Command | Parameters | Validates | Response | Rating |
|---------|-----------|-----------|----------|--------|
| `/start-work` | `order-number` (required) | Worker assigned, status = `ASSIGNED` | Ephemeral success embed | ⭐⭐⭐⭐⭐ |
| `/complete-work` | `order-number` (required), `notes` (optional) | Worker assigned, status = `IN_PROGRESS` | Ephemeral success + thread creation | ⭐⭐⭐⭐⭐ |

**Strengths:**
- Clear validation
- Good error messages
- Ephemeral responses (privacy)

**Missing Commands:**
- `/undo-completion` - Revert to IN_PROGRESS (if < 10 min)
- `/update-completion-notes` - Edit notes after submission

---

### Customer Commands

| Command | Parameters | Validates | Response | Rating |
|---------|-----------|-----------|----------|--------|
| *None directly* | - | - | - | N/A |

**Note:** Customers use buttons, not commands. This is good UX (easier to click than type).

**Potential Additions:**
- `/confirm-order order-number:X` - Alternative to button
- `/dispute-order order-number:X reason:"..."` - Direct dispute

---

### Support/Admin Commands

| Command | Parameters | Validates | Response | Rating |
|---------|-----------|-----------|----------|--------|
| `/order-status` | `order-number` (required), `status` (required), `reason` (optional) | Admin/Support role, order exists | Ephemeral success embed | ⭐⭐⭐⭐☆ |
| `/add-balance` | `amount`, `type`, `user`, `note`, `reference`, `payment_method` | Support/Admin role | Public notification + ephemeral | ⭐⭐⭐⭐⭐ |

**Strengths:**
- Powerful admin tools
- Good permission checks
- Clear audit trail

**Improvements:**
- `/order-status` should log reason to database (audit)
- Add `/order-history order-number:X` - Show full timeline

---

## 🔘 BUTTON REVIEW

### Thread Completion Buttons

| Button | Label | Style | Action | Validates | Rating |
|--------|-------|-------|--------|-----------|--------|
| Confirm | ✅ Confirm Complete | Success (Green) | Triggers payouts, updates status | Customer only, AWAITING_CONFIRM | ⭐⭐⭐⭐☆ |
| Issue | ❌ Report Issue | Danger (Red) | Opens dispute modal | Customer only, AWAITING_CONFIRM | ⭐⭐⭐⭐⭐ |
| Info | 📊 Order Details | Primary (Blue) | Shows order info ephemeral | Anyone | ⭐⭐⭐☆☆ |

**Issues:**
- **Confirm button:** Not disabled after click (HIGH RISK)
- **Info button:** Redundant in thread (already shows info)

**Fixes:**
1. Disable buttons after customer confirms
2. Remove "Order Details" button from thread
3. Add visual feedback when clicked

---

### Pinned Message Buttons

**Current State:** NONE (all removed during AWAITING_CONFIRM and COMPLETED)

**Rating:** ⭐⭐⭐⭐⭐ (5/5)
- Correct approach
- Prevents confusion with disabled buttons
- Forces customer to use thread

---

## 💰 FINANCIAL FLOW REVIEW

### Payout Structure
- Worker: **80%** of order value
- Support: **5%** of order value
- System: **15%** of order value
- **Total: 100%**

### Deposit Flow
- Worker locks deposit when assigned (security)
- Deposit amount independent of order value (risk-based)
- Deposit returned 100% on successful completion
- Deposit held if disputed

### Security Validations
✅ Order value: $1 - $10,000
✅ Deposit: $1 - $1,000
✅ Balance checks before deduction
✅ Transaction locks prevent race conditions
✅ Retry mechanism for conflicts

**Rating:** ⭐⭐⭐⭐⭐ (5/5) - Robust financial system

---

## 📈 RECOMMENDATIONS SUMMARY

### 🔴 IMMEDIATE FIXES (Deploy ASAP)

1. **Disable buttons after customer confirms**
   - File: `confirm-complete.button.ts`
   - Risk: Duplicate transactions

2. **Remove payout breakdown from customer messages**
   - Files: `confirm-complete.button.ts`, pinned message updates
   - Risk: Business margin exposure

3. **Send DM to customer when worker completes**
   - Files: `complete-work.command.ts`, `complete-order.modal.ts`
   - Risk: Customer misses notification

---

### 🟡 SHORT-TERM IMPROVEMENTS (Next Sprint)

4. **Auto-confirm after 48-72 hours**
   - Create scheduled job
   - Send reminder DMs

5. **Broadcast to support/admin channel**
   - Create notification system
   - Log all status changes

6. **Increase thread auto-archive to 24h**
   - Simple config change

7. **Add "Undo Completion" button for workers**
   - Time-limited (10 min)
   - Reverts to IN_PROGRESS

---

### 🟢 LONG-TERM ENHANCEMENTS (Future)

8. **Worker rating system** (already started)
9. **Order analytics dashboard**
10. **Automated dispute resolution flow**
11. **Multi-language support**
12. **Order templates for repeat services**

---

## ✅ OVERALL ASSESSMENT

| Category | Score | Notes |
|----------|-------|-------|
| **Status Lifecycle** | 9/10 | Clear, well-defined states |
| **UI/UX Design** | 8/10 | Clean, but needs button disable fix |
| **Message Content** | 7/10 | Good, but exposes too much financial detail |
| **Error Handling** | 9/10 | Robust validation and error messages |
| **Security** | 9/10 | Good financial controls, needs duplicate prevention |
| **Customer Experience** | 7/10 | Smooth flow, but notification gaps |
| **Worker Experience** | 9/10 | Clear commands, good feedback |
| **Admin/Support Tools** | 8/10 | Powerful, could use more automation |

**Overall: 8.1/10** - Strong foundation, needs refinement in customer notifications and button management.

---

## 🎯 PRIORITY IMPLEMENTATION ORDER

### Week 1 (Critical Fixes)
1. ✅ Disable buttons after confirmation
2. ✅ Remove payout details from customer view
3. ✅ Send DM to customer on completion

### Week 2 (Important Improvements)
4. ✅ Support/Admin notifications
5. ✅ Auto-confirm timeout
6. ✅ Thread archive extension

### Week 3 (Polish)
7. ✅ Worker undo button
8. ✅ Completion notes character limit
9. ✅ Order history command

---

**End of Review**
**Next Steps:** Implement critical fixes, then user testing
