# Discord Account Purchase Flow - Complete Analysis

## 1. COMPLETE FLOW DIAGRAM (Step-by-Step)

```
START: User Clicks "Browse Accounts" Button
│
├─ [1] BROWSE ACCOUNTS BUTTON HANDLER
│  ├─ handleBrowseAccounts() → account-buttons.ts
│  ├─ API Call: getAccountCategories()
│  ├─ Check: Any accounts available?
│  └─ Display: Category Selection Embed + Select Menu
│
├─ [2] CATEGORY SELECTION
│  ├─ handleAccountCategorySelect() → account-select.menu.ts
│  ├─ API Call: getAccountViewList(category, page=1, limit=5)
│  ├─ Check: Any accounts in category?
│  └─ Display: Account List Embed + Account Select Menu + Pagination Buttons
│
├─ [3] ACCOUNT LIST & PAGINATION
│  ├─ handleAccountPage() → account-buttons.ts (pagination)
│  ├─ API Call: getAccountViewList(category, pageNum, limit=5)
│  ├─ Calculate: totalPages = ceil(filterCount / 5)
│  └─ Display: Updated Account List Embed + Select Menu + Updated Pagination
│
├─ [4] ACCOUNT SELECTION
│  ├─ handleAccountSelect() → account-select.menu.ts
│  ├─ API Call: getAccountDetail(accountId)
│  ├─ Check: Account still available?
│  └─ Display: Account Detail Embed + Detail Buttons (Purchase, Back)
│
├─ [5] ACCOUNT DETAIL VIEW
│  ├─ Shows: Name, Price, Category, Stats, Features, Images
│  ├─ Buttons Available: 
│  │   ├─ 🛒 Purchase This Account
│  │   └─ ← Back to List
│  └─ User can review all account information
│
├─ [6a] PURCHASE INITIATION (Alternative: Direct Detail View)
│  ├─ handleAccountView() → account-buttons.ts (View Details button)
│  ├─ API Call: getAccountDetail(accountId)
│  ├─ Check: Account still available?
│  └─ Display: Account Detail Embed + Detail Buttons
│
├─ [6b] PURCHASE CONFIRMATION FLOW
│  ├─ handleAccountPurchase() → account-buttons.ts
│  ├─ API Call: getAccountDetail(accountId) [verify again]
│  ├─ Check: Account still available?
│  ├─ Display: Purchase Confirmation Embed
│  │   └─ Shows account name, price, payment method warning
│  └─ Buttons: [✅ Confirm Purchase] [❌ Cancel]
│
├─ [7] PURCHASE CONFIRMATION WITH ACCOUNT RESERVATION
│  ├─ handleAccountConfirm() → account-buttons.ts
│  ├─ API Call: getAccountDetail(accountId) [triple-check!]
│  ├─ Check: Account still available?
│  ├─ Display: "⏳ Creating Your Ticket..." (Processing state)
│  │
│  ├─ TICKET CREATION (createAccountPurchaseTicket)
│  │  ├─ API Call 1: POST /accounts/reserve/{accountId}
│  │  │   └─ Reserve for 30 minutes
│  │  │   └─ Return: reservationSuccess boolean
│  │  │
│  │  ├─ Create Discord Ticket Channel
│  │  │   ├─ Name: {username}-account-{ticketNumber}
│  │  │   ├─ Permissions: Private to customer + support
│  │  │   └─ Type: PURCHASE_ACCOUNT
│  │  │
│  │  ├─ API Call 2: POST /api/discord/tickets
│  │  │   └─ Create ticket in database with accountId
│  │  │   └─ Return: ticket object with ticketNumber
│  │  │
│  │  ├─ Send Welcome Message to Ticket Channel
│  │  │   ├─ Account details
│  │  │   ├─ Price: $XX.XX
│  │  │   ├─ Reservation status (30 min or warning)
│  │  │   ├─ Next Steps instructions
│  │  │   └─ Action Buttons:
│  │  │       ├─ 💳 Payment Sent
│  │  │       ├─ ❌ Cancel Order
│  │  │       └─ 🔒 Close Ticket
│  │  │
│  │  └─ Return: channel, ticket, reservationSuccess
│  │
│  └─ Display Success: "✅ Ticket Created Successfully!"
│      └─ Shows ticket channel link + account details + reservation status
│
├─ [8] CUSTOMER PAYMENT FLOW
│  ├─ Customer clicks: 💳 Payment Sent
│  │
│  ├─ handleAccountPaymentSent() → account-buttons.ts
│  ├─ API: NO DIRECT API CALL (missing piece!)
│  ├─ Creates: Payment Notification Embed
│  ├─ Mentions: @support role
│  ├─ Display: Staff Action Buttons
│  │   ├─ ✅ Confirm Payment
│  │   ├─ 📦 Deliver Account
│  │   ├─ 🔓 Release Account
│  │   └─ ❌ Cancel & Refund
│  │
│  └─ Customer Reply: "✅ Payment notification sent to staff"
│
├─ [9] STAFF PAYMENT VERIFICATION FLOW
│  ├─ handleAccountConfirmPayment() → account-buttons.ts
│  ├─ API: NO DIRECT API CALL (missing piece!)
│  ├─ Display: "✅ Payment Confirmed" message
│  ├─ Notification: Shows payment verified and ready for delivery
│  └─ Status: Ready for next step (Deliver Account)
│
├─ [10] STAFF ACCOUNT DELIVERY FLOW
│  ├─ handleAccountDeliver() → account-buttons.ts
│  ├─ Shows: Delivery Credentials Modal
│  │   ├─ Email/Username (required)
│  │   ├─ Password (required)
│  │   ├─ Bank PIN (optional)
│  │   └─ Additional Info (optional)
│  │
│  ├─ handleAccountDeliveryModal() → account-delivery.modal.ts
│  ├─ API: NO DIRECT API CALL (missing piece!)
│  ├─ Extract credentials from modal
│  ├─ Send: Account Delivery Embed (visible to customer)
│  │   └─ Shows credentials in code block
│  └─ Send: Order Complete Embed
│      └─ Shows security checklist
│
├─ [11] POST-DELIVERY (INCOMPLETE IN FLOW)
│  ├─ Components not wired: Leave Review, Close Ticket
│  └─ Status updates: NOT TRACKED in database
│
├─ [ALTERNATIVE FLOW] CANCEL ORDER
│  ├─ handleAccountCancelOrder() → account-buttons.ts
│  ├─ API: NO DIRECT API CALL for release (missing piece!)
│  ├─ TODO comment: "Need to get accountId from ticket to release it"
│  └─ Display: Order Cancelled message
│
├─ [ALTERNATIVE FLOW] RELEASE ACCOUNT (Staff)
│  ├─ handleAccountRelease() → account-buttons.ts
│  ├─ API Call: POST /accounts/release/{accountId}
│  ├─ Return: release success/failure
│  └─ Display: Release confirmation message
│
└─ END

```

