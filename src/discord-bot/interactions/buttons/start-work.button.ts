import { ButtonInteraction } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { EmbedBuilder } from "../../utils/embedBuilder";

/**
 * Handle "Start Work" button click
 * Transitions order from ASSIGNED to IN_PROGRESS
 */
export async function handleStartWork(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from customId: start_work_{orderId}
        const orderId = interaction.customId.replace("start_work_", "");
        const workerDiscordId = interaction.user.id;

        logger.info(`[StartWork] Worker ${workerDiscordId} starting work on order ${orderId}`);

        // Get order details
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        // Validate worker is assigned to this order
        if (!orderData.worker || orderData.worker.discordId !== workerDiscordId) {
            await interaction.editReply({
                content: "❌ You are not the assigned worker for this order.",
            });
            return;
        }

        // Validate order status
        if (orderData.status !== "ASSIGNED") {
            await interaction.editReply({
                content: `❌ Cannot start work. Order status is already: ${orderData.status}`,
            });
            return;
        }

        // Start work - change status to IN_PROGRESS
        await discordApiClient.put(`/discord/orders/${orderId}/status`, {
            status: "IN_PROGRESS",
            workerDiscordId,
            reason: "Worker manually started work",
        });

        const successEmbed = EmbedBuilder.createSuccessEmbed(
            `✅ You've started work on Order #${orderData.orderNumber}!\n\n` +
            `The order status has been updated to **IN PROGRESS**.\n\n` +
            `Click **Mark Complete** when you finish the work.`,
            "🚀 Work Started"
        );

        await interaction.editReply({
            embeds: [successEmbed as any],
        });

        logger.info(`[StartWork] Order ${orderId} status changed to IN_PROGRESS`);

        // Update the pinned order message with new status and buttons
        try {
            const { getOrderChannelService } = require("../../services/orderChannel.service");
            const orderChannelService = getOrderChannelService(interaction.client);

            await orderChannelService.updateOrderMessageStatus(
                interaction.channelId,
                orderData.orderNumber,
                orderId,
                "IN_PROGRESS",
                {
                    customerDiscordId: orderData.customer.discordId,
                    workerDiscordId: orderData.worker.discordId,
                    orderValue: parseFloat(orderData.orderValue),
                    depositAmount: parseFloat(orderData.depositAmount),
                    currency: orderData.currency || "USD",
                    serviceName: orderData.service?.name,
                    jobDetails: orderData.jobDetails,
                }
            );
            logger.info(`[StartWork] Updated pinned message for order #${orderData.orderNumber}`);
        } catch (updateError) {
            logger.error(`[StartWork] Failed to update pinned message:`, updateError);
            // Don't fail the whole operation if message update fails
        }

        // Notify in the channel
        if (interaction.channel) {
            await interaction.channel.send({
                content: `🚀 <@${workerDiscordId}> has started work on Order #${orderData.orderNumber}`,
            });
        }
    } catch (error: any) {
        logger.error("[StartWork] Error starting work:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        await interaction.editReply({
            content: `❌ **Failed to start work**\n\n${errorMessage}\n\nPlease try again or contact support.`,
        });
    }
}
