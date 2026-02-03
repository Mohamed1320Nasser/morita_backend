import { ModalSubmitInteraction, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { completeWorkOnOrder } from "../../utils/order-actions.util";
import { getPendingScreenshots, cleanupPendingScreenshots } from "../../utils/screenshot-collector.util";

export async function handleCompleteOrderModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderId = interaction.customId.replace("complete_order_", "");
        const confirmationText = interaction.fields.getTextInputValue("confirmation_text").trim().toUpperCase();
        const completionNotes = interaction.fields.getTextInputValue("completion_notes")?.trim() || undefined;

        if (confirmationText !== "DONE") {
            await interaction.editReply({
                content: `❌ Invalid confirmation. You typed: \`${confirmationText}\`. Required: \`DONE\``,
            });
            return;
        }

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
            await interaction.editReply({ content: "❌ You are not the assigned worker for this order." });
            return;
        }

        if (orderData.status !== "IN_PROGRESS") {
            await interaction.editReply({ content: `❌ Cannot complete. Status: \`${orderData.status}\`` });
            return;
        }

        const screenshots = getPendingScreenshots(orderId);

        if (!screenshots || screenshots.length === 0) {
            await interaction.editReply({
                content: "❌ No screenshots found. Please click **Mark Complete** again to restart.",
            });
            return;
        }

        const orderChannel = interaction.channel instanceof TextChannel ? interaction.channel : undefined;

        await completeWorkOnOrder(
            interaction.client,
            orderId,
            orderData,
            interaction.user.id,
            completionNotes,
            orderChannel,
            screenshots
        );

        // Clean up the "Screenshots Uploaded Successfully" ephemeral message
        await cleanupPendingScreenshots(orderId);

        // Delete the ephemeral reply - public message is already sent by completeWorkOnOrder
        await interaction.deleteReply();
    } catch (error: any) {
        logger.error("[CompleteOrderModal] Error:", error);
        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: `❌ Failed: ${errorMessage}` });
            } else {
                await interaction.reply({ content: `❌ Failed: ${errorMessage}`, ephemeral: true });
            }
        } catch {}
    }
}
