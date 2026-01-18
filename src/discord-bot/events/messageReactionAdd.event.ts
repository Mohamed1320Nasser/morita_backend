import { Events, MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import logger from "../../common/loggers";
import { getMentionTrackerService } from "../services/mention-tracker.service";

export default {
    name: Events.MessageReactionAdd,
    async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        try {
            // Skip bot reactions
            if (user.bot) return;

            // Mark user as responded if they react to a message where they were mentioned
            const mentionTracker = getMentionTrackerService(reaction.client);
            await mentionTracker.markAsRespondedByReaction(reaction, user);
        } catch (error) {
            logger.error("[MessageReactionAdd] Error handling reaction:", error);
        }
    },
};
