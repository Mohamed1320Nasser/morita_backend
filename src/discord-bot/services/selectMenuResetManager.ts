import { Message } from "discord.js";
import { ApiService } from "./api.service";
import { EnhancedPricingBuilder } from "../utils/enhancedPricingBuilder";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { ServiceCategory } from "../types/discord.types";

/**
 * Manages smart select menu resets with debouncing and caching
 * Prevents race conditions when multiple users click at once
 */
export class SelectMenuResetManager {
    private static instance: SelectMenuResetManager;
    private apiService = new ApiService(discordConfig.apiBaseUrl);

    // Debounce timers: messageId → timeout
    private resetTimers = new Map<string, NodeJS.Timeout>();

    // Cache for category data
    private categoryCache: ServiceCategory[] | null = null;
    private cacheTimestamp = 0;
    private readonly CACHE_TTL = 60000; // 1 minute

    // Debounce delay (wait this long before editing)
    private readonly DEBOUNCE_DELAY = 1500; // 1.5 seconds

    // Track which categories belong to which message
    private messageCategoryMap = new Map<string, string[]>();

    private constructor() {}

    static getInstance(): SelectMenuResetManager {
        if (!SelectMenuResetManager.instance) {
            SelectMenuResetManager.instance = new SelectMenuResetManager();
        }
        return SelectMenuResetManager.instance;
    }

    /**
     * Register which categories are in a grouped message
     */
    registerGroupedMessage(messageId: string, categoryIds: string[]): void {
        this.messageCategoryMap.set(messageId, categoryIds);
    }

    /**
     * Schedule a reset for a select menu (with debouncing)
     */
    async scheduleReset(
        message: Message,
        categoryId: string
    ): Promise<void> {
        const messageId = message.id;

        // Clear existing timer (debounce)
        if (this.resetTimers.has(messageId)) {
            clearTimeout(this.resetTimers.get(messageId)!);
        }

        // Schedule new reset
        const timer = setTimeout(async () => {
            await this.executeReset(message, messageId);
        }, this.DEBOUNCE_DELAY);

        this.resetTimers.set(messageId, timer);
    }

    /**
     * Execute the actual message reset
     */
    private async executeReset(
        message: Message,
        messageId: string
    ): Promise<void> {
        try {
            // Get category IDs for this message
            const categoryIds = this.messageCategoryMap.get(messageId);
            if (!categoryIds || categoryIds.length === 0) {
                logger.warn(
                    `[SelectMenuReset] No categories registered for message ${messageId}`
                );
                return;
            }

            // Fetch categories (with caching)
            const categories = await this.getCachedCategories();

            // Filter to only categories in this message
            const groupCategories = categories.filter((cat) =>
                categoryIds.includes(cat.id)
            );

            if (groupCategories.length === 0) {
                logger.warn(
                    `[SelectMenuReset] No matching categories found for message ${messageId}`
                );
                return;
            }

            // Rebuild all select menus in this group
            const components: any[] = [];
            for (const category of groupCategories) {
                const { components: categoryComponents } =
                    EnhancedPricingBuilder.buildCategorySelectMenu(category);
                components.push(...categoryComponents);
            }

            // Edit message to reset select menus
            await message.edit({
                components: components as any,
            });

            // Cleanup timer
            this.resetTimers.delete(messageId);

            logger.info(
                `[SelectMenuReset] Reset ${groupCategories.length} select menus in message ${messageId}`
            );
        } catch (error) {
            logger.error(
                `[SelectMenuReset] Failed to reset message ${messageId}:`,
                error
            );
            // Cleanup timer even on error
            this.resetTimers.delete(messageId);
        }
    }

    /**
     * Get categories with caching (fast)
     */
    private async getCachedCategories(): Promise<ServiceCategory[]> {
        const now = Date.now();

        // Check if cache is valid
        if (
            this.categoryCache &&
            now - this.cacheTimestamp < this.CACHE_TTL
        ) {
            return this.categoryCache;
        }

        // Fetch fresh data
        const categories = await this.apiService.getCategoriesWithServices();

        // Update cache
        this.categoryCache = categories;
        this.cacheTimestamp = now;

        return categories;
    }

    /**
     * Clear cache (useful for testing or manual refresh)
     */
    clearCache(): void {
        this.categoryCache = null;
        this.cacheTimestamp = 0;
    }

    /**
     * Cancel pending reset for a message
     */
    cancelReset(messageId: string): void {
        if (this.resetTimers.has(messageId)) {
            clearTimeout(this.resetTimers.get(messageId)!);
            this.resetTimers.delete(messageId);
        }
    }

    /**
     * Get statistics (for debugging)
     */
    getStats(): {
        pendingResets: number;
        registeredMessages: number;
        cacheAge: number;
    } {
        return {
            pendingResets: this.resetTimers.size,
            registeredMessages: this.messageCategoryMap.size,
            cacheAge: this.categoryCache
                ? Date.now() - this.cacheTimestamp
                : -1,
        };
    }
}

// Export singleton instance getter
export function getSelectMenuResetManager(): SelectMenuResetManager {
    return SelectMenuResetManager.getInstance();
}
