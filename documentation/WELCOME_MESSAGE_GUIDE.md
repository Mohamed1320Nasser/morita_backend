# Ticket Welcome Message Configuration Guide

## Overview

Each ticket type can have a custom welcome message configured from the admin panel. The welcome message appears when a new ticket channel is created.

---

## Where to Configure

In your **Admin Panel**:
1. Go to **Ticket Type Settings**
2. Select the ticket type (e.g., PURCHASE_SERVICES_OSRS, BUY_GOLD_OSRS, etc.)
3. Find the **Welcome Message** section

---

## Available Fields

### 1. Welcome Title
- **Field:** `welcomeTitle`
- **Type:** Text (optional)
- **Default:** Based on ticket type
- **Example:** `"Welcome to Your Service Order"`

### 2. Welcome Message
- **Field:** `welcomeMessage`
- **Type:** Textarea (required)
- **Supports:** Variables and formatting
- **Example:** See below

---

## Available Variables

You can use these variables in your welcome message:

| Variable | Description | Example Output |
|----------|-------------|----------------|
| `{{customer}}` | Mentions the customer | `@username` |
| `{{support}}` | Mentions support role | `@Support` |
| `{{ticketId}}` | Ticket number | `0012` |

---

## Example Welcome Messages

### For Service Orders (PURCHASE_SERVICES_OSRS/RS3):

**Title:** `Order Your OSRS/RS3 Service`

**Message:**
```
Hello {{customer}}! 👋

Welcome to your service order ticket **#{{ticketId}}**.

Our {{support}} team will review your request and provide you with:
- A detailed quote
- Estimated completion time
- Any additional requirements

**What happens next:**
1. Our team will review your service request
2. You'll receive a quote and timeline
3. Once approved, work will begin
4. You'll be updated throughout the process

Please provide as much detail as possible about your requirements!
```

### For Gold Trading (BUY_GOLD/SELL_GOLD):

**Title:** `Gold Trading Ticket`

**Message:**
```
Hello {{customer}}! 💰

Welcome to ticket **#{{ticketId}}** for gold trading.

Our {{support}} team will assist you with:
- Current gold rates
- Delivery methods
- Payment processing
- Safety guidelines

**Important:**
- All trades are monitored for your security
- Expected response time: 5-15 minutes
- Have your in-game username ready

Need immediate assistance? Ping {{support}}!
```

### For Crypto Swaps:

**Title:** `Cryptocurrency Swap Request`

**Message:**
```
Hello {{customer}}! 🔄

This is your crypto swap ticket **#{{ticketId}}**.

Our {{support}} team will help you with:
- Current exchange rates
- Swap processing
- Wallet verification
- Transaction confirmation

**Before proceeding:**
1. Confirm the swap direction (Crypto ↔ Gold)
2. Verify wallet addresses
3. Check current rates
4. Understand processing times

Our team will respond shortly!
```

---

## Formatting Support

The welcome message supports **Discord Markdown**:

- **Bold:** `**text**` → **text**
- *Italic:* `*text*` → *text*
- ~~Strikethrough:~~ `~~text~~` → ~~text~~
- `Code:` `` `text` `` → `text`
- Bullet lists: `- Item`
- Numbered lists: `1. Item`

---

## How It Works

1. **User clicks button** to create ticket
2. **Modal appears** with custom fields
3. **Ticket channel created** with format: `username {ticket-1}`
4. **Welcome message sent** using your template
5. **Variables replaced** with actual values

---

## Current Implementation

The welcome message is fetched from:
```
POST /discord/ticket-type-settings/render
```

With payload:
```json
{
  "ticketType": "PURCHASE_SERVICES_OSRS",
  "variables": {
    "customer": "<@user_id>",
    "support": "<@&role_id>",
    "ticketId": "0012"
  }
}
```

The API renders the template and returns the formatted message.

---

## Testing Your Welcome Message

1. **Update** the welcome message in admin panel
2. **Create a test ticket** from Discord
3. **Check** the welcome message in the new ticket channel
4. **Iterate** until it looks perfect!

---

## Tips

- Keep messages clear and actionable
- Use variables to personalize the experience
- Include clear next steps
- Add emoji for visual appeal (but don't overdo it)
- Test on mobile - Discord formatting can look different

---

## Database Fields

If editing directly in database:

```sql
-- TicketTypeSettings table
UPDATE TicketTypeSettings
SET welcomeTitle = 'Your Custom Title',
    welcomeMessage = 'Your message with {{customer}} variables'
WHERE ticketType = 'PURCHASE_SERVICES_OSRS';
```

---

## Default Values

If no custom message is set, the system uses hardcoded defaults based on ticket type:

- **Services:** "Welcome! Please describe your service request"
- **Buy Gold:** "Welcome to gold purchase ticket"
- **Sell Gold:** "Welcome to gold selling ticket"
- **Crypto Swap:** "Welcome to crypto swap ticket"

---

**That's it!** You already have full welcome message customization in your admin panel. Just configure the `welcomeTitle` and `welcomeMessage` fields for each ticket type.
