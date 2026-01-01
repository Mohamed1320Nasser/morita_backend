import { Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from "discord.js";
import { onboardingConfig } from "../config/onboarding.config";
import { discordConfig } from "../config/discord.config";
import axios from "axios";
import logger from "../../common/loggers";

export class TosManagerService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async initializeTosChannel() {
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

            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                if (messages.size > 0) {
                    await channel.bulkDelete(messages);
                }
            } catch (bulkDeleteError: any) {
                logger.warn("Could not bulk delete old messages:", bulkDeleteError.message);
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

            await channel.send({
                embeds: [embed as any],
                components: [row as any]
            });

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
