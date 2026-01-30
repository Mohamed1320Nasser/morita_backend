# Morita Backend - Ticket System Comprehensive Analysis

## Overview
The ticket system is a comprehensive Discord-integrated support ticketing platform that handles multiple ticket types for RuneScape-related services, gold trading, and crypto transactions. The system bridges Discord interactions with a NestJS/Prisma backend.

---

## 1. TICKET TYPES AND DEFINITIONS

### Ticket Type Enum (TicketType)
Located in: `/src/discord-bot/types/discord.types.ts`

```
PURCHASE_SERVICES_OSRS    - Buy OSRS game services
PURCHASE_SERVICES_RS3     - Buy RS3 game services
BUY_GOLD_OSRS            - Purchase OSRS gold
BUY_GOLD_RS3             - Purchase RS3 gold
SELL_GOLD_OSRS           - Sell OSRS gold to platform
SELL_GOLD_RS3            - Sell RS3 gold to platform
SWAP_CRYPTO              - Cryptocurrency to gold exchange
GENERAL                  - General support/fallback type
```

### Ticket Status Enum (TicketStatus)
Located in: `/prisma/schema.prisma`

```
OPEN                     - Initial state, awaiting response
IN_PROGRESS              - Being actively handled
AWAITING_CONFIRMATION    - Waiting for customer confirmation
COMPLETED                - Work is done
CANCELLED                - Ticket was cancelled
CLOSED                   - Final closed state
```

### Valid Status Transitions
From TicketService (`/src/api/ticket/ticket.service.ts`):

```
OPEN                → [IN_PROGRESS, CLOSED, CANCELLED]
IN_PROGRESS         → [AWAITING_CONFIRMATION, CANCELLED, CLOSED]
AWAITING_CONFIRMATION → [COMPLETED, IN_PROGRESS, CANCELLED, CLOSED]
COMPLETED           → [CLOSED]
CANCELLED           → [] (Terminal)
CLOSED              → [] (Terminal)
```

---

## 2. DATABASE SCHEMA FOR TICKETS

### Primary Ticket Table (ticket)
```
id                  String (UUID) - Primary key
ticketNumber        Int (Auto-increment) - Human-readable ticket ID (#0001, #0002, etc.)
ticketType          TicketType - Ticket classification
customerId          Int - Reference to customer User
customerDiscordId   String - Discord user ID
categoryId          String? - Service category reference
serviceId           String? - Specific service reference
channelId           String (UNIQUE) - Discord channel ID
calculatedPrice     Decimal? - Estimated/quoted price
paymentMethodId     String? - Payment method used
currency            String - Default "USD"
status              TicketStatus - Current state
supportId           Int? - Assigned support staff
supportDiscordId    String? - Support staff Discord ID
customerNotes       Text? - Customer initial request
createdAt           DateTime - Timestamp
updatedAt           DateTime - Last modified
closedAt            DateTime? - When ticket was closed

Indexes:
- customerId
- categoryId
- serviceId
- status
- channelId
- ticketType
- createdAt
```

### Ticket Message Table (ticketMessage)
Stores conversation history within ticket channels:
```
id                  String (UUID)
ticketId            String (FK) - Parent ticket
authorId            Int (FK) - User who sent message
authorDiscordId     String - Discord user ID
authorName          String - Display name
content             Text - Message content
isSystem            Boolean - Auto-generated system message flag
isWelcome           Boolean - Welcome message flag
discordMessageId    String? (UNIQUE) - Discord message ID for sync
createdAt           DateTime

Cascade delete with ticket
Indexes: ticketId, authorId, createdAt
```

### Ticket Metadata Table (ticketMetadata)
Stores type-specific details:
```
id                  String (UUID)
ticketId            String (UNIQUE, FK)

Gold Trading Fields:
- goldAmount        Decimal? - Amount in millions (e.g., 100M)
- goldRate          Decimal? - Price per M (e.g., $0.45/M)
- deliveryMethod    String? - F2P, P2P, Drop Trading, POH, etc.
- worldLocation     String? - "W301, Grand Exchange"
- osrsUsername      String? - Customer's OSRS/RS3 username

Crypto Trading Fields:
- cryptoType        String? - BTC, ETH, USDT, etc.
- cryptoAmount      Decimal? - Crypto amount
- walletAddress     String? - Wallet address
- swapDirection     String? - Direction of swap
- paymentEmail      String? - For payment info
- paymentProof      Text? - Proof of payment

General Fields:
- payoutAmount      Decimal? - Amount to payout
- specialNotes      Text? - Public notes
- internalNotes     Text? - Staff-only notes
- createdAt, updatedAt

Cascade delete with ticket
Index: ticketId
```

