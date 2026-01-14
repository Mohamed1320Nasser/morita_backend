import { Message } from "discord.js";
import { ApiService } from "./api.service";
import { EnhancedPricingBuilder } from "../utils/enhancedPricingBuilder";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { ServiceCategory } from "../types/discord.types";

export class SelectMenuResetManager {
    private static instance: SelectMenuResetManager;
    private apiService = new ApiService(discordConfig.apiBaseUrl);

    private resetTimers = new Map<string, NodeJS.Timeout>();

    private categoryCache: ServiceCategory[] | null = null;
    private cacheTimestamp = 0;
    private readonly CACHE_TTL = 45000; 

    private readonly DEBOUNCE_DELAY = 800; 

    private messageCategoryMap = new Map<string, string[]>();

    private operationLocks = new Map<string, boolean>();

    private readonly MAX_RETRIES = 3;
    private readonly RETRY_BASE_DELAY = 500; 

    private metrics = {
        totalResets: 0,
        successfulResets: 0,
        failedResets: 0,
        cacheHits: 0,
        cacheMisses: 0,
        retries: 0,
    };

    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly CLEANUP_INTERVAL = 300000; 

    private constructor() {
        
        this.startCleanupJob();
    }

    static getInstance(): SelectMenuResetManager {
        if (!SelectMenuResetManager.instance) {
            SelectMenuResetManager.instance = new SelectMenuResetManager();
        }
        return SelectMenuResetManager.instance;
    }

    private startCleanupJob(): void {
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, this.CLEANUP_INTERVAL);

        logger.info("[SelectMenuResetManager] Cleanup job started");
    }

    private performCleanup(): void {
        const before = {
            timers: this.resetTimers.size,
            mappings: this.messageCategoryMap.size,
            locks: this.operationLocks.size,
        };

        const staleLockThreshold = Date.now() - 30000;
        for (const [messageId] of this.operationLocks.entries()) {
            
            this.operationLocks.delete(messageId);
        }

        logger.debug(
            `[SelectMenuResetManager] Cleanup complete. Before: ${JSON.stringify(before)}, After: timers=${this.resetTimers.size}, mappings=${this.messageCategoryMap.size}, locks=${this.operationLocks.size}`
        );
    }

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

        if (this.resetTimers.has(messageId)) {
            const existingTimer = this.resetTimers.get(messageId)!;
            clearTimeout(existingTimer);
            logger.debug(
                `[SelectMenuResetManager] Debounced reset for message ${messageId}`
            );
        }

        const timer = setTimeout(async () => {
            await this.executeResetWithRetry(message, messageId);
        }, this.DEBOUNCE_DELAY);

        this.resetTimers.set(messageId, timer);
    }

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
                return; 
            } catch (error) {
                logger.warn(
                    `[SelectMenuResetManager] Reset attempt ${attempt + 1}/${this.MAX_RETRIES + 1} failed for message ${messageId}:`,
                    error
                );

                if (attempt === this.MAX_RETRIES) {
                    
                    this.metrics.failedResets++;
                    logger.error(
                        `[SelectMenuResetManager] All retry attempts exhausted for message ${messageId}`,
                        error
                    );
                    
                    this.resetTimers.delete(messageId);
                    this.operationLocks.delete(messageId);
                }
            }
        }
    }

    private async executeReset(
        message: Message,
        messageId: string
    ): Promise<void> {
        
        if (this.operationLocks.get(messageId)) {
            logger.debug(
                `[SelectMenuResetManager] Operation already in progress for message ${messageId}, skipping`
            );
            return;
        }

        this.operationLocks.set(messageId, true);

        try {
            
            const categoryIds = this.messageCategoryMap.get(messageId);
            if (!categoryIds || categoryIds.length === 0) {
                throw new Error(
                    `No categories registered for message ${messageId}`
                );
            }

            let freshMessage: Message;
            try {
                freshMessage = await message.channel.messages.fetch(messageId);
            } catch (fetchError) {
                logger.warn(
                    `[SelectMenuResetManager] Could not fetch fresh message ${messageId}, using provided message`,
                    fetchError
                );
                freshMessage = message; 
            }

            const categories = await this.getFreshCategories();

            const groupCategories = categories.filter((cat) =>
                categoryIds.includes(cat.id)
            );

            if (groupCategories.length === 0) {
                throw new Error(
                    `No matching categories found for message ${messageId}. Expected: ${categoryIds.join(", ")}`
                );
            }

            const components: any[] = [];
            for (const category of groupCategories) {
                const { components: categoryComponents } =
                    EnhancedPricingBuilder.buildCategorySelectMenu(category);
                components.push(...categoryComponents);
            }

            if (components.length === 0) {
                throw new Error(
                    `No components built for message ${messageId}`
                );
            }

            await freshMessage.edit({
                components: components as any,
            });

            this.invalidateCacheForMessage(messageId);

            this.resetTimers.delete(messageId);

            logger.info(
                `[SelectMenuResetManager] Successfully reset ${groupCategories.length} select menus in message ${messageId}`
            );
        } finally {
            
            this.operationLocks.delete(messageId);
        }
    }

    private invalidateCacheForMessage(messageId: string): void {

        this.categoryCache = null;
        this.cacheTimestamp = 0;
        logger.debug(
            `[SelectMenuResetManager] Cache invalidated for message ${messageId}`
        );
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async getCachedCategories(): Promise<ServiceCategory[]> {
        const now = Date.now();

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

        this.metrics.cacheMisses++;
        logger.debug("[SelectMenuResetManager] Cache miss, fetching fresh data");

        const categories = await this.apiService.getCategoriesWithServices();

        this.categoryCache = categories;
        this.cacheTimestamp = now;

        return categories;
    }

    private async getFreshCategories(): Promise<ServiceCategory[]> {
        logger.debug("[SelectMenuResetManager] Fetching fresh categories (bypass cache)");

        const categories = await this.apiService.getCategoriesWithServices();

        this.categoryCache = categories;
        this.cacheTimestamp = Date.now();

        return categories;
    }

    clearCache(): void {
        this.categoryCache = null;
        this.cacheTimestamp = 0;
        logger.info("[SelectMenuResetManager] Cache manually cleared");
    }

    cancelReset(messageId: string): void {
        if (this.resetTimers.has(messageId)) {
            clearTimeout(this.resetTimers.get(messageId)!);
            this.resetTimers.delete(messageId);
            logger.debug(
                `[SelectMenuResetManager] Cancelled pending reset for message ${messageId}`
            );
        }
    }

    unregisterMessage(messageId: string): void {
        this.cancelReset(messageId);
        this.messageCategoryMap.delete(messageId);
        this.operationLocks.delete(messageId);
        logger.debug(
            `[SelectMenuResetManager] Unregistered message ${messageId}`
        );
    }

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

    shutdown(): void {
        
        for (const [messageId, timer] of this.resetTimers.entries()) {
            clearTimeout(timer);
        }
        this.resetTimers.clear();

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        this.messageCategoryMap.clear();
        this.operationLocks.clear();
        this.categoryCache = null;

        logger.info(
            "[SelectMenuResetManager] Shutdown complete. Final metrics:",
            this.metrics
        );
    }
}

export function getSelectMenuResetManager(): SelectMenuResetManager {
    return SelectMenuResetManager.getInstance();
}
