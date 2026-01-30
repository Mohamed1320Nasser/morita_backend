# Ticket System - Quick Reference Guide

## File Locations Summary

### Database Schema
- **Prisma Schema**: `/prisma/schema.prisma`
  - Ticket table definition (lines 638-674)
  - TicketMessage table (lines 676-694)
  - TicketMetadata table (lines 710-734)
  - TicketTypeSettings table (lines 737-777)
  - CategoryTicketSettings table (lines 696-709)

### Discord Bot Services
- **Ticket Service**: `/src/discord-bot/services/ticket.service.ts`
  - Core ticket operations: creation, closure, archival
  - Welcome message handling & rendering
  - Channel management & permissions

- **Ticket Category Manager**: `/src/discord-bot/services/ticketCategoryManager.service.ts`
  - Manages ticket creation UI in Discord
  - Publishes messages to 4 ticket type channels

- **Ticket Type Helper**: `/src/discord-bot/utils/ticketTypeHelper.ts`
  - Converts ticket types to button configs
  - Maps emojis and styles to types

### Discord Interactions

**Button Handlers** (`/src/discord-bot/interactions/buttons/`):
- `create-ticket.button.ts` - Shows type-specific modal
- `open-ticket.button.ts` - Generic open ticket button
- `confirm-close-ticket.button.ts` - Confirms closure warning

**Modal Handlers** (`/src/discord-bot/interactions/modals/`):
- `ticket-create.modal.ts` - Main ticket creation submission
- `ticket-modal.modal.ts` - Generic modal handling & close confirmation

### API Services

**Controllers** (`/src/api/ticket/`):
- `ticket.controller.ts` - HTTP REST endpoints
- `ticket.discord.controller.ts` - Discord-specific endpoints

**Services** (`/src/api/ticket/`):
- `ticket.service.ts` - Database operations (create, update, list, close)

**DTOs** (`/src/api/ticket/dtos/`):
- `createTicket.dto.ts` - Ticket creation validation
- `createTicketFromDiscord.dto.ts` - Discord user creation validation
- `updateTicket.dto.ts` - Update operations
- `getTicketList.dto.ts` - List query parameters

### Types
- **Discord Types**: `/src/discord-bot/types/discord.types.ts`
  - TicketType enum (lines 187-196)
  - TicketData interface (lines 198-212)
  - TicketMetadata interface (lines 214-229)

---

## Ticket Types Quick Reference

| Type | File Field | Form Fields | Use Case |
|------|-----------|------------|----------|
| PURCHASE_SERVICES_OSRS | service_description, osrs_username, additional_notes | What service, username, notes | Buy OSRS leveling/quest services |
| PURCHASE_SERVICES_RS3 | service_description, osrs_username, additional_notes | What service, username, notes | Buy RS3 leveling/quest services |
| BUY_GOLD_OSRS | gold_amount, delivery_method, osrs_username, additional_notes | Amount (M), delivery, username, notes | Purchase OSRS gold |
| BUY_GOLD_RS3 | gold_amount, delivery_method, osrs_username, additional_notes | Amount (M), delivery, username, notes | Purchase RS3 gold |
| SELL_GOLD_OSRS | gold_amount, payment_method, payment_details, osrs_username | Amount (M), payment method, details, username | Sell OSRS gold for USD |
| SELL_GOLD_RS3 | gold_amount, payment_method, payment_details, osrs_username | Amount (M), payment method, details, username | Sell RS3 gold for USD |
| SWAP_CRYPTO | swap_direction, crypto_type, amount, wallet_or_username | Direction, crypto, amount, wallet | Crypto ↔ Gold exchange |
| GENERAL | ticket_description, ticket_osrs_username, ticket_contact | Description, username, contact | General support |

---

## Database Tables at a Glance

### ticket
```
Primary key: id (UUID)
Unique: ticketNumber, channelId
Indexes: customerId, categoryId, serviceId, status, channelId, ticketType, createdAt

Key fields:
- ticketNumber: Auto-increment integer
- status: OPEN|IN_PROGRESS|AWAITING_CONFIRMATION|COMPLETED|CANCELLED|CLOSED
- customerDiscordId: Links to Discord user
- supportDiscordId?: Assigned support staff (nullable)
```

### ticketMessage
```
Primary key: id (UUID)
Indexes: ticketId, authorId, createdAt
Relations: Cascade delete with ticket

Stores all messages in ticket channel for audit trail
```

### ticketMetadata
```
Primary key: id (UUID)
Unique: ticketId (1:1 relationship)
Indexes: ticketId

Type-specific fields for gold/crypto transactions
```

### ticketTypeSettings
```
Primary key: id (UUID)
Unique: ticketType
Indexes: ticketType, isActive, groupKey

Per-type customization: buttons, welcome messages, form fields
```

