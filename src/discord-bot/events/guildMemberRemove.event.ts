import { Events, GuildMember, AuditLogEvent } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

export default {
    name: Events.GuildMemberRemove,
    once: false,

    async execute(member: GuildMember) {
        try {
            logger.info(`[MemberRemove] Member left: ${member.user.tag} (${member.id})`);

            // Determine leave reason from audit logs
            let leaveType = 'LEAVE'; // Default to voluntary leave
            let reason = null;

            // Check for kick
            try {
                const kickLogs = await member.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.MemberKick
                });

                const kickLog = kickLogs.entries.first();

                // Check if this kick happened within last 5 seconds and matches this user
                if (kickLog &&
                    kickLog.target?.id === member.id &&
                    Date.now() - kickLog.createdTimestamp < 5000) {
                    leaveType = 'KICK';
                    reason = kickLog.reason || 'No reason provided';
                    logger.info(`[MemberRemove] User was kicked. Reason: ${reason}`);
                }
            } catch (error) {
                logger.warn("[MemberRemove] Could not fetch kick audit log", error);
            }

            // Check for ban (only if not already identified as kick)
            if (leaveType === 'LEAVE') {
                try {
                    const banLogs = await member.guild.fetchAuditLogs({
                        limit: 1,
                        type: AuditLogEvent.MemberBanAdd
                    });

                    const banLog = banLogs.entries.first();

                    // Check if this ban happened within last 5 seconds and matches this user
                    if (banLog &&
                        banLog.target?.id === member.id &&
                        Date.now() - banLog.createdTimestamp < 5000) {
                        leaveType = 'BAN';
                        reason = banLog.reason || 'No reason provided';
                        logger.info(`[MemberRemove] User was banned. Reason: ${reason}`);
                    }
                } catch (error) {
                    logger.warn("[MemberRemove] Could not fetch ban audit log", error);
                }
            }

            // Record to database via API
            try {
                await discordApiClient.post('/kpi/member-activity', {
                    discordId: member.id,
                    username: member.user.username,
                    displayName: member.displayName || member.user.displayName,
                    eventType: leaveType,
                    reason: reason,
                    timestamp: new Date().toISOString()
                });

                logger.info(`[MemberRemove] ✅ Activity recorded: ${member.user.tag} - Type: ${leaveType}`);
            } catch (apiError: any) {
                logger.error(`[MemberRemove] Failed to record activity to API:`, apiError.message);
            }

            // Update referral status
            try {
                await discordApiClient.post('/referral/member-left', {
                    discordId: member.id,
                    leftAt: new Date().toISOString(),
                    leaveType
                });

                logger.info(`[MemberRemove] ✅ Referral status updated for ${member.user.tag}`);
            } catch (referralError: any) {
                if (referralError.response?.status !== 404) {
                    logger.error(`[MemberRemove] Failed to update referral status:`, referralError.message);
                }
            }

        } catch (error) {
            logger.error("[MemberRemove] Error in guildMemberRemove event:", error);
        }
    }
};
