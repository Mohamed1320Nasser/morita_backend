import { Client, Guild, CategoryChannel, TextChannel, ChannelType, PermissionFlagsBits, Message } from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { buildPurchaseServicesMessage } from "../messages/purchaseServicesMessage";
import { buildPurchaseGoldMessage } from "../messages/purchaseGoldMessage";
import { buildSellGoldMessage } from "../messages/sellGoldMessage";
import { buildSwapCryptoMessage } from "../messages/swapCryptoMessage";
import { buildAccountShopMessage } from "../messages/accountShopMessage";
import { getMessagePersistence } from "./messagePersistence.service";

export class TicketCategoryManager {
    private client: Client;
    private guild: Guild | undefined = undefined;
    private ticketCategory: CategoryChannel | undefined = undefined;
    private channels: Map<string, TextChannel> = new Map();

    constructor(client: Client) {
        this.client = client;
    }

    async setupOnly(): Promise<void> {
        try {
            logger.info("[TicketCategoryManager] Setting up (manual publish mode)...");

            this.guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!this.guild) {
                logger.warn("[TicketCategoryManager] Guild not found");
                return;
            }

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

    async publishTickets(clearAllMessages: boolean = false): Promise<void> {
        await this.initialize(clearAllMessages);
    }

    private async clearChannels(clearAllMessages: boolean = false): Promise<void> {
        if (this.channels.size === 0) return;

        try {
            logger.info(`[TicketCategoryManager] Clearing channels (clearAll: ${clearAllMessages})`);

            for (const [key, channel] of this.channels) {
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

                    const messagesCollection = await channel.messages.fetch(fetchOptions);
                    if (messagesCollection.size === 0) break;

                    allMessages.push(...Array.from(messagesCollection.values()));
                    lastMessageId = messagesCollection.last()?.id;

                    if (messagesCollection.size < 100) break;
                }

                // Filter messages based on clearAllMessages flag
                const messagesToDelete = clearAllMessages
                    ? allMessages
                    : allMessages.filter(msg => msg.author.id === this.client.user?.id);

                logger.info(`[TicketCategoryManager] ${channel.name}: Found ${allMessages.length} total messages, deleting ${messagesToDelete.length} messages`);

                for (const msg of messagesToDelete) {
                    try {
                        await msg.delete();
                    } catch (err: any) {
                        if (err.code !== 10008) {
                            logger.warn(`[TicketCategoryManager] Could not delete message ${msg.id}: ${err}`);
                        }
                    }
                }

                channel.messages.cache.clear();
            }

            logger.info("[TicketCategoryManager] Successfully cleared all ticket channels");
        } catch (error) {
            logger.error("[TicketCategoryManager] Error clearing channels:", error);
        }
    }

    async initialize(clearAllMessages: boolean = false): Promise<void> {
        try {
            logger.info("[TicketCategoryManager] Initializing...");

            this.guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!this.guild) {
                throw new Error("Guild not found");
            }

            this.ticketCategory = await this.getOrCreateCategory();

            await this.getOrCreateChannels();

            // Clear channels before publishing if requested
            if (clearAllMessages) {
                await this.clearChannels(clearAllMessages);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            await this.sendMessagesToChannels();

            logger.info("[TicketCategoryManager] Initialization complete");
        } catch (error) {
            logger.error("[TicketCategoryManager] Initialization failed:", error);
            throw error;
        }
    }

