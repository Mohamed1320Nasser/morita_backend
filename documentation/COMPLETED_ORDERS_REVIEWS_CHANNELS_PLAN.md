# 📋 Implementation Plan: Completed Orders & Reviews Channels

## 🎯 Overview

Create two specialized Discord channels:
1. **Completed Orders Channel** - Shows completed orders with worker proof/screenshots (Admin/Support only)
2. **Reviews Channel** - Shows customer reviews after order confirmation (Public/visible to all)

---

## 🔄 Current vs New Workflow

### **Current Workflow:**
```
1. Worker clicks [Mark Complete]
2. Order status → READY_FOR_REVIEW
3. Customer gets notification
4. Customer clicks [Confirm Complete] or [Report Issue]
5. If confirmed → Customer can leave review
```

### **New Workflow:**
```
1. Worker clicks [Mark Complete]
2. ✨ NEW: Modal appears asking for completion notes
3. Worker submits notes
4. ✨ NEW: Bot asks "Please upload proof screenshots"
5. Worker uploads screenshots in channel
6. ✨ NEW: Bot posts to Completed Orders Channel with proof
7. Order status → READY_FOR_REVIEW
8. Customer confirms order
9. Customer leaves review
10. ✨ NEW: Review posted to Reviews Channel
```

---

## 🚧 Technical Challenge: Screenshot Upload in Discord

### **Problem:**
Discord modals (pop-ups) **CANNOT** accept file uploads - only text inputs!

### **Solution Options:**

#### **Option 1: Two-Step Process (RECOMMENDED)** ✅
```
Step 1: Worker clicks [Mark Complete]
        ↓
Step 2: Modal shows asking for completion notes
        ↓
Step 3: Worker submits notes
        ↓
Step 4: Bot replies: "Please upload proof screenshots in the next message"
        ↓
Step 5: Worker uploads images in order channel
        ↓
Step 6: Bot detects attachments and captures them
        ↓
Step 7: Bot posts to Completed Orders Channel
```

**Pros:**
- Natural workflow
- Worker can upload multiple screenshots
- Easy to implement

**Cons:**
- Two-step process (but only 5-10 seconds)
- Worker must remember to upload after modal

---

#### **Option 2: Button with Instructions** ⚠️
```
Step 1: Worker clicks [Mark Complete]
        ↓
Step 2: Bot replies: "Please type completion notes and upload screenshots"
        ↓
Step 3: Worker types notes + uploads images in one message
        ↓
Step 4: Bot captures text + attachments
        ↓
Step 5: Bot posts to Completed Orders Channel
```

**Pros:**
- Single message
- Simple for worker

**Cons:**
- No structured modal form
- Hard to validate input
- Worker might forget to include notes or screenshots

---

#### **Option 3: External Upload Link** ❌ (Not Recommended)
```
Step 1: Modal with text input for image URL
Step 2: Worker uploads to Imgur/external service
Step 3: Worker pastes URL in modal
```

**Cons:**
- Extra steps outside Discord
- Requires external service
- Bad user experience

---

## ✅ Recommended Approach: **Option 1 (Two-Step Process)**

---

## 📐 Implementation Architecture

### **Phase 1: Database Schema Updates**

#### **Order Model Changes:**
```typescript
model Order {
  // ... existing fields

  completionNotes      String?        // Worker's notes when completing
  completionProofUrls  String[]       // Array of screenshot URLs
  completedAt          DateTime?      // Timestamp of completion

  // ... existing fields
}
```

**Migration Required:** ✅ Yes

---

### **Phase 2: Discord Config Updates**

#### **`discord.config.ts`:**
```typescript
export const discordConfig = {
  // ... existing config

  // New channel IDs
  completedOrdersChannelId: process.env.COMPLETED_ORDERS_CHANNEL_ID || "",
  reviewsChannelId: process.env.REVIEWS_CHANNEL_ID || "",
};
```

#### **`.env` Updates:**
```env
# New channel IDs
COMPLETED_ORDERS_CHANNEL_ID=123456789...
REVIEWS_CHANNEL_ID=987654321...
```