---

## 2. BUTTON AND SELECT MENU IDS & HANDLERS

### A. BUTTON IDs (from accountComponentBuilder.ts)

```
ACCOUNT_BUTTON_IDS = {
  BROWSE_ACCOUNTS: "browse_accounts"
    └─ Handler: handleBrowseAccounts()
    └─ File: account-buttons.ts:24-79

  BACK_TO_CATEGORIES: "account_back_categories"
    └─ Handler: handleBackToCategories()
    └─ File: account-buttons.ts:84-121

  BACK_TO_LIST: "account_back_list" + suffix: "_CATEGORY"
    └─ Format: "account_back_list_MAIN"
    └─ Handler: handleBackToList()
    └─ File: account-buttons.ts:258-319

  ACCOUNT_VIEW: "account_view_" + suffix: "ACCOUNTID"
    └─ Format: "account_view_12345"
    └─ Handler: handleAccountView()
    └─ File: account-buttons.ts:200-252

  ACCOUNT_PURCHASE: "account_purchase_" + suffix: "ACCOUNTID"
    └─ Format: "account_purchase_12345"
    └─ Handler: handleAccountPurchase()
    └─ File: account-buttons.ts:325-375

  ACCOUNT_CONFIRM: "account_confirm_" + suffix: "ACCOUNTID"
    └─ Format: "account_confirm_12345"
    └─ Handler: handleAccountConfirm()
    └─ File: account-buttons.ts:418-525

  ACCOUNT_CANCEL: "account_cancel"
    └─ Handler: handleAccountCancel()
    └─ File: account-buttons.ts:380-412

  ACCOUNT_PAGE: "account_page_" + suffix: "CATEGORY_PAGE"
    └─ Format: "account_page_MAIN_2"
    └─ Handler: handleAccountPage()
    └─ File: account-buttons.ts:127-194

  PAYMENT_SENT: "account_payment_sent_" + suffix: "TICKETID"
    └─ Format: "account_payment_sent_ticket123"
    └─ Handler: handleAccountPaymentSent()
    └─ File: account-buttons.ts:531-587

  CANCEL_ORDER: "account_cancel_order_" + suffix: "TICKETID"
    └─ Format: "account_cancel_order_ticket123"
    └─ Handler: handleAccountCancelOrder()
    └─ File: account-buttons.ts:593-633

  CONFIRM_DELIVERY: "account_confirm_delivery_" + suffix: "TICKETID"
    └─ Not implemented in buttons.ts
    └─ TODO: Needs implementation

  LEAVE_REVIEW: "account_leave_review_" + suffix: "ORDERID"
    └─ Not implemented in buttons.ts
    └─ TODO: Needs implementation

  CLOSE_TICKET: "account_close_ticket_" + suffix: "TICKETID"
    └─ Uses generic: "ticket_close_" prefix
    └─ Not account-specific
}

// Additional Staff Buttons (not in ACCOUNT_BUTTON_IDS constant!)
"account_confirm_payment_" + "TICKETID"
  └─ Handler: handleAccountConfirmPayment()
  └─ File: account-buttons.ts:639-680

"account_deliver_" + "TICKETID_ACCOUNTID"
  └─ Handler: handleAccountDeliver()
  └─ File: account-buttons.ts:686-712

"account_release_" + "ACCOUNTID"
  └─ Handler: handleAccountRelease()
  └─ File: account-buttons.ts:718-763
```

