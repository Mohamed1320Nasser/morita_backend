import { Client, Message, MessageReaction, User, PartialUser, ChannelType } from "discord.js";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";

@Service()
export default class EngagementTrackerService {
    private client: Client;

    // Channels to exclude from engagement tracking
    private readonly EXCLUDED_CHANNEL_IDS: string[] = [
        // Add specific channel IDs to exclude
    ];

    // Ticket category IDs to exclude
    private readonly TICKET_CATEGORY_IDS = [
        // Will be populated from channel names/categories containing "ticket"
    ];

    // Helpful reaction emojis (worth 2x engagement points)
    private readonly HELPFUL_REACTIONS = ["👍", "✅", "❤️", "🎯", "⭐", "💯"];

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Check if a channel should be tracked for engagement
     */
    private shouldTrackChannel(message: Message): boolean {
        // Don't track DMs
        if (message.channel.type === ChannelType.DM) {
            return false;
        }

        // Don't track excluded channels
        if (this.EXCLUDED_CHANNEL_IDS.includes(message.channel.id)) {
            return false;
        }

        // Don't track ticket channels
        if (message.channel.parent) {
            const parentName = message.channel.parent.name.toLowerCase();
            if (parentName.includes("ticket") || parentName.includes("support")) {
                return false;
            }
        }

        // Don't track channels with "ticket" in name
        const channelName = message.channel.name?.toLowerCase() || "";
        if (channelName.includes("ticket") || channelName.includes("bot-only")) {
            return false;
        }

        return true;
    }

    /**
     * Track a message sent by a user
     */
    async trackMessage(message: Message): Promise<void> {
        try {
            // Don't track bots
            if (message.author.bot) {
                return;
            }

            // Check if channel should be tracked
            if (!this.shouldTrackChannel(message)) {
                return;
            }

            // Get today's date at midnight UTC
            const now = new Date();
            const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

            const discordId = message.author.id;
            const username = message.author.username;
            const displayName = message.author.displayName || message.author.username;
            const channelId = message.channel.id;

            // Count mentions (excluding @everyone and @here)
            const mentionsCount = message.mentions.users.size;

            // Use transaction to handle race conditions
            await prisma.$transaction(async (tx) => {
                // Try to find existing record first
                let engagement = await tx.discordEngagement.findUnique({
                    where: {
                        discordId_date: {
                            discordId,
                            date: today,
                        },
                    },
                });

                if (engagement) {
                    // Update existing record
                    const channelActivity = (engagement.channelActivity as any) || {};
                    channelActivity[channelId] = (channelActivity[channelId] || 0) + 1;

                    engagement = await tx.discordEngagement.update({
                        where: {
                            discordId_date: {
                                discordId,
                                date: today,
                            },
                        },
                        data: {
                            username,
                            displayName,
                            messagesCount: { increment: 1 },
                            mentionsCount: { increment: mentionsCount },
                            channelActivity,
                            engagementScore: this.calculateEngagementScore({
                                ...engagement,
                                messagesCount: engagement.messagesCount + 1,
                            }),
                        },
                    });
                } else {
                    // Create new record
                    try {
                        engagement = await tx.discordEngagement.create({
                            data: {
                                discordId,
                                username,
                                displayName,
                                date: today,
                                messagesCount: 1,
                                mentionsCount,
                                channelActivity: { [channelId]: 1 },
                                engagementScore: 0,
                            },
                        });
                    } catch (error: any) {
                        // If unique constraint error, record was created by another request
                        // Retry by fetching and updating
                        if (error.code === 'P2002') {
                            logger.debug(`[EngagementTracker] Record already exists for ${discordId} on ${today.toISOString()}, retrying update...`);

                            // Fetch the existing record
                            engagement = await tx.discordEngagement.findUnique({
                                where: {
                                    discordId_date: {
                                        discordId,
                                        date: today,
                                    },
                                },
                            });

                            if (engagement) {
                                // Update it
                                const channelActivity = (engagement.channelActivity as any) || {};
                                channelActivity[channelId] = (channelActivity[channelId] || 0) + 1;

                                engagement = await tx.discordEngagement.update({
                                    where: {
                                        discordId_date: {
                                            discordId,
                                            date: today,
                                        },
                                    },
                                    data: {
                                        username,
                                        displayName,
                                        messagesCount: { increment: 1 },
                                        mentionsCount: { increment: mentionsCount },
                                        channelActivity,
                                        engagementScore: this.calculateEngagementScore({
                                            ...engagement,
                                            messagesCount: engagement.messagesCount + 1,
                                        }),
                                    },
                                });
                            }
                            return;
                        }
                        throw error;
                    }
                }
            });

            const channelName = 'name' in message.channel ? message.channel.name : 'DM';
            logger.info(
                `[EngagementTracker] Tracked message from ${username} in ${channelName}`
            );
        } catch (error) {
            logger.error("[EngagementTracker] Error tracking message:", error);
        }
    }