---

### **Phase 3: Completed Orders Channel Implementation**

#### **Step 1: Create Channel Management Service**

**File:** `src/discord-bot/services/completed-orders-channel.service.ts`

**Responsibilities:**
- Get/create completed orders channel
- Post completed order message with proof
- Format order details as embed

**Key Functions:**
```typescript
class CompletedOrdersChannelService {
  async getOrCreateChannel(guild: Guild): Promise<TextChannel>
  async postCompletedOrder(order: Order, worker: User, proofUrls: string[]): Promise<void>
  async formatCompletedOrderEmbed(order: Order, worker: User, proofUrls: string[]): Embed
}
```

---

#### **Step 2: Modify Complete Order Button Handler**

**File:** `src/discord-bot/interactions/buttons/complete-order.button.ts`

**Current Flow:**
```typescript
handleCompleteOrder() {
  1. Update order status to READY_FOR_REVIEW
  2. Notify customer
  3. Update order channel message
}
```

**New Flow:**
```typescript
handleCompleteOrder() {
  1. Show modal asking for completion notes
  2. Store "awaiting screenshots" state
  3. After modal submission:
     - Reply: "Please upload proof screenshots in your next message"
     - Listen for worker's next message with attachments
  4. Capture screenshots
  5. Post to Completed Orders Channel
  6. Update order status to READY_FOR_REVIEW
  7. Notify customer
}
```

---

#### **Step 3: Create Modal for Completion Notes**

**File:** `src/discord-bot/interactions/modals/complete-order.modal.ts` (NEW)

**Modal Fields:**
```typescript
Modal: "Order Completion Details"
├─ Input 1: "Completion Notes" (paragraph)
│  ├─ Required: false
│  ├─ Max length: 1000
│  └─ Placeholder: "Describe what was completed, any notes for customer..."
│
└─ Input 2: "Additional Info" (paragraph)
   ├─ Required: false
   ├─ Max length: 500
   └─ Placeholder: "Any issues encountered, special instructions..."
```

---

#### **Step 4: Screenshot Capture System**

**Approach: Temporary State Management**

**File:** `src/discord-bot/services/screenshot-capture.service.ts` (NEW)

```typescript
// Temporary in-memory storage for workers awaiting screenshot upload
interface AwaitingScreenshot {
  orderId: string;
  workerId: string;
  channelId: string;
  completionNotes: string;
  timestamp: number;
  interactionId: string;
}

class ScreenshotCaptureService {
  private awaitingScreenshots: Map<string, AwaitingScreenshot>;

  // Set worker as awaiting screenshots
  setAwaitingScreenshots(workerId: string, data: AwaitingScreenshot): void

  // Check if worker is awaiting screenshots
  isAwaitingScreenshots(workerId: string): boolean

  // Get awaiting data
  getAwaitingData(workerId: string): AwaitingScreenshot | null

  // Clear awaiting state
  clearAwaitingState(workerId: string): void

  // Auto-cleanup after 10 minutes
  startCleanupTimer(): void
}
```

**Flow:**
```
1. Worker submits completion modal
   ↓
2. Service stores: { workerId, orderId, channelId, notes }
   ↓
3. Bot listens to messageCreate event
   ↓
4. If message author is in awaitingScreenshots map:
   - Capture attachments
   - Extract URLs
   - Process completion
   - Clear awaiting state
```

---

#### **Step 5: Message Listener for Screenshots**

**File:** `src/discord-bot/events/messageCreate.event.ts`

**Add Logic:**
```typescript
// Check if user is awaiting screenshot upload
const screenshotService = getScreenshotCaptureService();
if (screenshotService.isAwaitingScreenshots(message.author.id)) {
  const awaitingData = screenshotService.getAwaitingData(message.author.id);

  // Check if message is in correct channel
  if (message.channel.id === awaitingData.channelId) {
    // Check if message has attachments
    if (message.attachments.size > 0) {
      // Extract screenshot URLs
      const screenshotUrls = message.attachments.map(a => a.url);

      // Process order completion
      await processOrderCompletionWithProof(
        awaitingData.orderId,
        message.author,
        awaitingData.completionNotes,
        screenshotUrls
      );

      // Clear awaiting state
      screenshotService.clearAwaitingState(message.author.id);

      // Acknowledge
      await message.react('✅');
      await message.reply('Thank you! Screenshots captured and order marked as complete.');
    }
  }
}
```

