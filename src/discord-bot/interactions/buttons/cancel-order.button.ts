import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";
import { requireSupportOrAdmin } from "../../utils/permissions.util";
import { discordApiClient } from "../../clients/DiscordApiClient";

export async function handleCancelOrder(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const hasPermission = await requireSupportOrAdmin(interaction);
        if (!hasPermission) {
            return;
        }

        const orderId = interaction.customId.replace("cancel_order_", "");

        logger.info(`[CancelOrder] Support ${interaction.user.tag} cancelling order ${orderId}`);

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        await discordApiClient.put(`/discord/orders/${orderId}/status`, {
            status: "CANCELLED",
            supportDiscordId: interaction.user.id,
            reason: "Cancelled by support",
        });

        const embed = EmbedBuilder.createSuccessEmbed(
            `Order #${orderData.orderNumber} has been cancelled.\n\n` +
            `Customer and worker have been notified.`,
            "✅ Order Cancelled"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        if (interaction.channel) {
            await interaction.channel.send({
                content: `⚠️ **Order #${orderData.orderNumber} Cancelled**\n\nCancelled by <@${interaction.user.id}>`,
            });
        }

        logger.info(`[CancelOrder] Order ${orderId} cancelled by support ${interaction.user.tag}`);
    } catch (error: any) {
        logger.error("[CancelOrder] Error handling cancel order button:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        await interaction.editReply({
            content: `❌ **Failed to cancel order**\n\n${errorMessage}\n\nPlease try again or contact an administrator.`,
        });
    }
}
