# 🔒 Customer Close Ticket Flow - Complete Breakdown

## 📋 Overview

This document explains EXACTLY what happens when a customer closes a ticket, step by step.

---

## 🚦 Customer Restrictions

### **Can Customer Close Ticket?**

```
┌─────────────────────────────────────────────────────────┐
│ ✅ YES - Customer CAN close if:                          │
├─────────────────────────────────────────────────────────┤
│  • NO order exists in the ticket                         │
│  • Ticket is just for questions/support                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ❌ NO - Customer CANNOT close if:                        │
├─────────────────────────────────────────────────────────┤
│  • ANY order exists (regardless of status)               │
│  • Order status is PENDING                               │
│  • Order status is AWAITING_CONFIRMATION                 │
│  • Order status is IN_PROGRESS                           │
│  • Order status is READY_FOR_REVIEW                      │
│  • Order status is COMPLETED                             │
│  • Order status is CANCELLED                             │
└─────────────────────────────────────────────────────────┘
```

**Reason:** If an order exists, only Support/Admin should manage ticket closure to ensure proper workflow completion.

---

## 🔄 Complete Close Ticket Flow

### **Step-by-Step Process:**

```
1. Customer runs /close-ticket
   ↓
2. Bot checks: Is user the ticket customer?
   ↓ YES
3. Bot checks: Does ticket have an order?
   ↓ NO (if YES → BLOCKED)
4. Bot proceeds with closure
   ↓
5. API Call: POST /api/discord/tickets/{ticketId}/close
   ↓
6. Discord Actions:
   ├─ Send "Ticket Closed" message
   ├─ Disable [Close Ticket] button
   ├─ Rename channel: "closed-{original-name}"
   ├─ Move to "Closed Tickets" category
   └─ Remove customer's view permissions
   ↓
7. Customer sees success message
   ↓
8. Channel hidden from customer ✅
```

---

## 📝 Detailed Actions Breakdown

### **Action 1: Permission Check**

**Location:** `close-ticket.command.ts:61-78`

```typescript
// Check if user is the customer
const isCustomer = ticket.customerDiscordId === interaction.user.id;

if (!isCustomer && !isSupport && !isAdmin) {
    // ❌ BLOCKED: Not authorized
    return "You do not have permission to close this ticket.";
}
```

---

### **Action 2: Order Check**

**Location:** `close-ticket.command.ts:86-126`

```typescript
// Fetch order by ticket ID
const orderResponse = await discordApiClient.get(
    `/discord/orders/by-ticket/${ticket.id}`
);

// If customer AND order exists
if (isCustomer && !isSupport && !isAdmin) {
    if (associatedOrder) {
        // ❌ BLOCKED: Order exists
        return "You cannot close this ticket because an order exists.";
    }
}
```

**Error Message Customer Sees:**

```
❌ Cannot Close Ticket

You cannot close this ticket because an order exists.

Order #0001
Status: IN_PROGRESS
Worker: @WorkerName

Please contact support if you need to close this ticket.
```

---

### **Action 3: API Call to Backend**

**Location:** `ticket.service.ts:869-874`

```typescript
// Call backend API to mark ticket as closed
await this.apiClient.post(`/api/discord/tickets/${ticketId}/close`, {
    reason: reason || undefined
});
```

**What Backend Does:**
- Updates ticket status in database → `CLOSED`
- Saves close reason
- Records who closed it (customer/support/admin)
- Logs closure event

---

### **Action 4: Send "Ticket Closed" Message**

**Location:** `ticket.service.ts:886-903`

**Message Posted in Channel:**

```
🔒 Ticket Closed

This ticket has been closed by @CustomerName.

[Timestamp]
```

**If reason provided:**

```
🔒 Ticket Closed

This ticket has been closed by @CustomerName.

Reason: "Issue resolved"

[Timestamp]
```

