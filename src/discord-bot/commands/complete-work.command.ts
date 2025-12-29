import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    TextChannel,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
} from "discord.js";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";
import { notifySupportOrderUpdate } from "../utils/notification.util";

export const data = new SlashCommandBuilder()
    .setName("complete-work")
    .setDescription("Mark your work as complete")
    .addStringOption((option) =>
        option
            .setName("order-number")
            .setDescription("Order Number (e.g., 11)")
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName("notes")
            .setDescription("Completion notes (optional)")
            .setRequired(false)
            .setMaxLength(500)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderNumber = interaction.options.getString("order-number", true);
        const completionNotes = interaction.options.getString("notes") || undefined;
        const workerDiscordId = interaction.user.id;

        logger.info(
            `[CompleteWork] Worker ${interaction.user.tag} completing order #${orderNumber}`
        );

        // Find order by order number
        const result = await findOrderByNumber(orderNumber);

        if (!result) {
            await interaction.editReply({
                content: `❌ Order not found: **#${orderNumber}**\n\nPlease check the order number and try again.`,
            });
            return;
        }

        const { orderId, orderData } = result;

        // Validate worker is assigned to this order
        if (!orderData.worker || orderData.worker.discordId !== workerDiscordId) {
            await interaction.editReply({
                content: `❌ You are not the assigned worker for Order **#${orderNumber}**.\n\nThis order is assigned to: ${orderData.worker ? orderData.worker.fullname : "No one"}`,
            });
            return;
        }

        // Validate order status
        if (orderData.status !== "IN_PROGRESS") {
            await interaction.editReply({
                content: `❌ Cannot mark Order **#${orderNumber}** as complete.\n\nCurrent status: \`${orderData.status}\`\n\n${
                    orderData.status === "ASSIGNED"
                        ? "You must use `/start-work` to start working first."
                        : "Order must be `IN_PROGRESS` to mark as complete."
                }`,
            });
            return;
        }

        // Complete work - change status to AWAITING_CONFIRM
        const completeResponse: any = await discordApiClient.put(`/discord/orders/${orderId}/complete`, {
            workerDiscordId,
            completionNotes,
        });

        const completedOrder = completeResponse.data || completeResponse;

        // Calculate payout amounts
        const orderValue = parseFloat(orderData.orderValue);
        const workerPayout = orderValue * 0.8;
        const supportPayout = orderValue * 0.05;
        const systemPayout = orderValue * 0.15;

        // Create success embed for worker
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Work Completed!")
            .setDescription(
                `You've marked Order **#${orderNumber}** as complete!\n\n` +
                `The customer has been notified and will confirm completion soon.`
            )
            .addFields([
                {
                    name: "Previous Status",
                    value: "`In Progress`",
                    inline: true,
                },
                {
                    name: "New Status",
                    value: "`Awaiting Confirmation`",
                    inline: true,
                },
                {
                    name: "💰 Your Payout",
                    value: `**$${workerPayout.toFixed(2)} USD** (80%)`,
                    inline: false,
                },
                {
                    name: "Next Step",
                    value: "Waiting for customer to confirm completion",
                    inline: false,
                },
            ])
            .setColor(0xf39c12) // Orange for awaiting confirmation
            .setTimestamp();

        if (completionNotes) {
            successEmbed.addFields([
                {
                    name: "📝 Your Notes",
                    value: `> ${completionNotes}`,
                    inline: false,
                }
            ]);
        }

        await interaction.editReply({
            embeds: [successEmbed.toJSON() as any],
        });

        logger.info(
            `[CompleteWork] Order ${orderId} (#${orderNumber}) marked as complete by ${interaction.user.tag}`
        );

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
            notes: completionNotes,
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

            logger.info(`[CompleteWork] Sent DM notification to customer ${orderData.customer.discordId}`);
        } catch (dmError) {
            logger.warn(`[CompleteWork] Could not send DM to customer (might have DMs disabled):`, dmError);
            // Don't fail - DM is nice-to-have
        }

        // Notify customer in ticket channel
        const channel = interaction.channel;

        logger.info(`[CompleteWork] Channel check: ${!!channel}, TextChannel: ${channel instanceof TextChannel}, pinnedMessageId: ${orderData.pinnedMessageId}`);

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

                logger.info(`[CompleteWork] Updated pinned message ${orderData.pinnedMessageId}`);

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

                    logger.info(`[CompleteWork] Created thread with order info and action buttons`);
                } catch (threadError) {
                    logger.warn(`[CompleteWork] Could not create thread:`, threadError);
                    // Thread creation is optional, don't fail
                }

            } catch (err) {
                logger.error(`[CompleteWork] Failed to update pinned message ${orderData.pinnedMessageId}:`, err);
                logger.warn(`[CompleteWork] Attempting fallback message for order ${orderId}...`);

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

                logger.info(`[CompleteWork] Sent fallback notification message`);
            }
        } else {
            // No pinned message ID found - send new message
            logger.warn(`[CompleteWork] No pinnedMessageId found for order ${orderId}, sending new message`);
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

                logger.info(`[CompleteWork] Sent new notification message (no pinned message found)`);
            }
        }
    } catch (error: any) {
        logger.error("[CompleteWork] Error completing work:", error);

        const errorMessage = extractErrorMessage(error);

        await interaction.editReply({
            content: `❌ **Failed to mark work as complete**\n\n${errorMessage}\n\nPlease try again or contact support.`,
        });
    }
}
