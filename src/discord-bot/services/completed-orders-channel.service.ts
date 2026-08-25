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

    /**
     * Post the proof a worker has uploaded so far, while the order is still
     * running. Same layout as a completed post, but marked in progress so it
     * cannot be mistaken for delivered work.
     *
     * Only the screenshots from this upload are shown, so repeated uploads do
     * not re-post images that already appeared.
     */
    async postOrderProgress(
        order: any,
        worker: User,
        customer: User,
        newScreenshots: string[],
        orderChannel?: TextChannel
    ): Promise<void> {
        return this.postToChannel(
            { ...order, proofScreenshots: newScreenshots },
            worker,
            customer,
            orderChannel,
            true
        );
    }

    async postCompletedOrder(
        order: any,
        worker: User,
        customer: User,
        orderChannel?: TextChannel
    ): Promise<void> {
        return this.postToChannel(order, worker, customer, orderChannel, false);
    }

    private async postToChannel(
        order: any,
        worker: User,
        customer: User,
        orderChannel?: TextChannel,
        inProgress: boolean = false
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

            // The URL is what groups embeds into one block, so a progress post
            // needs its own or Discord folds it into an earlier one.
            const groupUrl = inProgress
                ? `https://morita.gg/order/${order.orderNumber}?p=${Date.now()}`
                : `https://morita.gg/order/${order.orderNumber}`;

            // Build all embeds array
            const allEmbeds: EmbedBuilder[] = [];

            // Main info embed with URL for grouping
            const mainEmbed = this.formatCompletedOrderEmbed(
                order,
                worker,
                customer,
                orderChannel,
                inProgress
            );
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
                        .setColor(0xfca311 as ColorResolvable);
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
                `[CompletedOrders] Posted ${inProgress ? "in-progress" : "completed"} order #${order.orderNumber} to channel with ${allScreenshots.length} screenshots`
            );
        } catch (error) {
            logger.error("[CompletedOrders] Error posting completed order:", error);
        }
    }

    private formatCompletedOrderEmbed(
        order: any,
        worker: User,
        customer: User,
        orderChannel?: TextChannel,
        inProgress: boolean = false
    ): EmbedBuilder {
        const orderNumber = order.orderNumber?.toString().padStart(4, "0") || "Unknown";
        const createdAt = order.createdAt ? new Date(order.createdAt) : null;
        const completedAt = order.completedAt ? new Date(order.completedAt) : new Date();
        const completedTimestamp = Math.floor(completedAt.getTime() / 1000);

        const embed = new EmbedBuilder()
            .setColor(0xfca311 as ColorResolvable)
            .setTitle(
                inProgress
                    ? `🔄 Order #${orderNumber} — In Progress`
                    : `🎉 Order #${orderNumber} — Completed`
            )
            .setTimestamp();

        // Embeds shrink to fit their text, which leaves a narrow block of text
        // sitting above a full-width image. A fixed-width rule holds the embed
        // open so the two line up. Kept short enough not to wrap on mobile.
        const WIDTH_RULE = "━".repeat(24);

        const descriptionParts: string[] = [];

        // Service info
        if (order.service) {
            const serviceEmoji = order.service.emoji || "📦";
            descriptionParts.push(`${serviceEmoji} **Service:** ${order.service.name}`);
        } else {
            descriptionParts.push(`📦 **Service:** Custom Order`);
        }

        // Worker info
        descriptionParts.push(
            inProgress
                ? `👷 **Worker:** <@${worker.id}>`
                : `👷 **Worker Completed By:** <@${worker.id}>`
        );
        descriptionParts.push("");

        // Timeline with more detail
        descriptionParts.push(
            inProgress
                ? `🔄 **Status:** In Progress — proof added <t:${Math.floor(Date.now() / 1000)}:R>`
                : `✅ **Status:** Completed <t:${completedTimestamp}:R>`
        );

        // Duration only means something once the work is finished.
        if (!inProgress && createdAt && completedAt) {
            const durationMs = completedAt.getTime() - createdAt.getTime();
            const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

            let durationStr = "";
            if (days > 0) {
                durationStr = `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}`;
            } else if (hours > 0) {
                durationStr = `${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`;
            } else if (minutes > 0) {
                durationStr = `${minutes} minute${minutes > 1 ? 's' : ''}`;
            } else {
                // Anything under a minute reads better than "0 minute".
                durationStr = "under a minute";
            }
            descriptionParts.push(`⏱️ **Completion Time:** ${durationStr}`);
        }

        if (orderChannel) {
            descriptionParts.push(`🎫 **Ticket:** <#${orderChannel.id}>`);
        }

        // Completion notes (if any)
        if (order.completionNotes) {
            descriptionParts.push("");
            descriptionParts.push(`📝 **Notes:** *"${order.completionNotes.substring(0, 300)}"*`);
        }

        const screenshots = (order.proofScreenshots as string[] | null) || [];
        if (screenshots.length > 0) {
            descriptionParts.push("");
            descriptionParts.push(
                `📸 **Proof:** ${screenshots.length} screenshot${screenshots.length > 1 ? "s" : ""}`
            );
        }

        descriptionParts.push(WIDTH_RULE);

        embed.setDescription(descriptionParts.join("\n"));

        // Worker avatar as thumbnail
        if (worker.displayAvatarURL) {
            embed.setThumbnail(worker.displayAvatarURL({ size: 128 }));
        }

        embed.setFooter({
            text: inProgress ? `Order #${orderNumber} • In Progress` : `Order #${orderNumber}`,
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
