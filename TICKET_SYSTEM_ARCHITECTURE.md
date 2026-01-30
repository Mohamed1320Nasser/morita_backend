# Ticket System Architecture Diagram

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DISCORD SERVER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  CREATE TICKET CATEGORY                                      │       │
│  ├──────────────────────────────────────────────────────────────┤       │
│  │ • purchase-services     (Service buttons)                    │       │
│  │ • purchase-gold         (Buy gold buttons)                   │       │
│  │ • sell-gold            (Sell gold buttons)                   │       │
│  │ • swap-crypto          (Crypto swap buttons)                 │       │
│  └──────────────────────────────────────────────────────────────┘       │
│           ↓ [User clicks button]                                        │
│           → Modal appears with type-specific form                       │
│           → User fills form & submits                                   │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  TICKETS CATEGORY (Active Tickets)                          │       │
│  ├──────────────────────────────────────────────────────────────┤       │
│  │ • username-tickettype-0001  (Customer channel)              │       │
│  │ • username-tickettype-0002  (Customer channel)              │       │
│  │ • username-tickettype-0003  (Customer channel)              │       │
│  │   ... [Dynamic channels created per ticket]                 │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  CLOSED TICKETS CATEGORY (Archived Tickets)                 │       │
│  ├──────────────────────────────────────────────────────────────┤       │
│  │ • closed-username-tickettype-0001  (Archived)               │       │
│  │ • closed-username-tickettype-0002  (Archived)               │       │
│  │   ... [Auto-deleted after X days]                           │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
         ↓ [Discord.js API calls]
         
┌─────────────────────────────────────────────────────────────────────────┐
│                     DISCORD BOT SERVICE LAYER                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  TicketCategoryManager                                                  │
│  ├─ setupOnly()                  - Initialize without publishing         │
│  ├─ publishTickets()             - Create/update ticket UI              │
│  ├─ getOrCreateCategory()        - Manage main category                 │
│  └─ getOrCreateChannels()        - Manage 4 creation channels           │
│                                                                           │
│  TicketService                                                          │
│  ├─ createTicketChannel()        - Basic ticket creation                │
│  ├─ createTicketChannelWithType()- Type-specific creation               │
│  ├─ sendWelcomeMessage()         - Send welcome embed                   │
│  ├─ closeTicket()                - Close & archive channel              │
│  ├─ archiveOldClosedTickets()    - Auto-cleanup old channels            │
│  ├─ getTicketById()              - Fetch by ID                          │
│  ├─ getTicketByChannelId()       - Fetch by Discord channel             │
│  ├─ getOpenTicketsForUser()      - List user's open tickets             │
│  └─ updateTicketStatus()         - Change ticket status                 │
│                                                                           │
│  Button Handlers (interactions/buttons/)                                │
│  ├─ create-ticket.button.ts      - Show type-specific modal             │
│  ├─ open-ticket.button.ts        - Show generic ticket form             │
│  └─ confirm-close-ticket.button.ts - Confirm closure warning            │
│                                                                           │
│  Modal Handlers (interactions/modals/)                                  │
│  ├─ ticket-create.modal.ts       - Handle form submission               │
│  └─ ticket-modal.modal.ts        - Handle close confirmation            │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
         ↓ [HTTP/REST API calls]
         
