import { Client, TextChannel, Message, AttachmentBuilder } from "discord.js";
import { ApiService } from "./api.service";
import { EnhancedPricingBuilder } from "../utils/enhancedPricingBuilder";
// Note: SelectMenuResetManager no longer used - ephemeral reply pattern is the best practice
import {
    pricingEventService,
    PricingEventData,
    PricingEventType,
} from "./pricingEvent.service";
import {
    ServiceCategory,
    Service,
    PricingMethod,
} from "../types/discord.types";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import path from "path";
import prisma from "../../common/prisma/client";

/**
 * Improved Pricing Channel Manager with Real-Time Updates
 * Listens to pricing events and updates Discord channel instantly
 */
export class ImprovedChannelManager {
    private client: Client;
    private apiService: ApiService;
    private pricingChannel: TextChannel | null = null;
    private headerMessage: Message | null = null;
    private categoryMessages: Map<string, Message> = new Map();
    private footerMessage: Message | null = null;

    // Cache for categories with services
    private categoriesCache: ServiceCategory[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 60 * 1000; // 1 minute

    // Track initialization state
    private isInitialized: boolean = false;
    private isUpdating: boolean = false;

    constructor(client: Client) {
        this.client = client;
        this.apiService = new ApiService(discordConfig.apiBaseUrl);
    }

    /**
     * Initialize pricing channel and event listeners
     */
    async initialize(): Promise<void> {
        try {
            logger.info("[ImprovedChannelManager] Initializing...");

            // Setup pricing channel
            await this.setupPricingChannel();

            // Register event listeners for real-time updates
            this.registerEventListeners();

            // Initial channel build
            await this.rebuildChannel();

            this.isInitialized = true;
            logger.info(
                "[ImprovedChannelManager] Initialization complete with real-time updates enabled"
            );
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Initialization failed:",
                error
            );
            throw error;
        }
    }

    /**
     * Setup pricing channel reference
     */
    private async setupPricingChannel(): Promise<void> {
        if (!discordConfig.pricingChannelId) {
            throw new Error("Pricing channel ID not configured");
        }

        const guild = this.client.guilds.cache.get(discordConfig.guildId);
        if (!guild) {
            throw new Error("Guild not found");
        }

        this.pricingChannel = guild.channels.cache.get(
            discordConfig.pricingChannelId
        ) as TextChannel;

        if (!this.pricingChannel) {
            throw new Error(
                `Pricing channel not found: ${discordConfig.pricingChannelId}`
            );
        }

        logger.info(
            `[ImprovedChannelManager] Connected to channel: ${this.pricingChannel.name}`
        );
    }

    /**
     * Register event listeners for real-time updates
     */
    private registerEventListeners(): void {
        logger.info(
            "[ImprovedChannelManager] Registering real-time event listeners"
        );

        // Listen to any pricing change
        pricingEventService.onPricingEvent(
            "pricing:change",
            async (eventData: PricingEventData) => {
                logger.info(
                    `[ImprovedChannelManager] Received event: ${eventData.type}`
                );
                await this.handlePricingChange(eventData);
            }
        );

        logger.info(
            "[ImprovedChannelManager] Event listeners registered successfully"
        );
    }

    /**
     * Handle pricing change events
     */
    private async handlePricingChange(
        eventData: PricingEventData
    ): Promise<void> {
        if (this.isUpdating) {
            return;
        }

        try {
            this.isUpdating = true;

            // Invalidate cache to force fresh data
            this.categoriesCache = null;
            this.cacheTimestamp = 0;

            // Determine what needs to be updated based on event type
            switch (eventData.type) {
                case PricingEventType.CATEGORY_CREATED:
                case PricingEventType.CATEGORY_UPDATED:
                case PricingEventType.CATEGORY_DELETED:
                    logger.info(
                        "[ImprovedChannelManager] Category changed, rebuilding channel"
                    );
                    await this.rebuildChannel();
                    break;

                case PricingEventType.SERVICE_CREATED:
                case PricingEventType.SERVICE_UPDATED:
                case PricingEventType.SERVICE_DELETED:
                    logger.info(
                        "[ImprovedChannelManager] Service changed, updating affected category"
                    );
                    const categoryId = eventData.data?.categoryId;
                    if (categoryId) {
                        await this.updateCategoryMessage(categoryId);
                    } else {
                        // If no categoryId, rebuild entire channel
                        await this.rebuildChannel();
                    }
                    break;

                case PricingEventType.PRICING_METHOD_CREATED:
                case PricingEventType.PRICING_METHOD_UPDATED:
                case PricingEventType.PRICING_METHOD_DELETED:
                case PricingEventType.PRICING_MODIFIER_CREATED:
                case PricingEventType.PRICING_MODIFIER_UPDATED:
                case PricingEventType.PRICING_MODIFIER_DELETED:
                    logger.info(
                        "[ImprovedChannelManager] Pricing method/modifier changed, updating affected service"
                    );
                    // Service detail views are ephemeral, no channel update needed
                    break;

                default:
                    logger.warn(
                        `[ImprovedChannelManager] Unknown event type: ${eventData.type}`
                    );
            }
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Error handling pricing change:",
                error
            );
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Get categories with services (cached)
     */
    private async getCategoriesWithServices(): Promise<ServiceCategory[]> {
        const now = Date.now();

        if (
            this.categoriesCache &&
            now - this.cacheTimestamp < this.CACHE_TTL
        ) {
            return this.categoriesCache;
        }

        const categories = await this.apiService.getCategoriesWithServices();

        this.categoriesCache = categories;
        this.cacheTimestamp = now;

        return categories;
    }

    /**
     * Rebuild entire pricing channel from scratch
     */
    async rebuildChannel(): Promise<void> {
        if (!this.pricingChannel) {
            logger.error(
                "[ImprovedChannelManager] Cannot rebuild: channel not initialized"
            );
            return;
        }

        try {
            logger.info("[ImprovedChannelManager] Rebuilding pricing channel");

            // Clear channel
            await this.clearChannel();

            // Wait 2 seconds for Discord to process deletions (prevents duplicate banners)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Create header
            await this.createHeader();

            // Create category messages
            await this.createAllCategoryMessages();

            logger.info(
                "[ImprovedChannelManager] Channel rebuild complete"
            );
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Error rebuilding channel:",
                error
            );
            throw error;
        }
    }

