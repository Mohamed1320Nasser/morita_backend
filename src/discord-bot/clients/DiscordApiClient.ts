import { HttpClient } from "../../common/clients/HttpClient";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

/**
 * Centralized HTTP client for Discord bot API calls
 * Automatically includes X-API-Key header for authentication
 */
export class DiscordApiClient extends HttpClient {
    constructor(timeout?: number) {
        super(discordConfig.apiBaseUrl, timeout || 30000);
        this._initializeApiKeyHeader();
    }

    private _initializeApiKeyHeader() {
        const apiKey = process.env.DISCORD_BOT_API_KEY;

        if (!apiKey) {
            logger.warn("[DiscordApiClient] DISCORD_BOT_API_KEY not found in environment variables");
        }

        // Set the X-API-Key header for all requests
        this.instance.defaults.headers.common['X-API-Key'] = apiKey || '';
    }

    /**
     * Override error handler to add Discord-specific logging
     */
    protected _handleError = (error: any) => {
        if (error.response) {
            logger.error("[DiscordApiClient] API Error:", {
                status: error.response.status,
                data: error.response.data,
                url: error.config?.url
            });
        } else if (error.request) {
            logger.error("[DiscordApiClient] Network Error:", {
                message: error.message,
                url: error.config?.url
            });
        } else {
            logger.error("[DiscordApiClient] Unexpected Error:", error.message);
        }

        return Promise.reject(error);
    };

    // Convenience methods for common HTTP operations
    async get<T = any>(url: string, config?: any): Promise<T> {
        return this.instance.get(url, config);
    }

    async post<T = any>(url: string, data?: any, config?: any): Promise<T> {
        return this.instance.post(url, data, config);
    }

    async put<T = any>(url: string, data?: any, config?: any): Promise<T> {
        return this.instance.put(url, data, config);
    }

    async patch<T = any>(url: string, data?: any, config?: any): Promise<T> {
        return this.instance.patch(url, data, config);
    }

    async delete<T = any>(url: string, config?: any): Promise<T> {
        return this.instance.delete(url, config);
    }
}

// Export a singleton instance
export const discordApiClient = new DiscordApiClient();
