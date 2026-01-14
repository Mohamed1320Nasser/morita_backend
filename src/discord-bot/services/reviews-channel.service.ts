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

            const embed = this.formatReviewEmbed(order, review, customer, worker);

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

    private formatReviewEmbed(
        order: any,
        review: any,
        customer: User,
        worker: User
    ): EmbedBuilder {
        const orderNumber = order.orderNumber.toString().padStart(4, "0");
        const rating = review.rating || 5;

        const stars = "⭐".repeat(rating);
        const emptyStars = "☆".repeat(5 - rating);
        const starDisplay = `${stars}${emptyStars} ${rating}/5`;

        let embedColor: number;
        if (rating >= 5) {
            embedColor = 0x57f287; 
        } else if (rating >= 4) {
            embedColor = 0x5865f2; 
        } else if (rating >= 3) {
            embedColor = 0xfee75c; 
        } else {
            embedColor = 0xed4245; 
        }

        const embed = new EmbedBuilder()
            .setTitle(starDisplay)
            .setColor(embedColor as ColorResolvable)
            .setTimestamp();

        const detailsLines: string[] = [];

        if (order.service) {
            detailsLines.push(`**📦 Service:** ${order.service.emoji || ""} ${order.service.name}`);
        }

        detailsLines.push(`**👤 Customer:** <@${customer.id}>`);
        detailsLines.push(`**👷 Worker:** <@${worker.id}>`);

        const completedAtRaw = order.completedAt || review.createdAt || new Date();
        const completedAt = completedAtRaw instanceof Date ? completedAtRaw : new Date(completedAtRaw);
        detailsLines.push(`**📅 Completed:** <t:${Math.floor(completedAt.getTime() / 1000)}:D>`);

        if (order.orderValue) {
            detailsLines.push(`**💰 Order Value:** $${order.orderValue.toFixed(2)}`);
        }

        embed.setDescription(detailsLines.join("\n"));

        if (review.comment && review.comment.trim().length > 0) {
            embed.addFields({
                name: "💬 Review",
                value: review.comment.substring(0, 1024), 
                inline: false,
            });
        }

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
