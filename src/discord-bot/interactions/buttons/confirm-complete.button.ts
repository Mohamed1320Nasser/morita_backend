import { ButtonInteraction, EmbedBuilder, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { confirmOrderCompletion } from "../../utils/order-actions.util";

export async function handleConfirmCompleteButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderId = interaction.customId.replace("confirm_complete_", "");

        logger.info(`[ConfirmComplete] Customer ${interaction.user.id} confirming order ${orderId}`);

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        
        const orderData = orderResponse.data || orderResponse;

        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the customer for this order.",
            });
            return;
        }

        if (orderData.status !== "AWAITING_CONFIRMATION" && orderData.status !== "AWAITING_CONFIRM") {
            await interaction.editReply({
                content: `❌ Order cannot be confirmed. Current status: ${orderData.status}`,
            });
            return;
        }

        await discordApiClient.put(`/discord/orders/${orderId}/confirm`, {
            customerDiscordId: interaction.user.id,
        });

        logger.info(`[ConfirmComplete] Order ${orderId} confirmed via /confirm endpoint, payouts triggered`);

        const updatedOrderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const updatedOrderData = updatedOrderResponse.data || updatedOrderResponse;

        let orderChannel: TextChannel | undefined;
        let reviewThread = interaction.channel?.isThread() ? interaction.channel : undefined;

        if (interaction.channel instanceof TextChannel) {
            orderChannel = interaction.channel;
        } else if (interaction.channel?.isThread()) {
            orderChannel = interaction.channel.parent as TextChannel;
        }

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

        await interaction.editReply({
            embeds: [confirmResult.customerEmbed.toJSON() as any],
        });

        try {
            const originalMessage = interaction.message;
            await originalMessage.edit({
                content: `✅ **Order confirmed successfully!** All buttons have been disabled.`,
                components: [] 
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