### B. SELECT MENU IDs (from accountComponentBuilder.ts)

```
ACCOUNT_SELECT_IDS = {
  CATEGORY_SELECT: "account_category_select"
    └─ Handler: handleAccountCategorySelect()
    └─ File: account-select.menu.ts:21-105

  ACCOUNT_SELECT: "account_select_menu"
    └─ Handler: handleAccountSelect()
    └─ File: account-select.menu.ts:111-177

  PAYMENT_SELECT: "account_payment_select"
    └─ Handler: handleAccountPaymentSelect()
    └─ File: account-select.menu.ts:183-227
    └─ Status: TODO - "Integrate with ticket creation in Phase 7"
}
```

### C. MODAL IDs (from accountComponentBuilder.ts)

```
ACCOUNT_MODAL_IDS = {
  DELIVERY_CREDENTIALS: "account_delivery_modal_" + "TICKETID"
    └─ Format: "account_delivery_modal_ticket123"
    └─ Handler: handleAccountDeliveryModal()
    └─ File: account-delivery.modal.ts:10-92

  PAYMENT_PREFERENCE: "account_payment_modal"
    └─ Status: DEFINED but NOT USED
    └─ TODO: Needs implementation

  CANCEL_REASON: "account_cancel_reason_modal_" + "TICKETID"
    └─ Status: DEFINED but NOT USED
    └─ TODO: Needs implementation
}
```

---

## 3. HANDLER REGISTRATION

### Button Handler Registration (interactions/buttons/index.ts:252-312)

```typescript
// Lines 254-258: Account pagination
customId.startsWith(ACCOUNT_BUTTON_IDS.ACCOUNT_PAGE)
  → handleAccountPage()

// Lines 261-264: Account view details
customId.startsWith(ACCOUNT_BUTTON_IDS.ACCOUNT_VIEW)
  → handleAccountView()

// Lines 267-270: Account purchase
customId.startsWith(ACCOUNT_BUTTON_IDS.ACCOUNT_PURCHASE)
  → handleAccountPurchase()

// Lines 273-276: Back to list
customId.startsWith(ACCOUNT_BUTTON_IDS.BACK_TO_LIST)
  → handleBackToList()

// Lines 279-282: Account confirm purchase
customId.startsWith(ACCOUNT_BUTTON_IDS.ACCOUNT_CONFIRM)
  → handleAccountConfirm()

// Lines 285-288: Payment sent
customId.startsWith(ACCOUNT_BUTTON_IDS.PAYMENT_SENT)
  → handleAccountPaymentSent()

// Lines 291-294: Cancel order
customId.startsWith(ACCOUNT_BUTTON_IDS.CANCEL_ORDER)
  → handleAccountCancelOrder()

// Lines 297-300: Staff confirm payment
customId.startsWith("account_confirm_payment_")
  → handleAccountConfirmPayment()

// Lines 303-306: Staff deliver account
customId.startsWith("account_deliver_")
  → handleAccountDeliver()

// Lines 309-312: Staff release account
customId.startsWith("account_release_")
  → handleAccountRelease()
```

