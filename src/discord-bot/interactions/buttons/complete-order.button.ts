import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { collectCompletionScreenshots, storePendingScreenshots } from "../../utils/screenshot-collector.util";

export async function handleCompleteOrder(interaction: ButtonInteraction): Promise<void> {
    try {
        const orderId = interaction.customId.replace("complete_order_", "").replace("mark_complete_", "");

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
            await interaction.reply({ content: "❌ You are not the assigned worker for this order.", ephemeral: true });
            return;
        }

        if (orderData.status !== "IN_PROGRESS") {
            await interaction.reply({
                content: `❌ Order must be IN_PROGRESS to complete. Current status: **${orderData.status}**`,
                ephemeral: true,
            });
            return;
        }

        const screenshotResult = await collectCompletionScreenshots(interaction, orderId, orderData.orderNumber);

        if (!screenshotResult.success) return;

        // Store screenshots and interaction reference for cleanup later
        storePendingScreenshots(orderId, screenshotResult.urls, interaction);

        const embed = new EmbedBuilder()
            .setTitle("📸 Screenshots Uploaded Successfully!")
            .setDescription(`Click the button below to confirm completion of **Order #${orderData.orderNumber}**.`)
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
        logger.error("[CompleteOrder] Error:", error);
        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: `❌ Failed: ${errorMessage}`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ Failed: ${errorMessage}`, ephemeral: true });
            }
        } catch {}
    }
}

export async function handleShowCompletionModal(interaction: ButtonInteraction): Promise<void> {
    try {
        const orderId = interaction.customId.replace("show_completion_modal_", "");

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        const modal = new ModalBuilder()
            .setCustomId(`complete_order_${orderId}`)
            .setTitle("✅ Confirm Order Completion");

        const confirmationInput = new TextInputBuilder()
            .setCustomId("confirmation_text")
            .setLabel(`Confirm Order #${orderData.orderNumber} is complete`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type "DONE" to confirm')
            .setRequired(true)
            .setMaxLength(10);

        const completionNotesInput = new TextInputBuilder()
            .setCustomId("completion_notes")
            .setLabel("Completion Notes (Optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("E.g., Completed ahead of schedule...")
            .setRequired(false)
            .setMaxLength(500);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(confirmationInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(completionNotesInput)
        );

        await interaction.showModal(modal as any);
    } catch (error: any) {
        logger.error("[ShowCompletionModal] Error:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Failed to show completion form.`, ephemeral: true });
        }
    }
}
