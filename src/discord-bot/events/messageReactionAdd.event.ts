import { Events, MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import logger from "../../common/loggers";
import { getMentionTrackerService } from "../services/mention-tracker.service";
import { getEngagementTrackerService } from "../services/engagement-tracker.service";

export default {
    name: Events.MessageReactionAdd,
    async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        try {
            logger.info(`[MessageReactionAdd] Reaction event received from ${user.username || user.id}`);

            // Skip bot reactions
            if (user.bot) {
                logger.debug(`[MessageReactionAdd] Skipping bot reaction`);
                return;
            }

            // Fetch partial reaction and message if needed
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    logger.error("[MessageReactionAdd] Failed to fetch partial reaction:", error);
                    return;
                }
            }

            if (reaction.message.partial) {
                try {
                    await reaction.message.fetch();
                } catch (error) {
                    logger.error("[MessageReactionAdd] Failed to fetch partial message:", error);
                    return;
                }
            }

            // Mark user as responded if they react to a message where they were mentioned
            const mentionTracker = getMentionTrackerService(reaction.client);
            await mentionTracker.markAsRespondedByReaction(reaction, user);

            // Track engagement for KPI #3: Discord Engagement & Interaction
            const engagementTracker = getEngagementTrackerService(reaction.client);

            // Track reaction given by the user
            await engagementTracker.trackReactionGiven(reaction as MessageReaction, user);

            // Track reaction received by the message author (if not the same user)
            if (reaction.message.author && reaction.message.author.id !== user.id) {
                await engagementTracker.trackReactionReceived(reaction as MessageReaction, reaction.message.author);
            }
        } catch (error) {
            logger.error("[MessageReactionAdd] Error handling reaction:", error);
        }
    },
};