### Ticket Type Settings Table (ticketTypeSettings)
Customization per ticket type:
```
id                  String (UUID)
ticketType          TicketType (UNIQUE)

Display Configuration:
- groupKey          String? - Grouping for shared welcome messages
- buttonLabel       String? - Custom button text
- buttonColor       String? - Button style (green, blue, red, gray)
- displayOrder      Int - Sort order in UI

Welcome Message:
- bannerUrl         Text? - Banner image URL
- thumbnailUrl      Text? - Thumbnail image URL
- welcomeTitle      String? - Embed title
- welcomeMessage    Text - Embed description
- footerText        String? - Footer text
- embedColor        String - Hex color (default "5865F2")

Behavior:
- customFields      Json? - Dynamic form fields
- autoAssign        Boolean - Auto-assign support staff
- notifyOnCreate    Boolean - Send notification
- notifyOnClose     Boolean - Notify on close
- mentionSupport    Boolean - @mention support role
- mentionCustomer   Boolean - @mention customer
- isActive          Boolean - Enable/disable type

createdAt, updatedAt

Indexes: ticketType, isActive, groupKey
```

### Category Ticket Settings Table (categoryTicketSettings)
Per-category welcome customization:
```
id                  String (UUID)
categoryId          String (UNIQUE, FK) - Service category
bannerUrl           Text?
welcomeTitle        String?
welcomeMessage      Text - Required
footerText          String?
embedColor          String - Default "5865F2"
isActive            Boolean
createdAt, updatedAt

Cascade delete with category
```

---

## 3. HOW TICKETS ARE CREATED IN DISCORD

### Creation Flow Overview
```
User sees "Create Ticket" buttons
    ↓
Click button (by ticket type)
    ↓
Modal form appears (type-specific fields)
    ↓
Submit form
    ↓
Backend validates & creates ticket
    ↓
Discord channel created
    ↓
Welcome message sent
    ↓
User notified of success
```

### Step 1: Ticket Creation UI

**Location**: `/src/discord-bot/services/ticketCategoryManager.service.ts`

Four channels are created/managed in a "CREATE TICKET" category:
- `purchase-services` - Service purchase tickets
- `purchase-gold` - Buy gold tickets
- `sell-gold` - Sell gold tickets
- `swap-crypto` - Crypto swap tickets

Each channel contains a message with type-specific buttons powered by `buildPurchaseServicesMessage()`, `buildPurchaseGoldMessage()`, etc.

### Step 2: Button Handler

**Location**: `/src/discord-bot/interactions/buttons/create-ticket.button.ts`

Function: `handleCreateTicket(ButtonInteraction)`

Process:
1. Extract ticket type from button custom ID (`create_ticket_${ticketType}`)
2. Build dynamic modal based on ticket type settings from API
3. Show modal to user
4. Handle cached modals (30-second TTL) for performance

Modal field count: Maximum 5 fields (Discord limit)

### Step 3: Type-Specific Modal Fields

**PURCHASE_SERVICES (OSRS/RS3)**:
- What service do you need? (textarea, required, 1000 chars)
- OSRS/RS3 Username (text, optional, 50 chars)
- Additional Notes (textarea, optional, 500 chars)

**BUY_GOLD (OSRS/RS3)**:
- How much gold? (text, required, in millions)
- Preferred Delivery Method (text, optional - F2P, P2P, etc.)
- OSRS/RS3 Username (text, required)
- Additional Notes (textarea, optional)

**SELL_GOLD (OSRS/RS3)**:
- How much gold to sell? (text, required)
- Preferred Payment Method (text, required - PayPal, Crypto, etc.)
- Payment Details (text, required - Email/wallet)
- OSRS/RS3 Username (text, required)

**SWAP_CRYPTO**:
- Swap Direction (text, required - Crypto to Gold / Gold to Crypto)
- Cryptocurrency Type (text, required - BTC, ETH, USDT, etc.)
- Amount (text, required)
- Wallet Address or OSRS Username (text, required)

