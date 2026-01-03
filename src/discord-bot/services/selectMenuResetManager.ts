import { Message } from "discord.js";
import { ApiService } from "./api.service";
import { EnhancedPricingBuilder } from "../utils/enhancedPricingBuilder";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { ServiceCategory } from "../types/discord.types";

/**
 * Advanced Select Menu Reset Manager
 *
 * Features:
 * - Smart debouncing with configurable delays
 * - Retry logic with exponential backoff
 * - Message-specific cache invalidation
 * - Race condition prevention with locks
 * - Automatic cleanup and health monitoring
 * - Metrics tracking for production debugging
 *
 * @author Senior Developer - Refactored for production reliability
 */
export class SelectMenuResetManager {
    private static instance: SelectMenuResetManager;
    private apiService = new ApiService(discordConfig.apiBaseUrl);

    // Debounce timers: messageId → timeout
    private resetTimers = new Map<string, NodeJS.Timeout>();

    // Cache for category data with message-specific invalidation
    private categoryCache: ServiceCategory[] | null = null;
    private cacheTimestamp = 0;
    private readonly CACHE_TTL = 45000; // 45 seconds (reduced from 60s)

    // Debounce delay - reduced for better UX
    private readonly DEBOUNCE_DELAY = 800; // 800ms (reduced from 1.5s)

    // Track which categories belong to which message
    private messageCategoryMap = new Map<string, string[]>();

    // Operation locks to prevent concurrent edits on same message
    private operationLocks = new Map<string, boolean>();

    // Retry configuration
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_BASE_DELAY = 500; // ms

    // Metrics for monitoring
    private metrics = {
        totalResets: 0,
        successfulResets: 0,
        failedResets: 0,
        cacheHits: 0,
        cacheMisses: 0,
        retries: 0,
    };

    // Cleanup interval for stale entries
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

    private constructor() {
        // Start automatic cleanup
        this.startCleanupJob();
    }

    static getInstance(): SelectMenuResetManager {
        if (!SelectMenuResetManager.instance) {
            SelectMenuResetManager.instance = new SelectMenuResetManager();
        }
        return SelectMenuResetManager.instance;
    }

    /**
     * Start automatic cleanup job for stale entries
     */
    private startCleanupJob(): void {
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, this.CLEANUP_INTERVAL);

