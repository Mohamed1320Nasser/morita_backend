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

export class ReviewsChannelService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async getOrCreateChannel(guild: Guild): Promise<TextChannel | null> {
        try {
            
            if (discordConfig.reviewsChannelId) {
                const existing = guild.channels.cache.get(
                    discordConfig.reviewsChannelId
                );
                if (existing && existing.type === ChannelType.GuildText) {
                    return existing as TextChannel;
                }
            }

            const existingByName = guild.channels.cache.find(
                (c) =>
                    c.name.toLowerCase() === "reviews" &&
                    c.type === ChannelType.GuildText
            );
            if (existingByName) {
                return existingByName as TextChannel;
            }

            logger.info("[Reviews] Creating reviews channel");
            const channel = await guild.channels.create({
                name: "reviews",
                type: ChannelType.GuildText,
                topic: "⭐ Customer reviews and testimonials",
                permissionOverwrites: [
                    {
                        
                        id: guild.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                        deny: [
                            PermissionFlagsBits.SendMessages, 
                        ],
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

            logger.info(`[Reviews] Created channel: ${channel.id}`);
            return channel;
        } catch (error) {
            logger.error("[Reviews] Error getting/creating channel:", error);
            return null;
        }
    }

    async postReview(
        order: any,
        review: any,
        customer: User,
        worker: User,
        isAnonymous: boolean = false
    ): Promise<void> {
        try {
            const guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!guild) {
                logger.error("[Reviews] Guild not found");
                return;
            }

            const channel = await this.getOrCreateChannel(guild);
            if (!channel) {
                logger.error("[Reviews] Could not get channel");
                return;
            }

            const embed = this.formatReviewEmbed(order, review, customer, worker, isAnonymous);

            await channel.send({
                embeds: [embed.toJSON() as any],
            });

            logger.info(
                `[Reviews] Posted review for order #${order.orderNumber} to channel`
            );
        } catch (error) {
            logger.error("[Reviews] Error posting review:", error);
        }
    }

    /**
     * Post an account purchase review (no worker involved)
     */
    async postAccountReview(
        order: any,
        review: any,
        customer: User,
        isAnonymous: boolean = false
    ): Promise<void> {
        try {
            const guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!guild) {
                logger.error("[Reviews] Guild not found");
                return;
            }

            const channel = await this.getOrCreateChannel(guild);
            if (!channel) {
                logger.error("[Reviews] Could not get channel");
                return;
            }

            const embed = this.formatAccountReviewEmbed(order, review, customer, isAnonymous);

            await channel.send({
                embeds: [embed.toJSON() as any],
            });

            logger.info(
                `[Reviews] Posted account review for order #${order.orderNumber} to channel`
            );
        } catch (error) {
            logger.error("[Reviews] Error posting account review:", error);
        }
    }

    private formatAccountReviewEmbed(
        order: any,
        review: any,
        customer: User,
        isAnonymous: boolean = false
    ): EmbedBuilder {
        const orderNumber = String(order.orderNumber).padStart(4, "0");
        const rating = review.rating || 5;

        const stars = "⭐".repeat(rating);

        let embedColor: number;
        if (rating >= 5) {
            embedColor = 0x57f287; // Green
        } else if (rating >= 4) {
            embedColor = 0x5865f2; // Blue
        } else if (rating >= 3) {
            embedColor = 0xfee75c; // Yellow
        } else {
            embedColor = 0xed4245; // Red
        }

        const embed = new EmbedBuilder()
            .setColor(embedColor as ColorResolvable)
            .setTimestamp();

        const descriptionParts: string[] = [];

        // Add highlighted review text at top (if exists)
        if (review.comment && review.comment.trim().length > 0) {
            descriptionParts.push(`## "${review.comment.substring(0, 900)}"`);
            descriptionParts.push("");
        }

        // Rating display
        descriptionParts.push(`${stars} **${rating}/5**`);
        descriptionParts.push("");

        // Service info - Account Purchase
        descriptionParts.push(`🎮 ${order.service?.name || "Account Purchase"}`);

        // Customer only (no worker for account purchases)
        const customerDisplay = isAnonymous ? "Anonymous" : customer.displayName;
        descriptionParts.push(`👤 ${customerDisplay}`);

        embed.setDescription(descriptionParts.join("\n"));

        embed.setFooter({
            text: `Ticket #${orderNumber} • Account Purchase`,
        });

        return embed;
    }

    private formatReviewEmbed(
        order: any,
        review: any,
        customer: User,
        worker: User,
        isAnonymous: boolean = false
    ): EmbedBuilder {
        const orderNumber = order.orderNumber.toString().padStart(4, "0");
        const rating = review.rating || 5;

        const stars = "⭐".repeat(rating);

        let embedColor: number;
        if (rating >= 5) {
            embedColor = 0x57f287; // Green
        } else if (rating >= 4) {
            embedColor = 0x5865f2; // Blue
        } else if (rating >= 3) {
            embedColor = 0xfee75c; // Yellow
        } else {
            embedColor = 0xed4245; // Red
        }

        const embed = new EmbedBuilder()
            .setColor(embedColor as ColorResolvable)
            .setTimestamp();

        // Build description with review text highlighted at top
        const descriptionParts: string[] = [];

        // Add highlighted review text at top (if exists)
        if (review.comment && review.comment.trim().length > 0) {
            descriptionParts.push(`## "${review.comment.substring(0, 900)}"`);
            descriptionParts.push("");
        }

        // Rating display
        descriptionParts.push(`${stars} **${rating}/5**`);
        descriptionParts.push("");

        // Service info
        if (order.service) {
            const serviceEmoji = order.service.emoji || "📦";
            descriptionParts.push(`${serviceEmoji} ${order.service.name}`);
        }

        // Customer and Worker on same line (display names, not mentions)
        const customerDisplay = isAnonymous ? "Anonymous" : customer.displayName;
        descriptionParts.push(`👤 ${customerDisplay} → 👷 ${worker.displayName}`);

        embed.setDescription(descriptionParts.join("\n"));

        embed.setFooter({
            text: `Order #${orderNumber}`,
        });

        return embed;
    }
}

let reviewsChannelServiceInstance: ReviewsChannelService | null = null;

export function getReviewsChannelService(client: Client): ReviewsChannelService {
    if (!reviewsChannelServiceInstance) {
        reviewsChannelServiceInstance = new ReviewsChannelService(client);
    }
    return reviewsChannelServiceInstance;
}

export default ReviewsChannelService;