**GENERAL**:
- Describe your request (textarea, required, 1000 chars)
- OSRS Username (text, optional)
- Preferred Contact Method (text, optional)

### Step 4: Modal Submission Handler

**Location**: `/src/discord-bot/interactions/modals/ticket-create.modal.ts`

Function: `handleTicketCreateModal(ModalSubmitInteraction)`

Process:
1. Defer reply (ephemeral response)
2. Extract field values from modal
3. Look up or create category ID
4. Build customer notes from all fields
5. Create TicketData object
6. Call `ticketService.createTicketChannelWithType()`
7. Send welcome message
8. Return success embed with ticket link

### Step 5: Channel & Database Creation

**Location**: `/src/discord-bot/services/ticket.service.ts`

Function: `createTicketChannelWithType(guild, user, ticketData, metadata?)`

Process:
1. **Get or create category**: Find "Tickets" category or create it
   - Denies @everyone from viewing
   - Allows support role to view
   - Allows admin full access

2. **Create Discord channel**:
   - Naming: `{username}-{tickettype}-{ticketnumber}`
   - Example: `john-buy-gold-0001`
   - Channel topic: `Ticket #0001 | Buy OSRS Gold | Customer: John#1234`
   - Permissions:
     - Deny @everyone
     - Allow customer: View, Send Messages, Read History, Attach Files, Embed Links
     - Allow support role: All above + Manage Messages
     - Allow admin: Administrator

3. **Create in Database** via API call to `/api/discord/tickets`:
   ```
   POST /api/discord/tickets
   {
     customerDiscordId: string,
     categoryId?: string,
     serviceId?: string,
     channelId: string,
     calculatedPrice?: number,
     paymentMethodId?: string,
     currency: string,
     customerNotes?: string,
     customerName: string,
     ticketType?: TicketType
   }
   ```

4. **API Handler** (`/src/api/ticket/ticket.discord.controller.ts`):
   - Call `ticketService.createFromDiscord()`
   - Find or create user from Discord ID
   - Create ticket in database with status OPEN
   - Return ticket object with generated ticketNumber

5. **Save metadata** (if provided):
   - Call `POST /api/discord/tickets/{id}/metadata`
   - Upsert TicketMetadata record

6. **Send Welcome Message**:
   - Fetch ticket type settings from API
   - Use template variables:
     - `{customer}` → Discord mention
     - `{support}` → Support role mention
     - `{service}` → Service name
     - `{price}` → Calculated price
     - `{ticket_id}` → Ticket number
   - Send embed with:
     - Title, description from settings
     - Custom color (hex)
     - Banner image if available
     - Customer Q&A field (if notes provided)
   - Add buttons:
     - "Calculate Price" button
     - "Close Ticket" button

---

## 4. TICKET WORKFLOW/FLOW

### Main Workflow States

```
┌─────────────────────────────────────────────────────────────┐
│                   TICKET LIFECYCLE                           │
└─────────────────────────────────────────────────────────────┘

1. OPEN (Initial)
   ├─ Created when user opens ticket
   ├─ Welcome message sent to Discord channel
   ├─ Support team alerted (if configured)
   └─ Can transition to: IN_PROGRESS, CLOSED, CANCELLED

2. IN_PROGRESS
   ├─ Support staff actively working
   ├─ Messages exchanged in Discord channel
   ├─ Related order may be created
   └─ Can transition to: AWAITING_CONFIRMATION, CANCELLED, CLOSED

3. AWAITING_CONFIRMATION
   ├─ Work completed, awaiting customer approval
   ├─ Customer reviews in Discord channel
   └─ Can transition to: COMPLETED, IN_PROGRESS, CANCELLED, CLOSED

4. COMPLETED
   ├─ Work approved and done
   ├─ Related order status updated
   └─ Can transition to: CLOSED

5. CANCELLED / CLOSED (Terminal States)
   ├─ closedAt timestamp set
   ├─ Channel archived (after delay)
   ├─ No further transitions possible
```

### Detailed Operations

#### A. Ticket Creation
- User clicks ticket type button
- Modal form appears with type-specific fields
- User submits form
- Discord channel created (with secure permissions)
- Ticket record created in database (status: OPEN)
- Metadata saved (if applicable)
- Welcome message posted with support buttons
- Success confirmation sent to user