    private async getOrCreateCategory(): Promise<CategoryChannel> {
        if (!this.guild) throw new Error("Guild not initialized");

        if (discordConfig.createTicketCategoryId) {
            const existing = this.guild.channels.cache.get(discordConfig.createTicketCategoryId);
            if (existing && existing.type === ChannelType.GuildCategory) {
                logger.info(`[TicketCategoryManager] Found existing category: ${existing.name}`);
                return existing as CategoryChannel;
            }
        }

        const existingByName = this.guild.channels.cache.find(
            c => c.name.toLowerCase() === "create ticket" && c.type === ChannelType.GuildCategory
        );
        if (existingByName) {
            return existingByName as CategoryChannel;
        }

        logger.info("[TicketCategoryManager] Creating new CREATE TICKET category");
        const category = await this.guild.channels.create({
            name: "CREATE TICKET",
            type: ChannelType.GuildCategory,
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

        logger.info(`[TicketCategoryManager] Created category: ${category.id}`);
        return category;
    }

    private async getOrCreateChannels(): Promise<void> {
        if (!this.guild || !this.ticketCategory) throw new Error("Guild or category not initialized");

        const channelConfigs = [
            { name: "purchase-services", key: "purchaseServicesChannelId" },
            { name: "purchase-gold", key: "purchaseGoldChannelId" },
            { name: "sell-gold", key: "sellGoldChannelId" },
            { name: "swap-crypto", key: "swapCryptoChannelId" },
            { name: "account-shop", key: "accountShopChannelId" },
        ];

        for (const config of channelConfigs) {
            const channel = await this.getOrCreateChannel(config.name, config.key);
            this.channels.set(config.key, channel);
        }
    }

    private async getOrCreateChannel(channelName: string, configKey: string): Promise<TextChannel> {
        if (!this.guild || !this.ticketCategory) throw new Error("Guild or category not initialized");

        const channelId = (discordConfig as any)[configKey];
        if (channelId) {
            const existing = this.guild.channels.cache.get(channelId);
            if (existing && existing.type === ChannelType.GuildText) {
                logger.info(`[TicketCategoryManager] Found existing channel: ${existing.name}`);
                return existing as TextChannel;
            }
        }

        const existingByName = this.guild.channels.cache.find(
            c => c.name === channelName &&
                 c.type === ChannelType.GuildText &&
                 c.parentId === this.ticketCategory?.id
        );
        if (existingByName) {
            return existingByName as TextChannel;
        }

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

    private async sendMessagesToChannels(): Promise<void> {
        try {
            
            const purchaseServicesChannel = this.channels.get("purchaseServicesChannelId");
            if (purchaseServicesChannel) {
                await this.ensureAndSendMessage(purchaseServicesChannel, await buildPurchaseServicesMessage());
            }

            const purchaseGoldChannel = this.channels.get("purchaseGoldChannelId");
            if (purchaseGoldChannel) {
                await this.ensureAndSendMessage(purchaseGoldChannel, await buildPurchaseGoldMessage());
            }

            const sellGoldChannel = this.channels.get("sellGoldChannelId");
            if (sellGoldChannel) {
                await this.ensureAndSendMessage(sellGoldChannel, await buildSellGoldMessage());
            }

            const swapCryptoChannel = this.channels.get("swapCryptoChannelId");
            if (swapCryptoChannel) {
                await this.ensureAndSendMessage(swapCryptoChannel, await buildSwapCryptoMessage());
            }

            const accountShopChannel = this.channels.get("accountShopChannelId");
            if (accountShopChannel) {
                await this.ensureAndSendMessage(accountShopChannel, await buildAccountShopMessage());
            }

            logger.info("[TicketCategoryManager] Messages ensured in all channels");
        } catch (error) {
            logger.error("[TicketCategoryManager] Error ensuring messages:", error);
            throw error;
        }
    }

    private async ensureAndSendMessage(
        channel: TextChannel,
        messageData: { embeds: any[]; components: any[] }
    ): Promise<void> {
        try {
            const messagePersistence = getMessagePersistence(this.client);

            await messagePersistence.ensureMessage(
                channel.id,
                "TICKET_MENU",
                messageData,
                {
                    pin: false  
                }
            );

            logger.info(`[TicketCategoryManager] Ensured message in ${channel.name}`);
        } catch (error) {
            logger.error(`[TicketCategoryManager] Error in ${channel.name}:`, error);
        }
    }

    async refreshMessages(): Promise<void> {
        await this.sendMessagesToChannels();
    }
}

let ticketCategoryManagerInstance: TicketCategoryManager | undefined = undefined;

export function getTicketCategoryManager(client: Client): TicketCategoryManager {
    if (!ticketCategoryManagerInstance) {
        ticketCategoryManagerInstance = new TicketCategoryManager(client);
    }
    return ticketCategoryManagerInstance;
}
