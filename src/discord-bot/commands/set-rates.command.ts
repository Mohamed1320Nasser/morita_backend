import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
    TextChannel,
} from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import { buildRateEmbedSimple } from "../utils/rateMessageBuilder";
import logger from "../../common/loggers";

export const data = new SlashCommandBuilder()
    .setName("set-rates")
    .setDescription("Set or update gold buy/sell rates (Admin only)")
    .addNumberOption((option) =>
        option
            .setName("buy-rate")
            .setDescription("Buy rate per 1M GP (e.g., 0.13)")
            .setRequired(false)
            .setMinValue(0)
    )
    .addNumberOption((option) =>
        option
            .setName("sell-rate")
            .setDescription("Sell rate per 1M GP (e.g., 0.15)")
            .setRequired(false)
            .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const buyRate = interaction.options.getNumber("buy-rate");
        const sellRate = interaction.options.getNumber("sell-rate");

        // At least one rate must be provided
        if (buyRate === null && sellRate === null) {
            await interaction.editReply({
                content: "❌ Please provide at least one rate to update (buy-rate or sell-rate).",
            });
            return;
        }

        logger.info(`[SetRates] Updating rates - Buy: ${buyRate}, Sell: ${sellRate}`);

        // Update rates in database
        const updateData: any = {};
        if (buyRate !== null) updateData.buyRate = buyRate;
        if (sellRate !== null) updateData.sellRate = sellRate;

        await discordApiClient.patch("/gold-rates", updateData);

        // Get current rates and all payment methods
        const ratesData: any = await discordApiClient.get("/gold-rates/all-methods");
        const data = ratesData.data || ratesData;

        logger.info(`[SetRates] Rates updated successfully`);

        // Get current config to check if message exists
        const currentConfig: any = await discordApiClient.get("/gold-rates");
        const config = currentConfig.data || currentConfig;

        const channel = interaction.channel as TextChannel;

        if (config.messageId && config.channelId === channel.id) {
            // Update existing message
            try {
                const message = await channel.messages.fetch(config.messageId);
                const rateMessage = buildRateEmbedSimple(data);
                await message.edit(rateMessage);

                await interaction.editReply({
                    content:
                        `✅ **Rates updated successfully!**\n\n` +
                        `💵 **Buy:** $${data.baseBuyRate.toFixed(4)}/M\n` +
                        `💸 **Sell:** $${data.baseSellRate.toFixed(4)}/M\n\n` +
                        `The existing rate message has been updated.`,
                });

                logger.info(`[SetRates] Updated existing message ${config.messageId}`);
            } catch (err) {
                logger.warn(`[SetRates] Could not update existing message, posting new one:`, err);
                // If message not found, post new one
                await postNewRateMessage(interaction, channel, data);
            }
        } else {
            // Post new message
            await postNewRateMessage(interaction, channel, data);
        }
    } catch (error: any) {
        logger.error("[SetRates] Error:", error);
        const content = `❌ Error: ${error?.response?.data?.message || error.message || "Unknown error"}`;
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content });
        } else {
            await interaction.reply({ content, ephemeral: true });
        }
    }
}

async function postNewRateMessage(interaction: ChatInputCommandInteraction, channel: TextChannel, data: any) {
    // Post new rate message
    const rateMessage = buildRateEmbedSimple(data);
    const sentMessage = await channel.send(rateMessage);

    // Save message ID to database
    await discordApiClient.patch("/gold-rates", {
        channelId: channel.id,
        messageId: sentMessage.id,
    });

    await interaction.editReply({
        content:
            `✅ **Rates set successfully!**\n\n` +
            `💵 **Buy:** $${data.baseBuyRate.toFixed(4)}/M\n` +
            `💸 **Sell:** $${data.baseSellRate.toFixed(4)}/M\n\n` +
            `Rate message posted in this channel.`,
    });

    logger.info(`[SetRates] Posted new message ${sentMessage.id} in channel ${channel.id}`);
}
