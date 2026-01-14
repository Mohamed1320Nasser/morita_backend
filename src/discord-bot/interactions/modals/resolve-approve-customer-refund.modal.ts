import { ModalSubmitInteraction, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { discordConfig } from "../../config/discord.config";
import { isAdminOrSupport } from "../../utils/role-check.util";

export async function handleResolveApproveCustomerRefundModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const parts = interaction.customId.split("_");
        const issueId = parts[parts.length - 2];
        const orderId = parts[parts.length - 1];

        const refundType = interaction.fields.getTextInputValue("refund_type").trim().toUpperCase();
        const refundAmountStr = interaction.fields.getTextInputValue("refund_amount")?.trim() || "0";
        const cancellationReason = interaction.fields.getTextInputValue("cancellation_reason").trim();

        logger.info(`[ApproveCustomerRefund] Processing resolution for issue ${issueId}, order ${orderId}`);

        const hasPermission = await isAdminOrSupport(interaction.client, interaction.user.id);
        if (!hasPermission) {
            await interaction.editReply({
                content: `❌ **Permission Denied**\n\nOnly users with Admin or Support roles can resolve issues.\n\nPlease contact an administrator.`,
            });
            logger.warn(`[ApproveCustomerRefund] User ${interaction.user.tag} (${interaction.user.id}) attempted to resolve issue without permission`);
            return;
        }

        if (!["FULL", "PARTIAL", "NONE"].includes(refundType)) {
            await interaction.editReply({
                content: `❌ Invalid refund type. Must be exactly "FULL", "PARTIAL", or "NONE" (you entered: "${refundType}").`,
            });
            return;
        }

        let refundAmount = 0;
        if (refundType === "PARTIAL") {
            refundAmount = parseFloat(refundAmountStr);
            if (isNaN(refundAmount) || refundAmount <= 0) {
                await interaction.editReply({
                    content: `❌ Invalid refund amount for PARTIAL refund. Must be a positive number (you entered: "${refundAmountStr}").`,
                });
                return;
            }
        }

        logger.info(`[ApproveCustomerRefund] Admin ${interaction.user.tag} approved customer refund (${refundType}) for issue ${issueId}`);

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        await discordApiClient.put(`/discord/orders/${orderId}/cancel`, {
            cancelledByDiscordId: interaction.user.id,
            cancellationReason: `❌ Issue Resolved by Admin - Customer Refund Approved (${refundType})\n\nReason: ${cancellationReason}\n\nResolved by: ${interaction.user.tag}`,
            refundType: refundType.toLowerCase() as "full" | "partial" | "none",
            refundAmount: refundType === "PARTIAL" ? refundAmount : undefined,
        });

        logger.info(`[ApproveCustomerRefund] Order ${orderId} cancelled via /cancel endpoint with ${refundType} refund`);

        let refundDisplayText = "";
        if (refundType === "FULL") {
            refundDisplayText = `Full Refund ($${parseFloat(orderData.orderValue || 0).toFixed(2)})`;
        } else if (refundType === "PARTIAL") {
            refundDisplayText = `Partial Refund ($${refundAmount.toFixed(2)})`;
        } else {
            refundDisplayText = "No Refund";
        }

        const successEmbed = new EmbedBuilder()
            .setTitle("❌ Issue Resolved - Customer Refund Approved")
            .setDescription(
                `The issue has been resolved in favor of the customer.\n\n` +
                `Order #${orderData.orderNumber} has been **CANCELLED** and refund processed.`
            )
            .addFields([
                { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                { name: "🆔 Issue ID", value: `\`${issueId}\``, inline: true },
                { name: "📊 Resolution", value: "Customer Refund Approved - Order Cancelled", inline: false },
                { name: "💰 Refund", value: refundDisplayText, inline: true },
                { name: "📝 Reason", value: cancellationReason.substring(0, 1024), inline: false },
                { name: "✅ Actions Taken", value:
                    "• Issue marked as RESOLVED\n" +
                    "• Order marked as CANCELLED\n" +
                    `• ${refundDisplayText} processed\n` +
                    "• Notifications sent to all parties",
                    inline: false
                },
            ])
            .setColor(0xed4245) 
            .setTimestamp()
            .setFooter({ text: `Resolved by ${interaction.user.tag}` });

        await interaction.editReply({
            embeds: [successEmbed.toJSON() as any],
        });

        try {
            if (orderData.discordChannelId) {
                const orderChannel = await interaction.client.channels.fetch(orderData.discordChannelId) as TextChannel;

                const customerNotificationEmbed = new EmbedBuilder()
                    .setTitle("❌ Order Cancelled - Refund Approved")
                    .setDescription(
                        `<@${orderData.customer.discordId}>, your issue has been reviewed and resolved in your favor.\n\n` +
                        `Order #${orderData.orderNumber} has been **CANCELLED** and your refund has been processed.`
                    )
                    .addFields([
                        { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                        { name: "💰 Refund", value: refundDisplayText, inline: true },
                        { name: "📊 Status", value: "❌ CANCELLED", inline: false },
                        { name: "📝 Reason", value: cancellationReason.substring(0, 1024), inline: false },
                        { name: "✅ What Happened", value:
                            `• Your issue was reviewed by support\n` +
                            `• The refund has been approved\n` +
                            `• Funds have been returned to your wallet\n` +
                            `• You can now place a new order if needed`,
                            inline: false
                        },
                    ])
                    .setColor(0xed4245) 
                    .setTimestamp()
                    .setFooter({ text: "Thank you for your patience" });

                await orderChannel.send({
                    content: `<@${orderData.customer.discordId}>`,
                    embeds: [customerNotificationEmbed.toJSON() as any],
                });

                if (orderData.worker?.discordId) {
                    const workerNotificationEmbed = new EmbedBuilder()
                        .setTitle("❌ Order Cancelled - Issue Resolved Against You")
                        .setDescription(
                            `<@${orderData.worker.discordId}>, Order #${orderData.orderNumber} has been cancelled.\n\n` +
                            `The customer reported an issue and support has resolved it in the customer's favor.`
                        )
                        .addFields([
                            { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                            { name: "💰 Customer Refund", value: refundDisplayText, inline: true },
                            { name: "📊 Status", value: "❌ CANCELLED", inline: false },
                            { name: "📝 Cancellation Reason", value: cancellationReason.substring(0, 1024), inline: false },
                            { name: "⚠️ Important", value:
                                `• The order has been cancelled\n` +
                                `• Customer received a refund\n` +
                                `• Please review the cancellation reason\n` +
                                `• Contact support if you have questions`,
                                inline: false
                            },
                        ])
                        .setColor(0xed4245) 
                        .setTimestamp()
                        .setFooter({ text: "Resolved by support" });

                    await orderChannel.send({
                        content: `<@${orderData.worker.discordId}>`,
                        embeds: [workerNotificationEmbed.toJSON() as any],
                    });
                }

                logger.info(`[ApproveCustomerRefund] Sent cancellation notifications to customer and worker in channel ${orderData.discordChannelId}`);
            }
        } catch (channelError) {
            logger.error(`[ApproveCustomerRefund] Failed to send notifications to order channel:`, channelError);
        }

        try {
            
            await discordApiClient.put(`/discord/orders/issues/${issueId}`, {
                status: "RESOLVED",
                resolution: `❌ Customer Refund Approved - Order Cancelled\n\n${refundDisplayText}\n\n${cancellationReason}\n\nResolved by: ${interaction.user.tag}`,
                resolvedByDiscordId: interaction.user.id,
            });

            logger.info(`[ApproveCustomerRefund] Marked issue ${issueId} as RESOLVED in database`);

            const issuesChannel = await interaction.client.channels.fetch(discordConfig.issuesChannelId);
            if (issuesChannel?.isTextBased()) {
                const issueData = await discordApiClient.get(`/discord/orders/issues/${issueId}`);
                const issue = issueData.data || issueData;

                if (issue.discordMessageId) {
                    const issueMessage = await issuesChannel.messages.fetch(issue.discordMessageId);

                    const resolvedEmbed = new EmbedBuilder(issueMessage.embeds[0].data)
                        .setColor(0xed4245) 
                        .setTitle(`❌ RESOLVED - ${issueMessage.embeds[0].title}`);

                    resolvedEmbed.addFields({
                        name: "❌ Resolution",
                        value: `**Customer Refund Approved - Order Cancelled**\n${refundDisplayText}\n\n${cancellationReason}\n\nResolved by: <@${interaction.user.id}>`,
                        inline: false,
                    });

                    await issueMessage.edit({
                        embeds: [resolvedEmbed.toJSON() as any],
                        components: [], 
                    });

                    logger.info(`[ApproveCustomerRefund] Updated issue message in Discord`);
                }
            }
        } catch (updateError) {
            logger.error(`[ApproveCustomerRefund] Failed to update issue:`, updateError);
            
        }

        logger.info(`[ApproveCustomerRefund] Resolution completed successfully`);
    } catch (error: any) {
        logger.error("[ApproveCustomerRefund] Error processing resolution:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to resolve issue**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to resolve issue**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[ApproveCustomerRefund] Failed to send error message:", replyError);
        }
    }
}