    /**
     * Clear all bot messages from the channel
     */
    private async clearChannel(): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            // Fetch ALL messages, not just 100 (force: true to bypass cache)
            let allMessages: Message[] = [];
            let lastMessageId: string | undefined = undefined;

            // Keep fetching until no more messages
            while (true) {
                const fetchOptions: { limit: number; before?: string; cache?: boolean } = {
                    limit: 100,
                    cache: false // Force fetch from Discord API, not cache
                };
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

                const messagesCollection = await this.pricingChannel.messages.fetch(fetchOptions);
                if (messagesCollection.size === 0) break;

                allMessages.push(...Array.from(messagesCollection.values()));
                lastMessageId = messagesCollection.last()?.id;

                if (messagesCollection.size < 100) break;
            }

            // Filter bot messages
            const botMessages = allMessages.filter(
                msg => msg.author.id === this.client.user?.id
            );

            // Delete messages in batches
            for (const msg of botMessages) {
                try {
                    await msg.delete();
                } catch (err: any) {
                    // Silently skip "Unknown Message" errors (message was already deleted)
                    if (err.code !== 10008) {
                        logger.warn(`[ImprovedChannelManager] Could not delete message ${msg.id}: ${err}`);
                    }
                }
            }

            // Clear database records
            await prisma.discordMessage.deleteMany({
                where: {
                    channelId: this.pricingChannel.id,
                },
            });

            // Clear local references
            this.headerMessage = null;
            this.categoryMessages.clear();
            this.footerMessage = null;

