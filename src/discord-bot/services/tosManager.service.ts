import { Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel, Message } from "discord.js";
import { onboardingConfig } from "../config/onboarding.config";
import { discordConfig } from "../config/discord.config";
import axios from "axios";
import logger from "../../common/loggers";
import { getMessagePersistence } from "./messagePersistence.service";

export class TosManagerService {
    private client: Client;
    private tosChannel: TextChannel | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    async setupOnly(): Promise<void> {
        try {
            if (!onboardingConfig.tosChannelId) {
                logger.warn("[TosManager] TOS channel ID not configured");
                return;
            }

            this.tosChannel = await this.client.channels.fetch(onboardingConfig.tosChannelId) as TextChannel;

            if (!this.tosChannel || !this.tosChannel.isTextBased()) {
                logger.warn("[TosManager] TOS channel not found or not text-based");
                return;
            }

            logger.info(`[TosManager] Setup complete - connected to channel: ${this.tosChannel.name}`);
        } catch (error) {
            logger.error("[TosManager] Setup failed:", error);
        }
    }

    async publishTos(clearAllMessages: boolean = false): Promise<void> {
        await this.initializeTosChannel(clearAllMessages);
    }

    private async clearChannel(clearAllMessages: boolean = false): Promise<void> {
        if (!this.tosChannel) return;

        try {
            logger.info(`[TosManager] Clearing channel (clearAll: ${clearAllMessages})`);

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

                const messagesCollection = await this.tosChannel.messages.fetch(fetchOptions);
                if (messagesCollection.size === 0) break;

                allMessages.push(...Array.from(messagesCollection.values()));
                lastMessageId = messagesCollection.last()?.id;

                if (messagesCollection.size < 100) break;
            }

            // Filter messages based on clearAllMessages flag
            const messagesToDelete = clearAllMessages
                ? allMessages
                : allMessages.filter(msg => msg.author.id === this.client.user?.id);

            logger.info(`[TosManager] Found ${allMessages.length} total messages, deleting ${messagesToDelete.length} messages`);

            for (const msg of messagesToDelete) {
                try {
                    await msg.delete();
                } catch (err: any) {
                    if (err.code !== 10008) {
                        logger.warn(`[TosManager] Could not delete message ${msg.id}: ${err}`);
                    }
                }
            }

            this.tosChannel.messages.cache.clear();

            logger.info(`[TosManager] Successfully cleared ${messagesToDelete.length} messages`);
        } catch (error) {
            logger.error("[TosManager] Error clearing channel:", error);
        }
    }

    async initializeTosChannel(clearAllMessages: boolean = false) {
        try {
            if (!onboardingConfig.tosChannelId) {
                logger.error("TOS channel ID not configured");
                return;
            }

            const channel = await this.client.channels.fetch(onboardingConfig.tosChannelId) as TextChannel;

            if (!channel) {
                logger.error(`TOS channel not found: ${onboardingConfig.tosChannelId}`);
                return;
            }

            if (!channel.isTextBased()) {
                logger.error("TOS channel is not a text channel");
                return;
            }

            this.tosChannel = channel;

            // Clear channel before publishing if requested
            if (clearAllMessages) {
                await this.clearChannel(clearAllMessages);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            const response = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/tos/active`);
            const activeTos = response.data.data;

            if (!activeTos) {
                logger.warn("No active TOS found");
                return;
            }

            if (!activeTos.title || typeof activeTos.title !== 'string') {
                logger.error(`Invalid TOS title: ${typeof activeTos.title}`);
                throw new Error("TOS title is required and must be a string");
            }

            if (!activeTos.content || typeof activeTos.content !== 'string') {
                logger.error(`Invalid TOS content: ${typeof activeTos.content}`);
                throw new Error("TOS content is required and must be a string");
            }

            const embed = new EmbedBuilder()
                .setTitle(activeTos.title.substring(0, 256))
                .setDescription(activeTos.content.substring(0, 4096))
                .setColor(parseInt(activeTos.embedColor || "5865F2", 16));

            if (activeTos.bannerUrl) {
                embed.setImage(activeTos.bannerUrl);
            }

            if (activeTos.thumbnailUrl) {
                embed.setThumbnail(activeTos.thumbnailUrl);
            }

            if (activeTos.footerText) {
                embed.setFooter({ text: activeTos.footerText });
            }

            const acceptButton = new ButtonBuilder()
                .setCustomId(onboardingConfig.acceptTosButtonId)
                .setLabel(activeTos.buttonLabel || "Accept Terms")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅");

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(acceptButton);

            const messagePersistence = getMessagePersistence(this.client);
            await messagePersistence.ensureMessage(
                onboardingConfig.tosChannelId,
                "TOS",
                {
                    embeds: [embed as any],
                    components: [row as any]
                },
                {
                    pin: false  
                }
            );

            logger.info("TOS channel initialized successfully");
        } catch (error: any) {
            logger.error("❌ Failed to initialize TOS channel:");
            logger.error(`Error Message: ${error.message || error}`);
            logger.error(`Error Stack: ${error.stack}`);

            if (error.code) {
                logger.error(`Discord API Error Code: ${error.code}`);
            }
            if (error.response) {
                logger.error(`HTTP Response Status: ${error.response.status}`);
                logger.error(`HTTP Response Data:`, JSON.stringify(error.response.data, null, 2));
            }
            if (error.rawError) {
                logger.error("Raw Discord Error:", JSON.stringify(error.rawError, null, 2));
            }

            throw error;
        }
    }

    async refreshTosChannel() {
        await this.initializeTosChannel();
    }
}
