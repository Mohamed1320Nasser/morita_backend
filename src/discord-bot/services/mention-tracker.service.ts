import {
    Client,
    Message,
    TextChannel,
    EmbedBuilder,
    User,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
} from "discord.js";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";
import { discordConfig } from "../config/discord.config";

// Get timing from config (configurable via .env)
const CHANNEL_REMINDER_DELAY_MINUTES = discordConfig.mentionChannelReminderDelayMinutes;
const DM_REMINDER_DELAY_MINUTES = discordConfig.mentionDmReminderDelayMinutes;
const CHECK_INTERVAL_MS = discordConfig.mentionCheckIntervalMinutes * 60 * 1000;

export class MentionTrackerService {
    private client: Client;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Start the reminder scheduler
     */
    start(): void {
        logger.info("[MentionTracker] Starting mention tracker service...");
        logger.info(`[MentionTracker] Config: Channel reminder=${CHANNEL_REMINDER_DELAY_MINUTES}min, DM reminder=${DM_REMINDER_DELAY_MINUTES}min, Check interval=${discordConfig.mentionCheckIntervalMinutes}min`);

        // Run check immediately, then at configured interval
        this.checkPendingMentions();
        this.checkInterval = setInterval(() => {
            this.checkPendingMentions();
        }, CHECK_INTERVAL_MS);

        logger.info("[MentionTracker] Mention tracker service started");
    }

