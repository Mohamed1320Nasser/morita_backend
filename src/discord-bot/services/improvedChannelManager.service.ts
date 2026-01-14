import { Client, TextChannel, Message, AttachmentBuilder } from "discord.js";
import { ApiService } from "./api.service";
import { EnhancedPricingBuilder } from "../utils/enhancedPricingBuilder";

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

export class ImprovedChannelManager {
    private client: Client;
    private apiService: ApiService;
    private pricingChannel: TextChannel | null = null;
    private headerMessage: Message | null = null;
    private categoryMessages: Map<string, Message> = new Map();
    private footerMessage: Message | null = null;

    private categoriesCache: ServiceCategory[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 60 * 1000; 

    private isInitialized: boolean = false;
    private isUpdating: boolean = false;

    constructor(client: Client) {
        this.client = client;
        this.apiService = new ApiService(discordConfig.apiBaseUrl);
    }

    async setupOnly(): Promise<void> {
        try {
            logger.info("[ImprovedChannelManager] Setting up (manual publish mode)...");
            await this.setupPricingChannel();
            this.isInitialized = true;
            logger.info("[ImprovedChannelManager] Setup complete - ready for manual publish");
        } catch (error) {
            logger.error("[ImprovedChannelManager] Setup failed:", error);
            throw error;
        }
    }

    async initialize(): Promise<void> {
        try {
            logger.info("[ImprovedChannelManager] Initializing (auto-update mode)...");

            await this.setupPricingChannel();

            this.registerEventListeners();

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

    private registerEventListeners(): void {
        logger.info(
            "[ImprovedChannelManager] Registering real-time event listeners"
        );

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

    private async handlePricingChange(
        eventData: PricingEventData
    ): Promise<void> {
        if (this.isUpdating) {
            return;
        }

        try {
            this.isUpdating = true;

            this.categoriesCache = null;
            this.cacheTimestamp = 0;

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

    async rebuildChannel(): Promise<void> {
        if (!this.pricingChannel) {
            logger.error(
                "[ImprovedChannelManager] Cannot rebuild: channel not initialized"
            );
            return;
        }

        try {
            logger.info("[ImprovedChannelManager] Rebuilding pricing channel");

            await this.clearChannel();

            await new Promise(resolve => setTimeout(resolve, 2000));

            await this.createHeader();

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

    private async clearChannel(): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            
            let allMessages: Message[] = [];
            let lastMessageId: string | undefined = undefined;

            while (true) {
                const fetchOptions: { limit: number; before?: string; cache?: boolean } = {
                    limit: 100,
                    cache: false 
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

            const botMessages = allMessages.filter(
                msg => msg.author.id === this.client.user?.id
            );

            for (const msg of botMessages) {
                try {
                    await msg.delete();
                } catch (err: any) {
                    
                    if (err.code !== 10008) {
                        logger.warn(`[ImprovedChannelManager] Could not delete message ${msg.id}: ${err}`);
                    }
                }
            }

            await prisma.discordMessage.deleteMany({
                where: {
                    channelId: this.pricingChannel.id,
                },
            });

            this.headerMessage = null;
            this.categoryMessages.clear();
            this.footerMessage = null;

            this.pricingChannel.messages.cache.clear();
        } catch (error) {
            logger.error(
                "[ImprovedChannelManager] Error clearing channel:",
                error
            );
        }
    }

    private async createHeader(): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            
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

    private async createAllCategoryMessages(): Promise<void> {
        try {
            const categories = await this.getCategoriesWithServices();

            const validCategories = categories.filter(
                cat => cat.services && cat.services.length > 0
            );

            logger.info(
                `[ImprovedChannelManager] Creating grouped category messages for ${validCategories.length} categories (${categories.length - validCategories.length} skipped - no services)`
            );

            const CATEGORIES_PER_MESSAGE = 5;
            const groupedCategories: ServiceCategory[][] = [];

            for (let i = 0; i < validCategories.length; i += CATEGORIES_PER_MESSAGE) {
                const group = validCategories.slice(i, i + CATEGORIES_PER_MESSAGE);
                groupedCategories.push(group);
            }

            logger.info(
                `[ImprovedChannelManager] Grouped into ${groupedCategories.length} messages (${CATEGORIES_PER_MESSAGE} categories per message)`
            );

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

    private async createGroupedCategoryMessage(
        categories: ServiceCategory[],
        groupIndex: number
    ): Promise<void> {
        if (!this.pricingChannel) return;

        try {
            const components: any[] = [];

            for (const category of categories) {
                const { components: categoryComponents } =
                    EnhancedPricingBuilder.buildCategorySelectMenu(category);

                components.push(...categoryComponents);
            }

            const message = await this.pricingChannel.send({
                components: components as any,
            });

            for (const category of categories) {
                this.categoryMessages.set(category.id, message);
            }

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

    private async updateCategoryMessage(categoryId: string): Promise<void> {
        try {
            logger.info(
                `[ImprovedChannelManager] Updating category message: ${categoryId}`
            );

            const categories = await this.getCategoriesWithServices();
            const category = categories.find(c => c.id === categoryId);

            if (!category) {
                logger.warn(
                    `[ImprovedChannelManager] Category not found: ${categoryId}`
                );
                
                await this.removeCategoryMessage(categoryId);
                return;
            }

            if (!category.services || category.services.length === 0) {
                logger.warn(
                    `[ImprovedChannelManager] Category has no services, removing message: ${category.name}`
                );
                
                await this.removeCategoryMessage(categoryId);
                return;
            }

            const existingMessage = this.categoryMessages.get(categoryId);

            if (existingMessage) {
                
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
                
                await this.createCategoryMessage(category);
            }
        } catch (error) {
            logger.error(
                `[ImprovedChannelManager] Error updating category message ${categoryId}:`,
                error
            );
        }
    }

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

    async manualRefresh(): Promise<void> {
        logger.info(
            "[ImprovedChannelManager] Manual refresh requested"
        );
        await this.rebuildChannel();
    }

    isReady(): boolean {
        return this.isInitialized && this.pricingChannel !== null;
    }
}