            // Clear Discord's message cache to prevent stale data
            this.pricingChannel.messages.cache.clear();
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Error clearing channel:",
                error
            );
        }
    }

    /**
     * Create header message
     */
    private async createHeader(): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            // Send only banner image
            const bannerPath = path.join(__dirname, "../../../public/discord banner 01.png");
            const bannerAttachment = new AttachmentBuilder(bannerPath);
            this.headerMessage = await this.pricingChannel.send({ files: [bannerAttachment] });

            await this.saveMessageToDatabase(
                this.headerMessage,
                "HEADER"
            );
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Error creating header:",
                error
            );
        }
    }

    /**
     * Create all category messages (GROUPED: 5 categories per message)
     */
    private async createAllCategoryMessages(): Promise<void> {
        try {
            const categories = await this.getCategoriesWithServices();

            // Filter out categories with no services (Discord requires 1-25 options in select menus)
            const validCategories = categories.filter(
                cat => cat.services && cat.services.length > 0
            );

            logger.info(
                `[ImprovedChannelManager] Creating grouped category messages for ${validCategories.length} categories (${categories.length - validCategories.length} skipped - no services)`
            );

            // Group categories: 5 per message (Discord limit: max 5 select menus per message)
            const CATEGORIES_PER_MESSAGE = 5;
            const groupedCategories: ServiceCategory[][] = [];

            for (let i = 0; i < validCategories.length; i += CATEGORIES_PER_MESSAGE) {
                const group = validCategories.slice(i, i + CATEGORIES_PER_MESSAGE);
                groupedCategories.push(group);
            }

            logger.info(
                `[ImprovedChannelManager] Grouped into ${groupedCategories.length} messages (${CATEGORIES_PER_MESSAGE} categories per message)`
            );

            // Create one message per group
            for (let i = 0; i < groupedCategories.length; i++) {
                await this.createGroupedCategoryMessage(groupedCategories[i], i);
            }

            logger.info(
                "[ImprovedChannelManager] All grouped category messages created"
            );
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Error creating category messages:",
                error
            );
        }
    }

    /**
     * Create grouped category message (5 categories in one message)
     */
    private async createGroupedCategoryMessage(
        categories: ServiceCategory[],
        groupIndex: number
    ): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            const components: any[] = [];

            // Build select menu for each category
            for (const category of categories) {
                const { components: categoryComponents } =
                    EnhancedPricingBuilder.buildCategorySelectMenu(category);

                // Add each select menu component
                components.push(...categoryComponents);
            }

            // Send grouped message (no content, just components)
            const message = await this.pricingChannel.send({
                components: components as any,
            });

            // Note: SelectMenuResetManager registration removed.
            // Using ephemeral reply pattern instead - the industry standard approach
            // used by MEE6, Dyno, Carl-bot, etc. No message edits needed.

            // Store reference for each category
            for (const category of categories) {
                this.categoryMessages.set(category.id, message);
            }

            // Save to database
            await this.saveMessageToDatabase(
                message,
                "GROUPED_CATEGORIES",
                `group_${groupIndex}`
            );

        } catch (error) {
            logger.error(
                `[ImprovedChannelManager] Error creating grouped message ${groupIndex}:`,
                error
            );
        }
    }

    /**
     * Create single category message (DEPRECATED - now using grouped messages)
     */
    private async createCategoryMessage(
        category: ServiceCategory
    ): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            const { content, components } =
                EnhancedPricingBuilder.buildCategorySelectMenu(category);

            const message = await this.pricingChannel.send({
                content,
                components: components as any,
            });

            this.categoryMessages.set(category.id, message);

            await this.saveMessageToDatabase(
                message,
                "CATEGORY_SELECT",
                category.id
            );
        } catch (error) {
            logger.error(
                `[ImprovedChannelManager] Error creating category message for ${category.name}:`,
                error
            );
        }
    }

    /**
     * Update specific category message
     */
    private async updateCategoryMessage(categoryId: string): Promise<void> {
        try {
            logger.info(
                `[ImprovedChannelManager] Updating category message: ${categoryId}`
            );

            // Get fresh category data
            const categories = await this.getCategoriesWithServices();
            const category = categories.find(c => c.id === categoryId);

            if (!category) {
                logger.warn(
                    `[ImprovedChannelManager] Category not found: ${categoryId}`
                );
                // Category might have been deleted, remove the message
                await this.removeCategoryMessage(categoryId);
                return;
            }

            // Check if category has services (Discord requires 1-25 options)
            if (!category.services || category.services.length === 0) {
                logger.warn(
                    `[ImprovedChannelManager] Category has no services, removing message: ${category.name}`
                );
                // Remove the message if it exists
                await this.removeCategoryMessage(categoryId);
                return;
            }

            const existingMessage = this.categoryMessages.get(categoryId);

            if (existingMessage) {
                // Update existing message
                const { content, components } =
                    EnhancedPricingBuilder.buildCategorySelectMenu(category);

                await existingMessage.edit({
                    content,
                    components: components as any,
                });

                logger.info(
                    `[ImprovedChannelManager] Category message updated: ${category.name}`
                );
            } else {
                // Create new message
                await this.createCategoryMessage(category);
            }
        } catch (error) {
            logger.error(
                `[ImprovedChannelManager] Error updating category message ${categoryId}:`,
                error
            );
        }
    }

    /**
     * Remove category message
     */
    private async removeCategoryMessage(categoryId: string): Promise<void> {
        try {
            const message = this.categoryMessages.get(categoryId);
            if (message) {
                await message.delete();
                this.categoryMessages.delete(categoryId);

                await prisma.discordMessage.deleteMany({
                    where: {
                        categoryId: categoryId,
                        messageType: "CATEGORY_SELECT",
                    },
                });

                logger.info(
                    `[ImprovedChannelManager] Category message removed: ${categoryId}`
                );
            }
        } catch (error) {
            logger.error(
                `[ImprovedChannelManager] Error removing category message ${categoryId}:`,
                error
            );
        }
    }

    /**
     * Create footer message
     */
    private async createFooter(): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            const footerContent = EnhancedPricingBuilder.buildFooterMessage();
            this.footerMessage = await this.pricingChannel.send(footerContent);

            await this.saveMessageToDatabase(this.footerMessage, "FOOTER");

            logger.debug("[ImprovedChannelManager] Footer created");
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Error creating footer:",
                error
            );
        }
    }

    /**
     * Save message to database for tracking
     */
    private async saveMessageToDatabase(
        message: Message,
        messageType: string,
        categoryId?: string,
        serviceId?: string
    ): Promise<void> {
        try {
            await prisma.discordMessage.create({
                data: {
                    messageId: message.id,
                    channelId: message.channel.id,
                    messageType,
                    categoryId,
                    serviceId,
                },
            });
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Error saving message to database:",
                error
            );
        }
    }

    /**
     * Public method to manually refresh channel (for admin command)
     */
    async manualRefresh(): Promise<void> {
        logger.info(
            "[ImprovedChannelManager] Manual refresh requested"
        );
        await this.rebuildChannel();
    }

    /**
     * Check if manager is initialized
     */
    isReady(): boolean {
        return this.isInitialized && this.pricingChannel !== null;
    }
}
