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
                    { name: "🔒 Deposit Locked", value: `$${data.depositAmount.toFixed(2)} ${data.currency}`, inline: true },
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

            orderEmbed.addFields([
                {
                    name: "ℹ️ Instructions",
                    value:
                        `• **Worker**: Start working and communicate with the customer here\n` +
                        `• **Customer**: Stay in touch with your worker for updates\n` +
                        `• **Worker**: Click "✅ Mark Complete" when finished\n` +
                        `• **Support**: Available to help if needed`,
                    inline: false,
                }
            ]);

            // Create action buttons
            const markCompleteButton = new ButtonBuilder()
                .setCustomId(`mark_complete_${data.orderId}`)
                .setLabel("✅ Mark Complete")
                .setStyle(ButtonStyle.Success);

            const orderInfoButton = new ButtonBuilder()
                .setCustomId(`order_info_${data.orderId}`)
                .setLabel("📊 Order Info")
                .setStyle(ButtonStyle.Primary);

            const cancelOrderButton = new ButtonBuilder()
                .setCustomId(`cancel_order_${data.orderId}`)
                .setLabel("❌ Cancel Order")
                .setStyle(ButtonStyle.Danger);

            const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(markCompleteButton, orderInfoButton, cancelOrderButton);

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