### categoryTicketSettings
```
Primary key: id (UUID)
Unique: categoryId
Relations: Cascade delete with category

Per-category customization
```

---

## API Endpoints Quick Reference

### Create Ticket
```
POST /api/discord/tickets
Content-Type: application/json

{
  "customerDiscordId": "123456789",
  "categoryId": "cat_uuid",
  "serviceId": "svc_uuid",
  "channelId": "discord_channel_id",
  "calculatedPrice": 49.99,
  "paymentMethodId": "pm_uuid",
  "currency": "USD",
  "customerNotes": "Please help me...",
  "customerName": "JohnDoe"
}

Response: { success: true, data: { id, ticketNumber, ... } }
```

### Get Ticket
```
GET /api/discord/tickets/{ticketId}
GET /api/discord/tickets/channel/{channelId}
GET /api/discord/tickets/customer/{discordId}/open

Response: Ticket object with relations included
```

### Update Ticket Status
```
PATCH /api/discord/tickets/{ticketId}/status
Content-Type: application/json

{
  "status": "IN_PROGRESS",
  "reason": "Starting work"
}

Validation: Checks valid transition
Response: Updated ticket object
```

### Close Ticket
```
POST /api/discord/tickets/{ticketId}/close
Content-Type: application/json

{
  "reason": "Work completed"
}

Effect: Sets status to CLOSED, sets closedAt timestamp
Response: Closed ticket object
```

### Save Metadata
```
POST /api/discord/tickets/{ticketId}/metadata
Content-Type: application/json

{
  "goldAmount": 100,
  "goldRate": 0.45,
  "osrsUsername": "player123",
  "deliveryMethod": "F2P",
  "worldLocation": "W301, Grand Exchange"
}

Effect: Upserts TicketMetadata record
Response: Metadata object
```

### Assign Support
```
POST /api/discord/tickets/{ticketId}/assign-support
Content-Type: application/json

{
  "supportId": 42,
  "supportDiscordId": "987654321"
}

Effect: Sets supportId and supportDiscordId
Response: Updated ticket object
```

---

## Status Transition State Machine

```
OPEN
  ├─ IN_PROGRESS (support starts working)
  ├─ CLOSED (customer closes directly)
  └─ CANCELLED (customer cancels)

IN_PROGRESS
  ├─ AWAITING_CONFIRMATION (work ready for review)
  ├─ CLOSED (no confirmation needed)
  └─ CANCELLED (customer changes mind)

AWAITING_CONFIRMATION
  ├─ COMPLETED (customer approves)
  ├─ IN_PROGRESS (customer requests more work)
  ├─ CANCELLED (customer cancels)
  └─ CLOSED (skip completion)

COMPLETED
  └─ CLOSED (final closure)

CANCELLED → CLOSED (final)
CLOSED (terminal state)
```

---

## Permission Model

### Discord Channel Access
```
@everyone: BLOCKED (can't see channel)

Customer:
  • VIEW_CHANNEL
  • SEND_MESSAGES
  • READ_MESSAGE_HISTORY
  • ATTACH_FILES
  • EMBED_LINKS

Support Role:
  • (all of above)
  • MANAGE_MESSAGES

Admin Role:
  • ADMINISTRATOR
```

### Closure Permissions
```
Customer: Can close ONLY if no attached order
Support/Admin: Can always close
  - But warned if order has risky status
  - Must confirm if order is IN_PROGRESS/COMPLETED/READY_FOR_REVIEW
```

---

## Caching Strategy

| Resource | TTL | Location | Purpose |
|----------|-----|----------|---------|
| Modal Definitions | 30s | `modalCache` in create-ticket.button.ts | Avoid re-fetching custom fields |
| Ticket Type Settings | Runtime | API service layer | Template rendering |
| Welcome Messages | Per-render | Fetched fresh | Ensure latest content |

---

## Configuration Options

Found in `discordConfig`:

```typescript
// Channel IDs
guildId: string                    // Discord server ID
ticketCategoryId?: string          // Active tickets category
closedTicketsCategoryId?: string   // Archived tickets category
createTicketCategoryId?: string    // UI category for buttons
purchaseServicesChannelId?: string
purchaseGoldChannelId?: string
sellGoldChannelId?: string
swapCryptoChannelId?: string

// Role IDs
supportRoleId: string              // Support team role
adminRoleId: string                // Admin role

// Channel Naming
ticketChannelPrefix: string        // Default "ticket-"

// Archival
closedTicketArchiveAfter: number   // Milliseconds (e.g., 7 days)

// API
apiBaseUrl: string                 // Backend API endpoint
```

---

## Common Operations

### Create a New Ticket (from Discord)

