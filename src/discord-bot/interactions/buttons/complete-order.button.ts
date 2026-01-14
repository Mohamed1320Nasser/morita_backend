import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";

export async function handleCompleteOrder(interaction: ButtonInteraction): Promise<void> {
    try {
        
        let orderId = interaction.customId.replace("complete_order_", "");
        if (orderId === interaction.customId) {
            orderId = interaction.customId.replace("mark_complete_", "");
        }

        logger.info(`[MarkComplete] Worker ${interaction.user.id} marking order ${orderId} as complete`);

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        
        const orderData = orderResponse.data || orderResponse;

        if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
            await interaction.reply({
                content: "❌ You are not the assigned worker for this order.",
                ephemeral: true,
            });
            return;
        }

        if (orderData.status !== "IN_PROGRESS") {
            await interaction.reply({
                content: `❌ Order must be IN_PROGRESS to complete. Current status: ${orderData.status}\n\nIf the order is ASSIGNED, use the "Start Work" button first.`,
                ephemeral: true,
            });
            return;
        }

        const workerPayout = parseFloat(orderData.orderValue) * 0.8;

        const modal = new ModalBuilder()
            .setCustomId(`complete_order_${orderId}`)
            .setTitle("✅ Mark Order Complete");

        const completionNotesInput = new TextInputBuilder()
            .setCustomId("completion_notes")
            .setLabel("Completion Notes (Optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("E.g., Completed ahead of schedule, all goals met...")
            .setRequired(false)
            .setMaxLength(500);

        const confirmationInput = new TextInputBuilder()
            .setCustomId("confirmation_text")
            .setLabel(`Confirm you've completed Order #${orderData.orderNumber}`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Type "COMPLETE" to confirm`)
            .setRequired(true)
            .setMaxLength(10);

        const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(confirmationInput);
        const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(completionNotesInput);

        modal.addComponents(firstRow, secondRow);

        await interaction.showModal(modal as any);

        logger.info(`[MarkComplete] Showed completion modal for order ${orderId}`);
    } catch (error: any) {
        logger.error("[MarkComplete] Error showing completion modal:", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Failed to show completion form: ${error.message || "Unknown error"}`,
                ephemeral: true,
            });
        }
    }
}