    /**
     * Stop the reminder scheduler
     */
    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        logger.info("[MentionTracker] Mention tracker service stopped");
    }

    /**
     * Track a mention from a message
     * Simple: Any user mentions another user → track it
     */
    async trackMention(message: Message): Promise<void> {
        try {
            // Skip bot messages
            if (message.author.bot) return;

            // Get mentioned users (excluding bots)
            const mentionedUsers = message.mentions.users.filter(u => !u.bot);
            if (mentionedUsers.size === 0) return;

            // Build message URL
            const guildId = message.guildId;
            const messageUrl = guildId
                ? `https://discord.com/channels/${guildId}/${message.channelId}/${message.id}`
                : null;

            // Track each mention
            for (const [userId, user] of mentionedUsers) {
                // Don't track self-mentions
                if (userId === message.author.id) continue;

                // Create or update mention tracker
                await prisma.mentionTracker.upsert({
                    where: {
                        channelId_messageId_mentionedUserId: {
                            channelId: message.channelId,
                            messageId: message.id,
                            mentionedUserId: userId,
                        },
                    },
                    create: {
                        channelId: message.channelId,
                        messageId: message.id,
                        messageUrl,
                        mentionedUserId: userId,
                        mentionedByUserId: message.author.id,
                        reminderDelayMinutes: CHANNEL_REMINDER_DELAY_MINUTES,
                    },
                    update: {
                        // Reset if mention is repeated
                        hasResponded: false,
                        channelReminderSent: false,
                        dmReminderSent: false,
                        mentionedAt: new Date(),
                    },
                });

                logger.info(
                    `[MentionTracker] Tracked: ${message.author.tag} mentioned ${user.tag} in channel ${message.channelId}`
                );
            }
        } catch (error) {
            logger.error("[MentionTracker] Error tracking mention:", error);
        }
    }

    /**
     * Mark a user as responded in a channel (when they send a message)
     */
    async markAsResponded(channelId: string, userId: string): Promise<void> {
        try {
            const result = await prisma.mentionTracker.updateMany({
                where: {
                    channelId,
                    mentionedUserId: userId,
                    hasResponded: false,
                    isActive: true,
                },
                data: {
                    hasResponded: true,
                    respondedAt: new Date(),
                },
            });

            if (result.count > 0) {
                logger.info(`[MentionTracker] User ${userId} responded in channel ${channelId} (${result.count} mentions cleared)`);
            }
        } catch (error) {
            logger.error("[MentionTracker] Error marking as responded:", error);
        }
    }

    /**
     * Mark as responded when user reacts to the message they were mentioned in
     */
    async markAsRespondedByReaction(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser
    ): Promise<void> {
        try {
            if (user.bot) return;

            const result = await prisma.mentionTracker.updateMany({
                where: {
                    channelId: reaction.message.channelId,
                    messageId: reaction.message.id,
                    mentionedUserId: user.id,
                    hasResponded: false,
                    isActive: true,
                },
                data: {
                    hasResponded: true,
                    respondedAt: new Date(),
                },
            });

            if (result.count > 0) {
                logger.info(`[MentionTracker] User ${user.id} reacted to message, marked as responded`);
            }
        } catch (error) {
            logger.error("[MentionTracker] Error marking as responded by reaction:", error);
        }
    }

    /**
     * Check for pending mentions and send reminders
     */
    private async checkPendingMentions(): Promise<void> {
        try {
            const now = new Date();

            logger.info("[MentionTracker] Checking for pending mentions...");

            // Get mentions needing channel reminder (X+ minutes, no response, no channel reminder sent)
            const needsChannelReminder = await prisma.mentionTracker.findMany({
                where: {
                    isActive: true,
                    hasResponded: false,
                    channelReminderSent: false,
                    mentionedAt: {
                        lte: new Date(now.getTime() - CHANNEL_REMINDER_DELAY_MINUTES * 60 * 1000),
                    },
                },
                take: 50, // Process in batches
            });

            logger.info(`[MentionTracker] Found ${needsChannelReminder.length} mentions needing channel reminder`);

            for (const mention of needsChannelReminder) {
                await this.sendChannelReminder(mention);
            }

            // Check active mentions with channel reminder sent (for debugging)
            const activeWithChannelReminder = await prisma.mentionTracker.findMany({
                where: {
                    isActive: true,
                    hasResponded: false,
                    channelReminderSent: true,
                    dmReminderSent: false,
                },
            });

            if (activeWithChannelReminder.length > 0) {
                logger.info(`[MentionTracker] Active mentions waiting for DM: ${activeWithChannelReminder.length}`);
                for (const m of activeWithChannelReminder) {
                    const timeSinceChannelReminder = m.channelReminderSentAt
                        ? Math.floor((now.getTime() - new Date(m.channelReminderSentAt).getTime()) / 60000)
                        : 'N/A';
                    logger.info(`[MentionTracker] - Mention ${m.id}: channelReminderSentAt=${m.channelReminderSentAt}, timeSince=${timeSinceChannelReminder}min, needsWait=${DM_REMINDER_DELAY_MINUTES}min`);
                }
            }

            // Get mentions needing DM reminder (Y+ minutes after channel reminder, no response, no DM sent)
            const needsDmReminder = await prisma.mentionTracker.findMany({
                where: {
                    isActive: true,
                    hasResponded: false,
                    channelReminderSent: true,
                    dmReminderSent: false,
                    channelReminderSentAt: {
                        lte: new Date(now.getTime() - DM_REMINDER_DELAY_MINUTES * 60 * 1000),
                    },
                },
                take: 50,
            });

            logger.info(`[MentionTracker] Found ${needsDmReminder.length} mentions needing DM reminder`);

            for (const mention of needsDmReminder) {
                await this.sendDmReminder(mention);
            }

        } catch (error) {
            logger.error("[MentionTracker] Error checking pending mentions:", error);
        }
    }

    /**
     * Send reminder in the channel
     */
    private async sendChannelReminder(mention: any): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(mention.channelId).catch(() => null) as TextChannel | null;
            if (!channel || !channel.isTextBased()) {
                // Channel not found, deactivate mention
                await prisma.mentionTracker.update({
                    where: { id: mention.id },
                    data: { isActive: false },
                });
                logger.warn(`[MentionTracker] Channel ${mention.channelId} not found, deactivated mention`);
                return;
            }

            const mentionedBy = await this.client.users.fetch(mention.mentionedByUserId).catch(() => null);
            const mentionedByText = mentionedBy ? `<@${mentionedBy.id}>` : "someone";

            // Build message link
            const messageLink = mention.messageUrl
                ? `[View Message](${mention.messageUrl})`
                : "";

            await channel.send({
                content: `🔔 <@${mention.mentionedUserId}> reminder: You were mentioned by ${mentionedByText} and haven't responded yet. ${messageLink}`,
                allowedMentions: { users: [mention.mentionedUserId] },
            });

            // Update tracker
            await prisma.mentionTracker.update({
                where: { id: mention.id },
                data: {
                    channelReminderSent: true,
                    channelReminderSentAt: new Date(),
                },
            });

            logger.info(
                `[MentionTracker] Sent channel reminder to ${mention.mentionedUserId} in ${mention.channelId}`
            );
        } catch (error) {
            logger.error("[MentionTracker] Error sending channel reminder:", error);
            // Deactivate on error to prevent spam
            await prisma.mentionTracker.update({
                where: { id: mention.id },
                data: { isActive: false },
            }).catch(() => {});
        }
    }

    /**
     * Send reminder via DM
     */
    private async sendDmReminder(mention: any): Promise<void> {
        try {
            const mentionedUser = await this.client.users.fetch(mention.mentionedUserId).catch(() => null);
            if (!mentionedUser) {
                await prisma.mentionTracker.update({
                    where: { id: mention.id },
                    data: { isActive: false },
                });
                return;
            }

            const mentionedBy = await this.client.users.fetch(mention.mentionedByUserId).catch(() => null);
            const mentionedByText = mentionedBy ? mentionedBy.tag : "someone";

            const embed = new EmbedBuilder()
                .setTitle("🔔 Reminder")
                .setDescription(
                    `You were mentioned by **${mentionedByText}** and still haven't responded.\n\n` +
                    `Please check and respond to the message.`
                )
                .setColor(0xffa500)
                .setTimestamp();

            if (mention.messageUrl) {
                embed.addFields({
                    name: "📎 Message Link",
                    value: `[Click here to view](${mention.messageUrl})`,
                    inline: false,
                });
            }

            await mentionedUser.send({
                embeds: [embed.toJSON() as any],
            });

            // Update tracker - stop tracking after DM
            await prisma.mentionTracker.update({
                where: { id: mention.id },
                data: {
                    dmReminderSent: true,
                    dmReminderSentAt: new Date(),
                    isActive: false,
                },
            });

            logger.info(`[MentionTracker] Sent DM reminder to ${mentionedUser.tag}`);
        } catch (error) {
            logger.error("[MentionTracker] Error sending DM reminder:", error);
            // Mark as sent anyway to prevent spam (user might have DMs disabled)
            await prisma.mentionTracker.update({
                where: { id: mention.id },
                data: {
                    dmReminderSent: true,
                    dmReminderSentAt: new Date(),
                    isActive: false,
                },
            }).catch(() => {});
        }
    }

    /**
     * Cleanup old records (older than 7 days)
     */
    async cleanup(): Promise<void> {
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const result = await prisma.mentionTracker.deleteMany({
                where: {
                    OR: [
                        { hasResponded: true, respondedAt: { lte: sevenDaysAgo } },
                        { isActive: false, updatedAt: { lte: sevenDaysAgo } },
                    ],
                },
            });

            if (result.count > 0) {
                logger.info(`[MentionTracker] Cleaned up ${result.count} old records`);
            }
        } catch (error) {
            logger.error("[MentionTracker] Error during cleanup:", error);
        }
    }
}

// Singleton instance
let mentionTrackerInstance: MentionTrackerService | null = null;

export function getMentionTrackerService(client: Client): MentionTrackerService {
    if (!mentionTrackerInstance) {
        mentionTrackerInstance = new MentionTrackerService(client);
    }
    return mentionTrackerInstance;
}

export default MentionTrackerService;
