import {
    Client,
    Guild,
    TextChannel,
    EmbedBuilder,
    ColorResolvable,
    User,
    ChannelType,
    PermissionFlagsBits,
} from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

/**
 * Service for managing the Completed Orders Channel
 * Posts completed order information for Admin/Support review
 */
export class CompletedOrdersChannelService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Get or create the Completed Orders channel
     */
    async getOrCreateChannel(guild: Guild): Promise<TextChannel | null> {
        try {
            // Try to find existing channel by ID
            if (discordConfig.completedOrdersChannelId) {
                const existing = guild.channels.cache.get(
                    discordConfig.completedOrdersChannelId
                );
                if (existing && existing.type === ChannelType.GuildText) {
                    return existing as TextChannel;
                }
            }

            // Try to find by name
            const existingByName = guild.channels.cache.find(
                (c) =>
                    c.name.toLowerCase() === "completed-orders" &&
                    c.type === ChannelType.GuildText
            );
            if (existingByName) {
                return existingByName as TextChannel;
            }

            // Create new channel
            logger.info("[CompletedOrders] Creating completed-orders channel");
            const channel = await guild.channels.create({
                name: "completed-orders",
                type: ChannelType.GuildText,
                topic: "📦 Completed orders with worker information | Admin & Support Only",
                permissionOverwrites: [
                    {
                        // Deny everyone from viewing
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        // Allow support role
                        id: discordConfig.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        // Allow admin role
                        id: discordConfig.adminRoleId,
                        allow: [PermissionFlagsBits.Administrator],
                    },
                ],
            });

            logger.info(`[CompletedOrders] Created channel: ${channel.id}`);
            return channel;
        } catch (error) {
            logger.error("[CompletedOrders] Error getting/creating channel:", error);
            return null;
        }
    }

    /**
     * Post a completed order to the channel
     */
    async postCompletedOrder(
        order: any,
        worker: User,
        customer: User,
        orderChannel?: TextChannel
    ): Promise<void> {
        try {
            const guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!guild) {
                logger.error("[CompletedOrders] Guild not found");
                return;
            }

            const channel = await this.getOrCreateChannel(guild);
            if (!channel) {
                logger.error("[CompletedOrders] Could not get channel");
                return;
            }

            // Create the embed
            const embed = this.formatCompletedOrderEmbed(order, worker, customer, orderChannel);

            // Send the message
            await channel.send({
                embeds: [embed.toJSON() as any],
            });

            logger.info(
                `[CompletedOrders] Posted completed order #${order.orderNumber} to channel`
            );
        } catch (error) {
            logger.error("[CompletedOrders] Error posting completed order:", error);
        }
    }

    /**
     * Format the completed order embed with powerful professional design
     */
    private formatCompletedOrderEmbed(
        order: any,
        worker: User,
        customer: User,
        orderChannel?: TextChannel
    ): EmbedBuilder {
        const orderNumber = order.orderNumber?.toString() || "Unknown";
        const orderValue = parseFloat(order.orderValue?.toString() || "0");

        // Calculate worker payout (80% of order value)
        const workerPayout = orderValue * 0.8;
        const platformFee = orderValue * 0.2;

        const embed = new EmbedBuilder()
            .setColor(0x57f287 as ColorResolvable) // Green for success
            .setTimestamp();

        // Hero section - Title with service
        if (order.service) {
            embed.setTitle(`${order.service.emoji || "✅"} ORDER COMPLETED - #${orderNumber}`);
            embed.setDescription(`**Service:** ${order.service.name}`);
        } else {
            embed.setTitle(`✅ ORDER COMPLETED - #${orderNumber}`);
        }

        // Set thumbnail if worker has avatar
        if (worker.displayAvatarURL) {
            embed.setThumbnail(worker.displayAvatarURL({ size: 128 }));
        }

        // === PARTICIPANTS SECTION ===
        embed.addFields(
            {
                name: "👤 Customer",
                value: `<@${customer.id}>\n\`${customer.tag}\``,
                inline: true,
            },
            {
                name: "👷 Worker",
                value: `<@${worker.id}>\n\`${worker.tag}\``,
                inline: true,
            },
            {
                name: "\u200b",
                value: "\u200b",
                inline: true,
            }
        );

        // === FINANCIAL SUMMARY ===
        embed.addFields({
            name: "━━━━━━━━ 💰 FINANCIAL SUMMARY ━━━━━━━━",
            value:
                `**Order Value:** \`$${orderValue.toFixed(2)}\`\n` +
                `**Worker Payout:** \`$${workerPayout.toFixed(2)}\` (80%)\n` +
                `**Platform Fee:** \`$${platformFee.toFixed(2)}\` (20%)`,
            inline: false,
        });

        // === TIMELINE ===
        const createdAt = order.createdAt ? new Date(order.createdAt) : null;
        const completedAt = order.completedAt ? new Date(order.completedAt) : new Date();

        const createdTimestamp = createdAt ? Math.floor(createdAt.getTime() / 1000) : null;
        const completedTimestamp = Math.floor(completedAt.getTime() / 1000);

        let timelineValue = "";
        if (createdTimestamp) {
            timelineValue += `**📅 Created:** <t:${createdTimestamp}:R>\n`;
        }
        timelineValue += `**✅ Completed:** <t:${completedTimestamp}:F>`;

        // Calculate duration if we have both timestamps
        if (createdAt && completedAt) {
            const durationMs = completedAt.getTime() - createdAt.getTime();
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

            if (hours > 0) {
                timelineValue += `\n**⏱️ Duration:** ${hours}h ${minutes}m`;
            } else {
                timelineValue += `\n**⏱️ Duration:** ${minutes}m`;
            }
        }

        embed.addFields({
            name: "━━━━━━━━ ⏰ TIMELINE ━━━━━━━━",
            value: timelineValue,
            inline: false,
        });

        // === JOB DETAILS ===
        if (order.jobDetails?.description) {
            embed.addFields({
                name: "━━━━━━━━ 📋 JOB DETAILS ━━━━━━━━",
                value: `\`\`\`${order.jobDetails.description.substring(0, 950)}\`\`\``,
                inline: false,
            });
        }

        // === COMPLETION NOTES ===
        if (order.completionNotes) {
            embed.addFields({
                name: "━━━━━━━━ 📝 COMPLETION NOTES ━━━━━━━━",
                value: `\`\`\`${order.completionNotes.substring(0, 950)}\`\`\``,
                inline: false,
            });
        }

        // === ORDER CHANNEL LINK ===
        if (orderChannel) {
            embed.addFields({
                name: "🔗 Order Channel",
                value: orderChannel.toString(),
                inline: false,
            });
        }

        // Footer with Order ID and timestamp info
        const footerText = `Order ID: ${order.id || "Unknown"} • Completed on ${completedAt.toLocaleDateString()}`;
        embed.setFooter({
            text: footerText,
            iconURL: customer.displayAvatarURL({ size: 32 }),
        });

        return embed;
    }
}

// Singleton instance
let completedOrdersChannelServiceInstance: CompletedOrdersChannelService | null = null;

export function getCompletedOrdersChannelService(client: Client): CompletedOrdersChannelService {
    if (!completedOrdersChannelServiceInstance) {
        completedOrdersChannelServiceInstance = new CompletedOrdersChannelService(client);
    }
    return completedOrdersChannelServiceInstance;
}

export default CompletedOrdersChannelService;
