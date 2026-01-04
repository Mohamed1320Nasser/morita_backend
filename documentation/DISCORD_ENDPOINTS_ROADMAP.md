# Discord Bot API Endpoints - Future Implementation Roadmap

This document outlines additional Discord bot management endpoints for future implementation in the Morita platform.

---

## 📋 Table of Contents

1. [Announcement Management](#1-announcement-management)
2. [Bot Statistics & Health](#2-bot-statistics--health)
3. [Bot Lifecycle Management](#3-bot-lifecycle-management)
4. [Guild Member Management](#4-guild-member-management)
5. [Category-Specific Updates](#5-category-specific-updates)
6. [Message Management](#6-message-management)
7. [Role & Permission Management](#7-role--permission-management)

---

## 1. Announcement Management

### Endpoint: `POST /discord/announcements/send`

**Purpose:** Send custom announcements to Discord channels

**Use Cases:**
- Notify users about new services
- Announce pricing changes
- Send maintenance notifications
- Promotional campaigns

**Request Body:**
```json
{
  "channelId": "1234567890",
  "message": "New services available!",
  "embed": {
    "title": "Announcement",
    "description": "We've added new gaming services",
    "color": "#00d9ff",
    "footer": "Morita Gaming Services"
  },
  "mentionRole": "@everyone" // optional
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "1234567890",
  "channelName": "announcements"
}
```

**Implementation Steps:**
1. Create `discord.announcements.controller.ts`
2. Add validation for channel permissions
3. Support rich embeds and attachments
4. Add rate limiting (prevent spam)
5. Log all announcements to database

**Dashboard Integration:**
- Add "Announcements" section in settings
- Rich text editor for message composition
- Preview before sending
- Schedule announcements (optional)

---

## 2. Bot Statistics & Health

### Endpoint: `GET /discord/bot/stats`

**Purpose:** Get comprehensive Discord bot statistics

**Use Cases:**
- Monitor bot health
- Track server growth
- Display stats in admin dashboard
- Troubleshooting connection issues

**Response:**
```json
{
  "success": true,
  "data": {
    "uptime": "5d 12h 34m",
    "uptimeSeconds": 475440,
    "status": "online",
    "ping": 45,
    "guilds": {
      "count": 1,
      "list": [
        {
          "id": "1431960124699709482",
          "name": "Morita dev",
          "memberCount": 9,
          "onlineCount": 5
        }
      ]
    },
    "channels": {
      "total": 15,
      "text": 10,
      "voice": 5
    },
    "cache": {
      "users": 45,
      "messages": 1234,
      "channels": 15
    },
    "memory": {
      "used": "45.2 MB",
      "total": "512 MB",
      "percentage": 8.8
    }
  }
}
```

**Implementation Steps:**
1. Create health monitoring service
2. Track uptime since bot start
3. Calculate memory usage
4. Monitor WebSocket ping
5. Cache statistics (refresh every 5 minutes)

**Dashboard Integration:**
- Add "Bot Health" card in dashboard
- Real-time status indicators
- Uptime graph
- Memory usage chart

---

## 3. Bot Lifecycle Management

### Endpoint: `POST /discord/bot/restart`

**Purpose:** Restart the Discord bot without server restart

**Use Cases:**
- Apply configuration changes
- Recover from connection issues
- Update bot presence/status
- Clear memory cache

**Request Body:**
```json
{
  "reason": "Applying configuration changes",
  "clearCache": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot restart initiated",
  "estimatedDowntime": "5-10 seconds"
}
```

**Implementation Steps:**
1. Gracefully disconnect from Discord
2. Clear all caches and listeners
3. Reload configuration
4. Reconnect to Discord
5. Re-initialize channel managers
6. Log restart event

**Security Considerations:**
- ⚠️ **Requires admin authentication**
- Log all restart attempts
- Rate limit (max 1 per 5 minutes)
- Prevent restart during critical operations

**Dashboard Integration:**
- Add "Restart Bot" button with confirmation
- Show restart history/logs
- Display estimated downtime

---

## 4. Guild Member Management

### Endpoint: `GET /discord/members`

**Purpose:** List and manage Discord server members

**Query Parameters:**
- `guildId` (optional): Specific guild ID
- `role` (optional): Filter by role
- `online` (boolean): Only online members
- `limit` (number): Max results (default: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 45,
    "members": [
      {
        "id": "123456789",
        "username": "John#1234",
        "displayName": "Johnny",
        "avatar": "https://cdn.discordapp.com/...",
        "roles": ["Admin", "Worker"],
        "joinedAt": "2024-01-15T10:30:00Z",
        "status": "online",
        "isBot": false
      }
    ]
  }
}
```

**Additional Endpoints:**

**`GET /discord/members/:userId`** - Get single member details

**`POST /discord/members/:userId/roles`** - Assign roles
```json
{
  "roleIds": ["123", "456"],
  "action": "add" // or "remove"
}
```

**`POST /discord/members/:userId/kick`** - Kick member
```json
{
  "reason": "Violation of rules"
}
```

**Implementation Steps:**
1. Create member service with caching
2. Add role management functions
3. Implement pagination
4. Add filtering and sorting
5. Sync with database user records

**Dashboard Integration:**
- Members list page
- Search and filter members
- Assign/remove roles
- View member activity

---

## 5. Category-Specific Updates

### Endpoint: `PATCH /discord/pricing/category/:categoryId`

**Purpose:** Update a specific category without rebuilding entire channel

**Use Cases:**
- Quick price updates
- Fix typos in category info
- Update category emoji
- Reorder services in category

**Request Body:**
```json
{
  "action": "update", // or "rebuild", "reorder"
  "data": {
    "emoji": "🎮",
    "name": "Gaming Services",
    "serviceOrder": ["svc1", "svc2", "svc3"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "categoryId": "cat123",
  "messageId": "msg456",
  "updated": true
}
```

**Implementation Steps:**
1. Find category message by ID
2. Fetch fresh category data from database
3. Rebuild only that category's dropdown
4. Update message in Discord
5. Clear relevant caches

**Dashboard Integration:**
- Add "Quick Update" button on category pages
- Inline editing for category details
- Drag-and-drop service reordering

---

## 6. Message Management

### Endpoint: `GET /discord/messages/:channelId`

**Purpose:** Retrieve messages from a specific channel

**Query Parameters:**
- `limit` (number): Max messages (1-100)
- `before` (string): Get messages before this ID
- `after` (string): Get messages after this ID
- `type` (string): Filter by type (bot_only, user_only, all)

**Response:**
```json
{
  "success": true,
  "data": {
    "channelId": "123",
    "channelName": "services-prices",
    "messages": [
      {
        "id": "msg123",
        "content": "Message text",
        "author": {
          "id": "123",
          "username": "Morita Bot",
          "isBot": true
        },
        "timestamp": "2024-01-15T10:30:00Z",
        "attachments": [],
        "embeds": []
      }
    ]
  }
}
```

**Additional Endpoints:**

**`DELETE /discord/messages/:messageId`** - Delete specific message

**`POST /discord/messages/bulk-delete`** - Bulk delete messages
```json
{
  "channelId": "123",
  "messageIds": ["msg1", "msg2", "msg3"]
}
```

**Implementation Steps:**
1. Add message fetching service
2. Implement filtering and pagination
3. Add bulk operations
4. Log all deletions

---

## 7. Role & Permission Management

### Endpoint: `GET /discord/roles`

**Purpose:** Manage Discord server roles

**Response:**
```json
{
  "success": true,
  "data": {
    "roles": [
      {
        "id": "role123",
        "name": "Admin",
        "color": "#ff0000",
        "position": 10,
        "permissions": "8",
        "memberCount": 3
      }
    ]
  }
}
```

**Additional Endpoints:**

**`POST /discord/roles`** - Create new role
```json
{
  "name": "Worker",
  "color": "#00ff00",
  "permissions": ["READ_MESSAGES", "SEND_MESSAGES"]
}
```

**`PATCH /discord/roles/:roleId`** - Update role

**`DELETE /discord/roles/:roleId`** - Delete role

**Implementation Steps:**
1. Create role management service
2. Add permission validation
3. Sync roles with database
4. Auto-assign roles on join

---

## 🔐 Security & Best Practices

### Authentication
- All endpoints require admin authentication
- Use JWT tokens or API keys
- Rate limiting on all endpoints
- Audit log for all actions

### Error Handling
```typescript
{
  "success": false,
  "error": "Bot not connected",
  "code": "BOT_OFFLINE",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Rate Limiting
| Endpoint Type | Rate Limit |
|--------------|------------|
| Read (GET) | 100/minute |
| Write (POST/PATCH) | 30/minute |
| Delete | 10/minute |
| Restart/Lifecycle | 1/5 minutes |

---

## 📊 Implementation Priority

**Phase 1 (High Priority):**
1. ✅ Pricing channel refresh (COMPLETED)
2. Bot Statistics & Health
3. Announcement Management

**Phase 2 (Medium Priority):**
4. Category-Specific Updates
5. Message Management
6. Bot Lifecycle Management

**Phase 3 (Low Priority):**
7. Guild Member Management
8. Role & Permission Management

---

## 🧪 Testing Checklist

For each endpoint implementation:

- [ ] Unit tests for controller
- [ ] Integration tests with Discord API
- [ ] Error handling tests
- [ ] Rate limiting tests
- [ ] Dashboard UI tests
- [ ] Load testing (concurrent requests)
- [ ] Security audit
- [ ] Documentation updated

---

## 📝 Code Template

```typescript
// Example controller structure
import { JsonController, Post, Get, Param, Body } from "routing-controllers";
import { Service } from "typedi";
import DiscordFeatureService from "./discord.feature.service";
import logger from "../../common/loggers";

@JsonController("/discord/feature")
@Service()
export default class DiscordFeatureController {
    constructor(private discordFeatureService: DiscordFeatureService) {}

    @Post("/")
    async createFeature(@Body() data: CreateFeatureDto) {
        try {
            return await this.discordFeatureService.createFeature(data);
        } catch (error: any) {
            logger.error("[DiscordFeatureController] Error:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}
```

---

## 🔗 References

- [Discord.js Documentation](https://discord.js.org/)
- [Discord API Documentation](https://discord.com/developers/docs)
- [Morita Backend Architecture](./README.md)
- [Security Guidelines](./SECURITY.md)

---

**Last Updated:** December 2024
**Status:** Planning Document
**Next Review:** Q1 2025
