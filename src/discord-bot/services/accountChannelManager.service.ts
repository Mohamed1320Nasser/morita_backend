import { Client, TextChannel, Message, AttachmentBuilder, EmbedBuilder } from "discord.js";
import { ApiService } from "./api.service";
import {
    EnhancedAccountBuilder,
    AccountCategoryWithAccounts,
} from "../utils/enhancedAccountBuilder";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import path from "path";

/**
 * Account Channel Manager Service
 * Manages the account shop channel display similar to pricing channel
 * Posts categories as dropdowns, each containing accounts
 */
export class AccountChannelManager {
    private client: Client;
    private apiService: ApiService;
    private accountChannel: TextChannel | null = null;
    private headerMessage: Message | null = null;
    private categoryMessages: Map<string, Message> = new Map();
    private isInitialized: boolean = false;
    private isUpdating: boolean = false;

    constructor(client: Client) {
        this.client = client;
        this.apiService = new ApiService(discordConfig.apiBaseUrl);
    }

    /**
     * Initialize the channel manager (setup only, no auto-rebuild)
     */
    async setupOnly(): Promise<void> {
        try {
            logger.info("[AccountChannelManager] Setting up (manual publish mode)...");
            await this.setupAccountChannel();
            this.isInitialized = true;
            logger.info("[AccountChannelManager] Setup complete - ready for manual publish");
        } catch (error) {
            logger.error("[AccountChannelManager] Setup failed:", error);
            throw error;
        }
    }

    /**
     * Initialize with auto-rebuild
     */
    async initialize(): Promise<void> {
        try {
            logger.info("[AccountChannelManager] Initializing...");
            await this.setupAccountChannel();
            await this.rebuildChannel();
            this.isInitialized = true;
            logger.info("[AccountChannelManager] Initialization complete");
        } catch (error) {
            logger.error("[AccountChannelManager] Initialization failed:", error);
            throw error;
        }
    }

    /**
     * Setup the account channel reference
     */
    private async setupAccountChannel(): Promise<void> {
        if (!discordConfig.accountShopChannelId) {
            throw new Error("Account channel ID not configured (DISCORD_ACCOUNT_SHOP_CHANNEL_ID)");
        }

        const guild = this.client.guilds.cache.get(discordConfig.guildId);
        if (!guild) {
            throw new Error("Guild not found");
        }

        this.accountChannel = guild.channels.cache.get(
            discordConfig.accountShopChannelId
        ) as TextChannel;

        if (!this.accountChannel) {
            throw new Error(
                `Account channel not found: ${discordConfig.accountShopChannelId}`
            );
        }

        logger.info(
            `[AccountChannelManager] Connected to channel: ${this.accountChannel.name}`
        );
    }

