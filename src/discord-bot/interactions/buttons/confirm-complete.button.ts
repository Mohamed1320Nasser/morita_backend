import { ButtonInteraction, EmbedBuilder, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { confirmOrderCompletion } from "../../utils/order-actions.util";

/**
 * Handle "Confirm Complete" button click (customer confirms order completion)
 */
export async function handleConfirmCompleteButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from button customId: confirm_complete_{orderId}
        const orderId = interaction.customId.replace("confirm_complete_", "");

        logger.info(`[ConfirmComplete] Customer ${interaction.user.id} confirming order ${orderId}`);

        // Get order details first
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        // HttpClient interceptor already unwrapped one level
        const orderData = orderResponse.data || orderResponse;

        // Validate customer is the one who placed this order
        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the customer for this order.",
            });
            return;
        }

        // Validate order status
        if (orderData.status !== "AWAITING_CONFIRMATION" && orderData.status !== "AWAITING_CONFIRM") {
            await interaction.editReply({
                content: `❌ Order cannot be confirmed. Current status: ${orderData.status}`,
            });
            return;
        }

        // Step 1: Confirm order completion (triggers payout)
        await discordApiClient.put(`/discord/orders/${orderId}/confirm`, {
            customerDiscordId: interaction.user.id,
        });

        logger.info(`[ConfirmComplete] Order ${orderId} confirmed via /confirm endpoint, payouts triggered`);

        // Step 2: Get updated order data
        const updatedOrderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const updatedOrderData = updatedOrderResponse.data || updatedOrderResponse;

        // Step 3: Get order channel and thread
        let orderChannel: TextChannel | undefined;
        let reviewThread = interaction.channel?.isThread() ? interaction.channel : undefined;

        if (interaction.channel instanceof TextChannel) {
            orderChannel = interaction.channel;
        } else if (interaction.channel?.isThread()) {
            orderChannel = interaction.channel.parent as TextChannel;
        }

        // Step 4: Handle all Discord notifications using shared utility
        // Send review request in thread for customer interaction
        const confirmResult = await confirmOrderCompletion(
            interaction.client,
            orderId,
            updatedOrderData,
            interaction.user.id,
            undefined,
            orderChannel,
            true,
            reviewThread
        );

        logger.info(`[ConfirmComplete] All Discord notifications sent for order ${orderId}`);

        // Send simple confirmation to customer (ephemeral)
        await interaction.editReply({
            embeds: [confirmResult.customerEmbed.toJSON() as any],
        });

        // Disable the action buttons in the thread to prevent duplicate clicks
        try {
            const originalMessage = interaction.message;
            await originalMessage.edit({
                content: `✅ **Order confirmed successfully!** All buttons have been disabled.`,
                components: [] // Remove all buttons
            });
            logger.info(`[ConfirmComplete] Disabled action buttons in thread message`);
        } catch (buttonError) {
            logger.warn(`[ConfirmComplete] Could not disable buttons:`, buttonError);
        }

        logger.info(`[ConfirmComplete] Order ${orderId} confirmation flow completed successfully`);
    } catch (error: any) {
        logger.error("[ConfirmComplete] Error confirming order completion:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to confirm order**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to confirm order**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[ConfirmComplete] Failed to send error message:", replyError);
        }
    }
}