### Select Menu Handler Registration (interactions/selectMenus/index.ts:27-31)

```typescript
[ACCOUNT_SELECT_IDS.CATEGORY_SELECT]: handleAccountCategorySelect
  → account_category_select

[ACCOUNT_SELECT_IDS.ACCOUNT_SELECT]: handleAccountSelect
  → account_select_menu

[ACCOUNT_SELECT_IDS.PAYMENT_SELECT]: handleAccountPaymentSelect
  → account_payment_select
```

### Modal Handler Registration (interactions/modals/index.ts:83-85)

```typescript
Pattern: /^account_delivery_modal_/
  → handleAccountDeliveryModal
```

---

## 4. ISSUES AND GAPS FOUND

### CRITICAL ISSUES

#### 1. ⚠️ MISSING ACCOUNT RESERVATION TRACKING
- **Location**: handleAccountCancelOrder() @ account-buttons.ts:593-633
- **Issue**: Cannot release account when customer cancels
- **Code Comment** (line 605-606):
  ```
  // TODO: Need to get accountId from ticket to release it
  // For now, we'll just notify
  ```
- **Impact**: ACCOUNT GETS STUCK IN RESERVED STATE - Cannot be purchased by others
- **Fix Needed**: Store accountId in ticket metadata or retrieve from ticket DB

#### 2. ⚠️ NO DATABASE UPDATES ON PAYMENT ACTIONS
- **Location**: handleAccountPaymentSent() @ line 531-587
- **Issue**: No API call to update ticket payment status
- **Impact**: 
  - Payment status not tracked in database
  - No audit trail of payment notifications
  - Cannot query pending payments

- **Location**: handleAccountConfirmPayment() @ line 639-680
- **Issue**: No API call to update ticket to "payment_confirmed" status
- **Impact**:
  - Cannot track which orders have paid
  - Staff cannot query "ready for delivery" orders

#### 3. ⚠️ NO STATUS UPDATE AFTER DELIVERY
- **Location**: handleAccountDeliveryModal() @ account-delivery.modal.ts:10-92
- **Issue**: No API call to update ticket status to "completed" or "delivered"
- **Impact**:
  - Ticket status remains in limbo
  - Cannot generate completion reports
  - No audit trail of when credentials were delivered

#### 4. ⚠️ UNUSED SELECT MENU HANDLER
- **Location**: handleAccountPaymentSelect() @ account-select.menu.ts:183-227
- **Issue**: 
  ```typescript
  // TODO: Integrate with ticket creation in Phase 7
  await interaction.followUp({
    content: "Payment method selected. Proceeding with ticket creation...",
    ephemeral: true,
  });
  ```
- **Impact**: Payment method selection doesn't do anything
- **Note**: This UI element exists but is non-functional

#### 5. ⚠️ INCOMPLETE POST-DELIVERY FLOW
- **Location**: accountComponentBuilder.ts:317-331
- **Issue**: Post-delivery buttons created but not integrated:
  - "⭐ Leave Review" (LEAVE_REVIEW button)
  - "📋 Close Ticket" (CLOSE_TICKET button)
- **Impact**: Customers cannot properly close tickets or leave reviews
- **Not Implemented**: handlers for these buttons

#### 6. ⚠️ MISSING STAFF BUTTON ROUTING
- **Location**: interactions/buttons/index.ts
- **Issue**: Staff buttons are hardcoded in handler function, not in main buttonHandlers object
  ```typescript
  // These are not in the buttonHandlers map!
  "account_confirm_payment_"
  "account_deliver_"
  "account_release_"
  ```
- **Why It Matters**: If button routing changes, these would be easy to miss
- **Risk**: Inconsistent error handling compared to main handlers

#### 7. ⚠️ UNUSED MODAL IDs
- **Location**: accountComponentBuilder.ts:43-47
- **Issue**: Two modal IDs defined but never used:
  ```typescript
  PAYMENT_PREFERENCE: "account_payment_modal"      // ← NEVER USED
  CANCEL_REASON: "account_cancel_reason_modal"     // ← NEVER USED
  ```