**Files Involved**:
- `create-ticket.button.ts` - Button handler
- `ticket-create.modal.ts` - Modal submission
- `ticket.service.ts` - Discord channel creation
- `ticket.service.ts` (API) - Database operations

#### B. Status Updates
**Via**: `PATCH /api/discord/tickets/{id}/status`

Validation:
- Current ticket status checked
- Validates transition is allowed
- Sets `closedAt` if moving to terminal state
- Logs status change with timestamp

**Support Methods**:
- Admin/support can change status
- Certain statuses trigger events (notifications, archiving)

#### C. Ticket Close Operation
**Handler**: `handleTicketCloseConfirmModal()` in `ticket-modal.modal.ts`

Flow:
1. User clicks "Close Ticket" button
2. Modal prompts for close reason (optional)
3. Permission check:
   - Customers can close if NO order attached
   - Support/Admin can close, but warned if risky order status
4. If order exists and status is IN_PROGRESS/COMPLETED/READY_FOR_REVIEW:
   - Show warning confirmation
   - Require Admin/Support approval
5. Call `ticketService.closeTicket(ticketId, closedByUser, reason)`
6. Operations:
   - API call: `POST /api/discord/tickets/{id}/close`
   - Update status to CLOSED
   - Disable all buttons in welcome message
   - Remove customer permissions from channel
   - Queue channel for archival

**File**: `/src/discord-bot/interactions/modals/ticket-modal.modal.ts`

#### D. Channel Archival
**Handler**: `archiveOldClosedTickets()` in `ticket.service.ts`

Process:
1. Find "Closed Tickets" category
2. Scan for channels in category with "closed-" prefix
3. Check last activity timestamp
4. Delete if older than `closedTicketArchiveAfter` (config)
5. Delete channel entirely (purges history)

**Config**: `discordConfig.closedTicketArchiveAfter` (milliseconds)

#### E. Ticket Assignment
**Via**: `POST /api/discord/tickets/{id}/assign-support`

Data:
```
{
  supportId: number,
  supportDiscordId: string
}
```

Updates:
- `supportId` field
- `supportDiscordId` field
- `updatedAt` timestamp

#### F. Message Logging
Function: `addMessage()` in API TicketService

Process:
1. Create TicketMessage record
2. Store:
   - Original Discord message ID (for sync)
   - Author info (ID, Discord ID, name)
   - Content
   - System message flag (for auto-messages)
   - Welcome message flag
3. Used for audit trail and conversation history

---

## 5. INTEGRATION POINTS

### Discord.js Integration
- **Client**: Discord bot instance
- **Channels**: Text/Category channels for tickets
- **Permissions**: Fine-grained role-based access
- **Embeds**: Rich message formatting
- **Buttons/Modals**: Interactive components
- **Message tracking**: Discord message IDs linked to DB

### API Integration
Base URL: Configured in `discordConfig.apiBaseUrl`

**Key Endpoints**:
```
POST   /api/discord/tickets                  - Create ticket
GET    /api/discord/tickets/{id}             - Get ticket details
GET    /api/discord/tickets/channel/{id}     - Get by Discord channel
GET    /api/discord/tickets/customer/{id}/open - Get open tickets
PATCH  /api/discord/tickets/{id}/status      - Update status
POST   /api/discord/tickets/{id}/close       - Close ticket
POST   /api/discord/tickets/{id}/metadata    - Save metadata
POST   /api/discord/tickets/{id}/assign-support - Assign staff

GET    /discord/ticket-type-settings/{type}/custom-fields
POST   /discord/ticket-type-settings/render  - Template rendering

GET    /discord/category-ticket-settings/category/{id}
GET    /api/public/service-categories        - List categories
GET    /api/public/services/{id}/pricing     - Service pricing
```

### Database (Prisma)
- **Connection**: MySQL database via Prisma ORM
- **Tables**: ticket, ticketMessage, ticketMetadata, ticketTypeSettings, categoryTicketSettings
- **User Relations**: Linked via customerId and supportId to User table
- **Service Relations**: Linked to ServiceCategory and Service tables
- **Order Relations**: Linked to Order table (ticketId foreign key)

---

## 6. CONFIGURATION & CUSTOMIZATION

