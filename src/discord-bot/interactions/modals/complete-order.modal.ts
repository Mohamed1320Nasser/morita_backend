import { ModalSubmitInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { notifySupportOrderUpdate } from "../../utils/notification.util";

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

        // Notify support/admin about order completion
        await notifySupportOrderUpdate(interaction.client, {
            orderNumber: orderData.orderNumber,
            orderId,
            status: "AWAITING_CONFIRMATION",
            customer: orderData.customer,
            worker: orderData.worker,
            orderValue: orderData.orderValue,
            action: "work_completed",
            actionBy: interaction.user.id,
            notes: completionNotes || undefined,
        });

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

        // Send DM notification to customer
        try {
            const customerUser = await interaction.client.users.fetch(orderData.customer.discordId);

            const customerDMEmbed = new EmbedBuilder()
                .setTitle("📦 Order Completed - Action Required!")
                .setDescription(
                    `Your Order **#${orderData.orderNumber}** has been marked as complete by the worker!\n\n` +
                    `**Please review the work and confirm completion.**`
                )
                .addFields([
                    { name: "📦 Order Number", value: `#${orderData.orderNumber}`, inline: true },
                    { name: "👷 Worker", value: `${orderData.worker.discordUsername || 'Worker'}`, inline: true },
                    { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                    { name: "📊 Status", value: "🟠 **Awaiting Your Confirmation**", inline: false },
                    {
                        name: "⏰ Next Steps",
                        value:
                            "1. Go to your ticket channel\n" +
                            "2. Review the completion thread\n" +
                            "3. Click **✅ Confirm Complete** if satisfied\n" +
                            "4. Or click **❌ Report Issue** if there's a problem\n\n" +
                            "⚠️ Please respond within 48 hours",
                        inline: false
                    },
                ])
                .setColor(0xf59e0b) // Orange
                .setTimestamp();

            if (completionNotes) {
                customerDMEmbed.addFields([
                    {
                        name: "📝 Completion Notes from Worker",
                        value: completionNotes.substring(0, 1024),
                        inline: false
                    }
                ]);
            }

            await customerUser.send({
                embeds: [customerDMEmbed.toJSON() as any],
            });

            logger.info(`[CompleteOrder] Sent DM notification to customer ${orderData.customer.discordId}`);
        } catch (dmError) {
            logger.warn(`[CompleteOrder] Could not send DM to customer (might have DMs disabled):`, dmError);
            // Don't fail - DM is nice-to-have
        }

        // Update the pinned message in ticket channel
        const channel = interaction.channel;

        // Debug logging
        logger.info(`[CompleteOrder] Channel check: ${!!channel}, TextChannel: ${channel instanceof TextChannel}, pinnedMessageId: ${orderData.pinnedMessageId}`);

        if (channel && channel instanceof TextChannel && orderData.pinnedMessageId) {
            try {
                // Fetch the existing pinned message
                const pinnedMessage = await channel.messages.fetch(orderData.pinnedMessageId);

                // Create updated embed with AWAITING_CONFIRM status (NO BUTTONS, NO PAYOUT DETAILS)
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`📦 ORDER #${orderData.orderNumber} - ⚠️ AWAITING CONFIRMATION`)
                    .setDescription(
                        `The worker has marked this order as complete.\n` +
                        `Customer is reviewing the work.`
                    )
                    .addFields([
                        { name: "👤 Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                        { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                        { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                        { name: "📊 Status", value: "🟠 **AWAITING CONFIRMATION**", inline: false },
                    ])
                    .setColor(0xf59e0b) // Orange for attention
                    .setTimestamp();

                if (completionNotes) {
                    updatedEmbed.addFields([
                        {
                            name: "📝 Completion Notes",
                            value: completionNotes.substring(0, 1024),
                            inline: false
                        }
                    ]);
                }

                // Update the pinned message (NO BUTTONS - just status update)
                await pinnedMessage.edit({
                    content: ``,
                    embeds: [updatedEmbed.toJSON() as any],
                    components: [], // Remove all buttons
                });

                logger.info(`[CompleteOrder] Updated pinned message ${orderData.pinnedMessageId}`);

                // Create thread and send messages inside it
                try {
                    // Create thread from the channel
                    const thread = await channel.threads.create({
                        name: `Order #${orderData.orderNumber} - Completion Review`,
                        autoArchiveDuration: 1440, // 24 hours (increased from 60 min)
                        reason: 'Order completion review thread',
                        type: 11, // Public thread
                    });

                    // MESSAGE 1: Order information (NO BUTTONS)
                    const orderInfoEmbed = new EmbedBuilder()
                        .setTitle(`📦 Order #${orderData.orderNumber} Completed`)
                        .setDescription(
                            `<@${orderData.customer.discordId}>, the worker has finished your order!`
                        )
                        .addFields([
                            { name: "👤 Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                            { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                            { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                            { name: "📊 Status", value: "🟠 **Awaiting Your Confirmation**", inline: false },
                        ])
                        .setColor(0xf59e0b)
                        .setTimestamp();

                    if (completionNotes) {
                        orderInfoEmbed.addFields([
                            {
                                name: "📝 Completion Notes from Worker",
                                value: completionNotes.substring(0, 1024),
                                inline: false
                            }
                        ]);
                    }

                    await thread.send({
                        content: `🔔 <@${orderData.customer.discordId}>`,
                        embeds: [orderInfoEmbed.toJSON() as any],
                    });

                    // MESSAGE 2: Action buttons
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

                    await thread.send({
                        content: `**Please review the work and take action:**`,
                        components: [buttonRow.toJSON() as any],
                    });

                    logger.info(`[CompleteOrder] Created thread with order info and action buttons`);
                } catch (threadError) {
                    logger.warn(`[CompleteOrder] Could not create thread:`, threadError);
                    // Thread creation is optional, don't fail
                }

            } catch (err) {
                logger.error(`[CompleteOrder] Failed to update pinned message ${orderData.pinnedMessageId}:`, err);
                logger.warn(`[CompleteOrder] Attempting fallback message for order ${orderId}...`);
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
        } else {
            // No pinned message ID found - send new message
            logger.warn(`[CompleteOrder] No pinnedMessageId found for order ${orderId}, sending new message`);
            if (channel && channel instanceof TextChannel) {
                const customerEmbed = new EmbedBuilder()
                    .setTitle("📦 ORDER COMPLETION NOTIFICATION")
                    .setDescription(
                        `<@${orderData.customer.discordId}>, your order has been marked as complete!\n\n` +
                        `**Please verify the work and confirm completion.**`
                    )
                    .addFields([
                        { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                        { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                        { name: "💰 Order Value", value: `$${parseFloat(orderData.orderValue).toFixed(2)} USD`, inline: true },
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

                const infoButton = new ButtonBuilder()
                    .setCustomId(`order_info_${orderId}`)
                    .setLabel("📊 Order Details")
                    .setStyle(ButtonStyle.Primary);

                const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(confirmButton, issueButton, infoButton);

                await channel.send({
                    content: `🔔 <@${orderData.customer.discordId}> **ACTION REQUIRED** - Please confirm order completion!`,
                    embeds: [customerEmbed.toJSON() as any],
                    components: [buttonRow.toJSON() as any],
                });

                logger.info(`[CompleteOrder] Sent new notification message (no pinned message found)`);
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
