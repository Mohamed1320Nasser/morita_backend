import {
    Client,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    TextChannel,
    User,
    ThreadChannel,
} from "discord.js";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { getOrderChannelService } from "../services/orderChannel.service";
import { notifySupportOrderUpdate } from "./notification.util";
import { getCompletedOrdersChannelService } from "../services/completed-orders-channel.service";

export async function startWorkOnOrder(
    client: Client,
    orderId: string,
    orderData: any,
    workerDiscordId: string
): Promise<{
    success: boolean;
    ephemeralEmbed: EmbedBuilder;
    completeButton: ActionRowBuilder<ButtonBuilder>;
}> {
    logger.info(`[StartWorkUtil] Worker ${workerDiscordId} starting work on order #${orderData.orderNumber}`);

    await discordApiClient.put(`/discord/orders/${orderId}/status`, {
        status: "IN_PROGRESS",
        workerDiscordId,
        reason: `Worker started work on Order #${orderData.orderNumber}`,
    });

    const ephemeralEmbed = new EmbedBuilder()
        .setColor(0x57f287) 
        .setTitle("✅ 🚀 Work Started")
        .setDescription(`✅ You've started work on Order #${orderData.orderNumber}!`)
        .addFields([
            { name: "📊 Status", value: "The order status has been updated to **IN PROGRESS**.", inline: false },
            { name: "ℹ️ Next Step", value: "Click **✅ Mark Complete** below when you finish the work.", inline: false }
        ])
        .setTimestamp()
        .setFooter({ text: "Good luck with the job!" });

    const completeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`mark_complete_${orderId}`)
            .setLabel("✅ Mark Complete")
            .setStyle(ButtonStyle.Success)
    );

    // Use ticketChannelId (DB field) - also check discordChannelId for backwards compatibility
    const channelId = orderData.ticketChannelId || orderData.discordChannelId;
    logger.info(`[StartWorkUtil] ticketChannelId: ${channelId}`);

    if (channelId) {
        try {
            const orderChannelService = getOrderChannelService(client);
            await orderChannelService.updateOrderMessageStatus(
                channelId,
                orderData.orderNumber,
                orderId,
                "IN_PROGRESS",
                {
                    customerDiscordId: orderData.customer.discordId,
                    workerDiscordId: orderData.worker.discordId,
                    orderValue: parseFloat(orderData.orderValue),
                    depositAmount: parseFloat(orderData.depositAmount),
                    currency: orderData.currency || "USD",
                    serviceName: orderData.service?.name,
                    jobDetails: orderData.jobDetails?.description,
                }
            );
        } catch (updateError) {
            logger.error("[StartWorkUtil] Failed to update pinned message:", updateError);
        }

        try {
            const orderChannel = await client.channels.fetch(channelId) as TextChannel;

            // Create public "Work Started" embed with Mark Complete button
            const publicEmbed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("🚀 Work Started")
                .setDescription(
                    `<@${workerDiscordId}> has started work on Order #${orderData.orderNumber}!\n\n` +
                    `**Status:** IN PROGRESS`
                )
                .addFields([
                    { name: "ℹ️ Next Step", value: "Worker: Click **Mark Complete** below when you finish the work.", inline: false }
                ])
                .setTimestamp()
                .setFooter({ text: `Order #${orderData.orderNumber}` });

            const markCompleteButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mark_complete_${orderId}`)
                    .setLabel("✅ Mark Complete")
                    .setStyle(ButtonStyle.Success)
            );

            await orderChannel.send({
                content: `<@${orderData.customer.discordId}> <@${workerDiscordId}>`,
                embeds: [publicEmbed.toJSON() as any],
                components: [markCompleteButton.toJSON() as any],
            });
            logger.info(`[StartWorkUtil] Sent public Work Started message to channel ${channelId}`);
        } catch (channelError) {
            logger.error("[StartWorkUtil] Failed to send public message:", channelError);
        }
    } else {
        logger.warn(`[StartWorkUtil] No ticketChannelId found for order #${orderData.orderNumber}`);
    }

    await notifySupportOrderUpdate(client, {
        orderNumber: orderData.orderNumber,
        orderId,
        status: "IN_PROGRESS",
        customer: orderData.customer,
        worker: orderData.worker,
        orderValue: orderData.orderValue,
        action: "work_started",
        actionBy: workerDiscordId,
    });

    logger.info(`[StartWorkUtil] Successfully started work on order #${orderData.orderNumber}`);

    return {
        success: true,
        ephemeralEmbed,
        completeButton,
    };
}