┌─────────────────────────────────────────────────────────────────────────┐
│                    NEST.JS API SERVICE LAYER                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Controllers                                                            │
│  ├─ ticket.controller.ts         - HTTP REST endpoints                  │
│  └─ ticket.discord.controller.ts - Discord-specific endpoints           │
│                                                                           │
│  Services                                                               │
│  ├─ ticket.service.ts                                                   │
│  │  ├─ create()                  - Create new ticket                    │
│  │  ├─ createFromDiscord()       - Create with Discord user             │
│  │  ├─ getList()                 - Paginated list                       │
│  │  ├─ getSingle()               - Get by ID                            │
│  │  ├─ getByChannelId()          - Get by Discord channel               │
│  │  ├─ updateStatus()            - Validate & change status             │
│  │  ├─ assignSupport()           - Assign support staff                 │
│  │  ├─ close()                   - Close ticket                         │
│  │  ├─ addMessage()              - Log message to ticket                │
│  │  ├─ getMessages()             - Fetch ticket messages                │
│  │  ├─ saveMetadata()            - Save type-specific metadata          │
│  │  └─ getMetadata()             - Fetch metadata                       │
│  │                                                                        │
│  └─ Additional Services                                                 │
│     ├─ ticketTypeSettings         - Per-type customization              │
│     └─ categoryTicketSettings     - Per-category customization          │
│                                                                           │
│  DTOs (Data Transfer Objects)                                           │
│  ├─ CreateTicketDto             - Input validation                      │
│  ├─ CreateTicketFromDiscordDto  - Discord creation validation           │
│  ├─ UpdateTicketDto             - Update validation                     │
│  ├─ GetTicketListDto            - List query validation                 │
│  └─ AssignSupportDto            - Support assignment validation         │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
         ↓ [Prisma ORM]
         
┌─────────────────────────────────────────────────────────────────────────┐
│                      MYSQL DATABASE (Prisma)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Tables                                                                 │
│  ├─ ticket                          (Main ticket records)                │
│  │  └─ ticketNumber (Auto-increment ID)                               │
│  │  └─ status (OPEN→IN_PROGRESS→...→CLOSED)                          │
│  │  └─ Relations: customer, support, category, service, paymentMethod │
│  │                                                                       │
│  ├─ ticketMessage                   (Conversation history)              │
│  │  └─ Cascade delete with parent ticket                             │
│  │  └─ Stores: Discord message IDs, author info, content            │
│  │                                                                       │
│  ├─ ticketMetadata                  (Type-specific data)                │
│  │  └─ Gold fields: amount, rate, delivery, username, location        │
│  │  └─ Crypto fields: type, amount, wallet, direction, proof         │
│  │  └─ General fields: notes, payouts                                 │
│  │                                                                       │
│  ├─ ticketTypeSettings              (Per-type customization)            │
│  │  └─ Button color, label, welcome message, form fields             │
│  │  └─ Auto-assign, notification preferences, active toggle          │
│  │                                                                       │
│  ├─ categoryTicketSettings          (Per-category customization)        │
│  │  └─ Welcome message, banner, color, footer                        │
│  │                                                                       │
│  └─ Related Tables                  (Foreign keys)                      │
│     ├─ user                         (Customer & support staff)          │
│     ├─ serviceCategory              (Ticket category)                   │
│     ├─ service                      (Specific service)                  │
│     ├─ paymentMethod                (Payment option)                    │
│     ├─ order                        (Related order, if any)             │
│     └─ Indexes on: customerId, categoryId, serviceId, status, etc.    │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Request Flow Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  USER CLICKS "Create Ticket" BUTTON IN DISCORD                    │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  handleCreateTicket() ButtonInteraction Handler                    │
│  • Extract ticket type from customId                              │
│  • Check modal cache (30s TTL)                                    │
│  • Fetch TicketTypeSettings from API if not cached              │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  Discord.showModal() - Displays Type-Specific Form                │
│  • PURCHASE_SERVICES: service description, username, notes        │
│  • BUY_GOLD: amount, delivery method, username, notes            │
│  • SELL_GOLD: amount, payment method, payment details, username  │
│  • SWAP_CRYPTO: direction, crypto type, amount, wallet/username │
│  • GENERAL: description, username, contact method               │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  USER FILLS FORM & CLICKS SUBMIT                                 │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  handleTicketCreateModal() ModalSubmitInteraction Handler          │
│  • Extract form fields                                            │
│  • Defer reply (ephemeral)                                       │
│  • Resolve/create categoryId                                     │
│  • Build customerNotes from fields                               │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  ticketService.createTicketChannelWithType()                       │
│  • Get or create "Tickets" category                              │
│  • Create Discord text channel                                   │
│  • Set channel permissions (customer, support, admin)            │
│  • Set channel name: {username}-{type}-{number}                 │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  API Call: POST /api/discord/tickets                              │
│  Payload:                                                         │
│  {                                                                │
│    customerDiscordId,                                            │
│    categoryId?,                                                  │
│    serviceId?,                                                   │
│    channelId,                                                    │
│    calculatedPrice?,                                             │
│    paymentMethodId?,                                             │
│    currency,                                                     │
│    customerNotes?,                                               │
│    customerName,                                                 │
│    ticketType                                                    │
│  }                                                                │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  ticket.discord.controller.ts POST /api/discord/tickets           │
│  • Call ticketService.createFromDiscord()                        │
│  • Find or create User by discordId                              │
│  • Create Ticket record (status: OPEN)                           │
│  • Return ticket with auto-generated ticketNumber                │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  Save Metadata (if applicable)                                    │
│  API Call: POST /api/discord/tickets/{id}/metadata                │
│  • Upsert TicketMetadata record with type-specific fields        │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  Send Welcome Message                                             │
│  • Fetch TicketTypeSettings for template rendering               │
│  • Interpolate template variables:                               │
│    {customer} → <@discord_id>                                   │
│    {support} → <@&support_role_id>                              │
│    {service} → Service name                                     │
│    {price} → Calculated price                                   │
│    {ticket_id} → Ticket #0001                                   │
│  • Build embed with custom colors, images, footer               │
│  • Add "Calculate Price" & "Close Ticket" buttons                │
│  • Send to Discord channel                                       │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│  Return Success Message to User                                   │
│  • Show confirmation embed with ticket number                    │
│  • Provide link to ticket channel                                │
└────────────────────────────────────────────────────────────────────┘
```

## Status Transition Diagram

```
                        ┌──────────┐
                        │   OPEN   │
                        │(Initial) │
                        └────┬─────┘
                             │
                ┌────────────┼────────────┐
                ↓            ↓            ↓
         ┌──────────────┐  ┌─────────┐  ┌──────────┐
         │ IN_PROGRESS  │  │ CLOSED  │  │CANCELLED │
         └──────┬───────┘  │(Final)  │  │(Final)   │
                │          └─────────┘  └──────────┘
                │
    ┌───────────┼───────────────┐
    ↓           ↓               ↓
