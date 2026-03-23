import { ModalSubmitInteraction, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { discordConfig } from "../../config/discord.config";
import { isAdminOrSupport } from "../../utils/role-check.util";

export async function handleResolveRequestCorrectionsModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const parts = interaction.customId.split("_");
        const issueId = parts[parts.length - 2];
        const orderId = parts[parts.length - 1];

        const fixInstructions = interaction.fields.getTextInputValue("fix_instructions").trim();

        logger.info(`[RequestCorrections] Processing resolution for issue ${issueId}, order ${orderId}`);

        const hasPermission = await isAdminOrSupport(interaction.client, interaction.user.id);
        if (!hasPermission) {
            await interaction.editReply({
                content: `❌ **Permission Denied**\n\nOnly users with Admin or Support roles can resolve issues.\n\nPlease contact an administrator.`,
            });
            logger.warn(`[RequestCorrections] User ${interaction.user.tag} (${interaction.user.id}) attempted to resolve issue without permission`);
            return;
        }

        logger.info(`[RequestCorrections] Admin ${interaction.user.tag} requested corrections for issue ${issueId}`);

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        await discordApiClient.put(`/discord/orders/${orderId}/status`, {
            status: "IN_PROGRESS",
            changedByDiscordId: interaction.user.id,
            reason: `🔄 Issue Resolution by Admin - Corrections Requested`,
            notes: `Corrections Required:\n${fixInstructions}\n\nRequested by: ${interaction.user.tag}`,
            isAdminOverride: true, 
        });

        logger.info(`[RequestCorrections] Order ${orderId} status updated to IN_PROGRESS`);

        const successEmbed = new EmbedBuilder()
            .setTitle("🔄 Issue Resolved - Corrections Requested")
            .setDescription(
                `The issue has been reviewed and corrections have been requested from the worker.\n\n` +
                `Order #${orderData.orderNumber} status has been updated to **IN PROGRESS**.`
            )
            .addFields([
                { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                { name: "🆔 Issue ID", value: `\`${issueId}\``, inline: true },
                { name: "📊 Resolution", value: "Corrections Requested - Resume Work", inline: false },
                { name: "📝 Correction Instructions", value: fixInstructions.substring(0, 1024), inline: false },
                { name: "✅ Actions Taken", value:
                    "• Issue marked as IN_REVIEW\n" +
                    "• Order status set to IN_PROGRESS\n" +
                    "• Worker notified with fix instructions\n" +
                    "• Customer notified of resolution",
                    inline: false
                },
            ])
            .setColor(0x3498db) 
            .setTimestamp()
            .setFooter({ text: `Resolved by ${interaction.user.tag}` });

        await interaction.editReply({
            embeds: [successEmbed.toJSON() as any],
        });

        try {
            if (orderData.ticketChannelId) {
                const orderChannel = await interaction.client.channels.fetch(orderData.ticketChannelId) as TextChannel;

                const workerNotificationEmbed = new EmbedBuilder()
                    .setTitle("🔄 Issue Resolution - Corrections Required")
                    .setDescription(
                        `<@${orderData.worker.discordId}>, the reported issue has been reviewed by support.\n\n` +
                        `You need to make the following corrections to complete this order:`
                    )
                    .addFields([
                        { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                        { name: "📊 Status", value: "IN PROGRESS - Corrections Required", inline: true },
                        { name: "📝 Required Corrections", value: fixInstructions.substring(0, 1024), inline: false },
                        { name: "⏳ Next Steps", value:
                            "1. Review the fix instructions above\n" +
                            "2. Complete the required fixes\n" +
                            "3. Click **✅ Mark Complete** when done",
                            inline: false
                        },
                    ])
                    .setColor(0x3498db)
                    .setTimestamp()
                    .setFooter({ text: "Support has reviewed this case" });

                await orderChannel.send({
                    content: `<@${orderData.worker.discordId}>`,
                    embeds: [workerNotificationEmbed.toJSON() as any],
                });

                logger.info(`[RequestCorrections] Sent correction instructions to worker in channel ${orderData.ticketChannelId}`);
            }
        } catch (channelError) {
            logger.error(`[RequestCorrections] Failed to send notification to order channel:`, channelError);
        }

        try {
            if (orderData.ticketChannelId) {
                const orderChannel = await interaction.client.channels.fetch(orderData.ticketChannelId) as TextChannel;

                const customerNotificationEmbed = new EmbedBuilder()
                    .setTitle("ℹ️ Issue Update")
                    .setDescription(
                        `<@${orderData.customer.discordId}>, thank you for reporting the issue.\n\n` +
                        `Support has reviewed your case and the worker will make the necessary corrections.`
                    )
                    .addFields([
                        { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                        { name: "📊 Status", value: "IN PROGRESS - Corrections Requested", inline: true },
                        { name: "⏳ Next Steps", value:
                            "The worker will make the requested corrections and resubmit the work.\n" +
                            "You will be notified when the work is ready for review.",
                            inline: false
                        },
                    ])
                    .setColor(0x3498db)
                    .setTimestamp()
                    .setFooter({ text: "Support has reviewed this case" });

                await orderChannel.send({
                    embeds: [customerNotificationEmbed.toJSON() as any],
                });

                logger.info(`[RequestCorrections] Sent update to customer in channel ${orderData.ticketChannelId}`);
            }
        } catch (channelError) {
            logger.error(`[RequestCorrections] Failed to send notification to customer:`, channelError);
        }

        try {
            
            await discordApiClient.put(`/discord/orders/issues/${issueId}`, {
                status: "IN_REVIEW",
                resolution: `🔄 Corrections Requested - Resume Work\n\n${fixInstructions}\n\nRequested by: ${interaction.user.tag}`,
                resolvedByDiscordId: interaction.user.id,
            });

            logger.info(`[RequestCorrections] Marked issue ${issueId} as IN_REVIEW in database`);

            const issuesChannel = await interaction.client.channels.fetch(discordConfig.issuesChannelId);
            if (issuesChannel?.isTextBased()) {
                const issueData = await discordApiClient.get(`/discord/orders/issues/${issueId}`);
                const issue = issueData.data || issueData;

                if (issue.discordMessageId) {
                    const issueMessage = await issuesChannel.messages.fetch(issue.discordMessageId);

                    const updatedEmbed = new EmbedBuilder(issueMessage.embeds[0].data)
                        .setColor(0x3498db) 
                        .setTitle(`🔄 IN REVIEW - ${issueMessage.embeds[0].title}`);

                    updatedEmbed.addFields({
                        name: "🔄 Resolution",
                        value: `**Corrections Requested - Resume Work**\n${fixInstructions}\n\nRequested by: <@${interaction.user.id}>`,
                        inline: false,
                    });

                    await issueMessage.edit({
                        embeds: [updatedEmbed.toJSON() as any],
                        components: [], 
                    });

                    logger.info(`[RequestCorrections] Updated issue message in Discord`);
                }
            }
        } catch (updateError) {
            logger.error(`[RequestCorrections] Failed to update issue:`, updateError);
            
        }

        logger.info(`[RequestCorrections] Resolution completed successfully`);
    } catch (error: any) {
        logger.error("[RequestCorrections] Error processing resolution:", error);

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
            logger.error("[RequestCorrections] Failed to send error message:", replyError);
        }
    }
}