### Ticket Type Settings (Per-Type Customization)
Each ticket type can have:
- Custom button label and color
- Custom welcome message template (with variable interpolation)
- Custom form fields (JSON array with validation rules)
- Grouping for shared welcome messages
- Active/inactive toggle per type
- Auto-assignment settings
- Notification preferences

### Category Settings
Each service category can override:
- Banner URL
- Welcome message title and body
- Footer text
- Embed color
- Active status

### Custom Fields
For each ticket type, define form fields:
```json
{
  "id": "field_id",
  "label": "Field Label",
  "type": "text|textarea",
  "required": true,
  "placeholder": "Help text",
  "options": [],
  "min": 0,
  "max": 100
}
```

---

## 7. KEY FILES & ARCHITECTURE

### Discord Bot Services
- `ticket.service.ts` - Core ticket operations
- `ticketCategoryManager.service.ts` - Manage ticket creation UI
- `ticket-channel-mover.service.ts` - Queue async channel moves
- `ticketTypeHelper.ts` - Utility functions for ticket types

### Discord Interactions
**Buttons**:
- `create-ticket.button.ts` - Open modal for ticket type
- `open-ticket.button.ts` - Generic open ticket button
- `confirm-close-ticket.button.ts` - Confirm closure warning

**Modals**:
- `ticket-create.modal.ts` - Main ticket creation form
- `ticket-modal.modal.ts` - Generic/dynamic modal handling

### API Services
- `/src/api/ticket/ticket.service.ts` - Database operations
- `/src/api/ticket/ticket.discord.controller.ts` - Discord-specific endpoints
- `/src/api/ticket/ticket.controller.ts` - HTTP REST endpoints

### DTOs
- `createTicket.dto.ts` - Ticket creation validation
- `getTicketList.dto.ts` - List query parameters
- `updateTicket.dto.ts` - Update validation

---

## 8. PERMISSIONS & SECURITY

### Discord Channel Permissions
```
@everyone (Guild role)
├─ Deny: ViewChannel, SendMessages (hidden from most)

Customer (User-specific)
├─ Allow: ViewChannel, SendMessages, ReadMessageHistory
├─ Allow: AttachFiles, EmbedLinks
└─ Deny: ManageMessages

Support Role (discordConfig.supportRoleId)
├─ Allow: All of above
└─ Allow: ManageMessages

Admin Role (discordConfig.adminRoleId)
└─ Allow: Administrator
```

### Status Transition Validation
- Cannot skip states (must follow valid transition chain)
- Terminal states (CANCELLED, CLOSED) are final
- Specific roles required for status changes

### Order-Ticket Relationship
- Customers blocked from closing if order exists (except support/admin)
- Support/Admin warned if order in risky state
- Order status prevents closure to avoid data loss

---

## 9. ERROR HANDLING & EDGE CASES

### Creation Errors
- Missing category: Attempt to find or use default
- Missing service: Optional, handled gracefully
- Channel creation failure: Rollback, delete temporary channel
- API timeout: Retry with exponential backoff (config)

### Permission Errors
- User not found: Create from Discord data
- Channel access denied: Log warning, continue
- Role not found: Fallback to @everyone with restrictions

### Closure Edge Cases
- Active orders: Warn with detailed confirmation
- Expired interactions: Graceful timeout with user message
- Message fetch failures: Skip button disable, log warning

---

## 10. PERFORMANCE CONSIDERATIONS

### Caching
- Modal definitions cached for 30 seconds
- Ticket type settings cached in memory
- Welcome message templates cached

### Optimization
- Batch message operations
- Lazy-load user/category data
- Pagination for ticket lists (default 10 per page)
- Index on frequently queried fields

### Rate Limiting
- API calls have 5-second timeout
- Channel operations have throttling
- Message deletion done with delay to avoid rate limits

---

## 11. LOGGING & MONITORING

All operations logged with context:
- User Discord tag
- Ticket number
- Status changes
- Error details
- Timestamp

Logger levels:
- `info` - Normal operations
- `warn` - Non-critical issues
- `error` - Critical failures

Examples:
```
[TicketService] Created ticket #0001 for user
[TicketService] Ticket #0001 status changed: OPEN -> IN_PROGRESS
[CloseTicket] Ticket closed by support user: reason provided
[ArchiveClosedTickets] Archived 5 tickets (>7 days old)
```

