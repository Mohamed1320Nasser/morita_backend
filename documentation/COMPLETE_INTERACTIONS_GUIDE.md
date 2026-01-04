# 🎮 Complete Discord Bot Interactions Guide

## 📋 Table of Contents
1. [Interaction Types](#interaction-types)
2. [Ticket System Flow](#ticket-system-flow)
3. [All Buttons & Permissions](#all-buttons--permissions)
4. [All Commands & Permissions](#all-commands--permissions)
5. [Complete User Journeys](#complete-user-journeys)

---

## 🎯 Interaction Types

Your Discord bot has **4 types of interactions**:

| Type | Description | Example |
|------|-------------|---------|
| **🔘 Buttons** | Clickable buttons on messages | `[Calculate Price]` `[Open Ticket]` |
| **⌨️ Slash Commands** | Commands typed with `/` | `/pricing` `/ticket` `/help` |
| **📝 Modals** | Pop-up forms with text inputs | Ticket creation form |
| **🔽 Select Menus** | Dropdown menus | Service selector |

---

## 🎫 Ticket System Flow (Start to Finish)

### **Step 1: Ticket Opened**
```
Customer clicks: [Open Ticket] button
          ↓
Modal appears with custom fields
          ↓
Customer fills form and submits
          ↓
Private ticket channel created (#ticket-000123)
          ↓
Customer and Support can see channel
```

### **Step 2: Inside Ticket Channel**

**Available Interactions:**

| Button/Command | Who Can Use | What It Does |
|---------------|-------------|--------------|
| `[Calculate Price]` | Anyone | Opens price calculator |
| `[Close Ticket]` | Customer, Support, Admin | Closes the ticket |
| `/create-order` | Support, Admin only | Creates an order from ticket |
| Regular chat | Everyone in ticket | Discuss the service |

---

## 🔘 All Buttons & Their Permissions

### **1. Service & Pricing Buttons**

| Button | Custom ID | Who Can Use | Permission Check |
|--------|-----------|-------------|------------------|
| **Calculate Price** | `calculate_price_<serviceId>` | Everyone | ✅ None |
| **Order Now** | `order_now_<serviceId>` | Everyone | ✅ None |
| **Service Select** | `service_select_<serviceId>` | Everyone | ✅ None |
| **Method Select** | `method_select_<methodId>` | Everyone | ✅ None |
| **Back to Services** | `back_to_services` | Everyone | ✅ None |
| **Back to Category** | `back_to_category_<catId>` | Everyone | ✅ None |
| **Pricing Pagination** | `pricing_page_<page>_<catId>` | Everyone | ✅ None |
| **Service Details** | `pricing_service_details_<id>` | Everyone | ✅ None |

---

### **2. Calculator Buttons**

| Button | Custom ID | Who Can Use | Permission Check |
|--------|-----------|-------------|------------------|
| **Calculate** | `calculate` | Everyone | ✅ None |
| **Recalculate** | `recalculate` | Everyone | ✅ None |
| **Reset Calculator** | `reset_calculator` | Everyone | ✅ None |
| **Order from Price** | `order_from_price_<price>` | Everyone | ✅ None |

---

### **3. Ticket Buttons**

| Button | Custom ID | Who Can Use | Permission Check |
|--------|-----------|-------------|------------------|
| **Open Ticket** | `open_ticket` | Everyone | ✅ None |
| **Create Ticket** | `create_ticket_<ticketType>` | Everyone | ✅ None |
| **Close Ticket** | `ticket_close_<ticketId>` | Customer, Support, Admin | ✅ Checks `customerDiscordId` or roles |
| **Ticket Calculate** | `ticket_calculate_<ticketId>` | Anyone in ticket | ✅ None |

**Permission Logic:**
```typescript
// Close Ticket Permission
const isSupport = member.roles.cache.has(supportRoleId);
const isAdmin = member.roles.cache.has(adminRoleId);
const isCustomer = ticket.customerDiscordId === user.id;

if (!isSupport && !isAdmin && !isCustomer) {
    return "You do not have permission to close this ticket.";
}
```

---

### **4. Order Management Buttons**

| Button | Custom ID | Who Can Use | Permission Check |
|--------|-----------|-------------|------------------|
| **Confirm Order** | `confirm_order_<orderId>` | Customer only | ✅ Checks `customerId` |
| **Cancel Order** | `cancel_order_<orderId>` | Customer only | ✅ Checks `customerId` |
| **Accept Order** | `accept_order_<orderId>` | Worker only | ✅ Checks `workerId` |
| **Start Work** | `start_work_<orderId>` | Assigned Worker | ✅ Checks `workerId` |
| **Complete Order** | `complete_order_<orderId>` | Assigned Worker | ✅ Checks `workerId` |
| **Confirm Complete** | `confirm_complete_<orderId>` | Customer only | ✅ Checks `customerId` |
| **Update Status** | `update_status_<orderId>` | Support, Admin | ✅ Checks roles |
| **Order Info** | `order_info_<orderId>` | Customer, Worker, Support | ✅ Checks relationship |
| **Claim Job** | `claim_job_<orderId>` | Workers with role | ✅ Checks `workerRoleId` |
| **Report Issue** | `report_issue_<orderId>` | Customer, Worker | ✅ Checks involvement |
| **Leave Review** | `leave_review_<orderId>` | Customer only | ✅ Checks `customerId` |
| **Cancel Ticket Order** | `cancel_ticket_order_<orderId>` | Customer only | ✅ Checks `customerId` |

**Permission Logic Examples:**
```typescript
// Customer-only buttons (Confirm Order, Cancel Order)
const order = await getOrder(orderId);
if (order.customerId !== interaction.user.id) {
    return "Only the customer can perform this action.";
}

// Worker-only buttons (Start Work, Complete Order)
const order = await getOrder(orderId);
if (order.workerId !== interaction.user.id) {
    return "Only the assigned worker can perform this action.";
}

// Worker role check (Claim Job)
const hasWorkerRole = member.roles.cache.has(workerRoleId);
if (!hasWorkerRole) {
    return "You must have the Worker role to claim jobs.";
}
```

---

### **5. Help Buttons**

| Button | Custom ID | Who Can Use | Permission Check |
|--------|-----------|-------------|------------------|
| **Help: Services** | `help_services` | Everyone | ✅ None |
| **Help: Pricing** | `help_pricing` | Everyone | ✅ None |
| **Help: Orders** | `help_orders` | Everyone | ✅ None |
| **Help: Support** | `help_support` | Everyone | ✅ None |

---

### **6. Admin Buttons**

| Button | Custom ID | Who Can Use | Permission Check |
|--------|-----------|-------------|------------------|
| **Refresh Pricing Channel** | `admin_refresh_pricing_channel` | Admin only | ✅ Checks `adminRoleId` |

**Permission Logic:**
```typescript
const isAdmin = member.roles.cache.has(adminRoleId);
if (!isAdmin) {
    return "You must be an admin to use this button.";
}
```

---

## ⌨️ All Commands & Their Permissions

### **1. Public Commands (Everyone)**

| Command | Description | Permission | Usage |
|---------|-------------|------------|-------|
| `/help` | Show help menu | ✅ None | `/help` |
| `/pricing` | Browse services & prices | ✅ None | `/pricing` |
| `/services` | View all services | ✅ None | `/services` |
| `/wallet` | Check your balance | ✅ None | `/wallet` |
| `/order-status` | Check order status | ✅ None | `/order-status <order-id>` |

**Example Usage:**
```
/pricing
→ Shows category selection
→ Click category button
→ Shows services with pricing
→ Click [Calculate Price]
→ Opens calculator
```

---

### **2. Worker Commands**

| Command | Description | Permission | Usage |
|---------|-------------|------------|-------|
| `/start-work` | Start working on order | ✅ Assigned Worker | `/start-work <order-id>` |
| `/complete-work` | Mark order complete | ✅ Assigned Worker | `/complete-work <order-id>` |

**Permission Check:**
```typescript
const order = await getOrder(orderId);
if (order.workerId !== interaction.user.id) {
    return "Only the assigned worker can use this command.";
}
```

---

### **3. Support/Admin Commands**

| Command | Description | Permission | Usage |
|---------|-------------|------------|-------|
| `/create-order` | Create order from ticket | ✅ Support/Admin | `/create-order` |
| `/close-ticket` | Close a ticket | ✅ Support/Admin | `/close-ticket` |
| `/order-action` | Manage order actions | ✅ Support/Admin | `/order-action <action>` |
| `/add-balance` | Add balance to user wallet | ✅ Admin only | `/add-balance <user> <amount>` |
| `/admin-refresh-pricing` | Refresh pricing channel | ✅ Admin only | `/admin-refresh-pricing` |
| `/admin-refresh-tickets` | Refresh ticket channels | ✅ Admin only | `/admin-refresh-tickets` |

**Permission Check:**
```typescript
// Support or Admin
const isSupport = member.roles.cache.has(supportRoleId);
const isAdmin = member.roles.cache.has(adminRoleId);

if (!isSupport && !isAdmin) {
    return "You need Support or Admin role to use this command.";
}

// Admin only
const isAdmin = member.roles.cache.has(adminRoleId);
if (!isAdmin) {
    return "You need Admin role to use this command.";
}
```

---

### **4. Ticket Command**

| Command | Description | Permission | Usage |
|---------|-------------|------------|-------|
| `/ticket` | Open support ticket | ✅ Everyone | `/ticket` |

**What it does:**
1. Shows modal with ticket form
2. Creates private ticket channel
3. Adds customer and support to channel
4. Saves ticket to database

---

## 🔄 Complete User Journeys

### **Journey 1: Customer Orders a Service**

```
1. Customer types: /pricing
   ↓
2. Bot shows categories
   [Skills] [Bossing] [Quests]
   ↓
3. Customer clicks: [Skills]
   ↓
4. Bot shows services in Skills category
   [Agility] [Runecrafting] [Mining]
   ↓
5. Customer clicks [Calculate Price] on Runecrafting
   ↓
6. Modal appears asking for levels
   Start Level: 23
   End Level: 90
   ↓
7. Bot shows pricing options:
   ✅ Optimal Combination: $159.24
   ◻️ GOTR Only: $183.62
   ◻️ Lava Runes Only: $288.36
   + Individual segments
   ↓
8. Customer clicks [Order Now]
   ↓
9. Bot creates order and opens ticket
   #ticket-000456
   ↓
10. Support reviews and assigns worker
    /create-order in ticket
    ↓
11. Customer confirms order
    [Confirm Order] button
    ↓
12. Worker accepts
    [Accept Order] button
    ↓
13. Worker starts work
    [Start Work] button
    ↓
14. Worker completes
    [Complete Order] button
    ↓
15. Customer confirms completion
    [Confirm Complete] button
    ↓
16. Customer leaves review
    [Leave Review] button
```

**Permissions at each step:**
- Steps 1-9: ✅ **Everyone**
- Step 10: ✅ **Support/Admin only**
- Step 11, 15, 16: ✅ **Customer only** (checks `customerId`)
- Step 12, 13, 14: ✅ **Assigned Worker only** (checks `workerId`)

---

### **Journey 2: Customer Opens Support Ticket**

```
1. Customer clicks [Open Ticket] in #support
   ↓
2. Modal appears with custom fields:
   - What service do you need?
   - OSRS Username (optional)
   - Contact preference (optional)
   ↓
3. Customer fills form and submits
   ↓
4. Bot creates private channel #ticket-000123
   ↓
5. Customer and Support can access
   ↓
6. Support helps customer
   (Regular chat messages)
   ↓
7. Issue resolved
   ↓
8. Support or Customer clicks [Close Ticket]
   ↓
9. Modal asks for close reason
   ↓
10. Ticket closed
    Channel archived/deleted
```

**Permissions:**
- Steps 1-3: ✅ **Everyone**
- Step 4-7: ✅ **Customer + Support + Admin**
- Step 8-10: ✅ **Customer, Support, or Admin** (checks `customerDiscordId` or roles)

---

### **Journey 3: Worker Claims and Completes Job**

```
1. Worker sees job in #jobs-available
   📋 Order #789
   Service: Runecrafting 23-90
   Pay: $50.00
   [Claim Job]
   ↓
2. Worker clicks [Claim Job]
   ↓
3. Bot assigns worker to order
   Worker must deposit $200 (insurance)
   ↓
4. Worker goes to order channel #order-789
   ↓
5. Worker clicks [Start Work]
   Status: In Progress
   ↓
6. Worker completes the job in-game
   ↓
7. Worker clicks [Complete Order]
   ↓
8. Bot notifies customer
   ↓
9. Customer reviews work
   ↓
10. Customer clicks [Confirm Complete]
    ↓
11. Bot releases payment to worker
    Worker: +$50
    Worker deposit: +$200 (returned)
    ↓
12. Customer clicks [Leave Review]
    ↓
13. Worker receives rating
```

**Permissions:**
- Step 2: ✅ **Workers only** (checks `workerRoleId`)
- Steps 5, 7: ✅ **Assigned Worker only** (checks `workerId`)
- Steps 10, 12: ✅ **Customer only** (checks `customerId`)

---

## 🔐 Permission Summary Table

| User Type | Can Do | Cannot Do |
|-----------|--------|-----------|
| **Everyone** | Browse services, Calculate prices, Open tickets, Check wallet | Create orders, Manage tickets, Admin actions |
| **Customer** | Confirm/cancel own orders, Close own tickets, Leave reviews | Manage other orders, Claim jobs, Admin commands |
| **Worker** | Claim jobs, Start/complete assigned orders | Manage tickets, Create orders, Admin commands |
| **Support** | Create orders, Close tickets, Manage orders | Delete services, Admin-only commands |
| **Admin** | Everything Support can do + Refresh channels, Add balance, All admin commands | Nothing restricted |

---

## 🛡️ Role IDs Configuration

Your permissions are controlled by Discord role IDs in `discord.config.ts`:

```typescript
export const discordConfig = {
    supportRoleId: "1234567890", // Support Team role
    adminRoleId: "0987654321",   // Admin role
    workerRoleId: "1122334455",  // Worker role
    // ... other config
};
```

**How to get Role IDs:**
1. Enable Developer Mode in Discord
2. Right-click a role
3. Click "Copy ID"
4. Paste into config

---

## 📝 Quick Reference: Common Scenarios

### **"Can customers close their own tickets?"**
✅ **YES** - Checks if `ticket.customerDiscordId === user.id`

### **"Can workers see all orders?"**
❌ **NO** - Workers only see:
- Jobs in #jobs-available (unclaimed)
- Orders they're assigned to

### **"Can support create orders without tickets?"**
✅ **YES** - Support can use `/create-order` anywhere

### **"Can customers cancel orders after worker starts?"**
✅ **YES** - But there may be penalties (check your business logic)

### **"Can admins do everything?"**
✅ **YES** - Admins bypass all permission checks

---

## 🎯 Key Takeaways

1. **Buttons** = Quick actions (Calculate, Order, Claim)
2. **Commands** = Typed with `/` (More complex actions)
3. **Modals** = Forms for collecting info
4. **Permissions** = Checked via Discord roles OR database relationship (customerId, workerId)

**Permission Hierarchy:**
```
Admin > Support > Worker > Customer > Everyone
```

**Most buttons/commands** = ✅ Everyone can use
**Sensitive actions** = ✅ Check user ID or role

---

**Your Discord bot is secure and well-organized!** 🎉
