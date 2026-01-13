import { Client, Guild, CategoryChannel, TextChannel, ChannelType, PermissionFlagsBits } from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { buildPurchaseServicesMessage } from "../messages/purchaseServicesMessage";
import { buildPurchaseGoldMessage } from "../messages/purchaseGoldMessage";
import { buildSellGoldMessage } from "../messages/sellGoldMessage";
import { buildSwapCryptoMessage } from "../messages/swapCryptoMessage";
import { getMessagePersistence } from "./messagePersistence.service";

export class TicketCategoryManager {
    private client: Client;
    private guild: Guild | undefined = undefined;
    private ticketCategory: CategoryChannel | undefined = undefined;
    private channels: Map<string, TextChannel> = new Map();

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Setup only - validates guild/category exists but doesn't publish messages
     * Used for manual publish mode
     */
    async setupOnly(): Promise<void> {
        try {
            logger.info("[TicketCategoryManager] Setting up (manual publish mode)...");

            // Get guild
            this.guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!this.guild) {
                logger.warn("[TicketCategoryManager] Guild not found");
                return;
            }

            // Check if category exists
            if (discordConfig.createTicketCategoryId) {
                const existing = this.guild.channels.cache.get(discordConfig.createTicketCategoryId);
                if (existing && existing.type === ChannelType.GuildCategory) {
                    this.ticketCategory = existing as CategoryChannel;
                    logger.info(`[TicketCategoryManager] Setup complete - connected to category: ${this.ticketCategory.name}`);
                }
            }
        } catch (error) {
            logger.error("[TicketCategoryManager] Setup failed:", error);
        }
    }

    /**
     * Publish ticket channels to Discord
     * Call this via API endpoint for manual publishing
     */
    async publishTickets(): Promise<void> {
        await this.initialize();
    }

    /**
     * Initialize the ticket category and channels
     */
    async initialize(): Promise<void> {
        try {
            logger.info("[TicketCategoryManager] Initializing...");

            // Get guild
            this.guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!this.guild) {
                throw new Error("Guild not found");
            }

            // Get or create CREATE TICKET category
            this.ticketCategory = await this.getOrCreateCategory();

            // Get or create channels
            await this.getOrCreateChannels();

            // Send messages to channels
            await this.sendMessagesToChannels();

            logger.info("[TicketCategoryManager] Initialization complete");
        } catch (error) {
            logger.error("[TicketCategoryManager] Initialization failed:", error);
            throw error;
        }
    }

    /**
     * Get or create the CREATE TICKET category
     */
    private async getOrCreateCategory(): Promise<CategoryChannel> {
        if (!this.guild) throw new Error("Guild not initialized");

        // Try to find existing category
        if (discordConfig.createTicketCategoryId) {
            const existing = this.guild.channels.cache.get(discordConfig.createTicketCategoryId);
            if (existing && existing.type === ChannelType.GuildCategory) {
                logger.info(`[TicketCategoryManager] Found existing category: ${existing.name}`);
                return existing as CategoryChannel;
            }
        }

        // Try to find by name
        const existingByName = this.guild.channels.cache.find(
            c => c.name.toLowerCase() === "create ticket" && c.type === ChannelType.GuildCategory
        );
        if (existingByName) {
            return existingByName as CategoryChannel;
        }

        // Create new category
        logger.info("[TicketCategoryManager] Creating new CREATE TICKET category");
        const category = await this.guild.channels.create({
            name: "CREATE TICKET",
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: this.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages], // Everyone can view but not send
                },
                {
                    id: discordConfig.supportRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                },
                {
                    id: discordConfig.adminRoleId,
                    allow: [PermissionFlagsBits.Administrator],
                },
            ],
        });

        logger.info(`[TicketCategoryManager] Created category: ${category.id}`);
        return category;
    }

    /**
     * Get or create all 4 ticket channels
     */
    private async getOrCreateChannels(): Promise<void> {
        if (!this.guild || !this.ticketCategory) throw new Error("Guild or category not initialized");

        const channelConfigs = [
            { name: "purchase-services", key: "purchaseServicesChannelId" },
            { name: "purchase-gold", key: "purchaseGoldChannelId" },
            { name: "sell-gold", key: "sellGoldChannelId" },
            { name: "swap-crypto", key: "swapCryptoChannelId" },
        ];

        for (const config of channelConfigs) {
            const channel = await this.getOrCreateChannel(config.name, config.key);
            this.channels.set(config.key, channel);
        }
    }

    /**
     * Get or create a single channel
     */
    private async getOrCreateChannel(channelName: string, configKey: string): Promise<TextChannel> {
        if (!this.guild || !this.ticketCategory) throw new Error("Guild or category not initialized");

        // Try to find existing channel
        const channelId = (discordConfig as any)[configKey];
        if (channelId) {
            const existing = this.guild.channels.cache.get(channelId);
            if (existing && existing.type === ChannelType.GuildText) {
                logger.info(`[TicketCategoryManager] Found existing channel: ${existing.name}`);
                return existing as TextChannel;
            }
        }

        // Try to find by name in the category
        const existingByName = this.guild.channels.cache.find(
            c => c.name === channelName &&
                 c.type === ChannelType.GuildText &&
                 c.parentId === this.ticketCategory?.id
        );
        if (existingByName) {
            return existingByName as TextChannel;
        }

        // Create new channel
        logger.info(`[TicketCategoryManager] Creating new channel: ${channelName}`);
        const channel = await this.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: this.ticketCategory.id,
            permissionOverwrites: [
                {
                    id: this.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                },
                {
                    id: discordConfig.supportRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                },
                {
                    id: discordConfig.adminRoleId,
                    allow: [PermissionFlagsBits.Administrator],
                },
            ],
        });

        logger.info(`[TicketCategoryManager] Created channel: ${channel.id}`);
        return channel;
    }

    /**
     * Send messages to all channels
     */
    private async sendMessagesToChannels(): Promise<void> {
        try {
            // Purchase Services
            const purchaseServicesChannel = this.channels.get("purchaseServicesChannelId");
            if (purchaseServicesChannel) {
                await this.ensureAndSendMessage(purchaseServicesChannel, await buildPurchaseServicesMessage());
            }

            // Purchase Gold
            const purchaseGoldChannel = this.channels.get("purchaseGoldChannelId");
            if (purchaseGoldChannel) {
                await this.ensureAndSendMessage(purchaseGoldChannel, await buildPurchaseGoldMessage());
            }

            // Sell Gold
            const sellGoldChannel = this.channels.get("sellGoldChannelId");
            if (sellGoldChannel) {
                await this.ensureAndSendMessage(sellGoldChannel, await buildSellGoldMessage());
            }

            // Swap Crypto
            const swapCryptoChannel = this.channels.get("swapCryptoChannelId");
            if (swapCryptoChannel) {
                await this.ensureAndSendMessage(swapCryptoChannel, await buildSwapCryptoMessage());
            }

            logger.info("[TicketCategoryManager] Messages ensured in all channels");
        } catch (error) {
            logger.error("[TicketCategoryManager] Error ensuring messages:", error);
            throw error;
        }
    }

    /**
     * Ensure message exists in channel (create or edit)
     */
    private async ensureAndSendMessage(
        channel: TextChannel,
        messageData: { embeds: any[]; components: any[] }
    ): Promise<void> {
        try {
            const messagePersistence = getMessagePersistence(this.client);

            // Use message persistence to create or edit existing message
            await messagePersistence.ensureMessage(
                channel.id,
                "TICKET_MENU",
                messageData,
                {
                    pin: false  // Don't pin ticket menu messages
                }
            );

            logger.info(`[TicketCategoryManager] Ensured message in ${channel.name}`);
        } catch (error) {
            logger.error(`[TicketCategoryManager] Error in ${channel.name}:`, error);
        }
    }

    /**
     * Refresh all channel messages
     */
    async refreshMessages(): Promise<void> {
        await this.sendMessagesToChannels();
    }
}

// Singleton instance
let ticketCategoryManagerInstance: TicketCategoryManager | undefined = undefined;

export function getTicketCategoryManager(client: Client): TicketCategoryManager {
    if (!ticketCategoryManagerInstance) {
        ticketCategoryManagerInstance = new TicketCategoryManager(client);
    }
    return ticketCategoryManagerInstance;
}