- **Impact**: Code cruft, potential confusion

#### 8. ⚠️ NO CANCEL REASON COLLECTION
- **Location**: handleAccountCancelOrder() @ line 593-633
- **Issue**: Cancel reason modal is defined but never shown
- **Impact**: Cannot gather customer feedback on why orders were cancelled

#### 9. ⚠️ FRAGILE BUTTON CUSTOM ID PARSING
- **Location**: handleAccountDeliver() @ line 686-712
```typescript
const parts = interaction.customId.split("_");
const ticketId = parts[2];        // ← What if custom ID format changes?
const accountId = parts[3];       // ← Brittle array indexing
```
- **Issue**: Uses array indexing instead of regex or constants
- **Impact**: Easy to break if custom ID format changes
- **Compare**: Other handlers use `.replace(ACCOUNT_BUTTON_IDS.prefix, "")`

---

### DESIGN ISSUES

#### 10. ⚠️ ACCOUNT AVAILABILITY CHECKED 4 TIMES
- **Locations**:
  - handleAccountPurchase() @ line 336
  - handleAccountConfirm() @ line 430
  - handleAccountView() @ line 211
  - getAccountDetail called in detail view
- **Issue**: Over-fetching same account data
- **Suggestion**: Cache account details for session

#### 11. ⚠️ NO TRANSACTION ROLLBACK ON FAILURE
- **Location**: createAccountPurchaseTicket() @ ticket.service.ts:278-389
- **Flow**:
  1. Reserve account in API
  2. Create Discord channel
  3. Create database ticket
  4. If step 3 fails → channel orphaned, account reserved forever
- **Impact**: Infrastructure leak
- **Need**: Try/catch with channel cleanup

#### 12. ⚠️ INCONSISTENT ERROR HANDLING
- **Issue**: Some handlers use `.replace()`, others use `.split()`
- **Issue**: Some check deferred status, others don't
- **Example**: 
  - handleAccountPaymentSent uses `deferReply({ ephemeral: true })`
  - handleAccountCancelOrder uses `deferReply()` (not ephemeral)

#### 13. ⚠️ STAFF BUTTONS NOT IN TYPE SYSTEM
- **Location**: buttons/index.ts
- **Issue**: Staff buttons like "account_confirm_payment_" are hardcoded in handler router
- **No Entry**: Not in ACCOUNT_BUTTON_IDS constant
- **Impact**: Inconsistent with pattern used for other buttons

---

### MISSING VALIDATIONS

#### 14. ⚠️ NO PERMISSION CHECKS
- **Issue**: No verification that user clicking staff button is actually staff
- **Risk**: Any user can click "Deliver Account" and enter fake credentials
- **Needed**: Check for support role before showing modal

#### 15. ⚠️ NO DUPLICATE PURCHASE PREVENTION
- **Issue**: Same user can click "Confirm Purchase" twice
- **Risk**: Could create two tickets for same account
- **Needed**: Idempotency key or one-time-use button

#### 16. ⚠️ NO RESERVATION EXPIRY HANDLING
- **Issue**: Account reserved for 30 min, but no cleanup of expired reservations shown
- **Risk**: User sees "account available" but API rejects purchase due to old reservation
- **Needed**: Better error message when reservation expires

---

### WORKFLOW GAPS

#### 17. ⚠️ NO PAYMENT DETAILS PROVIDED TO CUSTOMER
- **Location**: sendAccountPurchaseWelcome() @ ticket.service.ts:394-477
- **Issue**: "Instructions" say "send payment to provided details" but no details shown
- **Code**: 
  ```
  "2️⃣ Send payment to the provided details\n"
  ```
- **Missing**: Payment address, crypto wallet, or payment method selection
- **Needed**: Integration with payment method system

#### 18. ⚠️ DISCONNECT BETWEEN TICKET AND ORDER TRACKING
- **Issue**: No link between ticket and account order in database
- **Risk**: Cannot generate "My Orders" list for customers
- **Needed**: Account purchase order table with proper relationships

#### 19. ⚠️ NO PAYMENT VERIFICATION MECHANISM
- **Issue**: Staff have to manually verify payment happened
- **Risk**: Disputes about whether payment was actually sent
- **Needed**: Integration with payment processor webhooks

---

### CODE QUALITY ISSUES