    /**
     * Track a reaction given by a user
     */
    async trackReactionGiven(
        reaction: MessageReaction,
        user: User | PartialUser
    ): Promise<void> {
        try {
            // Don't track bot reactions
            if (user.bot) {
                return;
            }

            // Fetch full user if partial
            const fullUser = user.partial ? await user.fetch() : user;

            // Get today's date at midnight UTC
            const now = new Date();
            const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

            const discordId = fullUser.id;
            const username = fullUser.username;
            const displayName = fullUser.displayName || fullUser.username;

            // Check if it's a helpful reaction
            const emojiName = reaction.emoji.name || "";
            const isHelpful = this.HELPFUL_REACTIONS.includes(emojiName);

            // Upsert daily engagement record
            const currentEngagement = await prisma.discordEngagement.findUnique({
                where: {
                    discordId_date: {
                        discordId,
                        date: today,
                    },
                },
            });

            if (currentEngagement) {
                await prisma.discordEngagement.update({
                    where: {
                        discordId_date: {
                            discordId,
                            date: today,
                        },
                    },
                    data: {
                        reactionsGiven: { increment: 1 },
                        engagementScore: this.calculateEngagementScore({
                            ...currentEngagement,
                            reactionsGiven: currentEngagement.reactionsGiven + 1,
                        }),
                    },
                });
            } else {
                try {
                    await prisma.discordEngagement.create({
                        data: {
                            discordId,
                            username,
                            displayName,
                            date: today,
                            reactionsGiven: 1,
                            engagementScore: this.calculateEngagementScore({
                                messagesCount: 0,
                                reactionsGiven: 1,
                                reactionsReceived: 0,
                                helpfulReactions: 0,
                            } as any),
                        },
                    });
                } catch (error: any) {
                    // If unique constraint error, record was created by another request - retry update
                    if (error.code === 'P2002') {
                        logger.debug(`[EngagementTracker] Record exists for ${discordId}, retrying reaction given update...`);
                        const engagement = await prisma.discordEngagement.findUnique({
                            where: { discordId_date: { discordId, date: today } },
                        });
                        if (engagement) {
                            await prisma.discordEngagement.update({
                                where: { discordId_date: { discordId, date: today } },
                                data: {
                                    reactionsGiven: { increment: 1 },
                                    engagementScore: this.calculateEngagementScore({
                                        ...engagement,
                                        reactionsGiven: engagement.reactionsGiven + 1,
                                    }),
                                },
                            });
                        }
                        return;
                    }
                    throw error;
                }
            }

            logger.debug(
                `[EngagementTracker] Tracked reaction given by ${username}: ${emojiName}`
            );
        } catch (error) {
            logger.error("[EngagementTracker] Error tracking reaction given:", error);
        }
    }