---

#### **Step 6: Completed Orders Channel Message Format**

**Example Message:**
```
┌────────────────────────────────────────────────────┐
│ ✅ Order Completed - #1234                          │
├────────────────────────────────────────────────────┤
│                                                     │
│ 📦 Service: Firemaking 1-99                        │
│ 👤 Customer: @JohnDoe                              │
│ 👷 Worker: @WorkerName                             │
│ 💰 Value: $125.00                                  │
│                                                     │
│ ⏰ Completed: 2026-01-04 14:30:25                  │
│                                                     │
│ 📝 Completion Notes:                               │
│ "Completed all levels from 1 to 99. Used          │
│  wintertodt method. Customer was online during     │
│  entire process. No issues encountered."           │
│                                                     │
│ 📸 Proof Screenshots: 3 attachments                │
│ [Screenshot 1] [Screenshot 2] [Screenshot 3]       │
│                                                     │
│ 🔗 Order Channel: #order-1234-johnsmith            │
│                                                     │
└────────────────────────────────────────────────────┘

[Image 1: Screenshot showing level 99]
[Image 2: Screenshot showing customer confirmation]
[Image 3: Screenshot showing final stats]
```

---

### **Phase 4: Reviews Channel Implementation**

#### **Step 1: Create Reviews Channel Service**

**File:** `src/discord-bot/services/reviews-channel.service.ts` (NEW)

**Responsibilities:**
- Get/create reviews channel
- Post customer review
- Format review as embed

**Key Functions:**
```typescript
class ReviewsChannelService {
  async getOrCreateChannel(guild: Guild): Promise<TextChannel>
  async postReview(order: Order, review: Review, customer: User): Promise<void>
  async formatReviewEmbed(order: Order, review: Review, customer: User): Embed
}
```

---

#### **Step 2: Modify Review Submission Handler**

**File:** `src/discord-bot/interactions/modals/leave-review.modal.ts`

**Current Flow:**
```typescript
handleLeaveReview() {
  1. Get review from modal
  2. Save review to database
  3. Reply to customer: "Thank you for your review"
}
```

**New Flow:**
```typescript
handleLeaveReview() {
  1. Get review from modal
  2. Save review to database
  3. ✨ NEW: Post review to Reviews Channel
  4. Reply to customer: "Thank you for your review"
}
```

---

#### **Step 3: Reviews Channel Message Format**

**Example Message:**
```
┌────────────────────────────────────────────────────┐
│ ⭐⭐⭐⭐⭐ 5/5 Stars                                   │
├────────────────────────────────────────────────────┤
│                                                     │
│ 📦 Service: Firemaking 1-99                        │
│ 👤 Customer: @JohnDoe                              │
│ 👷 Worker: @WorkerName                             │
│                                                     │
│ 📅 Completed: 2026-01-04                           │
│ 💰 Order Value: $125.00                            │
│                                                     │
│ 💬 Review:                                         │
│ "Amazing service! Worker was professional and      │
│  completed the task faster than expected. Very     │
│  happy with the results. Highly recommend!"        │
│                                                     │
│ 🏆 Order #1234                                     │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

### **New Files to Create:**
```
src/discord-bot/
├── services/
│   ├── completed-orders-channel.service.ts   [NEW]
│   ├── reviews-channel.service.ts            [NEW]
│   └── screenshot-capture.service.ts         [NEW]
│
├── interactions/
│   └── modals/
│       └── complete-order.modal.ts           [NEW]
│
└── config/
    └── discord.config.ts                     [MODIFY]
```

### **Files to Modify:**
```
src/discord-bot/
├── interactions/
│   ├── buttons/
│   │   └── complete-order.button.ts          [MODIFY]
│   └── modals/
│       └── leave-review.modal.ts             [MODIFY]
│
├── events/
│   └── messageCreate.event.ts                [MODIFY]
│
└── config/
    └── discord.config.ts                     [MODIFY]
