import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import logger from "../../common/loggers";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";
import { collectCompletionScreenshots, storePendingScreenshots } from "../utils/screenshot-collector.util";

export const data = new SlashCommandBuilder()
    .setName("complete-work")
    .setDescription("Mark your work as complete (requires screenshot proof)")
    .addStringOption((option) =>
        option
            .setName("order-number")
            .setDescription("Order Number (e.g., 11)")
            .setRequired(true)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        const orderNumber = interaction.options.getString("order-number", true);

        const orderSearch = await findOrderByNumber(orderNumber);

        if (!orderSearch) {
            await interaction.reply({
                content: `❌ Order not found: **#${orderNumber}**`,
                ephemeral: true,
            });
            return;
        }

        const { orderId, orderData } = orderSearch;

        if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
            await interaction.reply({
                content: `❌ You are not the assigned worker for Order **#${orderNumber}**.`,
                ephemeral: true,
            });
            return;
        }

        if (orderData.status !== "IN_PROGRESS") {
            await interaction.reply({
                content: `❌ Cannot complete. Status: \`${orderData.status}\`. ${orderData.status === "ASSIGNED" ? "Use `/start-work` first." : ""}`,
                ephemeral: true,
            });
            return;
        }

        const screenshotResult = await collectCompletionScreenshots(interaction, orderId, orderData.orderNumber);

        if (!screenshotResult.success) return;

        storePendingScreenshots(orderId, screenshotResult.urls);

        const embed = new EmbedBuilder()
            .setTitle("📸 Screenshots Uploaded Successfully!")
            .setDescription(`Click the button below to confirm completion of **Order #${orderNumber}**.`)
            .setColor(0x57f287)
            .setTimestamp();

        const confirmButton = new ButtonBuilder()
            .setCustomId(`show_completion_modal_${orderId}`)
            .setLabel("Complete Order")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅");

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton);

        await interaction.followUp({
            embeds: [embed.toJSON() as any],
            components: [row.toJSON() as any],
            ephemeral: true,
        });
    } catch (error: any) {
        logger.error("[CompleteWork] Error:", error);
        const errorMessage = extractErrorMessage(error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: `❌ Failed: ${errorMessage}`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ Failed: ${errorMessage}`, ephemeral: true });
            }
        } catch {}
    }
}