#### 20. ⚠️ INCONSISTENT LOGGING LEVELS
- **Issue**: Some handlers use logger.info, some don't log at all
- **Example**: 
  - handleAccountPaymentSent() logs (line 578)
  - handleAccountConfirmPayment() logs (line 671)
  - handleAccountDeliver() logs (line 702)
  - But no standardized INFO level for transitions

#### 21. ⚠️ MAGIC STRING "page_indicator"
- **Location**: accountComponentBuilder.ts:173
```typescript
.setCustomId("page_indicator")
.setDisabled(true)
```
- **Issue**: Button that does nothing, just shows page number
- **Problem**: Takes up button space, could use components field instead

#### 22. ⚠️ NO INPUT VALIDATION
- **Location**: handleAccountDeliveryModal() @ account-delivery.modal.ts:20-25
- **Issue**: Accepts email/password without validation
- **Example**: No check if email looks valid
- **Risk**: Staff could accidentally enter garbage and send to customer

#### 23. ⚠️ RACE CONDITION POSSIBLE
- **Issue**: Between getAccountDetail() and actual purchase, account could be bought
- **Current Flow**:
  1. Get account detail ✓
  2. Show purchase confirm
  3. User clicks confirm
  4. Get account detail again
  5. Create reservation
- **Problem**: Race between step 2-3 while button is shown
- **Suggestion**: Lock account immediately on purchase initiation

---

## 5. FLOW COMPLETENESS CHECK

| Step | Status | Notes |
|------|--------|-------|
| 1. Browse Accounts | ✅ Complete | All handlers working |
| 2. Category Selection | ✅ Complete | Dropdown works |
| 3. Account List | ✅ Complete | Pagination implemented |
| 4. Account Details | ✅ Complete | Full details shown |
| 5. Purchase Initiation | ✅ Complete | Confirmation dialog works |
| 6. Ticket Creation | ✅ Complete | Channel & DB entry created |
| 7. Account Reservation | ✅ Complete | 30-min reservation set |
| 8. Payment Notification | ⚠️ Incomplete | No DB status update |
| 9. Payment Verification | ⚠️ Incomplete | No DB status update |
| 10. Account Delivery | ⚠️ Incomplete | No DB status update |
| 11. Order Completion | ❌ Missing | No completion handler |
| 12. Customer Review | ❌ Missing | Handler not implemented |
| 13. Ticket Closure | ❌ Missing | Generic handler, not account-specific |
| 14. Refunds/Cancels | ⚠️ Incomplete | Account not released on cancel |

---

## 6. SUGGESTED IMPROVEMENTS

### HIGH PRIORITY (Security & Data Integrity)

#### Fix 1: Add Permission Checks to Staff Buttons
```typescript
// Before showing modal/processing
if (!interaction.member?.roles.cache.has(discordConfig.supportRoleId)) {
  await interaction.reply({
    content: "❌ You don't have permission to perform this action.",
    ephemeral: true
  });
  return;
}
```

#### Fix 2: Update Ticket Status on All State Changes
```typescript
// Add API calls to track state
const statuses = {
  AWAITING_PAYMENT: "awaiting_payment",
  PAYMENT_SENT: "payment_sent",
  PAYMENT_CONFIRMED: "payment_confirmed",
  ACCOUNT_DELIVERED: "account_delivered",
  COMPLETED: "completed"
};

// In handleAccountPaymentSent
await apiService.updateTicketStatus(ticketId, "payment_sent");

// In handleAccountConfirmPayment
await apiService.updateTicketStatus(ticketId, "payment_confirmed");

// In handleAccountDeliveryModal
await apiService.updateTicketStatus(ticketId, "account_delivered");
```

#### Fix 3: Release Account on Cancel
```typescript
// In handleAccountCancelOrder
const accountId = /* extract from ticket */;
if (accountId) {
  await apiService.releaseAccount(accountId);
}
```

### MEDIUM PRIORITY (User Experience)

#### Fix 4: Integrate Payment Method Selection
```typescript
// Make handleAccountPaymentSelect functional
// Create payment details embed based on selected method
// Store in ticket for reference
```

#### Fix 5: Add Reservation Expiry Warnings
```typescript
// Show countdown timer
// Warn customer when 5 minutes remaining
// Auto-cancel if not completed in 30 min
```

#### Fix 6: Implement Post-Delivery Flow
```typescript
// Create handlers for:
// - Leave Review button
// - Close Ticket button
// - Send delivery confirmation email-equivalent
```

