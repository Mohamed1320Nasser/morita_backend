import { Events, GuildMember, PartialGuildMember } from "discord.js";
import logger from "../../common/loggers";
import { syncUserDiscordRole, getHighestDiscordRole } from "../utils/role-sync.util";
import { discordConfig } from "../config/discord.config";

export default {
    name: Events.GuildMemberUpdate,
    async execute(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
        try {
            // Check if roles changed
            const oldRoles = oldMember.roles?.cache;
            const newRoles = newMember.roles.cache;

            const rolesChanged = !oldRoles ||
                oldRoles.has(discordConfig.adminRoleId) !== newRoles.has(discordConfig.adminRoleId) ||
                oldRoles.has(discordConfig.supportRoleId) !== newRoles.has(discordConfig.supportRoleId) ||
                oldRoles.has(discordConfig.workersRoleId) !== newRoles.has(discordConfig.workersRoleId);

            // Check if display name changed
            const displayNameChanged = oldMember.displayName !== newMember.displayName;

            // Check if username changed
            const usernameChanged = oldMember.user?.username !== newMember.user.username;

            // If any relevant change, sync to database
            if (rolesChanged || displayNameChanged || usernameChanged) {
                const syncResult = await syncUserDiscordRole(newMember);

                if (syncResult?.updated) {
                    logger.info(
                        `[GuildMemberUpdate] Synced ${newMember.user.tag}: ` +
                        `role=${syncResult.discordRole}, walletType=${syncResult.walletType}`
                    );
                }

                if (rolesChanged) {
                    const oldRole = oldRoles ? getHighestDiscordRole(oldMember as GuildMember) : "unknown";
                    const newRole = getHighestDiscordRole(newMember);
                    logger.info(`[GuildMemberUpdate] Role changed for ${newMember.user.tag}: ${oldRole} -> ${newRole}`);
                }

                if (displayNameChanged) {
                    logger.info(`[GuildMemberUpdate] Display name changed for ${newMember.user.tag}: ${oldMember.displayName} -> ${newMember.displayName}`);
                }
            }
        } catch (error) {
            logger.error("[GuildMemberUpdate] Error syncing member:", error);
        }
    },
};