    /**
     * Track a reaction received by the message author
     */
    async trackReactionReceived(
        reaction: MessageReaction,
        messageAuthor: User
    ): Promise<void> {
        try {
            // Don't track reactions on bot messages
            if (messageAuthor.bot) {
                return;
            }

            // Get today's date at midnight UTC
            const now = new Date();
            const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

            const discordId = messageAuthor.id;
            const username = messageAuthor.username;
            const displayName = messageAuthor.displayName || messageAuthor.username;

            // Check if it's a helpful reaction
            const emojiName = reaction.emoji.name || "";
            const isHelpful = this.HELPFUL_REACTIONS.includes(emojiName);

            // Upsert daily engagement record
            const currentEngagement = await prisma.discordEngagement.findUnique({
                where: {
                    discordId_date: {
                        discordId,
                        date: today,
                    },
                },
            });

            if (currentEngagement) {
                await prisma.discordEngagement.update({
                    where: {
                        discordId_date: {
                            discordId,
                            date: today,
                        },
                    },
                    data: {
                        reactionsReceived: { increment: 1 },
                        helpfulReactions: isHelpful
                            ? { increment: 1 }
                            : currentEngagement.helpfulReactions,
                        engagementScore: this.calculateEngagementScore({
                            ...currentEngagement,
                            reactionsReceived: currentEngagement.reactionsReceived + 1,
                            helpfulReactions: isHelpful
                                ? currentEngagement.helpfulReactions + 1
                                : currentEngagement.helpfulReactions,
                        }),
                    },
                });
            } else {
                try {
                    await prisma.discordEngagement.create({
                        data: {
                            discordId,
                            username,
                            displayName,
                            date: today,
                            reactionsReceived: 1,
                            helpfulReactions: isHelpful ? 1 : 0,
                            engagementScore: this.calculateEngagementScore({
                                messagesCount: 0,
                                reactionsGiven: 0,
                                reactionsReceived: 1,
                                helpfulReactions: isHelpful ? 1 : 0,
                            } as any),
                        },
                    });
                } catch (error: any) {
                    // If unique constraint error, record was created by another request - retry update
                    if (error.code === 'P2002') {
                        logger.debug(`[EngagementTracker] Record exists for ${discordId}, retrying reaction received update...`);
                        const engagement = await prisma.discordEngagement.findUnique({
                            where: { discordId_date: { discordId, date: today } },
                        });
                        if (engagement) {
                            await prisma.discordEngagement.update({
                                where: { discordId_date: { discordId, date: today } },
                                data: {
                                    reactionsReceived: { increment: 1 },
                                    helpfulReactions: isHelpful
                                        ? { increment: 1 }
                                        : engagement.helpfulReactions,
                                    engagementScore: this.calculateEngagementScore({
                                        ...engagement,
                                        reactionsReceived: engagement.reactionsReceived + 1,
                                        helpfulReactions: isHelpful
                                            ? engagement.helpfulReactions + 1
                                            : engagement.helpfulReactions,
                                    }),
                                },
                            });
                        }
                        return;
                    }
                    throw error;
                }
            }

            logger.debug(
                `[EngagementTracker] Tracked reaction received by ${username}: ${emojiName} (helpful: ${isHelpful})`
            );
        } catch (error) {
            logger.error("[EngagementTracker] Error tracking reaction received:", error);
        }
    }

    /**
     * Calculate engagement score based on activity
     * Formula: Messages(1) + ReactionsGiven(0.5) + ReactionsReceived(0.3) + HelpfulReactions(2)
     */
    private calculateEngagementScore(engagement: {
        messagesCount: number;
        reactionsGiven: number;
        reactionsReceived: number;
        helpfulReactions: number;
    }): number {
        const messageScore = engagement.messagesCount * 1.0;
        const reactionsGivenScore = engagement.reactionsGiven * 0.5;
        const reactionsReceivedScore = engagement.reactionsReceived * 0.3;
        const helpfulScore = engagement.helpfulReactions * 2.0;

        return messageScore + reactionsGivenScore + reactionsReceivedScore + helpfulScore;
    }

    /**
     * Get top engaged users for a period
     */
    async getTopEngagedUsers(
        startDate: Date,
        endDate: Date,
        limit: number = 10
    ): Promise<any[]> {
        try {
            const engagements = await prisma.discordEngagement.groupBy({
                by: ["discordId", "username", "displayName"],
                where: {
                    date: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                _sum: {
                    messagesCount: true,
                    reactionsGiven: true,
                    reactionsReceived: true,
                    helpfulReactions: true,
                    engagementScore: true,
                },
                orderBy: {
                    _sum: {
                        engagementScore: "desc",
                    },
                },
                take: limit,
            });

            return engagements;
        } catch (error) {
            logger.error("[EngagementTracker] Error getting top engaged users:", error);
            return [];
        }
    }

    /**
     * Award engagement rank to a user
     */
    async awardRank(
        discordId: string,
        rank: string,
        reason: string,
        userId?: number
    ): Promise<void> {
        try {
            await prisma.engagementRank.create({
                data: {
                    discordId,
                    userId,
                    rank,
                    reason,
                    active: true,
                },
            });

            logger.info(`[EngagementTracker] Awarded rank "${rank}" to ${discordId}: ${reason}`);
        } catch (error) {
            logger.error("[EngagementTracker] Error awarding rank:", error);
        }
    }
}

// Singleton instance
let engagementTrackerInstance: EngagementTrackerService | null = null;

export function getEngagementTrackerService(client: Client): EngagementTrackerService {
    if (!engagementTrackerInstance) {
        engagementTrackerInstance = new EngagementTrackerService(client);
    }
    return engagementTrackerInstance;
}
