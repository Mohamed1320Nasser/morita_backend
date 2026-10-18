import { Events, Invite } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

/**
 * Drops a deleted invite from the snapshot and deactivates it in the
 * personal-invite table, so /referral hands out a fresh link next time.
 */
export default {
    name: Events.InviteDelete,
    once: false,

    async execute(invite: Invite) {
        try {
            if (invite.guild) {
                invite.client.inviteCache?.removeInvite(invite.guild.id, invite.code);
            }
            await discordApiClient.post("/referral/invite/deactivate", { inviteCode: invite.code });
        } catch (error: any) {
            logger.warn(`[InviteCache] Failed to handle deleted invite ${invite.code}: ${error?.message}`);
        }
    },
};
