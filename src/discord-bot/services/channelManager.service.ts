import { Client, TextChannel, Message, Collection, AttachmentBuilder } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { ApiService } from "./api.service";
import { SelectMenuPricingBuilder } from "../utils/selectMenuPricingBuilder";
import {
    ServiceCategory,
    Service,
    PricingMethod,
} from "../types/discord.types";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import path from "path";

const prisma = new PrismaClient();

export class ChannelManagerService {
    private client: Client;
    private apiService: ApiService;
    private pricingChannel: TextChannel | null = null;
    private categoryMessages: Map<string, Message> = new Map();
    private groupedMessages: Map<number, Message> = new Map();
    private serviceDetailMessages: Map<string, Message> = new Map();

    // Cache for categories with services
    private categoriesCache: ServiceCategory[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // State management for expanded categories
    private categoryStates: Map<string, boolean> = new Map();

    constructor(client: Client) {
        this.client = client;
        this.apiService = new ApiService(discordConfig.apiBaseUrl);
    }

    /**
     * Get categories with services from cache or API
     */
    private async getCategoriesWithServices(): Promise<ServiceCategory[]> {
        const now = Date.now();

        // Check if cache is valid
        if (
            this.categoriesCache &&
            now - this.cacheTimestamp < this.CACHE_TTL
        ) {
            logger.debug("Using cached categories data");
            return this.categoriesCache;
        }

        // Fetch fresh data from API
        logger.debug("Fetching fresh categories data from API");
        const categories = await this.apiService.getCategoriesWithServices();

        // Update cache
        this.categoriesCache = categories;
        this.cacheTimestamp = now;

        return categories;
    }

    /**
     * Refresh cache (called by pricing sync job)
     */
    async refreshCache(): Promise<void> {
        logger.debug("Refreshing categories cache");
        this.categoriesCache = null;
        this.cacheTimestamp = 0;
        await this.getCategoriesWithServices();
    }

    /**
     * Get cached categories (for button handlers)
     */
    getCachedCategories(): ServiceCategory[] | null {
        return this.categoriesCache;
    }

    /**
     * Toggle category expanded state
     */
    toggleCategoryState(categoryId: string): boolean {
        const currentState = this.categoryStates.get(categoryId) || false;
        const newState = !currentState;
        this.categoryStates.set(categoryId, newState);
        return newState;
    }

    /**
     * Get category expanded state
     */
    getCategoryState(categoryId: string): boolean {
        return this.categoryStates.get(categoryId) || false;
    }

    /**
     * Initialize pricing channel on bot startup
     */
    async initializePricingChannel(): Promise<void> {
        try {
            if (!discordConfig.pricingChannelId) {
                logger.warn(
                    "No pricing channel ID configured. Skipping pricing channel initialization."
                );
                return;
            }

            const guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!guild) {
                logger.error(
                    "Guild not found for pricing channel initialization"
                );
                return;
            }

            this.pricingChannel = guild.channels.cache.get(
                discordConfig.pricingChannelId
            ) as TextChannel;
            if (!this.pricingChannel) {
                logger.error(
                    `Pricing channel not found: ${discordConfig.pricingChannelId}`
                );
                return;
            }

            logger.info(
                `Initializing pricing channel: ${this.pricingChannel.name}`
            );

            // Clear existing messages in the channel
            await this.clearChannel();

            // Create header message
            await this.createHeaderMessage();

            // Create category messages
            await this.updateCategoryMessages();

            logger.info("Pricing channel initialized successfully");
        } catch (error) {
            logger.error("Error initializing pricing channel:", error);
        }
    }

    /**
     * Create/update category list messages (select menu approach)
     */
    async updateCategoryMessages(): Promise<void> {
        try {
            if (!this.pricingChannel) {
                logger.warn("Pricing channel not initialized");
                return;
            }

            const categories = await this.getCategoriesWithServices();
            if (!categories || categories.length === 0) {
                logger.warn("No categories found for pricing channel");
                return;
            }

            // Create one select menu per category (12 messages)
            for (const category of categories) {
                const { content, components } =
                    SelectMenuPricingBuilder.buildCategorySelectMenu(category);

                // Check if category message already exists
                const existingMessage = await this.getCategoryMessage(
                    category.id
                );

                if (existingMessage) {
                    // Update existing message
                    await existingMessage.edit({
                        content,
                        components: components as any,
                    });
                    this.categoryMessages.set(category.id, existingMessage);
                } else {
                    // Create new message
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
                }
            }

            logger.info(
                `Updated ${categories.length} category select menu messages`
            );
        } catch (error) {
            logger.error("Error updating category messages:", error);
        }
    }

