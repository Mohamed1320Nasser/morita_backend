import { Events, Invite } from "discord.js";
import logger from "../../common/loggers";

/**
 * Keeps the invite snapshot current so a join through a brand-new invite is
 * attributed correctly instead of being missed.
 */
export default {
    name: Events.InviteCreate,
    once: false,

    async execute(invite: Invite) {
        try {
            if (!invite.guild) return;
            invite.client.inviteCache?.addInvite(invite.guild.id, invite);
            logger.debug(`[InviteCache] Added new invite ${invite.code}`);
        } catch (error: any) {
            logger.warn(`[InviteCache] Failed to add invite ${invite.code}: ${error?.message}`);
        }
    },
};
