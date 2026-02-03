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

export class CompletedOrdersChannelService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async getOrCreateChannel(guild: Guild): Promise<TextChannel | null> {
        try {
            
            if (discordConfig.completedOrdersChannelId) {
                const existing = guild.channels.cache.get(
                    discordConfig.completedOrdersChannelId
                );
                if (existing && existing.type === ChannelType.GuildText) {
                    return existing as TextChannel;
                }
            }

            const existingByName = guild.channels.cache.find(
                (c) =>
                    c.name.toLowerCase() === "completed-orders" &&
                    c.type === ChannelType.GuildText
            );
            if (existingByName) {
                return existingByName as TextChannel;
            }

            logger.info("[CompletedOrders] Creating completed-orders channel");
            const channel = await guild.channels.create({
                name: "completed-orders",
                type: ChannelType.GuildText,
                topic: "📦 Completed orders with worker information | Admin & Support Only",
                permissionOverwrites: [
                    {
                        
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        
                        id: discordConfig.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        
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

            // Get all screenshots (now merged into proofScreenshots field)
            const allScreenshots = (order.proofScreenshots as string[] | null) || [];

            logger.info(`[CompletedOrders] Order #${order.orderNumber} - ${allScreenshots.length} screenshots`);

            const groupUrl = `https://morita.gg/order/${order.orderNumber}`;

            // Build all embeds to send in ONE message
            const allEmbeds: EmbedBuilder[] = [];

            // Main info embed with URL for grouping
            const mainEmbed = this.formatCompletedOrderEmbed(order, worker, customer, orderChannel);
            mainEmbed.setURL(groupUrl);
            allEmbeds.push(mainEmbed);

            // Add screenshot embeds with same URL for grid layout
            if (allScreenshots.length > 0) {
                for (let i = 0; i < allScreenshots.length; i++) {
                    const screenshotEmbed = new EmbedBuilder()
                        .setURL(groupUrl)
                        .setImage(allScreenshots[i])
                        .setColor(0x57f287 as ColorResolvable);
                    allEmbeds.push(screenshotEmbed);
                }
            }

            // Send ALL embeds in ONE message (Discord limit is 10 embeds per message)
            // If more than 10, we need to split but keep first batch with main embed
            if (allEmbeds.length <= 10) {
                await channel.send({
                    embeds: allEmbeds.map(e => e.toJSON() as any),
                });
            } else {
                // Send first 10 embeds (main + first 9 screenshots)
                await channel.send({
                    embeds: allEmbeds.slice(0, 10).map(e => e.toJSON() as any),
                });
                // Send remaining screenshots
                const remaining = allEmbeds.slice(10);
                for (let i = 0; i < remaining.length; i += 10) {
                    const batch = remaining.slice(i, i + 10);
                    await channel.send({
                        embeds: batch.map(e => e.toJSON() as any),
                    });
                }
            }

            logger.info(
                `[CompletedOrders] Posted completed order #${order.orderNumber} to channel with ${allScreenshots.length} screenshots`
            );
        } catch (error) {
            logger.error("[CompletedOrders] Error posting completed order:", error);
        }
    }

    private formatCompletedOrderEmbed(
        order: any,
        worker: User,
        customer: User,
        orderChannel?: TextChannel
    ): EmbedBuilder {
        const orderNumber = order.orderNumber?.toString().padStart(4, "0") || "Unknown";
        const createdAt = order.createdAt ? new Date(order.createdAt) : null;
        const completedAt = order.completedAt ? new Date(order.completedAt) : new Date();
        const completedTimestamp = Math.floor(completedAt.getTime() / 1000);

        const embed = new EmbedBuilder()
            .setColor(0x57f287 as ColorResolvable)
            .setTimestamp();

        // Build description
        const descriptionParts: string[] = [];

        // Service info
        if (order.service) {
            const serviceEmoji = order.service.emoji || "📦";
            descriptionParts.push(`${serviceEmoji} **${order.service.name}**`);
            descriptionParts.push("");
        }

        // Worker info
        descriptionParts.push(`👷 <@${worker.id}>`);
        descriptionParts.push("");

        // Timeline
        descriptionParts.push(`✅ Completed <t:${completedTimestamp}:R>`);

        // Duration
        if (createdAt && completedAt) {
            const durationMs = completedAt.getTime() - createdAt.getTime();
            const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

            let durationStr = "";
            if (days > 0) {
                durationStr = `${days}d ${hours}h ${minutes}m`;
            } else if (hours > 0) {
                durationStr = `${hours}h ${minutes}m`;
            } else {
                durationStr = `${minutes}m`;
            }
            descriptionParts.push(`⏱️ Duration: **${durationStr}**`);
        }

        // Completion notes (if any)
        if (order.completionNotes) {
            descriptionParts.push("");
            descriptionParts.push(`> *"${order.completionNotes.substring(0, 200)}"*`);
        }

        // Screenshot count
        const screenshots = (order.proofScreenshots as string[] | null) || [];
        if (screenshots.length > 0) {
            descriptionParts.push("");
            descriptionParts.push(`📸 **${screenshots.length}** screenshot${screenshots.length > 1 ? "s" : ""}`);
        }

        embed.setDescription(descriptionParts.join("\n"));

        // Worker avatar as thumbnail
        if (worker.displayAvatarURL) {
            embed.setThumbnail(worker.displayAvatarURL({ size: 128 }));
        }

        embed.setFooter({
            text: `Order #${orderNumber}`,
        });

        return embed;
    }
}

let completedOrdersChannelServiceInstance: CompletedOrdersChannelService | null = null;

export function getCompletedOrdersChannelService(client: Client): CompletedOrdersChannelService {
    if (!completedOrdersChannelServiceInstance) {
        completedOrdersChannelServiceInstance = new CompletedOrdersChannelService(client);
    }
    return completedOrdersChannelServiceInstance;
}

export default CompletedOrdersChannelService;
