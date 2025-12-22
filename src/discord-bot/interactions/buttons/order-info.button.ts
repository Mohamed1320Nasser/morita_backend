import { ButtonInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";

/**
 * Handle "Order Info" button click
 */
export async function handleOrderInfoButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from button customId: order_info_{orderId}
        const orderId = interaction.customId.replace("order_info_", "");

        logger.info(`[OrderInfo] User ${interaction.user.id} requesting info for order ${orderId}`);

        // Get order details
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);

        // Handle triple-nested response structure
        // HttpClient interceptor already unwrapped one level
        const outerData = orderResponse.data || orderResponse;
        const order = outerData.data || outerData;

        logger.info(`[OrderInfo] Retrieved order #${order.orderNumber}`);

        // Calculate order value
        const orderValue = parseFloat(order.orderValue);
        const depositAmount = parseFloat(order.depositAmount);

        // Build order info embed with improved design
        const orderInfoEmbed = new EmbedBuilder()
            .setTitle(`📦 Order #${order.orderNumber} Details`)
            .setColor(getStatusColor(order.status))
            .setTimestamp();

        // Order ID (compact format - only show first part)
        const shortId = order.id.split('-')[0];
        orderInfoEmbed.addFields([
            { name: "🆔 Order ID", value: `\`${shortId}...\``, inline: false }
        ]);

        // People section - all in one row
        const peopleFields = [
            { name: "👤 Customer", value: `<@${order.customer.discordId}>`, inline: true },
            { name: "👷 Worker", value: order.worker ? `<@${order.worker.discordId}>` : "`Unassigned`", inline: true },
            { name: "🎧 Support", value: order.support ? `<@${order.support.discordId}>` : "`None`", inline: true }
        ];
        orderInfoEmbed.addFields(peopleFields);

        // Status and Financial info
        const statusFinanceFields = [
            { name: "📊 Status", value: getStatusDisplay(order.status), inline: true },
            { name: "💰 Order Value", value: `**$${orderValue.toFixed(2)}** ${order.currency}`, inline: true },
            { name: "🔒 Deposit", value: `$${depositAmount.toFixed(2)} ${order.currency}`, inline: true }
        ];
        orderInfoEmbed.addFields(statusFinanceFields);

        // Service info
        if (order.service) {
            orderInfoEmbed.addFields([
                { name: "🎮 Service", value: `**${order.service.name}**`, inline: false }
            ]);
        }

        // Job details
        if (order.jobDetails?.description) {
            const jobDetails = order.jobDetails.description.length > 500
                ? order.jobDetails.description.substring(0, 500) + "..."
                : order.jobDetails.description;
            orderInfoEmbed.addFields([
                { name: "📋 Job Details", value: jobDetails, inline: false }
            ]);
        }

        // Timeline section - formatted as code blocks
        const timestamps: string[] = [];
        if (order.createdAt) {
            const createdTimestamp = Math.floor(new Date(order.createdAt).getTime() / 1000);
            timestamps.push(`\`📅 Created: \` <t:${createdTimestamp}:R>`);
        }
        if (order.assignedAt) {
            const assignedTimestamp = Math.floor(new Date(order.assignedAt).getTime() / 1000);
            timestamps.push(`\`👷 Assigned: \` <t:${assignedTimestamp}:R>`);
        }
        if (order.startedAt) {
            const startedTimestamp = Math.floor(new Date(order.startedAt).getTime() / 1000);
            timestamps.push(`\`🚀 Started: \` <t:${startedTimestamp}:R>`);
        }
        if (order.completedAt) {
            const completedTimestamp = Math.floor(new Date(order.completedAt).getTime() / 1000);
            timestamps.push(`\`✅ Completed: \` <t:${completedTimestamp}:R>`);
        }
        if (order.confirmedAt) {
            const confirmedTimestamp = Math.floor(new Date(order.confirmedAt).getTime() / 1000);
            timestamps.push(`\`🎉 Confirmed: \` <t:${confirmedTimestamp}:R>`);
        }

        if (timestamps.length > 0) {
            // Add absolute timestamp at the end (e.g., "Today at 11:50 PM")
            const lastTimestamp = order.confirmedAt || order.completedAt || order.startedAt || order.assignedAt || order.createdAt;
            if (lastTimestamp) {
                const absoluteTime = Math.floor(new Date(lastTimestamp).getTime() / 1000);
                timestamps.push(`<t:${absoluteTime}:f>`);
            }

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
