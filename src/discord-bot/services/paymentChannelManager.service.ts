import { Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel, Message } from "discord.js";
import { discordConfig } from "../config/discord.config";
import axios from "axios";
import logger from "../../common/loggers";
import { getMessagePersistence } from "./messagePersistence.service";

// Button style mapping
const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
    PRIMARY: ButtonStyle.Primary,
    SECONDARY: ButtonStyle.Secondary,
    SUCCESS: ButtonStyle.Success,
    DANGER: ButtonStyle.Danger,
};

export class PaymentChannelManagerService {
    private client: Client;
    private paymentsChannel: TextChannel | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    async setupOnly(): Promise<void> {
        try {
            if (!discordConfig.paymentsChannelId) {
                logger.warn("[PaymentChannelManager] Payments channel ID not configured");
                return;
            }

            this.paymentsChannel = await this.client.channels.fetch(discordConfig.paymentsChannelId) as TextChannel;

            if (!this.paymentsChannel || !this.paymentsChannel.isTextBased()) {
                logger.warn("[PaymentChannelManager] Payments channel not found or not text-based");
                return;
            }

            logger.info(`[PaymentChannelManager] Setup complete - connected to channel: ${this.paymentsChannel.name}`);
        } catch (error) {
            logger.error("[PaymentChannelManager] Setup failed:", error);
        }
    }

    async publishPayments(clearAllMessages: boolean = false): Promise<void> {
        await this.initializePaymentsChannel(clearAllMessages);
    }

    private async clearChannel(clearAllMessages: boolean = false): Promise<void> {
        if (!this.paymentsChannel) return;

        try {
            logger.info(`[PaymentChannelManager] Clearing channel (clearAll: ${clearAllMessages})`);

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

                const messagesCollection = await this.paymentsChannel.messages.fetch(fetchOptions);
                if (messagesCollection.size === 0) break;

                allMessages.push(...Array.from(messagesCollection.values()));
                lastMessageId = messagesCollection.last()?.id;

                if (messagesCollection.size < 100) break;
            }

            // Filter messages based on clearAllMessages flag
            const messagesToDelete = clearAllMessages
                ? allMessages
                : allMessages.filter(msg => msg.author.id === this.client.user?.id);

            logger.info(`[PaymentChannelManager] Found ${allMessages.length} total messages, deleting ${messagesToDelete.length} messages`);

            for (const msg of messagesToDelete) {
                try {
                    await msg.delete();
                } catch (err: any) {
                    if (err.code !== 10008) {
                        logger.warn(`[PaymentChannelManager] Could not delete message ${msg.id}: ${err}`);
                    }
                }
            }

            this.paymentsChannel.messages.cache.clear();

            logger.info(`[PaymentChannelManager] Successfully cleared ${messagesToDelete.length} messages`);
        } catch (error) {
            logger.error("[PaymentChannelManager] Error clearing channel:", error);
        }
    }

    async initializePaymentsChannel(clearAllMessages: boolean = false) {
        try {
            if (!discordConfig.paymentsChannelId) {
                logger.error("[PaymentChannelManager] Payments channel ID not configured");
                throw new Error("Payments channel ID not configured. Set DISCORD_PAYMENTS_CHANNEL_ID in .env");
            }

            const channel = await this.client.channels.fetch(discordConfig.paymentsChannelId) as TextChannel;

            if (!channel) {
                logger.error(`[PaymentChannelManager] Payments channel not found: ${discordConfig.paymentsChannelId}`);
                throw new Error("Payments channel not found");
            }

            if (!channel.isTextBased()) {
                logger.error("[PaymentChannelManager] Payments channel is not a text channel");
                throw new Error("Payments channel is not a text channel");
            }

            this.paymentsChannel = channel;

            // Clear channel before publishing if requested
            if (clearAllMessages) {
                await this.clearChannel(clearAllMessages);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Fetch config from API
            const response = await axios.get(`${discordConfig.apiBaseUrl}/payment-options/discord-config`);
            const config = response.data.data || response.data;

            if (!config) {
                logger.warn("[PaymentChannelManager] No payment config found, using defaults");
            }

            // Build the embed
            const embed = new EmbedBuilder()
                .setTitle((config?.title || "💳 Payment Methods").substring(0, 256))
                .setColor(parseInt((config?.color || "5865F2").replace("#", ""), 16))
                .setTimestamp();

            if (config?.description) {
                embed.setDescription(config.description.substring(0, 4096));
            }

            if (config?.bannerUrl) {
                embed.setImage(config.bannerUrl);
            }

            if (config?.thumbnailUrl) {
                embed.setThumbnail(config.thumbnailUrl);
            }

            if (config?.footerText) {
                embed.setFooter({ text: config.footerText });
            }

            // Build the buttons
            const cryptoButton = new ButtonBuilder()
                .setCustomId("payment_crypto")
                .setLabel(config?.cryptoButtonLabel || "🔗 Cryptocurrency")
                .setStyle(BUTTON_STYLE_MAP[config?.cryptoButtonStyle || "PRIMARY"] || ButtonStyle.Primary);

            const paymentButton = new ButtonBuilder()
                .setCustomId("payment_methods")
                .setLabel(config?.paymentButtonLabel || "💵 Other Payments")
                .setStyle(BUTTON_STYLE_MAP[config?.paymentButtonStyle || "SECONDARY"] || ButtonStyle.Secondary);

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(cryptoButton, paymentButton);

            // Use message persistence to ensure message exists
            const messagePersistence = getMessagePersistence(this.client);
            await messagePersistence.ensureMessage(
                discordConfig.paymentsChannelId,
                "PAYMENTS",
                {
                    embeds: [embed as any],
                    components: [row as any]
                },
                {
                    pin: false
                }
            );

            logger.info("[PaymentChannelManager] Payments channel initialized successfully");
        } catch (error: any) {
            logger.error("[PaymentChannelManager] Failed to initialize payments channel:");
            logger.error(`Error Message: ${error.message || error}`);
            logger.error(`Error Stack: ${error.stack}`);

            if (error.code) {
                logger.error(`Discord API Error Code: ${error.code}`);
            }
            if (error.response) {
                logger.error(`HTTP Response Status: ${error.response.status}`);
                logger.error(`HTTP Response Data:`, JSON.stringify(error.response.data, null, 2));
            }

            throw error;
        }
    }

    async refreshPaymentsChannel() {
        await this.initializePaymentsChannel();
    }
}

// Singleton instance getter
let paymentChannelManagerInstance: PaymentChannelManagerService | null = null;

export function getPaymentChannelManager(client: Client): PaymentChannelManagerService {
    if (!paymentChannelManagerInstance) {
        paymentChannelManagerInstance = new PaymentChannelManagerService(client);
    }
    return paymentChannelManagerInstance;
}