**Embed Color:** 🔴 Red (#ed4245)

---

### **Action 5: Disable [Close Ticket] Button**

**Location:** `ticket.service.ts:905-933`

**What Happens:**
1. Bot searches last 100 messages
2. Finds the welcome message with buttons
3. Disables all buttons (including [Close Ticket])

**Before:**
```
[Calculate Price]  [Close Ticket]
     ↑ Active          ↑ Active
```

**After:**
```
[Calculate Price]  [Close Ticket]
     ↑ Disabled        ↑ Disabled
```

**Why:** Prevents customer from clicking buttons after closure

---

### **Action 6: Rename Channel**

**Location:** `ticket.service.ts:941-957`

**Renaming Logic:**

```
Original: ticket-0001
          ↓
Renamed:  closed-ticket-0001
```

```
Original: monassereng_09706-services-0015
          ↓
Renamed:  closed-monassereng_09706-services-0015
```

**If already starts with "closed-":** No rename (skip)

**Timeout:** 3 seconds (if fails, continues anyway)

**Why:** Visual indicator that ticket is closed

---

### **Action 7: Move to "Closed Tickets" Category**

**Location:** `ticket.service.ts:959-977`

**Movement:**

```
BEFORE:
📁 Tickets
  ├── ticket-0001 ← Customer's ticket here
  ├── ticket-0002
  └── ticket-0003

📁 Closed Tickets
  └── (empty)
```

```
AFTER:
📁 Tickets
  ├── ticket-0002
  └── ticket-0003

📁 Closed Tickets
  └── closed-ticket-0001 ← Moved here
```

**Permissions Preserved:**
- Support can still view
- Admin can still view
- Customer permissions handled in next step

**Timeout:** 5 seconds (if fails, logs error)

**Delay Before Move:** 1 second (allows rename to complete)

---

### **Action 8: Remove Customer Permissions**

**Location:** `ticket.service.ts:979-999`

**Permission Change:**

```
BEFORE:
Permissions for @CustomerName:
  ✅ View Channel: TRUE
  ✅ Send Messages: TRUE
  ✅ Read History: TRUE
```

```
AFTER:
Permissions for @CustomerName:
  ❌ View Channel: FALSE  ← Changed
  ✅ Send Messages: TRUE
  ✅ Read History: TRUE
```

**Result:** Customer can no longer see the channel in their Discord sidebar

**Timeout:** 3 seconds (if fails, logs warning)

**Delay Before Permission Change:** 500ms

---

### **Action 9: Success Message to Customer**

**Location:** `close-ticket.command.ts:194-200`

**Customer Sees:**

```
✅ Ticket has been closed. The channel will be archived shortly.
```

**This message is:**
- Ephemeral (only customer sees it)
- Sent in the command response
- Confirmation of successful closure

---

### **Action 10: Logging**

**Location:** `ticket.service.ts:1005-1007`

**Log Entry:**

```
[CloseTicket] Ticket abc123 closed by CustomerName#1234
```

**If reason provided:**

```
[CloseTicket] Ticket abc123 closed by CustomerName#1234: Issue resolved
```

**Logs Include:**
- Ticket ID
- Who closed it
- User tag
- Close reason (if any)
- Timestamp

---

## ⏱️ Timeline

**Total Duration:** ~5-10 seconds

```
00:00 - Customer runs /close-ticket
00:01 - Permission check ✅
00:01 - Order check ✅
00:02 - API call to backend ✅
00:03 - "Ticket Closed" message sent ✅
00:03 - Button disabled ✅
00:04 - Channel rename attempt (3s timeout)
00:05 - Wait 1 second
00:06 - Move to Closed Tickets (5s timeout)
00:07 - Wait 500ms
00:07 - Remove customer permissions (3s timeout)
00:08 - Success message to customer ✅
00:08 - Logging ✅
00:08 - DONE ✅
```

---

## 🎯 What Customer Experiences

### **1. Before Closing:**

```
Customer's Discord:
📁 Tickets
  └── ticket-0001 ← Can see and access
```

**Customer can:**
- View channel
- Send messages
- See conversation history

---

### **2. During Closing:**

```
Customer types: /close-ticket

Bot checks:
  ✅ Is customer? Yes
  ✅ Has order? No
  ✅ Allowed to close? Yes

Bot processes...
```

**Customer sees:**
- "Thinking..." indicator (deferred reply)
- Processing for 5-10 seconds
- Success message appears

---

### **3. After Closing:**

```
Customer's Discord:
📁 Tickets
  └── (channel disappeared)
```

**Customer experiences:**
- Channel vanishes from sidebar
- Cannot access channel anymore
- Cannot see it in channel list
- DM confirmation (if sent)

**What customer CANNOT do:**
- View the closed ticket
- Reopen the ticket (no button)
- Access conversation history
- Send new messages

---

## 🔐 Security & Permissions

### **Who Can See Closed Ticket?**

```
┌──────────────────────────────────────────────────┐
│ Customer:         ❌ No (permissions removed)     │
│ Support:          ✅ Yes (can still view)         │
│ Admin:            ✅ Yes (full access)            │
│ Other Customers:  ❌ No (never had access)        │
│ Workers:          ❌ No (unless support/admin)    │
└──────────────────────────────────────────────────┘
```

### **What Can Be Done to Closed Ticket?**

```
┌──────────────────────────────────────────────────┐
│ Reopen:           ❌ Not implemented (yet)        │
│ View History:     ✅ Yes (Support/Admin)          │
│ Send Messages:    ✅ Yes (Support/Admin)          │
│ Delete:           ✅ Yes (Admin only)             │
│ Archive:          ✅ Yes (auto after 72 hours)    │
└──────────────────────────────────────────────────┘
```

---

## ❓ FAQ

### **Q: Can customer reopen closed ticket?**
**A:** No, there's no reopen functionality (yet). Customer must create new ticket.

### **Q: Can customer see closed ticket history?**
**A:** No, permissions are removed. Only Support/Admin can see it.

### **Q: What if customer has active order?**
**A:** Blocked! Customer cannot close ticket with ANY order. Must contact support.

### **Q: Can Support/Admin still close tickets with orders?**
**A:** Yes, but they get a confirmation warning if order is IN_PROGRESS, COMPLETED, or READY_FOR_REVIEW.

### **Q: What happens to closed tickets after time?**
**A:** Auto-archived after 72 hours (configurable via `CLOSED_TICKET_ARCHIVE_AFTER_HOURS`).

### **Q: Can customer close via button or command?**
**A:** Both!
- Button: `[Close Ticket]` in welcome message
- Command: `/close-ticket`

### **Q: What if API call fails?**
**A:** Bot continues with Discord actions anyway. Logs warning.

### **Q: What if rename/move fails?**
**A:** Bot logs error but continues. Permissions still removed. Customer still loses access.

---

## 🛠️ Error Handling

### **Scenario 1: Customer Has Order**

```
Customer: /close-ticket
Bot: ❌ "You cannot close this ticket because an order exists."
Result: Ticket stays open, nothing changes
```

---

### **Scenario 2: Not Ticket Customer**

```
Random User: /close-ticket
Bot: ❌ "You do not have permission to close this ticket."
Result: Blocked, ticket stays open
```

---

### **Scenario 3: API Call Fails**

```
Customer: /close-ticket
Bot calls API → FAILS
Bot continues anyway:
  ✅ Sends "Ticket Closed" message
  ✅ Renames channel
  ✅ Moves to Closed Tickets
  ✅ Removes permissions
⚠️ Warning logged: "API close call failed (will continue)"
```

**Why continue?** Customer experience is more important. Backend can be updated manually.

---

### **Scenario 4: Channel Rename Times Out**

```
Bot tries to rename → 3 seconds timeout
⚠️ Rename failed, continuing...
Bot proceeds to move channel anyway
Result: Channel moved but not renamed (acceptable)
```

---

### **Scenario 5: Move to Closed Category Fails**

```
Bot tries to move → 5 seconds timeout
❌ Failed to move
Channel stays in "Tickets" category
⚠️ Error logged
Bot still removes customer permissions
Result: Customer loses access, channel not moved (manual fix needed)
```

---

## 📊 Backend API Impact

### **API Endpoint Called:**

```
POST /api/discord/tickets/{ticketId}/close
```

**Request Body:**
```json
{
  "reason": "Issue resolved" // optional
}
```

**What Backend Does:**
1. Updates ticket record in database
2. Sets `status` = "CLOSED"
3. Sets `closedAt` = current timestamp
4. Sets `closedBy` = user who closed it
5. Saves `closeReason` if provided

**Response:** Success confirmation

---

## 🎨 Visual Summary

### **Customer Journey:**

```
1. Customer Opens Ticket
   ↓
2. Gets Help / No Order Created
   ↓
3. Issue Resolved
   ↓
4. Customer: /close-ticket
   ↓
5. Bot: Permission ✅ | Order ❌
   ↓
6. Bot Processes Closure
   ├─ API call
   ├─ Message posted
   ├─ Button disabled
   ├─ Channel renamed
   ├─ Channel moved
   └─ Permissions removed
   ↓
7. Customer Sees: "✅ Ticket closed"
   ↓
8. Channel Disappears from Sidebar
   ↓
9. Support/Admin Can Still View
   ↓
10. Auto-archived after 72 hours
```

---

## 📋 Checklist: When Customer Closes Ticket

- [x] Customer verified as ticket owner
- [x] No order exists in ticket
- [x] Backend API called to update database
- [x] "Ticket Closed" message sent
- [x] Buttons disabled in welcome message
- [x] Channel renamed with "closed-" prefix
- [x] Channel moved to "Closed Tickets" category
- [x] Customer permissions removed (View Channel = false)
- [x] Success message sent to customer
- [x] Closure logged for audit trail
- [x] Customer can no longer access channel
- [x] Support/Admin can still access
- [x] Will auto-archive after 72 hours

---

## 🔄 Comparison: Customer vs Support/Admin Close

| Action | Customer | Support/Admin |
|--------|----------|---------------|
| **Can close with order?** | ❌ No | ✅ Yes (with confirmation) |
| **Blocked if work started?** | ✅ Yes | ⚠️ Warning only |
| **Needs confirmation?** | ❌ No | ✅ Yes (if order exists) |
| **API call?** | ✅ Yes | ✅ Yes |
| **Channel renamed?** | ✅ Yes | ✅ Yes |
| **Channel moved?** | ✅ Yes | ✅ Yes |
| **Customer permissions removed?** | ✅ Yes | ✅ Yes |
| **Can still access after?** | ❌ No | ✅ Yes |

---

## 📁 Code References

**Main Files:**
- `src/discord-bot/commands/close-ticket.command.ts:106-126` - Customer restrictions
- `src/discord-bot/services/ticket.service.ts:859-1012` - Close ticket logic
- `src/discord-bot/interactions/modals/ticket-create.modal.ts:230-247` - Modal close restrictions

**Key Functions:**
- `closeTicket()` - Main closure logic
- `getOrCreateClosedTicketsCategory()` - Get/create closed category
- `handleTicketCloseConfirmModal()` - Handle button close

---

**Summary:** When a customer closes a ticket (without an order), the ticket is closed in the database, moved to a closed category, permissions are removed, and the customer loses access. Support/Admin can still view it. The process takes 5-10 seconds with proper error handling.