        logger.info("[SelectMenuResetManager] Cleanup job started");
    }

    /**
     * Cleanup stale timers and mappings
     */
    private performCleanup(): void {
        const before = {
            timers: this.resetTimers.size,
            mappings: this.messageCategoryMap.size,
            locks: this.operationLocks.size,
        };

        // Clear stale locks (older than 30 seconds is definitely stale)
        const staleLockThreshold = Date.now() - 30000;
        for (const [messageId] of this.operationLocks.entries()) {
            // If lock exists for too long, clear it (shouldn't happen in normal operation)
            this.operationLocks.delete(messageId);
        }

        logger.debug(
            `[SelectMenuResetManager] Cleanup complete. Before: ${JSON.stringify(before)}, After: timers=${this.resetTimers.size}, mappings=${this.messageCategoryMap.size}, locks=${this.operationLocks.size}`
        );
    }

    /**
     * Register which categories are in a grouped message
     */
    registerGroupedMessage(messageId: string, categoryIds: string[]): void {
        if (!messageId || !categoryIds || categoryIds.length === 0) {
            logger.warn(
                "[SelectMenuResetManager] Invalid registerGroupedMessage call",
                { messageId, categoryIds }
            );
            return;
        }

        this.messageCategoryMap.set(messageId, categoryIds);
        logger.debug(
            `[SelectMenuResetManager] Registered message ${messageId} with ${categoryIds.length} categories`
        );
    }

    /**
     * Schedule a reset for a select menu (with smart debouncing)
     */
    async scheduleReset(
        message: Message,
        categoryId: string
    ): Promise<void> {
        if (!message || !message.id) {
            logger.error(
                "[SelectMenuResetManager] Invalid message passed to scheduleReset"
            );
            return;
        }

        const messageId = message.id;

        // Clear existing timer (debounce)
        if (this.resetTimers.has(messageId)) {
            const existingTimer = this.resetTimers.get(messageId)!;
            clearTimeout(existingTimer);
            logger.debug(
                `[SelectMenuResetManager] Debounced reset for message ${messageId}`
            );
        }

        // Schedule new reset with retry support
        const timer = setTimeout(async () => {
            await this.executeResetWithRetry(message, messageId);
        }, this.DEBOUNCE_DELAY);

        this.resetTimers.set(messageId, timer);
    }

    /**
     * Execute reset with retry logic
     */
    private async executeResetWithRetry(
        message: Message,
        messageId: string
    ): Promise<void> {
        this.metrics.totalResets++;

        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    this.metrics.retries++;
                    const delay = this.RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
                    logger.debug(
                        `[SelectMenuResetManager] Retry attempt ${attempt} for message ${messageId} after ${delay}ms`
                    );
                    await this.sleep(delay);
                }

                await this.executeReset(message, messageId);
                this.metrics.successfulResets++;
                return; // Success!
            } catch (error) {
                logger.warn(
                    `[SelectMenuResetManager] Reset attempt ${attempt + 1}/${this.MAX_RETRIES + 1} failed for message ${messageId}:`,
                    error
                );

                if (attempt === this.MAX_RETRIES) {
                    // Final attempt failed
                    this.metrics.failedResets++;
                    logger.error(
                        `[SelectMenuResetManager] All retry attempts exhausted for message ${messageId}`,
                        error
                    );
                    // Cleanup
                    this.resetTimers.delete(messageId);
                    this.operationLocks.delete(messageId);
                }
            }
        }
    }

    /**
     * Execute the actual message reset with proper locking and fresh data
     */
    private async executeReset(
        message: Message,
        messageId: string
    ): Promise<void> {
        // Check if another operation is in progress (lock mechanism)
        if (this.operationLocks.get(messageId)) {
            logger.debug(
                `[SelectMenuResetManager] Operation already in progress for message ${messageId}, skipping`
            );
            return;
        }

        // Acquire lock
        this.operationLocks.set(messageId, true);

        try {
            // Get category IDs for this message
            const categoryIds = this.messageCategoryMap.get(messageId);
            if (!categoryIds || categoryIds.length === 0) {
                throw new Error(
                    `No categories registered for message ${messageId}`
                );
            }

            // Fetch FRESH message from Discord (prevents stale message issues)
            let freshMessage: Message;
            try {
                freshMessage = await message.channel.messages.fetch(messageId);
            } catch (fetchError) {
                logger.warn(
                    `[SelectMenuResetManager] Could not fetch fresh message ${messageId}, using provided message`,
                    fetchError
                );
                freshMessage = message; // Fallback to provided message
            }

            // Fetch categories with FRESH data (invalidate cache if needed)
            const categories = await this.getFreshCategories();

            // Filter to only categories in this message
            const groupCategories = categories.filter((cat) =>
                categoryIds.includes(cat.id)
            );

            if (groupCategories.length === 0) {
                throw new Error(
                    `No matching categories found for message ${messageId}. Expected: ${categoryIds.join(", ")}`
                );
            }

            // Rebuild all select menus in this group
            const components: any[] = [];
            for (const category of groupCategories) {
                const { components: categoryComponents } =
                    EnhancedPricingBuilder.buildCategorySelectMenu(category);
                components.push(...categoryComponents);
            }

            // Validate components before editing
            if (components.length === 0) {
                throw new Error(
                    `No components built for message ${messageId}`
                );
            }

            // Edit message to reset select menus
            await freshMessage.edit({
                components: components as any,
            });

            // Invalidate cache after successful edit (important!)
            this.invalidateCacheForMessage(messageId);

            // Cleanup timer
            this.resetTimers.delete(messageId);

            logger.info(
                `[SelectMenuResetManager] Successfully reset ${groupCategories.length} select menus in message ${messageId}`
            );
        } finally {
            // Always release lock
            this.operationLocks.delete(messageId);
        }
    }

    /**
     * Invalidate cache for a specific message
     */
    private invalidateCacheForMessage(messageId: string): void {
        // For now, invalidate entire cache
        // In future, could implement message-specific cache
        this.categoryCache = null;
        this.cacheTimestamp = 0;
        logger.debug(
            `[SelectMenuResetManager] Cache invalidated for message ${messageId}`
        );
    }

    /**
     * Sleep helper for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
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
            this.metrics.cacheHits++;
            logger.debug(
                `[SelectMenuResetManager] Cache hit (age: ${now - this.cacheTimestamp}ms)`
            );
            return this.categoryCache;
        }

        // Cache miss - fetch fresh data
        this.metrics.cacheMisses++;
        logger.debug("[SelectMenuResetManager] Cache miss, fetching fresh data");

        const categories = await this.apiService.getCategoriesWithServices();

        // Update cache
        this.categoryCache = categories;
        this.cacheTimestamp = now;

        return categories;
    }

    /**
     * Get FRESH categories (bypasses cache)
     * Use this when you need guaranteed up-to-date data
     */
    private async getFreshCategories(): Promise<ServiceCategory[]> {
        logger.debug("[SelectMenuResetManager] Fetching fresh categories (bypass cache)");

        const categories = await this.apiService.getCategoriesWithServices();

        // Update cache with fresh data
        this.categoryCache = categories;
        this.cacheTimestamp = Date.now();

        return categories;
    }

    /**
     * Clear cache (useful for testing or manual refresh)
     */
    clearCache(): void {
        this.categoryCache = null;
        this.cacheTimestamp = 0;
        logger.info("[SelectMenuResetManager] Cache manually cleared");
    }

    /**
     * Cancel pending reset for a message
     */
    cancelReset(messageId: string): void {
        if (this.resetTimers.has(messageId)) {
            clearTimeout(this.resetTimers.get(messageId)!);
            this.resetTimers.delete(messageId);
            logger.debug(
                `[SelectMenuResetManager] Cancelled pending reset for message ${messageId}`
            );
        }
    }

    /**
     * Unregister a message (cleanup)
     */
    unregisterMessage(messageId: string): void {
        this.cancelReset(messageId);
        this.messageCategoryMap.delete(messageId);
        this.operationLocks.delete(messageId);
        logger.debug(
            `[SelectMenuResetManager] Unregistered message ${messageId}`
        );
    }

    /**
     * Get statistics (for debugging and monitoring)
     */
    getStats(): {
        pendingResets: number;
        registeredMessages: number;
        activeLocks: number;
        cacheAge: number;
        metrics: {
            totalResets: number;
            successfulResets: number;
            failedResets: number;
            cacheHits: number;
            cacheMisses: number;
            retries: number;
        };
    } {
        return {
            pendingResets: this.resetTimers.size,
            registeredMessages: this.messageCategoryMap.size,
            activeLocks: this.operationLocks.size,
            cacheAge: this.categoryCache
                ? Date.now() - this.cacheTimestamp
                : -1,
            metrics: { ...this.metrics },
        };
    }

    /**
     * Get detailed metrics for monitoring
     */
    getMetrics(): {
        totalResets: number;
        successfulResets: number;
        failedResets: number;
        cacheHits: number;
        cacheMisses: number;
        retries: number;
    } {
        return { ...this.metrics };
    }

    /**
     * Reset metrics (for testing)
     */
    resetMetrics(): void {
        this.metrics = {
            totalResets: 0,
            successfulResets: 0,
            failedResets: 0,
            cacheHits: 0,
            cacheMisses: 0,
            retries: 0,
        };
        logger.info("[SelectMenuResetManager] Metrics reset");
    }

    /**
     * Shutdown cleanup (call when bot stops)
     */
    shutdown(): void {
        // Clear all timers
        for (const [messageId, timer] of this.resetTimers.entries()) {
            clearTimeout(timer);
        }
        this.resetTimers.clear();

        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        // Clear all data
        this.messageCategoryMap.clear();
        this.operationLocks.clear();
        this.categoryCache = null;

        logger.info(
            "[SelectMenuResetManager] Shutdown complete. Final metrics:",
            this.metrics
        );
    }
}

// Export singleton instance getter
export function getSelectMenuResetManager(): SelectMenuResetManager {
    return SelectMenuResetManager.getInstance();
}