    /**
     * Rebuild the entire account channel
     * Clears existing messages and posts fresh content
     */
    async rebuildChannel(clearAllMessages: boolean = false): Promise<void> {
        if (!this.accountChannel) {
            logger.error("[AccountChannelManager] Cannot rebuild: channel not initialized");
            return;
        }

        if (this.isUpdating) {
            logger.warn("[AccountChannelManager] Already updating, skipping");
            return;
        }

        try {
            this.isUpdating = true;
            logger.info("[AccountChannelManager] Rebuilding account channel");

            // Clear existing messages
            await this.clearChannel(clearAllMessages);

            // Wait a bit for rate limits
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Create category dropdowns (no header - just dropdowns)
            await this.createAllCategoryMessages();

            logger.info("[AccountChannelManager] Channel rebuild complete");
        } catch (error) {
            logger.error("[AccountChannelManager] Error rebuilding channel:", error);
            throw error;
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Clear messages from the channel
     */
    private async clearChannel(clearAllMessages: boolean = false): Promise<void> {
        if (!this.accountChannel) return;

        try {
            logger.info(
                `[AccountChannelManager] Clearing channel (clearAll: ${clearAllMessages})`
            );

            let allMessages: Message[] = [];
            let lastMessageId: string | undefined = undefined;

            // Fetch all messages
            while (true) {
                const fetchOptions: {
                    limit: number;
                    before?: string;
                    cache?: boolean;
                } = {
                    limit: 100,
                    cache: false,
                };
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

                const messagesCollection =
                    await this.accountChannel.messages.fetch(fetchOptions);
                if (messagesCollection.size === 0) break;

                allMessages.push(...Array.from(messagesCollection.values()));
                lastMessageId = messagesCollection.last()?.id;

                if (messagesCollection.size < 100) break;
            }

            // Filter messages
            const messagesToDelete = clearAllMessages
                ? allMessages
                : allMessages.filter(
                      (msg) => msg.author.id === this.client.user?.id
                  );

            logger.info(
                `[AccountChannelManager] Found ${allMessages.length} total messages, deleting ${messagesToDelete.length} messages`
            );

            for (const msg of messagesToDelete) {
                try {
                    await msg.delete();
                } catch (err: any) {
                    if (err.code !== 10008) {
                        logger.warn(
                            `[AccountChannelManager] Could not delete message ${msg.id}: ${err}`
                        );
                    }
                }
            }

            this.headerMessage = null;
            this.categoryMessages.clear();
            this.accountChannel.messages.cache.clear();

            logger.info(
                `[AccountChannelManager] Successfully cleared ${messagesToDelete.length} messages`
            );
        } catch (error) {
            logger.error("[AccountChannelManager] Error clearing channel:", error);
        }
    }

    /**
     * Create the header message (banner + intro embed)
     */
    private async createHeader(): Promise<void> {
        if (!this.accountChannel) return;

        try {
            // Try to send banner image
            try {
                const bannerPath = path.join(
                    __dirname,
                    "../../../public/discord banner 01.png"
                );
                const bannerAttachment = new AttachmentBuilder(bannerPath);
                await this.accountChannel.send({ files: [bannerAttachment] });
            } catch (bannerError) {
                logger.warn(
                    "[AccountChannelManager] Could not send banner image:",
                    bannerError
                );
            }

            // Get total account stats
            let totalAccounts = 0;
            let categoryCount = 0;

            try {
                const categories = await this.apiService.getAccountCategories();
                categoryCount = categories.length;
                totalAccounts = categories.reduce(
                    (sum: number, cat: any) => sum + (cat.availableCount || 0),
                    0
                );
            } catch (error) {
                logger.warn(
                    "[AccountChannelManager] Could not fetch account stats:",
                    error
                );
            }

            // Create header embed
            const headerEmbed =
                EnhancedAccountBuilder.buildAccountShopHeaderEmbed(
                    totalAccounts,
                    categoryCount
                );

            this.headerMessage = await this.accountChannel.send({
                embeds: [headerEmbed as any],
            });

            logger.debug("[AccountChannelManager] Header created");
        } catch (error) {
            logger.error("[AccountChannelManager] Error creating header:", error);
        }
    }

    /**
     * Create all category dropdowns in ONE message
     * Discord allows max 5 action rows per message
     */
    private async createAllCategoryMessages(): Promise<void> {
        if (!this.accountChannel) return;

        try {
            // Fetch categories
            const categories = await this.apiService.getAccountCategories();

            // Filter to only categories with available accounts
            const availableCategories = categories.filter(
                (cat: any) => cat.availableCount > 0
            );

            logger.info(
                `[AccountChannelManager] Creating combined message for ${availableCategories.length} categories`
            );

            if (availableCategories.length === 0) {
                logger.warn("[AccountChannelManager] No categories with available accounts");
                return;
            }

            // Fetch accounts for each category
            const categoriesWithAccounts: AccountCategoryWithAccounts[] = [];

            for (const category of availableCategories) {
                const result = await this.apiService.getAccountViewList(
                    category.category,
                    1,
                    25
                );

                const accounts = result?.list || [];

                categoriesWithAccounts.push({
                    category: category.category,
                    availableCount: category.availableCount,
                    label: category.label || category.category,
                    emoji: category.emoji || "📦",
                    accounts: accounts,
                });
            }

            // Build all dropdowns combined in one message
            const { content, components } =
                EnhancedAccountBuilder.buildAllCategorySelectMenus(categoriesWithAccounts);

            // Send single message with all dropdowns
            const message = await this.accountChannel.send({
                content: content || undefined,
                components: components as any,
            });

            // Store reference (using "combined" key)
            this.categoryMessages.set("combined", message);

            logger.info(
                `[AccountChannelManager] Combined message created with ${Math.min(categoriesWithAccounts.length, 5)} category dropdowns`
            );
        } catch (error) {
            logger.error(
                "[AccountChannelManager] Error creating category messages:",
                error
            );
        }
    }

    /**
     * Update the combined categories message
     * Since all dropdowns are in one message, we rebuild the entire combined message
     */
    async updateCategory(categoryKey?: string): Promise<void> {
        if (!this.accountChannel) return;

        try {
            logger.info(
                `[AccountChannelManager] Updating categories (triggered by: ${categoryKey || 'full refresh'})`
            );

            // Fetch fresh category data
            const categories = await this.apiService.getAccountCategories();

            // Filter to only categories with available accounts
            const availableCategories = categories.filter(
                (cat: any) => cat.availableCount > 0
            );

            if (availableCategories.length === 0) {
                // Remove the combined message if no categories have accounts
                const existingMessage = this.categoryMessages.get("combined");
                if (existingMessage) {
                    try {
                        await existingMessage.delete();
                    } catch (err) {
                        // Ignore if already deleted
                    }
                    this.categoryMessages.delete("combined");
                }
                return;
            }

            // Fetch accounts for each category
            const categoriesWithAccounts: AccountCategoryWithAccounts[] = [];

            for (const category of availableCategories) {
                const result = await this.apiService.getAccountViewList(
                    category.category,
                    1,
                    25
                );

                categoriesWithAccounts.push({
                    category: category.category,
                    availableCount: category.availableCount,
                    label: category.label || category.category,
                    emoji: category.emoji || "📦",
                    accounts: result?.list || [],
                });
            }

            // Build all dropdowns combined
            const { content, components } =
                EnhancedAccountBuilder.buildAllCategorySelectMenus(categoriesWithAccounts);

            const existingMessage = this.categoryMessages.get("combined");

            if (existingMessage) {
                // Edit existing combined message
                await existingMessage.edit({
                    content: content || undefined,
                    components: components as any,
                });
                logger.info("[AccountChannelManager] Combined message updated");
            } else {
                // Create new combined message
                const message = await this.accountChannel.send({
                    content: content || undefined,
                    components: components as any,
                });
                this.categoryMessages.set("combined", message);
                logger.info("[AccountChannelManager] Combined message created");
            }
        } catch (error) {
            logger.error(
                `[AccountChannelManager] Error updating categories:`,
                error
            );
        }
    }

    /**
     * Manual refresh (called from admin command)
     */
    async manualRefresh(): Promise<void> {
        logger.info("[AccountChannelManager] Manual refresh requested");
        await this.rebuildChannel();
    }

    /**
     * Check if the manager is ready
     */
    isReady(): boolean {
        return this.isInitialized && this.accountChannel !== null;
    }
}

// Singleton instance
let accountChannelManagerInstance: AccountChannelManager | null = null;

/**
 * Get or create the AccountChannelManager instance
 */
export function getAccountChannelManager(
    client: Client
): AccountChannelManager {
    if (!accountChannelManagerInstance) {
        accountChannelManagerInstance = new AccountChannelManager(client);
    }
    return accountChannelManagerInstance;
}
