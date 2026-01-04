# Ticket Category Setup (Optional)

## Overview

Tickets can optionally be assigned to categories for better organization. This is **optional** - tickets will work fine without categories.

## Optional Environment Variables

If you want to automatically categorize tickets by type, add these to your `.env` file:

```bash
# Service Tickets (PURCHASE_SERVICES_OSRS, PURCHASE_SERVICES_RS3)
DEFAULT_SERVICE_CATEGORY_ID=your_service_category_id_here

# Gold Tickets (BUY_GOLD_OSRS, BUY_GOLD_RS3, SELL_GOLD_OSRS, SELL_GOLD_RS3)
GOLD_CATEGORY_ID=your_gold_category_id_here

# Crypto Tickets (SWAP_CRYPTO)
CRYPTO_CATEGORY_ID=your_crypto_category_id_here
```

## How to Get Category IDs

1. **Create categories in your admin panel** (or database):
   - Create a "Services" category
   - Create a "Gold Trading" category
   - Create a "Crypto Swaps" category

2. **Get the category IDs** from your database:
   ```sql
   SELECT id, name FROM ServiceCategory;
   ```

3. **Add the IDs to your `.env` file**

## Without Categories

If you don't set these environment variables:
- Tickets will still be created successfully
- `categoryId` will be `null` in the database
- Everything works normally
- You can manually assign categories later from the admin panel

## Location in Code

The category assignment happens in:
- `/src/discord-bot/interactions/modals/ticket-modal.modal.ts` (lines 172-179)
