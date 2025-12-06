import { ButtonInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import axios from "axios";
import { discordConfig } from "../../config/discord.config";

/**
 * Handle "Order Info" button click
 */
export async function handleOrderInfoButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from button customId: order_info_{orderId}
        const orderId = interaction.customId.replace("order_info_", "");

        logger.info(`[OrderInfo] User ${interaction.user.id} requesting info for order ${orderId}`);

        // Create API client
        const apiClient = axios.create({
            baseURL: discordConfig.apiBaseUrl,
            timeout: 30000,
        });

        // Get order details
        const orderResponse = await apiClient.get(`/discord/orders/${orderId}`);

        // Handle triple-nested response structure
        const outerData = orderResponse.data.data || orderResponse.data;
        const order = outerData.data || outerData;

        logger.info(`[OrderInfo] Retrieved order #${order.orderNumber}`);

        // Calculate payouts
        const orderValue = parseFloat(order.orderValue);
        const workerPayout = orderValue * 0.8; // 80%
        const supportPayout = orderValue * 0.05; // 5%
        const systemPayout = orderValue * 0.15; // 15%

        // Build order info embed
        const orderInfoEmbed = new EmbedBuilder()
            .setTitle(`📊 Order #${order.orderNumber} Details`)
            .addFields([
                { name: "🆔 Order ID", value: order.id, inline: false },
                { name: "👤 Customer", value: `<@${order.customer.discordId}>`, inline: true },
                { name: "👷 Worker", value: order.worker ? `<@${order.worker.discordId}>` : "Unassigned", inline: true },
                { name: "🎧 Support", value: order.support ? `<@${order.support.discordId}>` : "None", inline: true },
                { name: "📊 Status", value: getStatusDisplay(order.status), inline: true },
                { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} ${order.currency}`, inline: true },
                { name: "🔒 Deposit", value: `$${parseFloat(order.depositAmount).toFixed(2)} ${order.currency}`, inline: true },
            ])
            .setColor(getStatusColor(order.status))
            .setTimestamp();

        if (order.service) {
            orderInfoEmbed.addFields([
                { name: "🎮 Service", value: order.service.name, inline: false }
            ]);
        }

        if (order.jobDetails?.description) {
            orderInfoEmbed.addFields([
                { name: "📋 Job Details", value: order.jobDetails.description.substring(0, 1024), inline: false }
            ]);
        }

        // Add payout breakdown if worker assigned
        if (order.worker) {
            orderInfoEmbed.addFields([
                {
                    name: "💸 Payout Breakdown",
                    value:
                        `• Worker: $${workerPayout.toFixed(2)} (80%)\n` +
                        `• Support: $${supportPayout.toFixed(2)} (5%)\n` +
                        `• System: $${systemPayout.toFixed(2)} (15%)`,
                    inline: false,
                }
            ]);
        }

        // Add timestamps
        const timestamps: string[] = [];
        if (order.createdAt) timestamps.push(`📅 Created: <t:${Math.floor(new Date(order.createdAt).getTime() / 1000)}:R>`);
        if (order.assignedAt) timestamps.push(`👷 Assigned: <t:${Math.floor(new Date(order.assignedAt).getTime() / 1000)}:R>`);
        if (order.startedAt) timestamps.push(`🚀 Started: <t:${Math.floor(new Date(order.startedAt).getTime() / 1000)}:R>`);
        if (order.completedAt) timestamps.push(`✅ Completed: <t:${Math.floor(new Date(order.completedAt).getTime() / 1000)}:R>`);
        if (order.confirmedAt) timestamps.push(`🎉 Confirmed: <t:${Math.floor(new Date(order.confirmedAt).getTime() / 1000)}:R>`);

        if (timestamps.length > 0) {
            orderInfoEmbed.addFields([
                { name: "⏱️ Timeline", value: timestamps.join("\n"), inline: false }
            ]);
        }

        if (order.completionNotes) {
            orderInfoEmbed.addFields([
                { name: "📝 Completion Notes", value: order.completionNotes.substring(0, 1024), inline: false }
            ]);
        }

        await interaction.editReply({
            embeds: [orderInfoEmbed.toJSON() as any],
        });

        logger.info(`[OrderInfo] Sent order info to user ${interaction.user.id}`);
    } catch (error: any) {
        logger.error("[OrderInfo] Error handling order info button:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to load order info**\n\n${errorMessage}`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to load order info**\n\n${errorMessage}`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[OrderInfo] Failed to send error message:", replyError);
        }
    }
}

/**
 * Get status display text
 */
function getStatusDisplay(status: string): string {
    const statusMap: { [key: string]: string } = {
        PENDING: "⏳ PENDING",
        ASSIGNED: "📋 ASSIGNED",
        IN_PROGRESS: "🟡 IN PROGRESS",
        AWAITING_CONFIRMATION: "🟠 AWAITING CONFIRMATION",
        AWAITING_CONFIRM: "🟠 AWAITING CONFIRMATION",
        COMPLETED: "✅ COMPLETED",
        CANCELLED: "❌ CANCELLED",
        DISPUTED: "🔴 DISPUTED",
    };
    return statusMap[status] || status;
}

/**
 * Get status color
 */
function getStatusColor(status: string): number {
    const colorMap: { [key: string]: number } = {
        PENDING: 0x95a5a6,      // Gray
        ASSIGNED: 0x3498db,     // Blue
        IN_PROGRESS: 0xf1c40f,  // Yellow
        AWAITING_CONFIRMATION: 0xf39c12, // Orange
        AWAITING_CONFIRM: 0xf39c12,      // Orange
        COMPLETED: 0x2ecc71,    // Green
        CANCELLED: 0xe74c3c,    // Red
        DISPUTED: 0xc0392b,     // Dark Red
    };
    return colorMap[status] || 0x95a5a6;
}
