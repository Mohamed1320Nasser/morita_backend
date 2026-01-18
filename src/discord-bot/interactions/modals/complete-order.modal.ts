import { ModalSubmitInteraction, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { completeWorkOnOrder } from "../../utils/order-actions.util";

export async function handleCompleteOrderModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderId = interaction.customId.replace("complete_order_", "");

        const confirmationText = interaction.fields.getTextInputValue("confirmation_text").trim().toUpperCase();
        const completionNotes = interaction.fields.getTextInputValue("completion_notes")?.trim() || undefined;

        if (confirmationText !== "DONE") {
            await interaction.editReply({
                content: `❌ **Invalid confirmation.**\n\nYou typed: \`${confirmationText}\`\nRequired: \`DONE\`\n\nPlease try again.`,
            });
            return;
        }

        logger.info(`[CompleteOrderModal] Processing completion for order ${orderId} by worker ${interaction.user.id}`);

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the assigned worker for this order.",
            });
            return;
        }

        if (orderData.status !== "IN_PROGRESS") {
            await interaction.editReply({
                content: `❌ Cannot complete order. Current status: \`${orderData.status}\`\n\nOrder must be in progress to mark as complete.`,
            });
            return;
        }

        const orderChannel = interaction.channel instanceof TextChannel ? interaction.channel : undefined;

        const completeResult = await completeWorkOnOrder(
            interaction.client,
            orderId,
            orderData,
            interaction.user.id,
            completionNotes,
            orderChannel
        );

        await interaction.editReply({
            embeds: [completeResult.workerEmbed.toJSON() as any],
        });

        logger.info(`[CompleteOrderModal] Order ${orderId} (#${orderData.orderNumber}) completed successfully via modal`);
    } catch (error: any) {
        logger.error("[CompleteOrderModal] Error processing completion:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to complete order**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to complete order**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[CompleteOrderModal] Failed to send error message:", replyError);
        }
    }
}
