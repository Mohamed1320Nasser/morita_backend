# 🎫 Complete Ticket System Explanation & Improvements

## 📋 Table of Contents
1. [Ticket Types Overview](#ticket-types-overview)
2. [Complete Ticket Lifecycle](#complete-ticket-lifecycle)
3. [Text Management: Hardcoded vs Admin Panel](#text-management)
4. [Dynamic Fields System](#dynamic-fields-system)
5. [Discord Supported Field Types](#discord-supported-field-types)
6. [Current Issues & Bugs](#current-issues--bugs)
7. [Recommended Improvements](#recommended-improvements)

---

## 🎯 Ticket Types Overview

### **You have 7 ticket types, not 4!**

```typescript
enum TicketType {
    PURCHASE_SERVICES_OSRS = "PURCHASE_SERVICES_OSRS",  // 1. Buy OSRS services
    PURCHASE_SERVICES_RS3 = "PURCHASE_SERVICES_RS3",    // 2. Buy RS3 services
    BUY_GOLD_OSRS = "BUY_GOLD_OSRS",                    // 3. Buy OSRS gold
    BUY_GOLD_RS3 = "BUY_GOLD_RS3",                      // 4. Buy RS3 gold
    SELL_GOLD_OSRS = "SELL_GOLD_OSRS",                  // 5. Sell OSRS gold
    SELL_GOLD_RS3 = "SELL_GOLD_RS3",                    // 6. Sell RS3 gold
    SWAP_CRYPTO = "SWAP_CRYPTO",                        // 7. Crypto swaps
    GENERAL = "GENERAL",                                // 8. General support
}
```

### **Channel Structure**

```
📁 Discord Server
├── 📂 CREATE TICKET Category
│   ├── #purchase-services  → OSRS & RS3 service buttons
│   ├── #purchase-gold      → OSRS & RS3 buy gold buttons
│   ├── #sell-gold          → OSRS & RS3 sell gold buttons
│   └── #swap-crypto        → Crypto swap button
│
└── 📂 TICKETS Category (created automatically)
    ├── #ticket-000001  → Customer's private ticket
    ├── #ticket-000002  → Another customer's ticket
    └── ...
```

---

## 🔄 Complete Ticket Lifecycle

### **Step 1: Initial Setup (Admin Panel)**

**Location:** Admin Panel → Ticket Type Settings

1. **Admin configures each ticket type:**
   ```
   Ticket Type: PURCHASE_SERVICES_OSRS
   ├── Welcome Title: "🎮 OSRS Services"
   ├── Welcome Message: "Click below to order OSRS services!"
   ├── Banner Image URL: https://example.com/banner.png
   ├── Thumbnail URL: https://example.com/logo.png
   ├── Embed Color: #5865F2
   ├── Footer Text: "morita | Professional Gaming Services"
   ├── Button Label: "📋 Order OSRS Service"
   ├── Button Color: PRIMARY (blue)
   ├── Button Emoji: 🎮
   └── Active: ✅ Yes
   ```

2. **Admin configures custom fields (questions):**
   ```
   Field 1:
   ├── ID: "service_description"
   ├── Label: "What service do you need?"
   ├── Type: textarea
   ├── Placeholder: "e.g., 1-99 Sailing, Quest Cape..."
   ├── Required: Yes
   ├── Max Length: 1000
   └── Display Order: 1

   Field 2:
   ├── ID: "osrs_username"
   ├── Label: "OSRS Username"
   ├── Type: text
   ├── Placeholder: "Your in-game name"
   ├── Required: No
   ├── Max Length: 50
   └── Display Order: 2
   ```

---

### **Step 2: Discord Channel Display**

**Location:** Discord #purchase-services channel

**Process:**
1. Bot fetches settings from API: `/ticket-type-settings/PURCHASE_SERVICES_OSRS`
2. Bot builds embed with:
   - Title (from admin panel)
   - Welcome message (from admin panel)
   - Banner image (from admin panel)
   - Embed color (from admin panel)
3. Bot creates buttons dynamically:
   - Fetches active ticket types for "services" group
   - Creates button for each active type
   - Button text, color, emoji all from admin panel

**Current Code:**
```typescript
// File: purchaseServicesMessage.ts (line 23-39)
const response = await axios.get(
    `${discordConfig.apiBaseUrl}/ticket-type-settings/PURCHASE_SERVICES_OSRS`
);

welcomeTitle = settings.welcomeTitle || "";
welcomeMessage = settings.welcomeMessage || "";
bannerUrl = settings.bannerUrl || "";
// All from database! ✅
```

**Result in Discord:**
```
📋 OSRS Services                    [From Admin Panel ✅]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Click below to order OSRS services!  [From Admin Panel ✅]

[🎮 Order OSRS Service]              [From Admin Panel ✅]
[⚔️ Order RS3 Service]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
morita | Professional Gaming Services [From Admin Panel ✅]
```

**✅ THIS IS MANAGED IN ADMIN PANEL, NOT HARDCODED!**

---

### **Step 3: User Clicks Button**

**User Action:** Clicks "🎮 Order OSRS Service"

**What Happens:**
```typescript
// File: create-ticket.button.ts (line 26-33)
1. Extract ticket type from button ID
   Button ID: "create_ticket_PURCHASE_SERVICES_OSRS"

2. Fetch custom fields from API
   GET /discord/ticket-type-settings/PURCHASE_SERVICES_OSRS/custom-fields

3. Build modal dynamically:
   - If custom fields exist → Use them ✅ DYNAMIC
   - If API fails → Fallback to hardcoded ⚠️ FALLBACK
```

---

### **Step 4: Modal (Form) Shows to User**

**Two Scenarios:**

#### **Scenario A: Using Custom Fields from Admin Panel** ✅ BEST
```typescript
// Fetched from database
GET /discord/ticket-type-settings/PURCHASE_SERVICES_OSRS/custom-fields

Response:
{
  "fields": [
    {
      "id": "service_description",
      "label": "What service do you need?",
      "type": "textarea",
      "placeholder": "e.g., 1-99 Sailing...",
      "required": true,
      "maxLength": 1000
    },
    {
      "id": "osrs_username",
      "label": "OSRS Username",
      "type": "text",
      "required": false
    }
  ]
}
```

**Discord Modal Shows:**
```
┌─────────────────────────────────────┐
│ Order OSRS Service                  │
├─────────────────────────────────────┤
│ What service do you need? *         │
│ ┌─────────────────────────────────┐ │
│ │ e.g., 1-99 Sailing...           │ │ [From Admin Panel ✅]
│ └─────────────────────────────────┘ │
│                                     │
│ OSRS Username                       │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │ [From Admin Panel ✅]
│ └─────────────────────────────────┘ │
│                                     │
│      [Cancel]        [Submit]       │
└─────────────────────────────────────┘
```

**✅ THESE QUESTIONS ARE FROM ADMIN PANEL, FULLY DYNAMIC!**

---

#### **Scenario B: Fallback to Hardcoded** ⚠️ BACKUP

If API fails or no custom fields configured:

```typescript
// File: create-ticket.button.ts (line 82-89)
catch (error) {
    logger.warn("Failed to fetch custom fields, using defaults");
    const fields = getModalFields(ticketType); // ⚠️ HARDCODED
}

// Hardcoded fields (line 172-330)
function getModalFields(ticketType) {
    // Different hardcoded forms for each ticket type
}
```

**⚠️ THIS IS HARDCODED AS FALLBACK ONLY!**

---

### **Step 5: User Submits Modal**

**User fills form and clicks Submit**

**What Happens:**
```typescript
// File: ticket-modal.modal.ts (line 9-84)

1. Extract ticket type from modal ID
   Modal ID: "ticket_modal_PURCHASE_SERVICES_OSRS"

2. Parse all form fields dynamically
   - Loop through all fields user filled
   - Build metadata object
   - Convert to customer notes

3. Create ticket channel
   - Private channel: only customer + support can see
   - Channel name: #ticket-000123

4. Save ticket to database
   POST /api/discord/tickets
   {
     customerDiscordId: "123456789",
     ticketType: "PURCHASE_SERVICES_OSRS",
     customerNotes: "Service: 1-99 Sailing\nUsername: MyRSName",
     metadata: {
       service_description: "1-99 Sailing",
       osrs_username: "MyRSName"
     }
   }

5. Send welcome message in ticket channel
   - Fetched from API (admin panel configured)
   - Shows ticket number, customer info, etc.
```

---

### **Step 6: Ticket Channel Created**

**Location:** Discord #ticket-000123 channel

**Visible to:**
- Customer (user who created it)
- Support role members
- Admin role members

**Initial Message (Hardcoded):**
```typescript
// File: ticket.service.ts (line 186-267)

const embed = new EmbedBuilder()
    .setTitle(`Ticket #${ticketNumber} Created`) // ⚠️ HARDCODED
    .setDescription(
        `Welcome <@${user.id}>!\n\n` +
        `Your ${ticketTypeLabel} ticket has been created.\n` +
        `A support team member will assist you shortly.`
    ) // ⚠️ HARDCODED
```

**⚠️ THIS WELCOME MESSAGE IS HARDCODED!**
**Should be fetched from admin panel like the initial message**

---

### **Step 7: Support Creates Order**

**Support uses:** `/create-order` command in the ticket channel

**Flow:**
1. Support enters order details
2. Modal shows with order value, deposit, worker assignment
3. Order created (as we fixed earlier)
4. Customer's wallet locked (order value)
5. Worker's wallet locked (deposit) if assigned

---

## 📝 Text Management: Hardcoded vs Admin Panel

### ✅ **Managed in Admin Panel**

| Location | What | Admin Controlled? |
|----------|------|-------------------|
| **Initial Channel Message** (#purchase-services) | Welcome title, message, banner, colors | ✅ YES |
| **Button Text** | Button label, emoji, color | ✅ YES |
| **Modal Title** | Form title | ⚠️ Hardcoded per type |
| **Modal Questions** | Field labels, placeholders, types | ✅ YES (if configured) |
| **Field Validation** | Required, max length, min/max values | ✅ YES (if configured) |

### ⚠️ **Still Hardcoded**

| Location | What | Should Be Admin Panel? |
|----------|------|------------------------|
| **Ticket Welcome Message** | Message sent in new ticket channel | ❌ YES - Should be configurable |
| **Modal Titles** | "Order OSRS Service" | ❌ YES - Should come from settings |
| **Fallback Fields** | When API fails | ✅ NO - This is OK as backup |
| **Error Messages** | "Failed to create ticket" | ✅ NO - Can stay hardcoded |

---

## 🔧 Dynamic Fields System

### **How It Works**

```
Admin Panel
    ↓
Database (TicketTypeSettings table)
    ↓
API Endpoint (/discord/ticket-type-settings/:type/custom-fields)
    ↓
Discord Bot fetches fields
    ↓
Builds modal dynamically
    ↓
User fills form
    ↓
Bot parses answers
    ↓
Saves to ticket metadata
```

### **Supported Field Types**

#### 1. **Text Input (Short)**
```json
{
  "id": "osrs_username",
  "type": "text",
  "label": "OSRS Username",
  "placeholder": "Your in-game name",
  "required": true,
  "maxLength": 50
}
```

**Discord Shows:** Single-line text box

---

#### 2. **Textarea (Paragraph)**
```json
{
  "id": "service_description",
  "type": "textarea",
  "label": "What service do you need?",
  "placeholder": "Describe in detail...",
  "required": true,
  "maxLength": 2000
}
```

**Discord Shows:** Multi-line text box

---

#### 3. **Number Input**
```json
{
  "id": "gold_amount",
  "type": "number",
  "label": "Gold Amount (in millions)",
  "placeholder": "100",
  "required": true,
  "min": 1,
  "max": 10000
}
```

**Discord Shows:** Text input (validated as number after submit)

**⚠️ Note:** Discord doesn't have native number picker, so it's a text field

---

#### 4. **Email Input**
```json
{
  "id": "payment_email",
  "type": "email",
  "label": "PayPal Email",
  "required": true
}
```

**Discord Shows:** Text input (validated as email after submit)

---

### **Discord Modal Limitations**

#### ❌ **NOT Supported by Discord:**
- Dropdown/Select menus
- Checkboxes
- Radio buttons
- Date pickers
- File uploads
- Multi-select

#### ✅ **Only Supported:**
- Short text input
- Long text input (paragraph)
- That's it!

**Everything else must be validated AFTER user submits.**

---

## 🐛 Current Issues & Bugs

### **Issue 1: Welcome Message Hardcoded**
**Location:** `ticket.service.ts:186-267`

**Problem:**
```typescript
const embed = new EmbedBuilder()
    .setTitle(`Ticket #${ticketNumber} Created`) // ⚠️ HARDCODED
    .setDescription(
        `Welcome <@${user.id}>!\n\n` +
        `Your ${ticketTypeLabel} ticket has been created.`
    ) // ⚠️ HARDCODED
```

**Should Be:**
```typescript
// Fetch from API
const welcomeSettings = await axios.get(
    `/ticket-type-settings/${ticketType}/welcome-message`
);

const embed = new EmbedBuilder()
    .setTitle(welcomeSettings.title) // ✅ FROM ADMIN PANEL
    .setDescription(welcomeSettings.message) // ✅ FROM ADMIN PANEL
```

---

### **Issue 2: Modal Titles Hardcoded**
**Location:** `create-ticket.button.ts:148-167`

**Problem:**
```typescript
function getModalTitle(ticketType: TicketType): string {
    switch (ticketType) {
        case TicketType.PURCHASE_SERVICES_OSRS:
            return "Order OSRS Service"; // ⚠️ HARDCODED
        // ...
    }
}
```

**Should Be:**
```typescript
// Fetch from ticket type settings
const settings = await fetchTicketTypeSettings(ticketType);
return settings.modalTitle || "Open Support Ticket";
```

---

### **Issue 3: No Field Ordering**
**Location:** `create-ticket.button.ts:98-143`

**Problem:** Fields are displayed in the order they're stored in database, but admin can't control display order.

**Fix:** Add `displayOrder` field and sort before building modal.

---

### **Issue 4: No Field Type Validation**
**Location:** `ticket-modal.modal.ts:89-192`

**Problem:** All fields are accepted as strings. If admin sets a number field, no validation happens.

**Fix:**
```typescript
// After modal submit, validate field types
for (const field of customFields) {
    const value = formData[field.id];

    if (field.type === "number") {
        if (isNaN(Number(value))) {
            throw new Error(`${field.label} must be a number`);
        }
        if (field.min && Number(value) < field.min) {
            throw new Error(`${field.label} must be at least ${field.min}`);
        }
    }

    if (field.type === "email") {
        if (!isValidEmail(value)) {
            throw new Error(`${field.label} must be a valid email`);
        }
    }
}
```

---

### **Issue 5: No Conditional Fields**
**Problem:** Can't show/hide fields based on previous answers (Discord limitation).

**Workaround:** Create different ticket types for different scenarios.

---

### **Issue 6: Metadata Not Parsed Properly**
**Location:** `ticket-modal.modal.ts:158-169`

**Problem:**
```typescript
customerNotesLines.push(`**${label}:** ${value}`);
```

This creates a readable string, but loses structure.

**Better Approach:**
```typescript
// Store structured data in metadata
metadata: {
    fields: {
        service_description: "1-99 Sailing",
        osrs_username: "MyName"
    }
}

// AND ALSO keep readable notes
customerNotes: "Service: 1-99 Sailing\nUsername: MyName"
```

---

## 🚀 Recommended Improvements

### **Priority 1: HIGH (Do First)**

#### 1. **Make Ticket Welcome Message Dynamic**
```typescript
// Add to TicketTypeSettings table
interface TicketTypeSettings {
    // Existing fields...
    ticketWelcomeTitle: string;
    ticketWelcomeMessage: string;
    ticketWelcomeBanner: string;
}

// Update ticket.service.ts
const settings = await fetchTicketTypeSettings(ticketType);

const embed = new EmbedBuilder()
    .setTitle(settings.ticketWelcomeTitle)
    .setDescription(settings.ticketWelcomeMessage)
    .setImage(settings.ticketWelcomeBanner);
```

**Benefit:** Admins can customize every message without code changes.

---

#### 2. **Add Field Type Validation**
```typescript
// Create validator utility
class FieldValidator {
    static validate(field: CustomField, value: string): { valid: boolean; error?: string } {
        // Number validation
        if (field.type === "number") {
            const num = Number(value);
            if (isNaN(num)) {
                return { valid: false, error: `${field.label} must be a number` };
            }
            if (field.min !== undefined && num < field.min) {
                return { valid: false, error: `${field.label} must be at least ${field.min}` };
            }
            if (field.max !== undefined && num > field.max) {
                return { valid: false, error: `${field.label} cannot exceed ${field.max}` };
            }
        }

        // Email validation
        if (field.type === "email") {
            if (!this.isValidEmail(value)) {
                return { valid: false, error: `${field.label} must be a valid email` };
            }
        }

        // Length validation
        if (field.maxLength && value.length > field.maxLength) {
            return { valid: false, error: `${field.label} is too long (max ${field.maxLength})` };
        }

        return { valid: true };
    }

    static isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}

// Use in modal handler
for (const [fieldId, value] of Object.entries(formData)) {
    const field = customFields.find(f => f.id === fieldId);
    if (field) {
        const validation = FieldValidator.validate(field, value);
        if (!validation.valid) {
            await interaction.editReply({
                content: `❌ **Validation Error:**\n${validation.error}`
            });
            return;
        }
    }
}
```

**Benefit:** Prevents invalid data from being saved.

---

#### 3. **Add Display Order to Fields**
```typescript
// Update custom field interface
interface CustomFieldDefinition {
    id: string;
    label: string;
    type: string;
    displayOrder: number; // ✅ ADD THIS
    // ...
}

// Sort before building modal
const sortedFields = customFields.sort((a, b) => a.displayOrder - b.displayOrder);
const rows = buildFieldsFromCustomDefinitions(sortedFields);
```

**Benefit:** Admins control the order fields appear.

---

### **Priority 2: MEDIUM**

#### 4. **Add Field Groups/Categories**
```typescript
interface CustomFieldDefinition {
    id: string;
    label: string;
    type: string;
    group: string; // e.g., "Account Info", "Payment Details"
    displayOrder: number;
}

// Group fields when displaying
const groupedFields = {
    "Account Info": [field1, field2],
    "Payment Details": [field3, field4]
};

// Add section headers in description
embed.addFields([
    { name: "📋 Account Info", value: "Fill in your account details", inline: false },
    // ... fields ...
    { name: "💳 Payment Details", value: "How you want to be paid", inline: false },
    // ... fields ...
]);
```

**Benefit:** Better organization for complex forms.

---

#### 5. **Add Field Presets**
```typescript
// Admin panel: Create preset field bundles
const presets = {
    "Gold Trading": [
        { id: "gold_amount", label: "Gold Amount (M)", type: "number" },
        { id: "osrs_username", label: "OSRS Username", type: "text" },
        { id: "delivery_method", label: "Delivery Method", type: "text" }
    ],
    "Service Order": [
        { id: "service_description", label: "Service Needed", type: "textarea" },
        { id: "osrs_username", label: "OSRS Username", type: "text" },
        { id: "special_notes", label: "Special Notes", type: "textarea" }
    ]
};

// Admin can select preset and customize
```

**Benefit:** Faster setup of new ticket types.

---

### **Priority 3: LOW (Nice to Have)**

#### 6. **Add Field Dependencies (Conditional Logic)**

**Problem:** Discord modals don't support showing/hiding fields based on answers.

**Workaround:** Create sub-ticket-types
```typescript
enum TicketType {
    // Instead of one "BUY_GOLD" with conditional fields...
    BUY_GOLD_CRYPTO_PAYMENT = "BUY_GOLD_CRYPTO_PAYMENT",
    BUY_GOLD_PAYPAL_PAYMENT = "BUY_GOLD_PAYPAL_PAYMENT",
    // Different forms for different payment methods
}
```

**OR:** Use follow-up modals
```typescript
// First modal: Ask payment method
// Second modal: Show payment-specific fields
```

---

#### 7. **Add Rich Metadata Parsing**
```typescript
// Instead of just string notes, parse metadata properly
interface ParsedTicketMetadata {
    structuredData: {
        [fieldId: string]: {
            value: any;
            type: string;
            label: string;
        }
    };
    readableNotes: string;
}

// Example
{
    structuredData: {
        gold_amount: {
            value: 100,
            type: "number",
            label: "Gold Amount (M)"
        },
        osrs_username: {
            value: "MyName",
            type: "text",
            label: "OSRS Username"
        }
    },
    readableNotes: "Gold Amount: 100M\nUsername: MyName"
}
```

**Benefit:** Easier to query and filter tickets in admin panel.

---

## 📊 Summary Table

| Feature | Current State | Managed Where? | Should Improve? |
|---------|--------------|----------------|-----------------|
| Channel welcome message | ✅ Dynamic | Admin Panel | No |
| Button text/style | ✅ Dynamic | Admin Panel | No |
| Modal questions | ✅ Dynamic (with fallback) | Admin Panel | Add validation |
| Ticket welcome message | ❌ Hardcoded | Code | **YES - High Priority** |
| Modal titles | ❌ Hardcoded | Code | **YES - Medium Priority** |
| Field ordering | ⚠️ Database order | Database | **YES - Add displayOrder** |
| Field validation | ❌ None | N/A | **YES - High Priority** |
| Conditional fields | ❌ Not supported | N/A | Workaround with sub-types |

---

## ✅ Quick Wins (Easy Improvements)

### 1. **Add Ticket Welcome Message to Admin Panel**
**Time:** 2 hours
**Impact:** High
**Files to Change:**
- Add fields to `TicketTypeSettings` table
- Update `ticket.service.ts` to fetch from API
- Update admin panel UI

### 2. **Add Field Type Validation**
**Time:** 3 hours
**Impact:** High
**Files to Change:**
- Create `FieldValidator` utility
- Update `ticket-modal.modal.ts` to validate before saving

### 3. **Add Display Order**
**Time:** 1 hour
**Impact:** Medium
**Files to Change:**
- Add `displayOrder` column to custom fields
- Sort before rendering

---

## 🎯 Final Recommendation

**Top 3 improvements to make:**

1. ✅ **Make ticket welcome message dynamic** (currently hardcoded)
2. ✅ **Add field type validation** (numbers, emails, etc.)
3. ✅ **Add display order control** for custom fields

These three changes will make your ticket system **100% admin-controlled** with no hardcoded messages!

---

**Any questions about the ticket system?** 🎫
