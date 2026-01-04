# Centralized HTTP Client for Discord Bot

## Overview

All Discord bot API calls now use a centralized HTTP client with automatic API key authentication. This provides better code organization, consistency, and maintainability.

## Architecture

### 1. Base HttpClient (`src/common/clients/HttpClient.ts`)

Abstract base class that provides:
- Axios instance configuration
- Response/error interceptors
- Timeout management
- Error handling

```typescript
export abstract class HttpClient {
    protected readonly instance: AxiosInstance;
    // ... implementation
}
```

### 2. DiscordApiClient (`src/discord-bot/clients/DiscordApiClient.ts`)

Extends HttpClient and adds:
- **Automatic X-API-Key header** for all requests
- Discord-specific error logging
- Convenience methods (get, post, put, patch, delete)
- Singleton instance export

```typescript
export class DiscordApiClient extends HttpClient {
    constructor(timeout?: number) {
        super(discordConfig.apiBaseUrl, timeout || 30000);
        this._initializeApiKeyHeader();
    }
}

// Singleton instance
export const discordApiClient = new DiscordApiClient();
```

## Usage

### Before (Old Way)
```typescript
import axios from "axios";
import { discordConfig } from "../config/discord.config";

const apiClient = axios.create({
    baseURL: discordConfig.apiBaseUrl,
    timeout: 10000,
    headers: {
        "X-API-Key": process.env.DISCORD_BOT_API_KEY || ""
    }
});

const response = await apiClient.get(`/discord/wallets/balance/${discordId}`);
```

### After (New Way)
```typescript
import { discordApiClient } from "../clients/DiscordApiClient";

const response = await discordApiClient.get(`/discord/wallets/balance/${discordId}`);
```

## Benefits

### 1. **Automatic Authentication**
- API key header is added automatically to every request
- No more forgetting to add headers
- Single source of truth for API configuration

### 2. **Consistency**
- All API calls follow the same pattern
- Centralized error handling
- Consistent timeout configuration

### 3. **Maintainability**
- Easy to update API configuration in one place
- Simpler to add request/response interceptors
- Better logging and debugging

### 4. **Type Safety**
- Generic type support for responses
- Better IDE autocomplete
- Compile-time error checking

### 5. **DRY Principle**
- No repeated axios.create() calls
- No duplicated configuration
- Less boilerplate code

## Files Refactored

### Commands (3 files)
- ✅ `wallet.command.ts`
- ✅ `add-balance.command.ts`
- ✅ `create-order.command.ts`

### Button Interactions (6 files)
- ✅ `claim-job.button.ts`
- ✅ `order-info.button.ts`
- ✅ `complete-order.button.ts`
- ✅ `report-issue.button.ts`
- ✅ `confirm-complete.button.ts`
- ✅ `create-ticket.button.ts`

### Modal Interactions (4 files)
- ✅ `create-order-job.modal.ts`
- ✅ `complete-order.modal.ts`
- ✅ `report-issue.modal.ts`
- ✅ `ticket-create.modal.ts`

### Utilities and Messages (2 files)
- ✅ `ticketTypeHelper.ts`
- ✅ `purchaseServicesMessage.ts`

## Configuration

The client reads configuration from:
- **Base URL**: `discordConfig.apiBaseUrl` from `discord.config.ts`
- **API Key**: `process.env.DISCORD_BOT_API_KEY` from `.env`

## Error Handling

The client automatically logs errors with context:
```typescript
protected _handleError = (error: any) => {
    if (error.response) {
        logger.error("[DiscordApiClient] API Error:", {
            status: error.response.status,
            data: error.response.data,
            url: error.config?.url
        });
    }
    // ... more logging
    return Promise.reject(error);
};
```

## Future Enhancements

Possible improvements:
- Add retry logic for failed requests
- Implement request caching
- Add request rate limiting
- Request/response logging middleware
- Automatic token refresh if needed

## Migration Checklist

When adding new Discord bot features:
1. ✅ Import `discordApiClient` from `../clients/DiscordApiClient`
2. ✅ Use `discordApiClient.get()`, `.post()`, etc.
3. ❌ Don't import `axios` directly
4. ❌ Don't create new axios instances
5. ❌ Don't manually add API key headers

## Example

```typescript
// ✅ Good
import { discordApiClient } from "../clients/DiscordApiClient";

const balance = await discordApiClient.get(`/discord/wallets/balance/${id}`);
const order = await discordApiClient.post("/discord/orders/create", orderData);

// ❌ Bad
import axios from "axios";

const response = await axios.get(`${baseUrl}/...`); // Missing auth!
```

---

**Note**: The `api.service.ts` and `ticket.service.ts` files have their own specialized axios instances and were intentionally not migrated.
