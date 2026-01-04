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
 * Service for managing the Reviews Channel
 * Posts customer reviews publicly
 */
export class ReviewsChannelService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Get or create the Reviews channel
     */
    async getOrCreateChannel(guild: Guild): Promise<TextChannel | null> {
        try {
            // Try to find existing channel by ID
            if (discordConfig.reviewsChannelId) {
                const existing = guild.channels.cache.get(
                    discordConfig.reviewsChannelId
                );
                if (existing && existing.type === ChannelType.GuildText) {
                    return existing as TextChannel;
                }
            }

            // Try to find by name
            const existingByName = guild.channels.cache.find(
                (c) =>
                    c.name.toLowerCase() === "reviews" &&
                    c.type === ChannelType.GuildText
            );
            if (existingByName) {
                return existingByName as TextChannel;
            }

            // Create new channel
            logger.info("[Reviews] Creating reviews channel");
            const channel = await guild.channels.create({
                name: "reviews",
                type: ChannelType.GuildText,
                topic: "⭐ Customer reviews and testimonials",
                permissionOverwrites: [
                    {
                        // Allow everyone to view and read
                        id: guild.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                        deny: [
                            PermissionFlagsBits.SendMessages, // Only bot can post
                        ],
                    },
                    {
                        // Allow support role to send messages
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

            logger.info(`[Reviews] Created channel: ${channel.id}`);
            return channel;
        } catch (error) {
            logger.error("[Reviews] Error getting/creating channel:", error);
            return null;
        }
    }

    /**
     * Post a review to the channel
     */
    async postReview(
        order: any,
        review: any,
        customer: User,
        worker: User
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

            // Create the embed
            const embed = this.formatReviewEmbed(order, review, customer, worker);

            // Send the message
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
     * Format the review embed
     */
    private formatReviewEmbed(
        order: any,
        review: any,
        customer: User,
        worker: User
    ): EmbedBuilder {
        const orderNumber = order.orderNumber.toString().padStart(4, "0");
        const rating = review.rating || 5;

        // Generate star rating display
        const stars = "⭐".repeat(rating);
        const emptyStars = "☆".repeat(5 - rating);
        const starDisplay = `${stars}${emptyStars} ${rating}/5`;

        // Determine embed color based on rating
        let embedColor: number;
        if (rating >= 5) {
            embedColor = 0x57f287; // Green for 5 stars
        } else if (rating >= 4) {
            embedColor = 0x5865f2; // Blue for 4 stars
        } else if (rating >= 3) {
            embedColor = 0xfee75c; // Yellow for 3 stars
        } else {
            embedColor = 0xed4245; // Red for low ratings
        }

        const embed = new EmbedBuilder()
            .setTitle(starDisplay)
            .setColor(embedColor as ColorResolvable)
            .setTimestamp();

        // Add service and participant info
        const detailsLines: string[] = [];

        if (order.service) {
            detailsLines.push(`**📦 Service:** ${order.service.emoji || ""} ${order.service.name}`);
        }

        detailsLines.push(`**👤 Customer:** <@${customer.id}>`);
        detailsLines.push(`**👷 Worker:** <@${worker.id}>`);

        // Add completion date
        const completedAtRaw = order.completedAt || review.createdAt || new Date();
        const completedAt = completedAtRaw instanceof Date ? completedAtRaw : new Date(completedAtRaw);
        detailsLines.push(`**📅 Completed:** <t:${Math.floor(completedAt.getTime() / 1000)}:D>`);

        // Add order value
        if (order.orderValue) {
            detailsLines.push(`**💰 Order Value:** $${order.orderValue.toFixed(2)}`);
        }

        embed.setDescription(detailsLines.join("\n"));

        // Add review comment if exists
        if (review.comment && review.comment.trim().length > 0) {
            embed.addFields({
                name: "💬 Review",
                value: review.comment.substring(0, 1024), // Discord limit
                inline: false,
            });
        }

        // Add footer
        embed.setFooter({
            text: `Order #${orderNumber}`,
        });

        return embed;
    }
}

// Singleton instance
let reviewsChannelServiceInstance: ReviewsChannelService | null = null;

export function getReviewsChannelService(client: Client): ReviewsChannelService {
    if (!reviewsChannelServiceInstance) {
        reviewsChannelServiceInstance = new ReviewsChannelService(client);
    }
    return reviewsChannelServiceInstance;
}

export default ReviewsChannelService;