```

### **Database Migration:**
```
prisma/migrations/
└── add_completion_proof_fields/
    └── migration.sql                         [NEW]
```

---

## 🔐 Channel Permissions

### **Completed Orders Channel:**
```typescript
Permissions:
├─ @everyone: ❌ View Channel (DENY)
├─ @Support Role: ✅ View, Read, Send Messages
├─ @Admin Role: ✅ Administrator
└─ Bot: ✅ Send Messages, Embed Links, Attach Files
```

### **Reviews Channel:**
```typescript
Permissions:
├─ @everyone: ✅ View, Read Messages (ALLOW)
│              ❌ Send Messages (DENY) - only bot can post
├─ @Support Role: ✅ View, Read, Send Messages
├─ @Admin Role: ✅ Administrator
└─ Bot: ✅ Send Messages, Embed Links
```

---

## 🔄 Complete Order Flow (Detailed)

### **Before Changes:**
```
1. Worker clicks [Mark Complete]
2. Order status → READY_FOR_REVIEW
3. Customer notified
```

### **After Changes:**
```
1. Worker clicks [Mark Complete]
   ↓
2. Modal appears:
   ┌─────────────────────────────────────┐
   │ Order Completion Details             │
   ├─────────────────────────────────────┤
   │ Completion Notes:                    │
   │ [Text input - paragraph]             │
   │                                      │
   │ Additional Info:                     │
   │ [Text input - paragraph]             │
   │                                      │
   │         [Submit]  [Cancel]           │
   └─────────────────────────────────────┘
   ↓
3. Worker submits modal
   ↓
4. Bot replies in order channel:
   "✅ Completion notes saved!

   📸 Please upload proof screenshots in your next message.
   (You have 10 minutes to upload)"
   ↓
5. Worker uploads screenshots (drag & drop into channel)
   ↓
6. Bot detects attachments:
   - Extracts URLs
   - Stores in database
   - Reacts with ✅
   ↓
7. Bot posts to Completed Orders Channel:
   [Embed with order details + screenshots]
   ↓
8. Order status → READY_FOR_REVIEW
   ↓
9. Customer notified in order channel
   ↓
10. Customer clicks [Confirm Complete]
    ↓
11. Customer leaves review (modal)
    ↓
12. Review saved to database
    ↓
13. ✨ NEW: Review posted to Reviews Channel
    ↓
14. Customer thanked
    ↓
