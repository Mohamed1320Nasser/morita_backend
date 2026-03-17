import { Events, GuildMember, TextChannel, EmbedBuilder } from "discord.js";
import { OnboardingManagerService } from "../services/onboardingManager.service";
import { discordConfig } from "../config/discord.config";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

export default {
    name: Events.GuildMemberAdd,
    once: false,

    async execute(member: GuildMember) {
        try {
            logger.info(`[MemberAdd] 👋 New member joined: ${member.user.tag} (${member.id})`);

            // ========================================
            // PROFESSIONAL INVITE-BASED REFERRAL TRACKING
            // ========================================
            if (member.client.inviteCache) {
                // Run referral tracking asynchronously without blocking user experience
                Promise.resolve().then(async () => {
                    try {
                        logger.info(`[Referral] 🔍 Detecting which invite was used...`);

                        // Use invite cache to detect which invite was used
                        const usedInvite = await member.client.inviteCache!.detectUsedInvite(member.guild);

                        if (usedInvite && usedInvite.inviterId) {
                            logger.info(
                                `[Referral] ✅ Invite detected: ` +
                                `Code=${usedInvite.code}, ` +
                                `Inviter=${usedInvite.inviterTag} (${usedInvite.inviterId}), ` +
                                `New Member=${member.user.tag} (${member.id})`
                            );

                            // Track referral in database
                            try {
                                await discordApiClient.post('/referral/track', {
                                    referrerDiscordId: usedInvite.inviterId,
                                    referredDiscordId: member.id,
                                    inviteCode: usedInvite.code,
                                });
                                logger.info(`[Referral] ✅ Tracked referral in database`);
                            } catch (trackError: any) {
                                logger.error(`[Referral] Failed to track referral in database:`, trackError.message);
                            }

                            // Send notification to referral channel (if configured)
                            const referralChannelId = process.env.DISCORD_REFERRAL_CHANNEL_ID;
                            if (referralChannelId) {
                                try {
                                    const channel = member.guild.channels.cache.get(referralChannelId) as TextChannel;
                                    if (channel) {
                                        const referrer = await member.guild.members.fetch(usedInvite.inviterId).catch(() => null);

                                        const embed = new EmbedBuilder()
                                            .setColor(0x00FF00)
                                            .setTitle("🎉 New Referral!")
                                            .setDescription(
                                                `${referrer ? `<@${usedInvite.inviterId}>` : usedInvite.inviterTag} referred ${member}`
                                            )
                                            .addFields(
                                                { name: "Referrer", value: usedInvite.inviterTag || "Unknown", inline: true },
                                                { name: "New Member", value: member.user.tag, inline: true },
                                                { name: "Invite Code", value: `\`${usedInvite.code}\``, inline: true }
                                            )
                                            .setFooter({ text: `They'll earn $5 when ${member.user.username} completes onboarding` })
                                            .setTimestamp();

                                        await channel.send({ embeds: [embed.toJSON() as any] });
                                        logger.info(`[Referral] ✅ Posted notification to referral channel`);
                                    }
                                } catch (channelError: any) {
                                    logger.error(`[Referral] Failed to post to referral channel:`, channelError.message);
                                }
                            }

                            // Send DM to referrer
                            try {
                                const referrer = await member.guild.members.fetch(usedInvite.inviterId).catch(() => null);
                                if (referrer) {
                                    await referrer.send(
                                        `🎁 **${member.user.tag}** joined using your invite link! ` +
                                        `Once they complete onboarding, you'll earn **$5**.`
                                    );
                                    logger.info(`[Referral] ✅ Sent DM to referrer`);
                                }
                            } catch (dmError) {
                                logger.warn(`[Referral] Could not DM referrer ${usedInvite.inviterTag}`);
                            }
                        } else {
                            logger.info(`[Referral] ℹ️ No invite detected for ${member.user.tag} - organic join or vanity URL`);
                        }
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