1. User clicks button in ticket UI channel
2. Button handler: `handleCreateTicket()`
3. Shows modal with type-specific fields
4. User fills form, submits
5. Modal handler: `handleTicketCreateModal()`
6. Calls `ticketService.createTicketChannelWithType()`
7. Creates Discord channel, database record, welcome message
8. Returns success confirmation

**Files**: 
- Button: `create-ticket.button.ts`
- Modal: `ticket-create.modal.ts`
- Service: `ticket.service.ts` (Discord)
- Service: `ticket.service.ts` (API)

### Close a Ticket

1. User clicks "Close Ticket" button in ticket channel
2. Button handler: `handleTicketClose()`
3. Shows modal for close reason (optional)
4. User submits close confirmation
5. Modal handler: `handleTicketCloseConfirmModal()`
6. Validates permissions & checks for attached orders
7. If warnings needed, shows confirmation buttons
8. Calls `ticketService.closeTicket()`
9. Updates status to CLOSED, disables buttons, moves channel

**Files**:
- Button: `open-ticket.button.ts` (handleTicketClose function)
- Modal: `ticket-modal.modal.ts`
- Service: `ticket.service.ts` (Discord)

### Update Ticket Status (via API)

1. Admin/Support calls: `PATCH /api/discord/tickets/{id}/status`
2. Service validates transition in state machine
3. Sets `closedAt` if moving to terminal state
4. Logs change with timestamp
5. Returns updated ticket

**Files**:
- Controller: `ticket.controller.ts`
- Service: `ticket.service.ts` (API)

### Archive Old Closed Tickets

1. Called periodically (e.g., daily)
2. Finds "Closed Tickets" category
3. Scans for channels with "closed-" prefix
4. Checks last activity timestamp
5. Deletes channels older than configured threshold
6. Purges entire history

**Function**: `archiveOldClosedTickets()` in `ticket.service.ts` (Discord)

---

## Debugging Tips

### Check Ticket Status
```
GET /api/discord/tickets/{id}
```
Look at `status` field and `closedAt` timestamp

### View Conversation History
```
GET /api/discord/tickets/{id}/messages
```
Shows all logged messages with author info

### Find Ticket by Discord Channel
```
GET /api/discord/tickets/channel/{channelId}
```
Useful if you have Discord channel but need ticket ID

### Get User's Open Tickets
```
GET /api/discord/tickets/customer/{discordId}/open
```
Returns all OPEN and IN_PROGRESS tickets for user

### Check Metadata
```
GET /api/discord/tickets/{id}/metadata
```
View type-specific fields (gold amount, crypto details, etc.)

---

## Common Issues & Solutions

### Modal doesn't appear
- Check ticket type is valid (must match enum)
- Verify API endpoint returns custom fields
- Check modal cache (30s TTL)
- Verify bot has permission to show modal

### Ticket created but no channel
- Check bot has create channel permission
- Verify category ID is valid
- Check guild is accessible
- Review logs for permission errors

### Status transition fails
- Check current status is in valid transition list
- Verify user has support/admin role for certain transitions
- Ensure ticket status is not already terminal

### Channel won't delete (during archival)
- Check bot has delete channel permission
- Verify channel is in closed tickets category
- Check archive threshold (may not be old enough yet)
- Review logs for rate limiting

### Metadata not saving
- Verify ticket ID is valid
- Check metadata has at least one field
- Ensure data types match schema (Decimal for amounts)
- Review API response for validation errors

---

## Performance Optimization Tips

1. **Modal Caching**: 30-second TTL prevents repeated API calls for same type
2. **Batch Messages**: Group Discord operations to avoid rate limits
3. **Lazy Loading**: Category & service data fetched only when needed
4. **Pagination**: Ticket lists default to 10 per page
5. **Database Indexes**: All frequently queried fields indexed (customerId, status, etc.)

---

## Related Systems

### Orders Integration
- Tickets can have related orders (ticketId FK in Order table)
- Customers blocked from closing if order exists (unless support/admin)
- Order status affects ticket closure warnings

### User Accounts
- Customer linked via customerId (User table)
- Support staff linked via supportId (User table)
- Discord ID used for user creation if not in system

### Services & Categories
- Tickets linked to ServiceCategory
- Tickets linked to Service
- Settings per category override global defaults

### Payment Methods
- Payment method linked to ticket
- Used for pricing calculations

---

## Testing Checklist

- [ ] Create ticket for each type (8 types total)
- [ ] Verify channel name format: username-type-number
- [ ] Check welcome message appears with correct variables
- [ ] Verify customer can see channel, others cannot
- [ ] Test status transitions (try invalid transition)
- [ ] Close ticket as customer (should work if no order)
- [ ] Close ticket as support (should warn if order exists)
- [ ] Verify metadata saved for gold/crypto tickets
- [ ] Check archived old tickets are deleted
- [ ] Verify pagination works (create 15+ tickets)
- [ ] Test API endpoints directly with Postman/curl

