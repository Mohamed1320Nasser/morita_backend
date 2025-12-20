import { ModalSubmitInteraction, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import { discordApiClient } from "../../clients/DiscordApiClient";

/**
 * Handle issue report modal submission (customer reports problem)
 */
export async function handleReportIssueModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from customId: report_issue_{orderId}
        const orderId = interaction.customId.replace("report_issue_", "");

        // Get form input
        const issueDescription = interaction.fields.getTextInputValue("issue_description").trim();

        logger.info(`[ReportIssue] Processing issue report for order ${orderId} by customer ${interaction.user.id}`);

        // Get order details
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        // HttpClient interceptor already unwrapped one level
        const orderData = orderResponse.data || orderResponse;

        // Validate customer
        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the customer for this order.",
            });
            return;
        }

        // Update order status to DISPUTED and add the issue description
        const disputeResponse = await discordApiClient.put(`/discord/orders/${orderId}/status`, {
            status: "DISPUTED",
            changedByDiscordId: interaction.user.id,
            reason: "Customer reported issue",
            notes: issueDescription,
        });

        logger.info(`[ReportIssue] Order ${orderId} marked as DISPUTED`);

        // Send confirmation to customer
        const customerEmbed = new EmbedBuilder()
            .setTitle("⚠️ Issue Reported")
            .setDescription(
                `Your issue has been reported for Order #${orderData.orderNumber}.\n\n` +
                `Support has been notified and will review your case shortly.`
            )
            .addFields([
                { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                { name: "📊 Status", value: "🔴 DISPUTED", inline: true },
                { name: "⏳ Next Step", value: "Support will contact you", inline: false },
                { name: "📝 Your Report", value: issueDescription.substring(0, 1024), inline: false },
            ])
            .setColor(0xed4245) // Red for disputed
            .setTimestamp()
            .setFooter({ text: "Please wait for support assistance" });

        await interaction.editReply({
            embeds: [customerEmbed.toJSON() as any],
        });

        // Send notification to order channel
        const channel = interaction.channel;
        if (channel && channel instanceof TextChannel) {
            const disputeEmbed = new EmbedBuilder()
                .setTitle("⚠️ ORDER DISPUTE")
                .setDescription(
                    `<@${orderData.customer.discordId}> has reported an issue with Order #${orderData.orderNumber}!\n\n` +
                    `Support team has been notified.`
                )
                .addFields([
                    { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                    { name: "👤 Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                    { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                    { name: "📊 Status", value: "🔴 DISPUTED - Funds Locked", inline: false },
                    { name: "📝 Issue Description", value: issueDescription.substring(0, 1024), inline: false },
                    {
                        name: "ℹ️ Next Steps",
                        value:
                            "• Support will review the case\n" +
                            "• Both parties may be contacted for details\n" +
                            "• Funds remain locked until resolved",
                        inline: false,
                    },
                ])
                .setColor(0xed4245)
                .setTimestamp();

            // Disable the buttons by editing the original message
            try {
                const messages = await channel.messages.fetch({ limit: 10 });
                const confirmationMessage = messages.find(msg =>
                    msg.content.includes(`<@${orderData.customer.discordId}>`) &&
                    msg.embeds.length > 0 &&
                    msg.embeds[0].title === "📦 ORDER COMPLETION NOTIFICATION"
                );

                if (confirmationMessage) {
                    await confirmationMessage.edit({
                        components: [], // Remove all buttons
                    });
                }
            } catch (err) {
                logger.warn(`[ReportIssue] Could not disable buttons on confirmation message:`, err);
            }

            await channel.send({
                embeds: [disputeEmbed.toJSON() as any],
            });

            logger.info(`[ReportIssue] Sent dispute notification to channel ${channel.id}`);
        }

        // Notify support (if logs channel configured)
        if (discordConfig.logsChannelId) {
            try {
                const logsChannel = await interaction.client.channels.fetch(discordConfig.logsChannelId) as TextChannel;
                if (logsChannel) {
                    const supportNotificationEmbed = new EmbedBuilder()
                        .setTitle("🚨 NEW ORDER DISPUTE")
                        .setDescription(
                            `Order #${orderData.orderNumber} has been disputed by the customer.\n\n` +
                            `**Immediate attention required!**`
                        )
                        .addFields([
                            { name: "Order ID", value: orderId, inline: true },
                            { name: "Order Number", value: `#${orderData.orderNumber}`, inline: true },
                            { name: "Order Value", value: `$${parseFloat(orderData.orderValue).toFixed(2)} USD`, inline: true },
                            { name: "Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                            { name: "Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                            { name: "Support", value: orderData.support ? `<@${orderData.support.discordId}>` : "None", inline: true },
                            { name: "Issue Description", value: issueDescription.substring(0, 1024), inline: false },
                        ])
                        .setColor(0xed4245)
                        .setTimestamp();

                    await logsChannel.send({
                        content: `<@&${discordConfig.supportRoleId}> <@&${discordConfig.adminRoleId}>`,
                        embeds: [supportNotificationEmbed.toJSON() as any],
                    });

                    logger.info(`[ReportIssue] Notified support team in logs channel`);
                }
            } catch (err) {
                logger.error(`[ReportIssue] Failed to notify support in logs channel:`, err);
            }
        }

        logger.info(`[ReportIssue] Order ${orderId} dispute flow completed`);
    } catch (error: any) {
        logger.error("[ReportIssue] Error processing issue report:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to report issue**\n\n${errorMessage}\n\nPlease try again or contact support directly.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to report issue**\n\n${errorMessage}\n\nPlease try again or contact support directly.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[ReportIssue] Failed to send error message:", replyError);
        }
    }
}