export async function completeWorkOnOrder(
    client: Client,
    orderId: string,
    orderData: any,
    workerDiscordId: string,
    completionNotes?: string,
    orderChannel?: TextChannel,
    completionScreenshots?: string[]
): Promise<{
    success: boolean;
    workerEmbed: EmbedBuilder;
}> {
    logger.info(`[CompleteWorkUtil] Worker ${workerDiscordId} completing order #${orderData.orderNumber}`);
    logger.info(`[CompleteWorkUtil] Screenshots provided: ${completionScreenshots?.length || 0}`);

    const completeResponse: any = await discordApiClient.put(`/discord/orders/${orderId}/complete`, {
        workerDiscordId,
        completionNotes,
        completionScreenshots,
    });

    const completedOrder = completeResponse.data || completeResponse;
    const orderValue = parseFloat(orderData.orderValue);

    const workerEmbed = new EmbedBuilder()
        .setTitle("✅ Work Completed!")
        .setDescription(`You've marked Order #${orderData.orderNumber} as complete!`)
        .addFields([
            { name: "📊 Previous Status", value: "In Progress", inline: true },
            { name: "📊 New Status", value: "Awaiting Confirmation", inline: true },
        ])
        .addFields([
            { name: "⏳ Next Step", value: "Waiting for customer to confirm completion", inline: false },
        ])
        .setColor(0xf59e0b) 
        .setTimestamp();

    if (orderChannel) {
        try {
            // Update pinned message if exists
            if (orderData.pinnedMessageId) {
                try {
                    const pinnedMessage = await orderChannel.messages.fetch(orderData.pinnedMessageId);

                    const updatedEmbed = new EmbedBuilder()
                        .setTitle(`📦 Order #${orderData.orderNumber} - Awaiting Confirmation`)
                        .setDescription(`The worker has marked this order as complete.`)
                        .addFields([
                            { name: "👤 Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                            { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                            { name: "📊 Status", value: "🟠 **AWAITING CONFIRMATION**", inline: true },
                        ])
                        .setColor(0xf59e0b)
                        .setTimestamp();

                    if (completionNotes) {
                        updatedEmbed.addFields([
                            { name: "📝 Completion Notes", value: completionNotes.substring(0, 1024), inline: false }
                        ]);
                    }

                    await pinnedMessage.edit({
                        embeds: [updatedEmbed.toJSON() as any],
                        components: [],
                    });

                    logger.info(`[CompleteWorkUtil] Updated pinned message ${orderData.pinnedMessageId}`);
                } catch (pinnedError) {
                    logger.error("[CompleteWorkUtil] Failed to update pinned message:", pinnedError);
                }
            }

            // Send completion message in main channel (no thread)
            const completionEmbed = new EmbedBuilder()
                .setTitle(`✅ Order #${orderData.orderNumber} - Work Completed`)
                .setDescription(`The worker has finished your order!\n\nPlease review and confirm below.`)
                .addFields([
                    { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                    { name: "📊 Status", value: "🟠 Awaiting Confirmation", inline: true },
                ])
                .setColor(0xf59e0b)
                .setTimestamp();

            if (completionNotes) {
                completionEmbed.addFields([
                    { name: "📝 Worker Notes", value: completionNotes.substring(0, 1024), inline: false }
                ]);
            }

            // Note: Screenshots are NOT shown in completion message
            // They will be displayed in the completed-orders channel after confirmation

            const confirmButton = new ButtonBuilder()
                .setCustomId(`confirm_complete_${orderId}`)
                .setLabel("Confirm Complete")
                .setStyle(ButtonStyle.Success);

            const issueButton = new ButtonBuilder()
                .setCustomId(`report_issue_${orderId}`)
                .setLabel("Report Issue")
                .setStyle(ButtonStyle.Danger);

            const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(confirmButton, issueButton);

            // Send completion message (no screenshots - they show in completed-orders channel)
            await orderChannel.send({
                content: `<@${orderData.customer.discordId}>`,
                embeds: [completionEmbed.toJSON() as any],
                components: [buttonRow.toJSON() as any],
            });

            logger.info(`[CompleteWorkUtil] Sent completion message to main channel`);
        } catch (channelError) {
            logger.error("[CompleteWorkUtil] Failed to send channel messages:", channelError);
        }
    }

    await notifySupportOrderUpdate(client, {
        orderNumber: orderData.orderNumber,
        orderId,
        status: "AWAITING_CONFIRMATION",
        customer: orderData.customer,
        worker: orderData.worker,
        orderValue: orderData.orderValue,
        action: "work_completed",
        actionBy: workerDiscordId,
        notes: completionNotes,
    });

    // Send DM to customer notifying them that work is complete
    try {
        if (!orderData.customer?.discordId) {
            logger.warn(`[CompleteWorkUtil] No customer discordId found for order #${orderData.orderNumber}`);
        } else {
            logger.info(`[CompleteWorkUtil] Sending DM to customer ${orderData.customer.discordId}...`);
        }

        const customerUser = await client.users.fetch(orderData.customer.discordId);

        // Build channel link if available
        const channelLink = orderData.discordChannelId
            ? `<#${orderData.discordChannelId}>`
            : "your ticket channel";

        const customerDmEmbed = new EmbedBuilder()
            .setTitle("🎉 Your Order is Ready!")
            .setDescription(
                `Great news! The worker has completed your order.\n\n` +
                `Please review the work and confirm if everything looks good.`
            )
            .addFields([
                { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                { name: "💰 Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                { name: "📊 Status", value: "Awaiting Your Confirmation", inline: true },
            ])
            .addFields([
                {
                    name: "📋 What to do next",
                    value:
                        `1. Go to ${channelLink}\n` +
                        "2. Click **Confirm Complete** if satisfied\n" +
                        "3. Or click **Report Issue** if there's a problem",
                    inline: false
                },
            ])
            .setColor(0xf59e0b)
            .setTimestamp()
            .setFooter({ text: "Thank you for choosing our service!" });

        if (completionNotes) {
            customerDmEmbed.addFields([
                { name: "📝 Notes from Worker", value: completionNotes.substring(0, 1024), inline: false }
            ]);
        }

        await customerUser.send({
            embeds: [customerDmEmbed.toJSON() as any],
        });

        logger.info(`[CompleteWorkUtil] Sent DM to customer ${orderData.customer.discordId}`);
    } catch (dmError) {
        logger.warn(`[CompleteWorkUtil] Could not send DM to customer:`, dmError);
    }

    logger.info(`[CompleteWorkUtil] Successfully completed work on order #${orderData.orderNumber}`);

    return {
        success: true,
        workerEmbed,
    };
}

export async function confirmOrderCompletion(
    client: Client,
    orderId: string,
    orderData: any,
    confirmedByDiscordId: string,
    feedback?: string,
    orderChannel?: TextChannel,
    sendReviewRequest: boolean = false,
    reviewThread?: ThreadChannel
): Promise<{
    success: boolean;
    customerEmbed: EmbedBuilder;
}> {
    logger.info(`[ConfirmOrderUtil] Confirming order #${orderData.orderNumber} by ${confirmedByDiscordId}`);

    const orderValue = parseFloat(orderData.orderValue);
    const workerPayout = orderValue * 0.8; 

    const customerEmbed = new EmbedBuilder()
        .setTitle("✅ Order Confirmed!")
        .setDescription(
            `Order #${orderData.orderNumber} has been confirmed as complete!\n\n` +
            `All payouts have been processed successfully.`
        )
        .addFields([
            { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
            { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
            { name: "📊 Status", value: "✅ COMPLETED", inline: true },
        ])
        .setColor(0x57f287) 
        .setTimestamp()
        .setFooter({ text: "Thank you for your business!" });

    if (orderChannel && orderData.pinnedMessageId) {
        try {
            const pinnedMessage = await orderChannel.messages.fetch(orderData.pinnedMessageId);

            const completionEmbed = new EmbedBuilder()
                .setTitle(`📦 ORDER #${orderData.orderNumber} - ✅ COMPLETED`)
                .setDescription(
                    `This order has been successfully completed and confirmed!\n\n` +
                    `All payouts have been processed.`
                )
                .addFields([
                    { name: "👤 Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                    { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                    { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                    { name: "📊 Final Status", value: "✅ **COMPLETED & PAID**", inline: false },
                ])
                .setColor(0x57f287)
                .setTimestamp()
                .setFooter({ text: `Order #${orderData.orderNumber} • Completed` });

            if (orderData.completionNotes) {
                completionEmbed.addFields([
                    { name: "📝 Completion Notes", value: orderData.completionNotes.substring(0, 1024), inline: false }
                ]);
            }

            if (feedback) {
                completionEmbed.addFields([
                    { name: "💬 Feedback", value: feedback.substring(0, 1024), inline: false }
                ]);
            }

            await pinnedMessage.edit({
                content: `✅ Order completed and confirmed`,
                embeds: [completionEmbed.toJSON() as any],
                components: [], 
            });

            logger.info(`[ConfirmOrderUtil] Updated pinned message ${orderData.pinnedMessageId}`);
        } catch (pinnedError) {
            logger.error("[ConfirmOrderUtil] Failed to update pinned message:", pinnedError);
        }
    }

    // Send combined completion + review message to channel
    if (orderChannel && sendReviewRequest) {
        try {
            const completionWithReviewEmbed = new EmbedBuilder()
                .setTitle("🎉 Order #" + orderData.orderNumber + " Complete!")
                .setDescription(
                    `Thank you for your business!\n` +
                    `Great work <@${orderData.worker.discordId}>!\n\n` +
                    `Please take a moment to rate your experience.`
                )
                .addFields([
                    { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                    { name: "💡 Tip", value: "Your feedback helps us maintain quality service!", inline: false },
                ])
                .setColor(0x57f287)
                .setTimestamp();

            const publicReviewButton = new ButtonBuilder()
                .setCustomId(`public_review_${orderId}`)
                .setLabel("Public Review")
                .setStyle(ButtonStyle.Success);

            const anonymousReviewButton = new ButtonBuilder()
                .setCustomId(`anonymous_review_${orderId}`)
                .setLabel("Anonymous Review")
                .setStyle(ButtonStyle.Secondary);

            const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(publicReviewButton, anonymousReviewButton);

            await orderChannel.send({
                content: `<@${orderData.customer.discordId}>`,
                embeds: [completionWithReviewEmbed.toJSON() as any],
                components: [buttonRow.toJSON() as any],
            });

            logger.info(`[ConfirmOrderUtil] Sent combined completion + review message to order channel`);
        } catch (channelError) {
            logger.error("[ConfirmOrderUtil] Failed to send completion message:", channelError);
        }
    } else if (orderChannel) {
        // Just send completion message without review buttons
        try {
            await orderChannel.send({
                content: `<@${orderData.customer.discordId}>`,
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🎉 Order #" + orderData.orderNumber + " Complete!")
                        .setDescription(
                            `Thank you for your business!\n` +
                            `Great work <@${orderData.worker.discordId}>!`
                        )
                        .setColor(0x57f287)
                        .toJSON() as any
                ]
            });

            logger.info(`[ConfirmOrderUtil] Sent celebration message to order channel`);
        } catch (channelError) {
            logger.error("[ConfirmOrderUtil] Failed to send celebration message:", channelError);
        }
    }

    try {
        const customerUser = await client.users.fetch(orderData.customer.discordId);

        const celebrationEmbed = new EmbedBuilder()
            .setTitle("🎉 Order Completed Successfully!")
            .setDescription(
                `Order #${orderData.orderNumber} has been confirmed as complete!\n\n` +
                `We hope you're satisfied with the service.`
            )
            .addFields([
                { name: "📦 Order Number", value: `#${orderData.orderNumber}`, inline: true },
                { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                { name: "📊 Status", value: "✅ COMPLETED", inline: true },
                { name: "👷 Worker", value: `${orderData.worker.fullname || 'Worker'}`, inline: false },
                {
                    name: "🌟 What's Next?",
                    value:
                        "• Please rate your experience!\n" +
                        "• All payouts have been processed\n" +
                        "• Feel free to place another order anytime!",
                    inline: false
                },
            ])
            .setColor(0x57f287)
            .setTimestamp()
            .setFooter({ text: "Thank you for choosing our service! ❤️" });

        if (orderData.completionNotes) {
            celebrationEmbed.addFields([
                { name: "📝 Final Notes from Worker", value: orderData.completionNotes.substring(0, 1024), inline: false }
            ]);
        }

        await customerUser.send({
            embeds: [celebrationEmbed.toJSON() as any],
        });

        logger.info(`[ConfirmOrderUtil] Sent celebration DM to customer`);
    } catch (dmError) {
        logger.warn(`[ConfirmOrderUtil] Could not send DM to customer:`, dmError);
    }

    try {
        const workerUser = await client.users.fetch(orderData.worker.discordId);

        const workerCelebrationEmbed = new EmbedBuilder()
            .setTitle("🎉 Payment Received!")
            .setDescription(
                `Great news! Order #${orderData.orderNumber} has been confirmed as complete.\n\n` +
                `Your payment has been processed!`
            )
            .addFields([
                { name: "📦 Order Number", value: `#${orderData.orderNumber}`, inline: true },
                { name: "💰 Your Earnings", value: `$${workerPayout.toFixed(2)} USD`, inline: true },
                { name: "📊 Status", value: "✅ PAID", inline: true },
                {
                    name: "✅ Payment Details",
                    value:
                        `• Order value: $${orderValue.toFixed(2)}\n` +
                        `• Your earnings (80%): $${workerPayout.toFixed(2)}\n` +
                        `• Deposit returned: $${parseFloat(orderData.depositAmount || 0).toFixed(2)}\n` +
                        `• Payment has been added to your balance`,
                    inline: false
                },
            ])
            .setColor(0x57f287)
            .setTimestamp()
            .setFooter({ text: "Keep up the great work!" });

        await workerUser.send({
            embeds: [workerCelebrationEmbed.toJSON() as any],
        });

        logger.info(`[ConfirmOrderUtil] Sent payment DM to worker`);
    } catch (dmError) {
        logger.warn(`[ConfirmOrderUtil] Could not send DM to worker:`, dmError);
    }

    await notifySupportOrderUpdate(client, {
        orderNumber: orderData.orderNumber,
        orderId,
        status: "COMPLETED",
        customer: orderData.customer,
        worker: orderData.worker,
        orderValue: orderData.orderValue,
        action: "order_confirmed",
        actionBy: confirmedByDiscordId,
    });

    // Review request is now combined with the completion message above
    // No separate review message needed

    // Post to completed orders channel
    try {
        const customerUser = await client.users.fetch(orderData.customer.discordId);
        const workerUser = await client.users.fetch(orderData.worker.discordId);

        // Refetch order data to get the latest including proofScreenshots
        const freshOrderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const freshOrderData = freshOrderResponse.data || freshOrderResponse;

        const completedOrdersService = getCompletedOrdersChannelService(client);
        await completedOrdersService.postCompletedOrder(
            freshOrderData,
            workerUser,
            customerUser,
            orderChannel
        );

        logger.info(`[ConfirmOrderUtil] Posted order #${orderData.orderNumber} to completed-orders channel`);
    } catch (completedOrdersError) {
        logger.error(`[ConfirmOrderUtil] Failed to post to completed-orders channel:`, completedOrdersError);
    }

    logger.info(`[ConfirmOrderUtil] Order #${orderData.orderNumber} confirmation completed successfully`);

    return {
        success: true,
        customerEmbed,
    };
}