15. Order status → COMPLETED
```

---

## 🧪 Test Scenarios

### **Test 1: Worker Completes Order with Screenshots**
```
Expected:
1. Modal appears ✅
2. Worker submits notes ✅
3. Bot asks for screenshots ✅
4. Worker uploads 3 images ✅
5. Bot captures all 3 URLs ✅
6. Completed Orders Channel shows message with 3 images ✅
7. Customer gets notification ✅
```

### **Test 2: Worker Completes Order WITHOUT Screenshots**
```
Expected:
1. Modal appears ✅
2. Worker submits notes ✅
3. Bot asks for screenshots ✅
4. Worker doesn't upload (timeout after 10 min) ⏰
5. Bot auto-completes order without proof ✅
6. Completed Orders Channel shows message with "No proof provided" ⚠️
7. Customer still gets notification ✅
```

### **Test 3: Worker Uploads Wrong Channel**
```
Expected:
1. Bot asks for screenshots in order channel ✅
2. Worker uploads in different channel ❌
3. Bot ignores (wrong channel) ✅
4. Worker uploads in correct channel ✅
5. Bot captures screenshots ✅
```

### **Test 4: Customer Leaves Review**
```
Expected:
1. Customer confirms order ✅
2. Review modal appears ✅
3. Customer submits 5-star review ✅
4. Review saved to database ✅
5. ✨ Review posted to Reviews Channel ✅
6. Customer sees "Thank you" message ✅
```

---

## 📊 Database Schema

### **Order Model:**
```prisma
model Order {
  id                  String    @id @default(uuid())
  orderNumber         Int       @unique @default(autoincrement())

  // ... existing fields

  // NEW FIELDS
  completionNotes     String?   @db.Text
  completionProofUrls String[]  @default([])
  completedAt         DateTime?

  // ... existing fields
}
```

---

## 🎯 API Endpoints to Create/Modify

### **1. Update Order Completion Endpoint**
```
PUT /api/discord/orders/:orderId/complete
Body: {
  workerId: string,
  completionNotes: string,
  proofUrls: string[]
}
```

### **2. Get Order Completion Proof**
```
GET /api/discord/orders/:orderId/proof
Response: {
  completionNotes: string,
  proofUrls: string[],
  completedAt: DateTime
}
```

---

## ⚙️ Environment Variables

```env
# .env additions
COMPLETED_ORDERS_CHANNEL_ID=123456789...
REVIEWS_CHANNEL_ID=987654321...
```

---

## 🚀 Implementation Steps (Recommended Order)

### **Week 1: Foundation**
1. ✅ Create database migration for new fields
2. ✅ Update Order model
3. ✅ Add channel IDs to config
4. ✅ Create channel services (completed-orders, reviews)

### **Week 2: Completed Orders**
5. ✅ Create screenshot capture service
6. ✅ Create completion notes modal
7. ✅ Modify complete order button handler
8. ✅ Add message listener for screenshots
9. ✅ Test complete order flow

### **Week 3: Reviews Channel**
10. ✅ Create reviews channel service
11. ✅ Modify review submission handler
12. ✅ Test review posting

### **Week 4: Polish & Testing**
13. ✅ Add error handling
14. ✅ Add timeout handling (10 min)
15. ✅ Test all scenarios
16. ✅ Deploy to production

---

## 🎨 UI Mockups

### **Completed Orders Channel Message:**
![Mockup - See example in message format above]

**Features:**
- ✅ Order number prominent
- ✅ Customer & Worker mentioned
- ✅ Completion notes clearly visible
- ✅ Screenshots embedded
- ✅ Link to order channel

---

### **Reviews Channel Message:**
![Mockup - See example in message format above]

**Features:**
- ✅ Star rating visible
- ✅ Customer & Worker mentioned
- ✅ Review text highlighted
- ✅ Service name shown
- ✅ Order number for reference

---

## ❓ Questions to Confirm Before Implementation

1. **Screenshot Upload:**
   - ✅ Is the 2-step process (modal → upload) acceptable?
   - ⚠️ Should screenshots be required or optional?
   - ⏰ Is 10 minutes timeout reasonable?

2. **Completed Orders Channel:**
   - 👁️ Should only Admin/Support see it? (Currently planned)
   - 🔒 Or should customer also see their own completed order posts?

3. **Reviews Channel:**
   - 👥 Should it be public (everyone can see)?
   - 🎯 Or restricted to certain roles?
   - ⭐ Should we show star rating as emoji or number?

4. **Screenshot Storage:**
   - 💾 Discord URLs expire after time - should we download and re-host?
   - 🌐 Or rely on Discord's CDN?

---

## 💡 Recommendations

### **Recommended:**
1. ✅ Make screenshots **optional** (worker might not always have proof)
2. ✅ Keep completed orders channel **Admin/Support only**
3. ✅ Make reviews channel **public** (good for marketing)
4. ✅ Use Discord CDN (screenshots unlikely to be deleted)
5. ✅ Add "Skip Screenshots" button in case worker has none

### **Future Enhancements:**
1. 🔮 Add search/filter in completed orders channel
2. 🔮 Add leaderboard based on reviews
3. 🔮 Add monthly "Top Worker" based on reviews
4. 🔮 Export reviews to website

---

## 📋 Summary

**Total Implementation Time:** ~3-4 weeks

**Complexity:** Medium

**New Files:** 4

**Modified Files:** 4

**Database Changes:** Yes (migration required)

**Discord Permissions:** 2 new channels needed

**Risk Level:** Low (isolated changes, no breaking existing features)

---

Ready to start implementation? 🚀