### LOWER PRIORITY (Code Quality)

#### Fix 7: Standardize Button Custom ID Parsing
```typescript
// Instead of: const accountId = customId.replace("account_deliver_", "")
// Use regex with groups:
const match = customId.match(/^account_deliver_(.+?)_(.+)$/);
const [, ticketId, accountId] = match;
```

#### Fix 8: Create Account Delivery Service
```typescript
class AccountDeliveryService {
  async deliverAccount(ticketId: string, credentials: Credentials): Promise<void> {
    // Handle modal submission
    // Store in DB
    // Send to customer
    // Update ticket status
    // Mark account as delivered
  }
}
```

#### Fix 9: Remove Dead Code
```typescript
// Delete:
// - handleAccountPaymentSelect (or implement it)
// - PAYMENT_PREFERENCE modal ID
// - CANCEL_REASON modal ID (if not implementing)
// - createCancelReasonModal (if not using)
```

#### Fix 10: Add Input Validation
```typescript
// In handleAccountDeliveryModal:
if (!email || !email.includes('@')) {
  return error("Invalid email format");
}
if (password.length < 6) {
  return error("Password too short");
}
```

---

## 7. DATABASE SCHEMA NEEDS

### Required Ticket Fields
```
tickets {
  id
  ticketNumber
  customerDiscordId
  ticketType: 'PURCHASE_ACCOUNT'
  status: 'awaiting_payment' | 'payment_sent' | 'payment_confirmed' | 'account_delivered' | 'completed'
  accountId        ← CRITICAL: Missing in current flow
  channelId
  createdAt
  updatedAt
  paymentNotifiedAt  ← NEW: When payment sent notification sent
  paymentConfirmedAt ← NEW: When staff confirmed payment
  accountDeliveredAt ← NEW: When account credentials sent
  completedAt       ← NEW: When order marked complete
}

accountPurchases {  ← NEW: Separate table for order tracking
  id
  ticketId
  accountId
  customerId
  purchasePrice
  status
  createdAt
  deliveredAt
  completedAt
}

accountReservations {  ← Ensure this exists
  id
  accountId
  reservedByDiscordId
  expiresAt
  status: 'active' | 'released' | 'expired'
}
```

---

## 8. MISSING ENVIRONMENT VARIABLES / CONFIG

Check if these are defined in discord.config:
- Payment method configuration (payment addresses)
- Reservation timeout (currently hardcoded as 30 min)
- Support role ID (used correctly)
- Admin role ID (used correctly)
- Account shop channel ID (for posting shop message)

---

## 9. API ENDPOINTS THAT SHOULD EXIST

Based on code calls, these endpoints should be checked:
```
✅ GET /accounts/categories           → Exists
✅ GET /accounts/{id}                 → Exists
✅ GET /accounts/list?category=X      → Exists
✅ POST /accounts/reserve/{id}        → Exists (called line 290)
✅ POST /accounts/release/{id}        → Exists (called line 730)
❌ PATCH /api/discord/tickets/{id}    → MISSING (status updates)
✅ GET /accounts/stats                → Exists (called in message)
```

---

## 10. CRITICAL TODO COMMENTS IN CODE

These are warnings already in the codebase:

1. **account-buttons.ts:605-606**: Release account on cancel
2. **account-select.menu.ts:210**: Integrate payment selection with ticket creation
3. **accountComponentBuilder.ts**: Unused modal IDs and helper functions

---

## SUMMARY

### What Works
- Account browsing, category selection, pagination
- Account detail views with beautiful embeds
- Ticket channel creation with proper permissions
- Account reservation system
- Basic UI flow with appropriate buttons

### What's Broken
1. No database status tracking for payment → can't generate reports
2. Can't release account if customer cancels → permanently stuck
3. Staff buttons not permission-checked → security issue
4. No payment method selection integrated
5. Post-delivery flow incomplete

### What's Missing
1. Payment details provided to customer
2. Order history/tracking system
3. Payment verification mechanism
4. Account reservation expiry handling
5. Delivery confirmation workflow
6. Input validation on credentials

### Recommended Action Plan
1. **Week 1**: Fix critical issues (permissions, account release, status updates)
2. **Week 2**: Add payment method integration
3. **Week 3**: Implement post-delivery flow
4. **Week 4**: Add validation and refactor parsing

This is a 75% complete feature that needs the last 25% of workflow automation.

