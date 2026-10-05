import { Events, GuildMember } from "discord.js";
import { OnboardingManagerService } from "../services/onboardingManager.service";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";
import { unwrapApiData } from "../utils/apiResponse.util";
import { notifyReferralJoined } from "../services/referralNotifier.service";

export default {
    name: Events.GuildMemberAdd,
    once: false,

    async execute(member: GuildMember) {
        try {
            logger.info(`[MemberAdd] 👋 New member joined: ${member.user.tag} (${member.id})`);

            // ========================================
            // INVITE-BASED REFERRAL TRACKING
            // ========================================
            if (member.client.inviteCache) {
                // Runs detached so the member's onboarding is never delayed by it
                Promise.resolve().then(async () => {
                    try {
                        const usedInvite = await member.client.inviteCache!.detectUsedInvite(member.guild);

                        if (!usedInvite) {
                            logger.info(`[Referral] ℹ️ No invite detected for ${member.user.tag} - organic join or vanity URL`);
                            return;
                        }

                        // The backend resolves the real owner from the invite code: personal
                        // links are created by the bot, so Discord reports the bot as inviter.
                        let tracked: { isNew: boolean; rewardEligible?: boolean; referrerDiscordId: string } | null = null;
                        try {
                            const response = await discordApiClient.post('/referral/track', {
                                referrerDiscordId: usedInvite.inviterId || undefined,
                                referredDiscordId: member.id,
                                inviteCode: usedInvite.code,
                            });
                            tracked = unwrapApiData(response);
                        } catch (trackError: any) {
                            const status = trackError?.response?.status;
                            const reason = trackError?.response?.data?.msg || trackError.message;
                            // 400/404 are expected refusals: unknown referrer, self-referral, returning member
                            if (status === 400 || status === 404) {
                                logger.info(`[Referral] Join via ${usedInvite.code} not tracked: ${reason}`);
                            } else {
                                logger.error(`[Referral] Failed to track referral in database: ${reason}`);
                            }
                            return;
                        }

                        if (!tracked?.isNew) {
                            logger.info(`[Referral] ${member.user.tag} already has a referral on record; not announcing again`);
                            return;
                        }

                        logger.info(`[Referral] ✅ Tracked ${tracked.referrerDiscordId} → ${member.id} via ${usedInvite.code}`);

                        // Joined while rewards were off: recorded, but nothing to announce or promise
                        if (tracked.rewardEligible === false) return;

                        await notifyReferralJoined(member.client, {
                            referrerDiscordId: tracked.referrerDiscordId,
                            memberId: member.id,
                            memberTag: member.user.tag,
                            inviteCode: usedInvite.code,
                        });
                    } catch (refError: any) {
                        logger.error(`[Referral] Failed to track referral:`, refError.message);
                    }
                });
            }

            // ========================================
            // UPDATE REFERRAL STATUS (if rejoining)
            // ========================================
            try {
                await discordApiClient.post('/referral/member-rejoined', {
                    discordId: member.id,
                    rejoinedAt: new Date().toISOString()
                });
                logger.info(`[Referral] Updated status for rejoining member`);
            } catch (rejoinError: any) {
                if (rejoinError.response?.status !== 404) {
                    logger.debug(`[Referral] Member not previously tracked or error:`, rejoinError.message);
                }
            }

            // ========================================
            // ONBOARDING FLOW
            // ========================================
            const onboardingManager = new OnboardingManagerService(member.client);
            await onboardingManager.handleNewMember(member);

        } catch (error) {
            logger.error("[MemberAdd] Error in guildMemberAdd event:", error);
        }
    }
};
