import {
    Client,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    TextChannel,
} from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";

export class OrderChannelService {
    constructor(private client: Client) {}

    async archiveOrderChannel(channelId: string, orderNumber: number): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel && channel.type === ChannelType.GuildText) {
                await (channel as TextChannel).setName(`completed-order-${orderNumber}`);
                await (channel as TextChannel).send(
                    `✅ **Order Completed**\n\nThis channel has been archived. It will remain accessible for reference.`
                );
            }
        } catch (error) {
            logger.error("[OrderChannel] Archive error:", error);
        }
    }

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
                logger.warn("[OrderChannel] Channel not found or not text channel");
                return;
            }

            const textChannel = channel as TextChannel;
            const pinnedMessages = await textChannel.messages.fetchPinned();

            logger.info(`[OrderChannel] Found ${pinnedMessages.size} pinned messages`);

            const orderMessage = pinnedMessages.find(msg => {
                if (msg.embeds.length === 0) return false;
                const title = msg.embeds[0].title;
                logger.info(`[OrderChannel] Checking pinned message title: "${title}"`);
                return title?.includes(`ORDER #${orderNumber}`) && title?.includes("WORKER ASSIGNED");
            });

            if (!orderMessage) {
                logger.warn(`[OrderChannel] Could not find pinned message for Order #${orderNumber}`);
                return;
            }

            logger.info(`[OrderChannel] Updating pinned message for Order #${orderNumber} to status: ${newStatus}`);

            const updatedEmbed = this.buildOrderEmbed(
                orderNumber,
                newStatus,
                orderData.customerDiscordId,
                orderData.workerDiscordId,
                orderData.serviceName,
                orderData.jobDetails
            );

            const buttons = this.buildActionButtons(orderId, newStatus);
            const buttonRow = buttons.length > 0
                ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
                : [];

            await orderMessage.edit({
                embeds: [updatedEmbed.toJSON() as any],
                components: buttonRow.length > 0 ? [buttonRow[0].toJSON() as any] : [],
            });

            logger.info(`[OrderChannel] Successfully updated pinned message for Order #${orderNumber}`);
        } catch (error) {
            logger.error("[OrderChannel] Update error:", error);
        }
    }

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
        skipMessage?: boolean; // Skip posting message (used when combining with order creation message)
        isDirectAssign?: boolean; // Direct assign = don't pin the message
    }): Promise<TextChannel | null> {
        try {
            const channel = await this.client.channels.fetch(data.ticketChannelId);

            if (!channel || channel.type !== ChannelType.GuildText) {
                return null;
            }

            const ticketChannel = channel as TextChannel;

            await ticketChannel.permissionOverwrites.edit(data.workerDiscordId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                EmbedLinks: true,
            });

            // Only post message if not skipped
            if (!data.skipMessage) {
                await this.postWorkerAssignmentMessage(ticketChannel, data, data.isDirectAssign);
            }

            return ticketChannel;
        } catch (error) {
            logger.error("[OrderChannel] Add worker error:", error);
            return null;
        }
    }

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
    }, isDirectAssign?: boolean): Promise<void> {
        try {
            const orderEmbed = this.buildOrderEmbed(
                data.orderNumber,
                data.status,
                data.customerDiscordId,
                data.workerDiscordId,
                data.serviceName,
                data.jobDetails,
                isDirectAssign
            );

            const buttons = this.buildActionButtons(data.orderId, data.status);
            const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

            const message = await channel.send({
                content: `<@${data.customerDiscordId}> <@${data.workerDiscordId}>`,
                embeds: [orderEmbed.toJSON() as any],
                components: [buttonRow.toJSON() as any],
            });

            // Only pin if NOT a direct assign (job claiming flow should pin)
            if (!isDirectAssign) {
                await message.pin();
            }

            try {
                await discordApiClient.put(`/discord/orders/${data.orderId}/message`, {
                    ticketChannelId: channel.id,
                    pinnedMessageId: message.id,
                });
            } catch (err) {
                logger.warn("[OrderChannel] Failed to store message ID:", err);
            }
        } catch (error) {
            logger.error("[OrderChannel] Post message error:", error);
        }
    }

    private buildOrderEmbed(
        orderNumber: number,
        status: string,
        customerDiscordId: string,
        workerDiscordId: string,
        serviceName?: string,
        jobDetails?: string,
        isDirectAssign?: boolean
    ): EmbedBuilder {
        // Use "ORDER CREATED" for direct assign, "WORKER ASSIGNED" for job claiming
        const title = isDirectAssign
            ? `📦 ORDER #${orderNumber} - ORDER CREATED`
            : `📦 ORDER #${orderNumber} - WORKER ASSIGNED`;

        const description = isDirectAssign
            ? `Order has been created and worker assigned!\n\nThis ticket channel will now be used for order communication.`
            : `A worker has been assigned to this order!\n\nThis ticket channel will now be used for order communication.`;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .addFields([
                { name: "👤 Customer", value: `<@${customerDiscordId}>`, inline: true },
                { name: "👷 Worker", value: `<@${workerDiscordId}>`, inline: true },
                { name: "📊 Status", value: this.getStatusEmoji(status), inline: true },
            ])
            .setColor(0xf59e0b)
            .setTimestamp();

        if (serviceName) {
            embed.addFields([
                { name: "🎮 Service", value: serviceName, inline: false }
            ]);
        }

        if (jobDetails) {
            embed.addFields([
                { name: "📋 Job Details", value: jobDetails.substring(0, 1024), inline: false }
            ]);
        }

        embed.addFields([
            {
                name: "ℹ️ Instructions",
                value: this.getInstructionsForStatus(status),
                inline: false,
            }
        ]);

        return embed;
    }

    private buildActionButtons(orderId: string, status: string): ButtonBuilder[] {
        const buttons: ButtonBuilder[] = [];

        if (status === "ASSIGNED") {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`start_work_${orderId}`)
                    .setLabel("🚀 Start Work")
                    .setStyle(ButtonStyle.Success)
            );
        }

        if (status === "IN_PROGRESS") {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`mark_complete_${orderId}`)
                    .setLabel("✅ Mark Complete")
                    .setStyle(ButtonStyle.Success)
            );
        }

        buttons.push(
            new ButtonBuilder()
                .setCustomId(`order_info_${orderId}`)
                .setLabel("📊 Order Info")
                .setStyle(ButtonStyle.Primary)
        );

        return buttons;
    }

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
}

export function getOrderChannelService(client: Client): OrderChannelService {
    return new OrderChannelService(client);
}