┌──────────────────────┐  ┌──────────┐  ┌─────────┐
│AWAITING_CONFIRMATION │  │ CLOSED   │  │CANCELLED│
└──────────┬───────────┘  │(Final)   │  │(Final)  │
           │              └──────────┘  └─────────┘
    ┌──────┼──────────┐
    ↓      ↓          ↓
┌──────────┐┌──────────────┐┌─────────┐
│COMPLETED ││IN_PROGRESS   ││CANCELLED│
└───┬──────┘└──────────────┘└─────────┘
    │
    ↓
 ┌─────────┐
 │ CLOSED  │
 │(Final)  │
 └─────────┘

Valid Transitions:
• OPEN → [IN_PROGRESS, CLOSED, CANCELLED]
• IN_PROGRESS → [AWAITING_CONFIRMATION, CANCELLED, CLOSED]
• AWAITING_CONFIRMATION → [COMPLETED, IN_PROGRESS, CANCELLED, CLOSED]
• COMPLETED → [CLOSED]
• CANCELLED → [] (Terminal)
• CLOSED → [] (Terminal)
```

## Ticket Closure Flow

```
┌──────────────────────────────────────────────┐
│  USER CLICKS "Close Ticket" BUTTON          │
└──────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────┐
│  handleTicketClose() ButtonInteraction       │
│  • Check user role (support/admin/customer) │
│  • Show "Close Ticket" modal form           │
└──────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────┐
│  USER FILLS OPTIONAL CLOSE REASON & SUBMITS │
└──────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────┐
│  handleTicketCloseConfirmModal()             │
│  • Permission validation                    │
│  • Check if order exists                    │
└──────────────────────────────────────────────┘
           │
    ┌──────┴──────┐
    ↓             ↓
