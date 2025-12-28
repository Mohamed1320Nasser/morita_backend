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
            logger.info("=== Starting TOS Channel Initialization ===");

            if (!onboardingConfig.tosChannelId) {
                logger.error("TOS channel ID not configured. Please set DISCORD_TOS_CHANNEL_ID in environment variables");
                return;
            }

            logger.info(`Fetching Discord channel with ID: ${onboardingConfig.tosChannelId}`);
            const channel = await this.client.channels.fetch(onboardingConfig.tosChannelId) as TextChannel;

            if (!channel) {
                logger.error(`TOS channel not found with ID: ${onboardingConfig.tosChannelId}`);
                return;
            }

            logger.info(`Channel found: ${channel.name} (Type: ${channel.type})`);

            if (!channel.isTextBased()) {
                logger.error("TOS channel is not a text channel");
                return;
            }

            // Fetch active TOS from API
            logger.info(`Fetching active TOS from API: ${discordConfig.apiBaseUrl}/onboarding/tos/active`);
            const response = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/tos/active`);

            logger.info(`API Response Status: ${response.status}`);
            logger.info(`API Response Type: ${typeof response.data}`);
            logger.info(`API Response Keys: ${response.data ? Object.keys(response.data).join(', ') : 'null'}`);

            try {
                logger.info(`API Response Data (stringified):`);
                console.log(JSON.stringify(response.data, null, 2));
            } catch (e) {
                logger.warn("Could not stringify response data");
            }

            // The API wraps the response in { msg, status, data, error }
            const activeTos = response.data.data;

            if (!activeTos) {
                logger.warn("No active TOS found - skipping channel initialization");
                return;
            }

            logger.info(`TOS Title value: "${activeTos.title}"`);
            logger.info(`TOS Title type: ${typeof activeTos.title}`);
            logger.info(`TOS Content value: "${activeTos.content?.substring(0, 100)}..."`);
            logger.info(`TOS Content type: ${typeof activeTos.content}`);
            logger.info(`TOS Content Length: ${activeTos.content?.length || 0} characters`);
            logger.info(`TOS Embed Color: ${activeTos.embedColor}`);
            logger.info(`TOS Banner URL: ${activeTos.bannerUrl || 'None'}`);
            logger.info(`TOS Button Label: ${activeTos.buttonLabel || 'Accept Terms'}`);

            // Validate required fields
            if (!activeTos.title || typeof activeTos.title !== 'string') {
                logger.error(`Invalid TOS title: ${activeTos.title} (type: ${typeof activeTos.title})`);
                throw new Error("TOS title is required and must be a string");
            }

            if (!activeTos.content || typeof activeTos.content !== 'string') {
                logger.error(`Invalid TOS content: ${activeTos.content} (type: ${typeof activeTos.content})`);
                throw new Error("TOS content is required and must be a string");
            }

            // Clear existing messages
            try {
                logger.info("Fetching existing messages in channel...");
                const messages = await channel.messages.fetch({ limit: 100 });
                logger.info(`Found ${messages.size} existing messages`);

                if (messages.size > 0) {
                    logger.info("Deleting existing messages...");
                    await channel.bulkDelete(messages);
                    logger.info(`Cleared ${messages.size} old messages from TOS channel`);
                }
            } catch (bulkDeleteError: any) {
                logger.warn("Could not bulk delete old messages (may be >14 days old):", bulkDeleteError.message);
            }

            // Create embed
            logger.info("Creating Discord embed...");
            const embed = new EmbedBuilder()
                .setTitle(activeTos.title.substring(0, 256))
                .setDescription(activeTos.content.substring(0, 4096))
                .setColor(parseInt(activeTos.embedColor || "5865F2", 16));

            if (activeTos.bannerUrl) {
                logger.info(`Adding banner image: ${activeTos.bannerUrl}`);
                embed.setImage(activeTos.bannerUrl);
            }

            if (activeTos.thumbnailUrl) {
                logger.info(`Adding thumbnail: ${activeTos.thumbnailUrl}`);
                embed.setThumbnail(activeTos.thumbnailUrl);
            }

            if (activeTos.footerText) {
                logger.info(`Adding footer: ${activeTos.footerText}`);
                embed.setFooter({ text: activeTos.footerText });
            }

            // Create accept button
            logger.info("Creating Accept button...");
            const acceptButton = new ButtonBuilder()
                .setCustomId(onboardingConfig.acceptTosButtonId)
                .setLabel(activeTos.buttonLabel || "Accept Terms")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅");

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(acceptButton);

            // Send message
            logger.info("Sending message to Discord channel...");
            const sentMessage = await channel.send({
                embeds: [embed as any],
                components: [row as any]
            });

            logger.info(`✅ Message sent successfully! Message ID: ${sentMessage.id}`);
            logger.info("=== TOS Channel Initialization Complete ===");
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
