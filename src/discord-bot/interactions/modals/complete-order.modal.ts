import { ModalSubmitInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import { discordApiClient } from "../../clients/DiscordApiClient";

/**
 * Handle order completion modal submission
 */
export async function handleCompleteOrderModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from customId: complete_order_{orderId}
        const orderId = interaction.customId.replace("complete_order_", "");

        // Get form inputs
        const confirmationText = interaction.fields.getTextInputValue("confirmation_text").trim().toUpperCase();
        const completionNotes = interaction.fields.getTextInputValue("completion_notes")?.trim() || null;

        // Validate confirmation
        if (confirmationText !== "COMPLETE") {
            await interaction.editReply({
                content: `❌ Invalid confirmation. You typed "${confirmationText}" but must type "COMPLETE" exactly.`,
            });
            return;
        }

        logger.info(`[CompleteOrder] Processing completion for order ${orderId} by worker ${interaction.user.id}`);

        // Get order details
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        // HttpClient interceptor already unwrapped one level
        const orderData = orderResponse.data || orderResponse;

        // Validate worker
        if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the assigned worker for this order.",
            });
            return;
        }

        // Mark order as complete (AWAITING_CONFIRMATION)
        const completeResponse: any = await discordApiClient.put(`/discord/orders/${orderId}/complete`, {
            workerDiscordId: interaction.user.id,
            completionNotes,
        });

        // HttpClient interceptor already unwrapped one level
        const completedOrder = completeResponse.data || completeResponse;

        logger.info(`[CompleteOrder] Order ${orderId} marked as complete, awaiting customer confirmation`);

        // Calculate payout amounts
        const orderValue = parseFloat(orderData.orderValue);
        const workerPayout = orderValue * 0.8; // 80%
        const supportPayout = orderValue * 0.05; // 5%
        const systemPayout = orderValue * 0.15; // 15%

        // Send confirmation to worker
        const workerEmbed = new EmbedBuilder()
            .setTitle("✅ Order Marked as Complete")
            .setDescription(
                `You've successfully marked Order #${orderData.orderNumber} as complete!\n\n` +
                `The customer has been notified and will now review your work.`
            )
            .addFields([
                { name: "💰 Your Payout (pending)", value: `$${workerPayout.toFixed(2)} USD (80%)`, inline: true },
                { name: "📊 Status", value: "🟠 AWAITING CONFIRMATION", inline: true },
                { name: "⏳ Next Step", value: "Customer must confirm completion", inline: false },
            ])
            .setColor(0xf59e0b) // Orange for pending
            .setTimestamp();

        if (completionNotes) {
            workerEmbed.addFields([
                { name: "📝 Your Notes", value: completionNotes.substring(0, 1024), inline: false }
            ]);
        }

        await interaction.editReply({
            embeds: [workerEmbed.toJSON() as any],
        });

        // Update the pinned message in ticket channel
        const channel = interaction.channel;
        if (channel && channel instanceof TextChannel && orderData.pinnedMessageId) {
            try {
                // Fetch the existing pinned message
                const pinnedMessage = await channel.messages.fetch(orderData.pinnedMessageId);

                // Create updated embed with AWAITING_CONFIRM status
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`📦 ORDER #${orderData.orderNumber} - ⚠️ AWAITING CONFIRMATION`)
                    .setDescription(
                        `**<@${orderData.customer.discordId}>, please confirm order completion!**\n\n` +
                        `The worker has marked this order as complete. Please review and confirm.`
                    )
                    .addFields([
                        { name: "👤 Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                        { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                        { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                        { name: "📊 Status", value: "🟠 **AWAITING YOUR CONFIRMATION**", inline: false },
                        {
                            name: "💸 Pending Payout Distribution",
                            value:
                                `✅ Worker will receive: $${workerPayout.toFixed(2)} USD (80%)\n` +
                                `✅ Support will receive: $${supportPayout.toFixed(2)} USD (5%)\n` +
                                `✅ System fee: $${systemPayout.toFixed(2)} USD (15%)\n` +
                                `🔄 Worker deposit: $${orderData.depositAmount.toFixed(2)} USD (returned)`,
                            inline: false
                        },
                    ])
                    .setColor(0xf59e0b) // Orange for attention
                    .setTimestamp();

                if (completionNotes) {
                    updatedEmbed.addFields([
                        {
                            name: "📝 Completion Notes from Worker",
                            value: completionNotes.substring(0, 1024),
                            inline: false
                        }
                    ]);
                }

                // Create action buttons for customer
                const confirmButton = new ButtonBuilder()
                    .setCustomId(`confirm_complete_${orderId}`)
                    .setLabel("✅ Confirm Complete")
                    .setStyle(ButtonStyle.Success);

                const issueButton = new ButtonBuilder()
                    .setCustomId(`report_issue_${orderId}`)
                    .setLabel("❌ Report Issue")
                    .setStyle(ButtonStyle.Danger);

                const infoButton = new ButtonBuilder()
                    .setCustomId(`order_info_${orderId}`)
                    .setLabel("📊 Order Details")
                    .setStyle(ButtonStyle.Primary);

                const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(confirmButton, issueButton, infoButton);

                // Update the pinned message
                await pinnedMessage.edit({
                    content: `🔔 <@${orderData.customer.discordId}> **ACTION REQUIRED** - Please confirm order completion!`,
                    embeds: [updatedEmbed.toJSON() as any],
                    components: [buttonRow.toJSON() as any],
                });

                logger.info(`[CompleteOrder] Updated pinned message ${orderData.pinnedMessageId}`);

                // Create a thread for completion discussion (optional but nice)
                try {
                    const thread = await pinnedMessage.startThread({
                        name: `Order #${orderData.orderNumber} - Completion Review`,
                        autoArchiveDuration: 60, // 1 hour
                        reason: 'Order completion review thread'
                    });

                    await thread.send({
                        content: `<@${orderData.customer.discordId}>`,
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(
                                    `**Worker has completed the order!**\n\n` +
                                    `Please review the work and use the buttons above to:\n` +
                                    `✅ **Confirm Complete** if satisfied\n` +
                                    `❌ **Report Issue** if there are problems\n\n` +
                                    `If you have questions, reply in this thread.`
                                )
                                .setColor(0xf59e0b)
                                .toJSON() as any
                        ]
                    });

                    logger.info(`[CompleteOrder] Created completion review thread`);
                } catch (threadError) {
                    logger.warn(`[CompleteOrder] Could not create thread:`, threadError);
                    // Thread creation is optional, don't fail
                }

            } catch (err) {
                logger.error(`[CompleteOrder] Failed to update pinned message:`, err);
                // Fallback: send new message if update fails
                const customerEmbed = new EmbedBuilder()
                    .setTitle("📦 ORDER COMPLETION NOTIFICATION")
                    .setDescription(
                        `<@${orderData.customer.discordId}>, your order has been marked as complete!\n\n` +
                        `**Please verify the work and confirm completion.**`
                    )
                    .addFields([
                        { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                        { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                        { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                        { name: "📊 Status", value: "🟠 AWAITING YOUR CONFIRMATION", inline: false },
                    ])
                    .setColor(0xf59e0b);

                if (completionNotes) {
                    customerEmbed.addFields([
                        { name: "📝 Completion Notes", value: completionNotes.substring(0, 1024), inline: false }
                    ]);
                }

                const confirmButton = new ButtonBuilder()
                    .setCustomId(`confirm_complete_${orderId}`)
                    .setLabel("✅ Confirm Complete")
                    .setStyle(ButtonStyle.Success);

                const issueButton = new ButtonBuilder()
                    .setCustomId(`report_issue_${orderId}`)
                    .setLabel("❌ Report Issue")
                    .setStyle(ButtonStyle.Danger);

                const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(confirmButton, issueButton);

                await channel.send({
                    content: `<@${orderData.customer.discordId}>`,
                    embeds: [customerEmbed.toJSON() as any],
                    components: [buttonRow.toJSON() as any],
                });

                logger.info(`[CompleteOrder] Sent fallback notification message`);
            }
        }

        logger.info(`[CompleteOrder] Order ${orderId} completion flow initiated successfully`);
    } catch (error: any) {
        logger.error("[CompleteOrder] Error processing completion modal:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to mark order as complete**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to mark order as complete**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[CompleteOrder] Failed to send error message:", replyError);
        }
    }
}
