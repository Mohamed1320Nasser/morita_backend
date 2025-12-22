import {
    Client,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    TextChannel,
} from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

/**
 * Order Channel Manager Service
 * Handles management of order communication in ticket channels
 */
export class OrderChannelService {
    constructor(private client: Client) {}

    /**
     * Get status emoji
     */
    private getStatusEmoji(status: string): string {
        const statusMap: { [key: string]: string } = {
            PENDING: "⏳ PENDING",
            ASSIGNED: "📋 ASSIGNED",
            IN_PROGRESS: "🟡 IN PROGRESS",
            AWAITING_CONFIRMATION: "🟠 AWAITING CONFIRMATION",
            AWAITING_CONFIRM: "🟠 AWAITING CONFIRMATION",
            COMPLETED: "✅ COMPLETED",
            CANCELLED: "❌ CANCELLED",
            DISPUTED: "🔴 DISPUTED",
        };
        return statusMap[status] || status;
    }

    /**
     * Archive order channel (rename after completion)
     */
    async archiveOrderChannel(channelId: string, orderNumber: number): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel && channel.type === ChannelType.GuildText) {
                await (channel as TextChannel).setName(`completed-order-${orderNumber}`);
                await (channel as TextChannel).send(
                    `✅ **Order Completed**\n\nThis channel has been archived. It will remain accessible for reference.`
                );
                logger.info(`[OrderChannel] Archived channel for order #${orderNumber}`);
            }
        } catch (error) {
            logger.error("[OrderChannel] Error archiving channel:", error);
        }
    }

    /**
     * Update pinned order message when status changes
     */
    async updateOrderMessageStatus(
        channelId: string,
        orderNumber: number,
        orderId: string,
        newStatus: string,
        orderData: {
            customerDiscordId: string;
            workerDiscordId: string;
            orderValue: number;
            depositAmount: number;
            currency: string;
            serviceName?: string;
            jobDetails?: string;
        }
    ): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel || channel.type !== ChannelType.GuildText) {
                logger.warn(`[OrderChannel] Cannot update message - channel not found`);
                return;
            }

            const textChannel = channel as TextChannel;

            // Find the pinned order message
            const pinnedMessages = await textChannel.messages.fetchPinned();
            const orderMessage = pinnedMessages.find(msg =>
                msg.embeds.length > 0 &&
                msg.embeds[0].title?.includes(`Order #${orderNumber}`) &&
                msg.embeds[0].title?.includes("WORKER ASSIGNED")
            );

            if (!orderMessage) {
                logger.warn(`[OrderChannel] Could not find pinned order message for #${orderNumber}`);
                return;
            }

            // Update the embed with new status
            const existingEmbed = orderMessage.embeds[0];
            const workerPayout = orderData.orderValue * 0.8;
            const supportPayout = orderData.orderValue * 0.05;
            const systemFee = orderData.orderValue * 0.15;

            const updatedEmbed = new EmbedBuilder()
                .setTitle(`📦 ORDER #${orderNumber} - WORKER ASSIGNED`)
                .setDescription(
                    `A worker has been assigned to this order!\n\n` +
                    `This ticket channel will now be used for order communication.`
                )
                .addFields([
                    { name: "👤 Customer", value: `<@${orderData.customerDiscordId}>`, inline: true },
                    { name: "👷 Worker", value: `<@${orderData.workerDiscordId}>`, inline: true },
                    { name: "📊 Status", value: this.getStatusEmoji(newStatus), inline: true },
                    { name: "💰 Order Value", value: `$${orderData.orderValue.toFixed(2)} ${orderData.currency}`, inline: true },
                    { name: "💵 Worker Payout", value: `$${workerPayout.toFixed(2)} ${orderData.currency} (80%)`, inline: true },
                    { name: "🔒 Worker Deposit", value: `$${orderData.depositAmount.toFixed(2)} ${orderData.currency}`, inline: true },
                ])
                .setColor(0xf59e0b)
                .setTimestamp();

            if (orderData.serviceName) {
                updatedEmbed.addFields([
                    { name: "🎮 Service", value: orderData.serviceName, inline: false }
                ]);
            }

            if (orderData.jobDetails) {
                updatedEmbed.addFields([
                    { name: "📋 Job Details", value: orderData.jobDetails.substring(0, 1024), inline: false }
                ]);
            }

            updatedEmbed.addFields([
                {
                    name: "💸 Payout Distribution (After Customer Confirms)",
                    value:
                        `✅ Worker receives: **$${workerPayout.toFixed(2)}** (80%)\n` +
                        `✅ Support receives: **$${supportPayout.toFixed(2)}** (5%)\n` +
                        `✅ System fee: **$${systemFee.toFixed(2)}** (15%)\n` +
                        `🔄 Worker deposit: **$${orderData.depositAmount.toFixed(2)}** (returned to worker)`,
                    inline: false,
                },
                {
                    name: "ℹ️ Instructions",
                    value: this.getInstructionsForStatus(newStatus),
                    inline: false,
                }
            ]);

            // Update buttons based on new status
            const buttons: ButtonBuilder[] = [];

            if (newStatus === "ASSIGNED") {
                const startWorkButton = new ButtonBuilder()
                    .setCustomId(`start_work_${orderId}`)
                    .setLabel("🚀 Start Work")
                    .setStyle(ButtonStyle.Success);
                buttons.push(startWorkButton);
            }

            if (newStatus === "IN_PROGRESS") {
                const markCompleteButton = new ButtonBuilder()
                    .setCustomId(`mark_complete_${orderId}`)
                    .setLabel("✅ Mark Complete")
                    .setStyle(ButtonStyle.Success);
                buttons.push(markCompleteButton);
            }

            const orderInfoButton = new ButtonBuilder()
                .setCustomId(`order_info_${orderId}`)
                .setLabel("📊 Order Info")
                .setStyle(ButtonStyle.Primary);
            buttons.push(orderInfoButton);

            if (newStatus !== "AWAITING_CONFIRMATION" && newStatus !== "AWAITING_CONFIRM" && newStatus !== "COMPLETED") {
                const cancelOrderButton = new ButtonBuilder()
                    .setCustomId(`cancel_order_${orderId}`)
                    .setLabel("❌ Cancel Order")
                    .setStyle(ButtonStyle.Danger);
                buttons.push(cancelOrderButton);
            }

            const buttonRow = buttons.length > 0
                ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
                : [];

            // Update the message
            await orderMessage.edit({
                embeds: [updatedEmbed.toJSON() as any],
                components: buttonRow.length > 0 ? [buttonRow[0].toJSON() as any] : [],
            });

            logger.info(`[OrderChannel] Updated pinned message for order #${orderNumber} - new status: ${newStatus}`);
        } catch (error) {
            logger.error("[OrderChannel] Error updating order message:", error);
        }
    }

    /**
     * Add worker to existing ticket channel (instead of creating new order channel)
     */
    async addWorkerToTicketChannel(data: {
        ticketChannelId: string;
        workerDiscordId: string;
        orderNumber: number;
        orderId: string;
        orderValue: number;
        depositAmount: number;
        currency: string;
        customerDiscordId: string;
        serviceName?: string;
        jobDetails?: string;
        status: string;
    }): Promise<TextChannel | null> {
        try {
            const channel = await this.client.channels.fetch(data.ticketChannelId);

            if (!channel || channel.type !== ChannelType.GuildText) {
                logger.error(`[OrderChannel] Channel ${data.ticketChannelId} not found or not a text channel`);
                return null;
            }

            const ticketChannel = channel as TextChannel;

            // Add worker permissions to the ticket channel
            await ticketChannel.permissionOverwrites.edit(data.workerDiscordId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                EmbedLinks: true,
            });

            logger.info(`[OrderChannel] Added worker ${data.workerDiscordId} to ticket channel ${ticketChannel.name}`);

            // Post order assignment message in the ticket channel
            await this.postWorkerAssignmentMessage(ticketChannel, data);

            return ticketChannel;
        } catch (error) {
            logger.error("[OrderChannel] Error adding worker to ticket channel:", error);
            return null;
        }
    }

    /**
     * Get status-based instructions
     */
    private getInstructionsForStatus(status: string): string {
        switch (status) {
            case "ASSIGNED":
                return (
                    `• **Worker**: Click "🚀 Start Work" below to begin working\n` +
                    `• **Customer**: The worker will start soon, stay available for communication\n` +
                    `• **Support**: Monitor progress if needed`
                );
            case "IN_PROGRESS":
                return (
                    `• **Worker**: Communicate progress updates with the customer\n` +
                    `• **Worker**: Click "✅ Mark Complete" when finished (requires typing COMPLETE)\n` +
                    `• **Customer**: Stay in touch with your worker for updates\n` +
                    `• **Support**: Available if issues arise`
                );
            case "AWAITING_CONFIRMATION":
            case "AWAITING_CONFIRM":
                return (
                    `• **Customer**: Review the work and click "✅ Confirm Complete" when satisfied\n` +
                    `• **Worker**: Waiting for customer confirmation\n` +
                    `• **Payouts**: Will be distributed automatically after customer confirms`
                );
            default:
                return (
                    `• **Worker**: Start working and communicate with the customer here\n` +
                    `• **Customer**: Stay in touch with your worker for updates\n` +
                    `• **Support**: Available to help if needed`
                );
        }
    }

    /**
     * Post worker assignment message in ticket channel
     */
    async postWorkerAssignmentMessage(channel: TextChannel, data: {
        workerDiscordId: string;
        orderNumber: number;
        orderId: string;
        orderValue: number;
        depositAmount: number;
        currency: string;
        customerDiscordId: string;
        serviceName?: string;
        jobDetails?: string;
        status: string;
    }): Promise<void> {
        try {
            const workerPayout = data.orderValue * 0.8; // 80%
            const supportPayout = data.orderValue * 0.05; // 5%
            const systemFee = data.orderValue * 0.15; // 15%

            const orderEmbed = new EmbedBuilder()
                .setTitle(`📦 ORDER #${data.orderNumber} - WORKER ASSIGNED`)
                .setDescription(
                    `A worker has been assigned to this order!\n\n` +
                    `This ticket channel will now be used for order communication.`
                )
                .addFields([
                    { name: "👤 Customer", value: `<@${data.customerDiscordId}>`, inline: true },
                    { name: "👷 Worker", value: `<@${data.workerDiscordId}>`, inline: true },
                    { name: "📊 Status", value: this.getStatusEmoji(data.status), inline: true },
                    { name: "💰 Order Value", value: `$${data.orderValue.toFixed(2)} ${data.currency}`, inline: true },
                    { name: "💵 Worker Payout", value: `$${workerPayout.toFixed(2)} ${data.currency} (80%)`, inline: true },
                    { name: "🔒 Worker Deposit", value: `$${data.depositAmount.toFixed(2)} ${data.currency}`, inline: true },
                ])
                .setColor(0xf59e0b) // Orange
                .setTimestamp();

            if (data.serviceName) {
                orderEmbed.addFields([
                    { name: "🎮 Service", value: data.serviceName, inline: false }
                ]);
            }

            if (data.jobDetails) {
                orderEmbed.addFields([
                    { name: "📋 Job Details", value: data.jobDetails.substring(0, 1024), inline: false }
                ]);
            }

            // Add payout breakdown with deposit return info
            orderEmbed.addFields([
                {
                    name: "💸 Payout Distribution (After Customer Confirms)",
                    value:
                        `✅ Worker receives: **$${workerPayout.toFixed(2)}** (80%)\n` +
                        `✅ Support receives: **$${supportPayout.toFixed(2)}** (5%)\n` +
                        `✅ System fee: **$${systemFee.toFixed(2)}** (15%)\n` +
                        `🔄 Worker deposit: **$${data.depositAmount.toFixed(2)}** (returned to worker)`,
                    inline: false,
                }
            ]);

            // Add status-based instructions
            orderEmbed.addFields([
                {
                    name: "ℹ️ Instructions",
                    value: this.getInstructionsForStatus(data.status),
                    inline: false,
                }
            ]);

            // Create status-based action buttons
            const buttons: ButtonBuilder[] = [];

            // Start Work button (only for ASSIGNED status)
            if (data.status === "ASSIGNED") {
                const startWorkButton = new ButtonBuilder()
                    .setCustomId(`start_work_${data.orderId}`)
                    .setLabel("🚀 Start Work")
                    .setStyle(ButtonStyle.Success);
                buttons.push(startWorkButton);
            }

            // Mark Complete button (only for IN_PROGRESS status)
            if (data.status === "IN_PROGRESS") {
                const markCompleteButton = new ButtonBuilder()
                    .setCustomId(`mark_complete_${data.orderId}`)
                    .setLabel("✅ Mark Complete")
                    .setStyle(ButtonStyle.Success);
                buttons.push(markCompleteButton);
            }

            // Always show Order Info
            const orderInfoButton = new ButtonBuilder()
                .setCustomId(`order_info_${data.orderId}`)
                .setLabel("📊 Order Info")
                .setStyle(ButtonStyle.Primary);
            buttons.push(orderInfoButton);

            // Cancel Order button (not for AWAITING_CONFIRM or COMPLETED)
            if (data.status !== "AWAITING_CONFIRMATION" && data.status !== "AWAITING_CONFIRM" && data.status !== "COMPLETED") {
                const cancelOrderButton = new ButtonBuilder()
                    .setCustomId(`cancel_order_${data.orderId}`)
                    .setLabel("❌ Cancel Order")
                    .setStyle(ButtonStyle.Danger);
                buttons.push(cancelOrderButton);
            }

            const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(...buttons);

            // Send and pin the message
            const message = await channel.send({
                content: `<@${data.customerDiscordId}> <@${data.workerDiscordId}>`,
                embeds: [orderEmbed.toJSON() as any],
                components: [buttonRow.toJSON() as any],
            });

            await message.pin();
            logger.info(`[OrderChannel] Order assignment message posted and pinned in ${channel.name}`);

            // Send welcome message to worker
            await channel.send(
                `👋 **Worker Assigned!**\n\n` +
                `<@${data.workerDiscordId}> has been assigned to Order #${data.orderNumber}.\n` +
                `Please communicate here with the customer to complete the job.`
            );
        } catch (error) {
            logger.error("[OrderChannel] Error posting worker assignment message:", error);
        }
    }
}

/**
 * Get OrderChannelService instance
 */
export function getOrderChannelService(client: Client): OrderChannelService {
    return new OrderChannelService(client);
}
