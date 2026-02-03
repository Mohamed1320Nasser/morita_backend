import { ButtonInteraction } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { startWorkOnOrder } from "../../utils/order-actions.util";

export async function handleStartWork(interaction: ButtonInteraction): Promise<void> {
    try {
        // Use ephemeral only for error responses
        await interaction.deferReply({ ephemeral: true });

        const orderId = interaction.customId.replace("start_work_", "");
        const workerDiscordId = interaction.user.id;

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        if (!orderData.worker || orderData.worker.discordId !== workerDiscordId) {
            await interaction.editReply({
                content: "❌ You are not the assigned worker for this order.",
            });
            return;
        }

        if (orderData.status !== "ASSIGNED") {
            await interaction.editReply({
                content: `❌ Cannot start work. Order status is already: ${orderData.status}`,
            });
            return;
        }

        const result = await startWorkOnOrder(
            interaction.client,
            orderId,
            orderData,
            workerDiscordId
        );

        // Delete the ephemeral reply since we'll send public message
        await interaction.deleteReply();

        logger.info(`[StartWorkButton] Order ${orderId} (#${orderData.orderNumber}) started successfully via button`);
    } catch (error: any) {
        logger.error("[StartWork] Error:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            await interaction.editReply({
                content: `❌ **Failed to start work**\n\n${errorMessage}\n\nPlease try again or contact support.`,
            });
        } catch (replyError) {
            // If editReply fails, try to reply directly
            logger.error("[StartWork] Failed to edit reply:", replyError);
        }
    }
}
