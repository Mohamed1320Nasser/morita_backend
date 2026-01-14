import { Client, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../../common/loggers";
import { discordConfig } from "../config/discord.config";

export async function notifySupportOrderUpdate(
    client: Client,
    data: {
        orderNumber: string;
        orderId: string;
        status: string;
        customer: { discordId: string; discordUsername?: string };
        worker?: { discordId: string; discordUsername?: string };
        orderValue: string;
        action: "work_started" | "work_completed" | "order_confirmed" | "issue_reported";
        actionBy: string; 
        notes?: string;
    }
): Promise<void> {
    try {
        
        if (!discordConfig.logsChannelId) {
            logger.warn(`[Notification] No logs channel configured, skipping support notification`);
            return;
        }

        const logsChannel = await client.channels.fetch(discordConfig.logsChannelId);
        if (!logsChannel || !(logsChannel instanceof TextChannel)) {
            logger.warn(`[Notification] Logs channel not found or not a text channel`);
            return;
        }

        let color: number;
        let title: string;
        let description: string;

        switch (data.action) {
            case "work_started":
                color = 0xf1c40f; 
                title = "🚀 Work Started";
                description = `Worker has started working on Order #${data.orderNumber}`;
                break;
            case "work_completed":
                color = 0xf39c12; 
                title = "⚠️ Work Completed - Awaiting Confirmation";
                description = `Worker has marked Order #${data.orderNumber} as complete\n**Customer needs to confirm!**`;
                break;
            case "order_confirmed":
                color = 0x2ecc71; 
                title = "✅ Order Confirmed & Paid";
                description = `Customer has confirmed Order #${data.orderNumber}\nPayouts have been distributed`;
                break;
            case "issue_reported":
                color = 0xe74c3c; 
                title = "🔴 Issue Reported";
                description = `Customer reported an issue with Order #${data.orderNumber}\n**Support intervention required!**`;
                break;
            default:
                color = 0x95a5a6; 
                title = "📦 Order Update";
                description = `Order #${data.orderNumber} status changed`;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .addFields([
                { name: "📦 Order Number", value: `#${data.orderNumber}`, inline: true },
                { name: "💰 Order Value", value: `$${parseFloat(data.orderValue).toFixed(2)} USD`, inline: true },
                { name: "📊 Status", value: `\`${data.status}\``, inline: true },
                { name: "👤 Customer", value: `<@${data.customer.discordId}> (\`${data.customer.discordUsername || 'Unknown'}\`)`, inline: true },
                { name: "👷 Worker", value: data.worker ? `<@${data.worker.discordId}> (\`${data.worker.discordUsername || 'Unknown'}\`)` : "`Not Assigned`", inline: true },
                { name: "🔧 Action By", value: `<@${data.actionBy}>`, inline: true },
            ])
            .setColor(color)
            .setTimestamp()
            .setFooter({ text: `Order ID: ${data.orderId}` });

        if (data.notes) {
            embed.addFields([
                { name: "📝 Notes", value: data.notes.substring(0, 1024), inline: false }
            ]);
        }

        await logsChannel.send({
            content: data.action === "issue_reported" ? `<@&${discordConfig.supportRoleId}> **Urgent:** Issue reported!` : undefined,
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[Notification] Sent ${data.action} notification for order ${data.orderNumber} to support channel`);
    } catch (error) {
        logger.error(`[Notification] Failed to send support notification:`, error);
        
    }
}

export async function pingSupportRole(
    client: Client,
    channelId: string,
    message: string
): Promise<void> {
    try {
        if (!discordConfig.supportRoleId) {
            logger.warn(`[Notification] No support role configured`);
            return;
        }

        const channel = await client.channels.fetch(channelId);
        if (!channel || !(channel instanceof TextChannel)) {
            logger.warn(`[Notification] Channel not found or not a text channel`);
            return;
        }

        await channel.send({
            content: `<@&${discordConfig.supportRoleId}> ${message}`,
        });

        logger.info(`[Notification] Pinged support role in channel ${channelId}`);
    } catch (error) {
        logger.error(`[Notification] Failed to ping support role:`, error);
    }
}
