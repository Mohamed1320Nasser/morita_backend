import { Client, TextChannel, Message, Collection, AttachmentBuilder } from "discord.js";
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
import prisma from "../../common/prisma/client";

export class ChannelManagerService {
    private client: Client;
    private apiService: ApiService;
    private pricingChannel: TextChannel | null = null;
    private categoryMessages: Map<string, Message> = new Map();
    private groupedMessages: Map<number, Message> = new Map();
    private serviceDetailMessages: Map<string, Message> = new Map();

    private categoriesCache: ServiceCategory[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; 

    private categoryStates: Map<string, boolean> = new Map();

    constructor(client: Client) {
        this.client = client;
        this.apiService = new ApiService(discordConfig.apiBaseUrl);
    }

    private async getCategoriesWithServices(): Promise<ServiceCategory[]> {
        const now = Date.now();

        if (
            this.categoriesCache &&
            now - this.cacheTimestamp < this.CACHE_TTL
        ) {
            logger.debug("Using cached categories data");
            return this.categoriesCache;
        }

        logger.debug("Fetching fresh categories data from API");
        const categories = await this.apiService.getCategoriesWithServices();

        this.categoriesCache = categories;
        this.cacheTimestamp = now;

        return categories;
    }

    async refreshCache(): Promise<void> {
        logger.debug("Refreshing categories cache");
        this.categoriesCache = null;
        this.cacheTimestamp = 0;
        await this.getCategoriesWithServices();
    }

    getCachedCategories(): ServiceCategory[] | null {
        return this.categoriesCache;
    }

    toggleCategoryState(categoryId: string): boolean {
        const currentState = this.categoryStates.get(categoryId) || false;
        const newState = !currentState;
        this.categoryStates.set(categoryId, newState);
        return newState;
    }

    getCategoryState(categoryId: string): boolean {
        return this.categoryStates.get(categoryId) || false;
    }

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

            await this.clearChannel();

            await this.createHeaderMessage();

            await this.updateCategoryMessages();

            logger.info("Pricing channel initialized successfully");
        } catch (error) {
            logger.error("Error initializing pricing channel:", error);
        }
    }

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

            for (const category of categories) {
                const { content, components } =
                    SelectMenuPricingBuilder.buildCategorySelectMenu(category);

                const existingMessage = await this.getCategoryMessage(
                    category.id
                );

                if (existingMessage) {
                    
                    await existingMessage.edit({
                        content,
                        components: components as any,
                    });
                    this.categoryMessages.set(category.id, existingMessage);
                } else {
                    
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

    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

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

    private async createHeaderMessage(): Promise<void> {
        if (!this.pricingChannel) return;

        const bannerPath = path.join(__dirname, "../../../public/discord banner 01.png");
        const bannerAttachment = new AttachmentBuilder(bannerPath);
        const message = await this.pricingChannel.send({ files: [bannerAttachment] });
        await this.saveMessageToDatabase(message, "HEADER");
    }

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
