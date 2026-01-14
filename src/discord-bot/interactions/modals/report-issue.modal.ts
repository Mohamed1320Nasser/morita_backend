import { ModalSubmitInteraction, EmbedBuilder, TextChannel, AnyThreadChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { getIssuesChannelService } from "../../services/issues-channel.service";

export async function handleReportIssueModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderId = interaction.customId.replace("report_issue_", "");
        const issueDescription = interaction.fields.getTextInputValue("issue_description").trim();

        logger.info(`[ReportIssue] Processing issue report for order ${orderId} by customer ${interaction.user.id}`);

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the customer for this order.",
            });
            return;
        }

        const issueResponse = await discordApiClient.post(`/discord/orders/${orderId}/report-issue`, {
            reportedByDiscordId: interaction.user.id,
            issueDescription,
            priority: "MEDIUM",
        });

        const issueData = issueResponse.data || issueResponse;
        logger.info(`[ReportIssue] Issue created: ${issueData.id}, Order ${orderId} marked as DISPUTED`);

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
            .setColor(0xed4245) 
            .setTimestamp()
            .setFooter({ text: "Please wait for support assistance" });

        await interaction.editReply({
            embeds: [customerEmbed.toJSON() as any],
        });

        try {
            const issuesChannelService = getIssuesChannelService(interaction.client);
            const customerUser = interaction.user;
            const workerUser = orderData.worker?.discordId
                ? await interaction.client.users.fetch(orderData.worker.discordId).catch(() => undefined)
                : undefined;
            const orderChannel = interaction.channel instanceof TextChannel ? interaction.channel : undefined;

            const discordMessageId = await issuesChannelService.postIssue(
                issueData,
                orderData,
                customerUser,
                workerUser,
                orderChannel
            );

            logger.info(`[ReportIssue] Posted issue to issues channel with message ID: ${discordMessageId}`);

            if (discordMessageId) {
                await discordApiClient.put(`/discord/orders/issues/${issueData.id}`, {
                    discordMessageId,
                    discordChannelId: discordConfig.issuesChannelId,
                });
                logger.info(`[ReportIssue] Saved Discord message ID to issue ${issueData.id}`);
            }
        } catch (channelError) {
            logger.error(`[ReportIssue] Failed to post to issues channel:`, channelError);
        }

        let parentChannel: TextChannel | null = null;

        if (interaction.channel instanceof TextChannel) {
            parentChannel = interaction.channel;
        } else if (interaction.channel?.isThread()) {
            
            parentChannel = interaction.channel.parent as TextChannel;
        }

        if (parentChannel) {
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

            try {
                
                const disableButtonsInChannel = async (targetChannel: TextChannel | AnyThreadChannel) => {
                    const messages = await targetChannel.messages.fetch({ limit: 50 });

                    const messagesWithButtons = messages.filter(msg =>
                        msg.components.length > 0 &&
                        msg.components.some(row =>
                            row.components.some(comp =>
                                comp.customId?.startsWith(`report_issue_${orderId}`) ||
                                comp.customId?.startsWith(`confirm_complete_${orderId}`)
                            )
                        )
                    );

                    logger.info(`[ReportIssue] Found ${messagesWithButtons.size} messages with buttons in ${targetChannel.name}`);

                    for (const msg of messagesWithButtons.values()) {
                        await msg.edit({
                            components: [], 
                        });
                        logger.info(`[ReportIssue] Disabled buttons on message ${msg.id} in ${targetChannel.name}`);
                    }
                };

                await disableButtonsInChannel(parentChannel);

                const [activeThreads, archivedThreads] = await Promise.all([
                    parentChannel.threads.fetchActive(),
                    parentChannel.threads.fetchArchived({ limit: 10 })
                ]);

                const allThreads = [
                    ...activeThreads.threads.values(),
                    ...archivedThreads.threads.values()
                ];

                for (const thread of allThreads) {
                    if (thread.name.includes(`Order #${orderData.orderNumber}`) ||
                        thread.name.includes(`Completion Review`)) {
                        await disableButtonsInChannel(thread);
                    }
                }
            } catch (err) {
                logger.warn(`[ReportIssue] Could not disable buttons:`, err);
            }

            await parentChannel.send({
                embeds: [disputeEmbed.toJSON() as any],
            });

            logger.info(`[ReportIssue] Sent dispute notification to channel ${parentChannel.id}`);
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
