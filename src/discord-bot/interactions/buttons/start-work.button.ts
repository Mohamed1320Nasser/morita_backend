import { ButtonInteraction } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { startWorkOnOrder } from "../../utils/order-actions.util";

export async function handleStartWork(interaction: ButtonInteraction): Promise<void> {
    try {
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

        await interaction.editReply({
            embeds: [result.ephemeralEmbed.toJSON() as any],
            components: [result.completeButton.toJSON() as any],
        });

        logger.info(`[StartWorkButton] Order ${orderId} (#${orderData.orderNumber}) started successfully via button`);
    } catch (error: any) {
        logger.error("[StartWork] Error:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        await interaction.editReply({
            content: `❌ **Failed to start work**\n\n${errorMessage}\n\nPlease try again or contact support.`,
        });
    }
}
