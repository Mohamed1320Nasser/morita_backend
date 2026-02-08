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

            // Build all embeds array
            const allEmbeds: EmbedBuilder[] = [];

            // Main info embed with URL for grouping
            const mainEmbed = this.formatCompletedOrderEmbed(order, worker, customer, orderChannel);
            mainEmbed.setURL(groupUrl);

            // Conditional image display logic:
            // - If 1 image: add to main embed directly (full-width with text)
            // - If multiple images: show as grid below text
            if (allScreenshots.length === 1) {
                // Single image: add to main embed for full-width display
                mainEmbed.setImage(allScreenshots[0]);
                allEmbeds.push(mainEmbed);
            } else if (allScreenshots.length > 1) {
                // Multiple images: keep main embed text-only, add images as grid
                allEmbeds.push(mainEmbed);
                for (const screenshot of allScreenshots) {
                    const screenshotEmbed = new EmbedBuilder()
                        .setURL(groupUrl)  // Same URL groups embeds together
                        .setImage(screenshot)  // Full-width image
                        .setColor(0x57f287 as ColorResolvable);
                    allEmbeds.push(screenshotEmbed);
                }
            } else {
                // No images: just add main embed
                allEmbeds.push(mainEmbed);
            }

            // Send all embeds in batches (max 10 per message)
            for (let i = 0; i < allEmbeds.length; i += 10) {
                const batch = allEmbeds.slice(i, i + 10);
                await channel.send({
                    embeds: batch.map(e => e.toJSON() as any),
                });
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

        // Build description with more details to make embed wider
        const descriptionParts: string[] = [];

        // Header with decorative line
        descriptionParts.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        descriptionParts.push("");

        // Service info
        if (order.service) {
            const serviceEmoji = order.service.emoji || "📦";
            descriptionParts.push(`${serviceEmoji} **Service:** ${order.service.name}`);
        } else {
            descriptionParts.push(`📦 **Service:** Custom Order`);
        }

        // Worker info
        descriptionParts.push(`👷 **Worker Completed By:** <@${worker.id}>`);
        descriptionParts.push("");

        // Timeline with more detail
        descriptionParts.push(`✅ **Status:** Completed <t:${completedTimestamp}:R>`);

        // Duration with more context
        if (createdAt && completedAt) {
            const durationMs = completedAt.getTime() - createdAt.getTime();
            const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

            let durationStr = "";
            if (days > 0) {
                durationStr = `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`;
            } else if (hours > 0) {
                durationStr = `${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`;
            } else {
                durationStr = `${minutes} minute${minutes > 1 ? 's' : ''}`;
            }
            descriptionParts.push(`⏱️ **Completion Time:** ${durationStr}`);
        }

        descriptionParts.push("");
        descriptionParts.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // Completion notes (if any)
        if (order.completionNotes) {
            descriptionParts.push("");
            descriptionParts.push(`📝 **Completion Notes:**`);
            descriptionParts.push(`> *"${order.completionNotes.substring(0, 300)}"*`);
        }

        // Screenshot count with more detail
        const screenshots = (order.proofScreenshots as string[] | null) || [];
        if (screenshots.length > 0) {
            descriptionParts.push("");
            descriptionParts.push(`📸 **Proof Screenshots Attached:** ${screenshots.length} screenshot${screenshots.length > 1 ? "s" : ""} uploaded`);
        }

        descriptionParts.push("");
        descriptionParts.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

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
