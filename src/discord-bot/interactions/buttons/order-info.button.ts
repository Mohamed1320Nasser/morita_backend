import { ButtonInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";

export async function handleOrderInfoButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderId = interaction.customId.replace("order_info_", "");
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const outerData = orderResponse.data || orderResponse;
        const order = outerData.data || outerData;

        const orderValue = parseFloat(order.orderValue);
        const depositAmount = parseFloat(order.depositAmount);

        const orderInfoEmbed = buildOrderInfoEmbed(order, orderValue, depositAmount);

        await interaction.editReply({
            embeds: [orderInfoEmbed.toJSON() as any],
        });
    } catch (error: any) {
        logger.error("[OrderInfo] Error:", error);

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

function buildOrderInfoEmbed(order: any, orderValue: number, depositAmount: number): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`📦 Order #${order.orderNumber} Details`)
        .setColor(getStatusColor(order.status))
        .setTimestamp();

    embed.addFields([
        { name: "🆔 Order ID", value: `#${order.orderNumber}`, inline: true },
        { name: "📊 Status", value: getStatusDisplay(order.status), inline: true },
        { name: "\u200b", value: "\u200b", inline: true }
    ]);

    embed.addFields([
        { name: "👤 Customer", value: `<@${order.customer.discordId}>`, inline: true },
        { name: "👷 Worker", value: order.worker ? `<@${order.worker.discordId}>` : "`Unassigned`", inline: true },
        { name: "🎧 Support", value: order.support ? `<@${order.support.discordId}>` : "`None`", inline: true }
    ]);

    embed.addFields([
        { name: "💰 Order Value", value: `**$${orderValue.toFixed(2)}** ${order.currency}`, inline: true },
        { name: "🔒 Deposit", value: `$${depositAmount.toFixed(2)} ${order.currency}`, inline: true },
        { name: "\u200b", value: "\u200b", inline: true }
    ]);

    if (order.service) {
        embed.addFields([
            { name: "🎮 Service", value: `**${order.service.name}**`, inline: false }
        ]);
    }

    if (order.jobDetails?.description) {
        const jobDetails = order.jobDetails.description.length > 500
            ? order.jobDetails.description.substring(0, 500) + "..."
            : order.jobDetails.description;
        embed.addFields([
            { name: "📋 Job Details", value: jobDetails, inline: false }
        ]);
    }

    const timestamps = buildTimeline(order);
    if (timestamps.length > 0) {
        embed.addFields([
            { name: "⏱️ Timeline", value: timestamps.join("\n"), inline: false }
        ]);
    }

    if (order.completionNotes) {
        embed.addFields([
            { name: "📝 Completion Notes", value: order.completionNotes.substring(0, 1024), inline: false }
        ]);
    }

    return embed;
}

function buildTimeline(order: any): string[] {
    const timestamps: string[] = [];

    if (order.createdAt) {
        const createdTimestamp = Math.floor(new Date(order.createdAt).getTime() / 1000);
        timestamps.push(`📅 **Created:** <t:${createdTimestamp}:R>`);
    }
    if (order.assignedAt) {
        const assignedTimestamp = Math.floor(new Date(order.assignedAt).getTime() / 1000);
        timestamps.push(`👷 **Assigned:** <t:${assignedTimestamp}:R>`);
    }
    if (order.startedAt) {
        const startedTimestamp = Math.floor(new Date(order.startedAt).getTime() / 1000);
        timestamps.push(`🚀 **Started:** <t:${startedTimestamp}:R>`);
    }
    if (order.completedAt) {
        const completedTimestamp = Math.floor(new Date(order.completedAt).getTime() / 1000);
        timestamps.push(`✅ **Completed:** <t:${completedTimestamp}:R>`);
    }
    if (order.confirmedAt) {
        const confirmedTimestamp = Math.floor(new Date(order.confirmedAt).getTime() / 1000);
        timestamps.push(`🎉 **Confirmed:** <t:${confirmedTimestamp}:R>`);
    }

    if (timestamps.length > 0) {
        const lastTimestamp = order.confirmedAt || order.completedAt || order.startedAt || order.assignedAt || order.createdAt;
        if (lastTimestamp) {
            const absoluteTime = Math.floor(new Date(lastTimestamp).getTime() / 1000);
            timestamps.push(`\n<t:${absoluteTime}:f>`);
        }
    }

    return timestamps;
}

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

function getStatusColor(status: string): number {
    const colorMap: { [key: string]: number } = {
        PENDING: 0x95a5a6,
        ASSIGNED: 0x3498db,
        IN_PROGRESS: 0xf1c40f,
        AWAITING_CONFIRMATION: 0xf39c12,
        AWAITING_CONFIRM: 0xf39c12,
        COMPLETED: 0x2ecc71,
        CANCELLED: 0xe74c3c,
        DISPUTED: 0xc0392b,
    };
    return colorMap[status] || 0x95a5a6;
}