    /**
     * Utility function to chunk array into groups
     */
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Delete expired service detail messages
     */
    async cleanupExpiredMessages(): Promise<void> {
        try {
            const expiredMessages = await prisma.discordMessage.findMany({
                where: {
                    messageType: "SERVICE_DETAIL",
                    expiresAt: {
                        lte: new Date(),
                    },
                },
            });

            for (const messageRecord of expiredMessages) {
                try {
                    if (this.pricingChannel) {
                        const message =
                            await this.pricingChannel.messages.fetch(
                                messageRecord.messageId
                            );
                        await message.delete();
                    }
                    await this.deleteMessageFromDatabase(
                        messageRecord.messageId
                    );
                    this.serviceDetailMessages.delete(
                        messageRecord.serviceId || ""
                    );
                } catch (error) {
                    logger.error(
                        `Error cleaning up expired message ${messageRecord.messageId}:`,
                        error
                    );
                }
            }

            if (expiredMessages.length > 0) {
                logger.info(
                    `Cleaned up ${expiredMessages.length} expired service detail messages`
                );
            }
        } catch (error) {
            logger.error("Error cleaning up expired messages:", error);
        }
    }

    /**
     * Rebuild all category messages from scratch
     */
    async rebuildPricingChannel(): Promise<void> {
        try {
            logger.info("Rebuilding pricing channel...");
            await this.clearChannel();
            await this.initializePricingChannel();
            logger.info("Pricing channel rebuilt successfully");
        } catch (error) {
            logger.error("Error rebuilding pricing channel:", error);
        }
    }

    /**
     * Clear all messages in the pricing channel
     */
    private async clearChannel(): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            const messages = await this.pricingChannel.messages.fetch({
                limit: 100,
            });
            const botMessages = messages.filter(
                msg => msg.author.id === this.client.user?.id
            );

            if (botMessages.size > 0) {
                await this.pricingChannel.bulkDelete(botMessages);
            }

            // Clear database records
            await prisma.discordMessage.deleteMany({
                where: {
                    channelId: this.pricingChannel.id,
                },
            });

            this.categoryMessages.clear();
            this.serviceDetailMessages.clear();
        } catch (error) {
            logger.error("Error clearing pricing channel:", error);
        }
    }

    /**
     * Create header message
     */
    private async createHeaderMessage(): Promise<void> {
        if (!this.pricingChannel) return;

        // Send only banner image
        const bannerPath = path.join(__dirname, "../../../public/discord banner 01.png");
        const bannerAttachment = new AttachmentBuilder(bannerPath);
        const message = await this.pricingChannel.send({ files: [bannerAttachment] });
        await this.saveMessageToDatabase(message, "HEADER");
    }

    /**
     * Get existing category message from database
     */
    private async getCategoryMessage(
        categoryId: string
    ): Promise<Message | null> {
        try {
            const messageRecord = await prisma.discordMessage.findFirst({
                where: {
                    messageType: "CATEGORY_LIST",
                    categoryId: categoryId,
                },
            });

            if (messageRecord && this.pricingChannel) {
                return await this.pricingChannel.messages.fetch(
                    messageRecord.messageId
                );
            }

            return null;
        } catch (error) {
            logger.error(
                `Error fetching category message for ${categoryId}:`,
                error
            );
            return null;
        }
    }

    /**
     * Get existing grouped message from database
     */
    private async getGroupedMessage(
        groupIndex: number
    ): Promise<Message | null> {
        try {
            const messageRecord = await prisma.discordMessage.findFirst({
                where: {
                    messageType: "GROUPED_CATEGORIES",
                    groupIndex: groupIndex,
                },
            });

            if (messageRecord && this.pricingChannel) {
                return await this.pricingChannel.messages.fetch(
                    messageRecord.messageId
                );
            }

            return null;
        } catch (error) {
            logger.error(
                `Error fetching grouped message for index ${groupIndex}:`,
                error
            );
            return null;
        }
    }

    /**
     * Save message to database
     */
    private async saveMessageToDatabase(
        message: Message,
        messageType: string,
        categoryId?: string,
        serviceId?: string,
        expiresAt?: Date,
        groupIndex?: number
    ): Promise<void> {
        try {
            await prisma.discordMessage.create({
                data: {
                    messageId: message.id,
                    channelId: message.channel.id,
                    messageType,
                    categoryId,
                    serviceId,
                    expiresAt,
                    groupIndex,
                },
            });
        } catch (error) {
            logger.error("Error saving message to database:", error);
        }
    }

    /**
     * Delete message from database
     */
    private async deleteMessageFromDatabase(messageId: string): Promise<void> {
        try {
            await prisma.discordMessage.delete({
                where: {
                    messageId,
                },
            });
        } catch (error) {
            logger.error("Error deleting message from database:", error);
        }
    }
}
