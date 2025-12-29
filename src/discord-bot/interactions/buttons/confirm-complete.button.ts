import { ButtonInteraction, EmbedBuilder, TextChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";

/**
 * Handle "Confirm Complete" button click (customer confirms order completion)
 */
export async function handleConfirmCompleteButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from button customId: confirm_complete_{orderId}
        const orderId = interaction.customId.replace("confirm_complete_", "");

        logger.info(`[ConfirmComplete] Customer ${interaction.user.id} confirming order ${orderId}`);

        // Get order details first
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        // HttpClient interceptor already unwrapped one level
        const orderData = orderResponse.data || orderResponse;

        // Validate customer is the one who placed this order
        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the customer for this order.",
            });
            return;
        }

        // Validate order status
        if (orderData.status !== "AWAITING_CONFIRMATION" && orderData.status !== "AWAITING_CONFIRM") {
            await interaction.editReply({
                content: `❌ Order cannot be confirmed. Current status: ${orderData.status}`,
            });
            return;
        }

        // Confirm order completion (triggers payout)
        const confirmResponse: any = await discordApiClient.put(`/discord/orders/${orderId}/confirm`, {
            customerDiscordId: interaction.user.id,
        });

        // HttpClient interceptor already unwrapped one level
        const confirmedOrder = confirmResponse.data || confirmResponse;

        logger.info(`[ConfirmComplete] Order ${orderId} confirmed, payouts triggered`);

        // Calculate payout amounts for display
        const orderValue = parseFloat(orderData.orderValue);
        const workerPayout = orderValue * 0.8; // 80%
        const supportPayout = orderValue * 0.05; // 5%
        const systemPayout = orderValue * 0.15; // 15%

        // Send confirmation to customer (ephemeral) with review button
        const customerEmbed = new EmbedBuilder()
            .setTitle("✅ Order Confirmed!")
            .setDescription(
                `Thank you for confirming completion of Order #${orderData.orderNumber}!\n\n` +
                `Payouts have been automatically distributed.`
            )
            .addFields([
                { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                { name: "📊 Status", value: "✅ COMPLETED", inline: true },
                {
                    name: "💸 Payout Distribution",
                    value:
                        `• 👷 Worker: $${workerPayout.toFixed(2)} (80%)\n` +
                        `• 🎧 Support: $${supportPayout.toFixed(2)} (5%)\n` +
                        `• 🏢 System: $${systemPayout.toFixed(2)} (15%)`,
                    inline: false,
                },
                {
                    name: "⭐ Rate Your Experience",
                    value: "Please take a moment to rate this order!",
                    inline: false,
                },
            ])
            .setColor(0x57f287) // Green for success
            .setTimestamp()
            .setFooter({ text: "Thank you for your business!" });

        // Add review button
        const reviewButton = new ButtonBuilder()
            .setCustomId(`leave_review_${orderId}`)
            .setLabel("⭐ Leave Review")
            .setStyle(ButtonStyle.Primary);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(reviewButton);

        await interaction.editReply({
            embeds: [customerEmbed.toJSON() as any],
            components: [buttonRow.toJSON() as any],
        });

        // Send celebration DM to customer
        try {
            const customerUser = await interaction.client.users.fetch(orderData.customer.discordId);

            const celebrationEmbed = new EmbedBuilder()
                .setTitle("🎉 Order Completed Successfully!")
                .setDescription(
                    `Thank you for confirming completion of your order!\n\n` +
                    `We hope you're satisfied with the service.`
                )
                .addFields([
                    { name: "📦 Order Number", value: `#${orderData.orderNumber}`, inline: true },
                    { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                    { name: "📊 Status", value: "✅ COMPLETED", inline: true },
                    { name: "👷 Worker", value: `${orderData.worker.discordUsername || 'Worker'}`, inline: false },
                    {
                        name: "🌟 What's Next?",
                        value:
                            "• Please rate your experience in the ticket!\n" +
                            "• Use `/close-ticket` when you're done\n" +
                            "• All payouts have been processed\n" +
                            "• Feel free to place another order anytime!",
                        inline: false
                    },
                ])
                .setColor(0x57f287) // Green
                .setTimestamp()
                .setFooter({
                    text: "Thank you for choosing our service! ❤️"
                });

            if (orderData.completionNotes) {
                celebrationEmbed.addFields([
                    {
                        name: "📝 Final Notes from Worker",
                        value: orderData.completionNotes.substring(0, 1024),
                        inline: false
                    }
                ]);
            }

            await customerUser.send({
                embeds: [celebrationEmbed.toJSON() as any],
            });

            logger.info(`[ConfirmComplete] Sent celebration DM to customer`);
        } catch (dmError) {
            logger.warn(`[ConfirmComplete] Could not send DM to customer (might have DMs disabled):`, dmError);
            // Don't fail - DM is nice-to-have
        }

        // Update the pinned message in ticket channel
        const channel = interaction.channel;
        if (channel && channel instanceof TextChannel && orderData.pinnedMessageId) {
            try {
                // Fetch the pinned message
                const pinnedMessage = await channel.messages.fetch(orderData.pinnedMessageId);

                // Create completion embed
                const completionEmbed = new EmbedBuilder()
                    .setTitle(`📦 ORDER #${orderData.orderNumber} - ✅ COMPLETED`)
                    .setDescription(
                        `This order has been successfully completed and confirmed!\n\n` +
                        `Payouts have been automatically distributed.`
                    )
                    .addFields([
                        { name: "👤 Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                        { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                        { name: "💰 Total Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                        { name: "📊 Final Status", value: "✅ **COMPLETED & PAID**", inline: false },
                        {
                            name: "💸 Payouts Processed",
                            value:
                                `✅ Worker received: $${workerPayout.toFixed(2)} USD (80%)\n` +
                                `✅ Support received: $${supportPayout.toFixed(2)} USD (5%)\n` +
                                `✅ System collected: $${systemPayout.toFixed(2)} USD (15%)\n` +
                                `🔄 Deposit returned: $${orderData.depositAmount.toFixed(2)} USD`,
                            inline: false,
                        },
                    ])
                    .setColor(0x57f287) // Green
                    .setTimestamp()
                    .setFooter({ text: `Order #${orderData.orderNumber} • Completed` });

                if (orderData.completionNotes) {
                    completionEmbed.addFields([
                        {
                            name: "📝 Completion Notes",
                            value: orderData.completionNotes.substring(0, 1024),
                            inline: false
                        }
                    ]);
                }

                // Update pinned message - NO BUTTONS (completed)
                await pinnedMessage.edit({
                    content: `✅ Order completed and confirmed by <@${orderData.customer.discordId}>`,
                    embeds: [completionEmbed.toJSON() as any],
                    components: [], // Remove all buttons
                });

                logger.info(`[ConfirmComplete] Updated pinned message to completion status`);

                // Send a simple celebration message in channel
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(
                                `🎉 **Order #${orderData.orderNumber} Complete!**\n\n` +
                                `Thank you <@${orderData.customer.discordId}> for confirming!\n` +
                                `Great work <@${orderData.worker.discordId}>!`
                            )
                            .setColor(0x57f287)
                            .toJSON() as any
                    ]
                });

            } catch (err) {
                logger.error(`[ConfirmComplete] Failed to update pinned message:`, err);
            }
        }

        // REMOVED: Auto-close ticket (now manual via /close-ticket command)
        // Ticket will remain open for customer to review and close manually
        logger.info(`[ConfirmComplete] Order ${orderId} completion flow finished successfully. Ticket remains open for customer review.`);
    } catch (error: any) {
        logger.error("[ConfirmComplete] Error confirming order completion:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to confirm order**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to confirm order**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[ConfirmComplete] Failed to send error message:", replyError);
        }
    }
}