┌─────────┐  ┌──────────────────────────┐
│CUSTOMER │  │  SUPPORT/ADMIN WITH ORDER│
└────┬────┘  └──────────┬───────────────┘
     │                  │
   NO?          RISKY STATUS?
   Order        (IN_PROGRESS,
     │          COMPLETED, etc)
   YES          │
     │          YES
   BLOCK        │
     │      ┌───┴──┐
     │      ↓      ↓
     │   WARN   PROCEED
     │   (show confirm buttons)
     │      │
     │      └──→ Require "Confirm Close" click
     │
     └──→ Call ticketService.closeTicket()
              ↓
         ┌─────────────────────────────┐
         │  API: POST /tickets/{}/close │
         ├─────────────────────────────┤
         │  • Update status to CLOSED   │
         │  • Set closedAt timestamp    │
         │  • Log change               │
         └──────────┬──────────────────┘
                    ↓
         ┌─────────────────────────────┐
         │  Discord Operations:         │
         ├─────────────────────────────┤
         │  • Disable welcome buttons   │
         │  • Remove customer perms     │
         │  • Move to "Closed" category │
         │  • Queue for archival        │
         └─────────────────────────────┘
                    ↓
         ┌─────────────────────────────┐
         │  Auto-Archive (if enabled):  │
         ├─────────────────────────────┤
         │  • Wait X days              │
         │  • Delete channel           │
         │  • Purge history            │
         └─────────────────────────────┘
```

## Component Interaction Map

```
┌────────────────────────────────────────────────────────────────┐
│                  DISCORD BOT COMPONENTS                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  TicketCategoryManager ←→ TicketService                       │
│         ↓                      ↓                               │
│  Creates UI channels    Creates ticket channels              │
│  Sends button messages  Sends welcome messages              │
│                                                                │
│  Button Handlers (create-ticket.button.ts) ←→ TicketService │
│         ↓                                            ↓         │
│  Show modal form              Get cached modals              │
│  Extract customId             Fetch custom fields            │
│                                                                │
│  Modal Handlers (ticket-create.modal.ts) ←→ TicketService   │
│         ↓                                        ↓             │
│  Extract form fields          Create channel                 │
│  Validate input               Save metadata                  │
│                                                                │
│         All components ↓                                      │
│         ┌──────────────────────────┐                         │
│         │   discordApiClient       │                         │
│         │  (HTTP Client)           │                         │
│         └──────────────┬───────────┘                         │
│                        ↓                                      │
│         ┌──────────────────────────────────────┐            │
│         │     NestJS API Server                │            │
│         │  (ticket.service.ts handlers)        │            │
│         └──────────────┬───────────────────────┘            │
│                        ↓                                      │
│         ┌──────────────────────────────────────┐            │
│         │   MySQL Database (Prisma)            │            │
│         │  (ticket, ticketMessage, metadata)   │            │
│         └──────────────────────────────────────┘            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
User Action → Discord Handler
    ↓
    ├─ Validation Error
    │  ↓
    │  → User feedback (ephemeral message)
    │  → Log warning
    │  → Continue
    │
    ├─ API Timeout
    │  ↓
    │  → Retry with exponential backoff
    │  → After 3 failures: Error response
    │  → Log error
    │
    ├─ Database Error
    │  ↓
    │  → Rollback transaction
    │  → Delete temporary Discord channel (if created)
    │  → Error response to user
    │  → Log critical error
    │
    ├─ Permission Error
    │  ↓
    │  → Fallback to basic permissions
    │  → Log warning
    │  → Continue with degraded functionality
    │
    └─ Discord API Error
       ↓
       → Retry (rate limit handling)
       → Log error
       → Graceful degradation or user notification
```

