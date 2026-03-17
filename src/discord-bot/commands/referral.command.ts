import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import axios from "axios";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("referral")
        .setDescription("View your referral stats and personal invite link"),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            // Defer immediately to prevent timeout
            await interaction.deferReply({ ephemeral: true });

            const discordId = interaction.user.id;

            // Fetch user's referral stats from API
            let stats;
            try {
                const statsResponse = await axios.get(`${discordConfig.apiBaseUrl}/referral/stats/discord/${discordId}`);
                stats = statsResponse.data;
                logger.info(`[Referral Command] Stats received for ${interaction.user.tag}:`, JSON.stringify(stats));
            } catch (statsError: any) {
                logger.error(`[Referral Command] Failed to fetch stats:`, statsError.message);
                return interaction.editReply({
                    content: "❌ Could not fetch stats. Complete onboarding first!",
                });
            }

            // Fetch referral reward configuration to show current reward amount
            let rewardConfig;
            try {
                const configResponse = await axios.get(`${discordConfig.apiBaseUrl}/referral-reward/config`);
                rewardConfig = configResponse.data;
            } catch (configError: any) {
                logger.warn(`[Referral Command] Could not fetch reward config:`, configError.message);
                rewardConfig = { rewardAmount: 5, currencyName: "$", isEnabled: true };
            }

            // Get user's personal invite link (or create one)
            let inviteUrl: string | null = null;
            let inviteErrorMessage: string | null = null;

            try {
                if (!interaction.client.inviteCache) {
                    throw new Error("Invite cache not initialized");
                }

                // Check if user already has an active invite
                const userInvites = interaction.client.inviteCache.getUserInvites(
                    interaction.guild?.id || "",
                    discordId
                );

                if (userInvites.length > 0) {
                    // Use existing invite
                    const invite = userInvites[0];
                    inviteUrl = `https://discord.gg/${invite.code}`;
                    logger.info(`[Referral Command] Using existing invite: ${invite.code}`);
                } else {
                    // Create new invite
                    if (!interaction.guild) {
                        throw new Error("Guild not found");
                    }

                    // Find suitable channel (general or first text channel)
                    const channel = interaction.guild.channels.cache.find(
                        ch => ch.isTextBased() && (ch.name === 'general' || ch.name === 'welcome')
                    ) || interaction.guild.channels.cache.find(ch => ch.isTextBased());

                    if (!channel) {
                        inviteErrorMessage = "No suitable channel found";
                        logger.error(`[Referral Command] ${inviteErrorMessage}`);
                    } else if (!('createInvite' in channel)) {
                        inviteErrorMessage = "Channel does not support invites";
                        logger.error(`[Referral Command] ${inviteErrorMessage}`);
                    } else {
                        // Check if bot has permission to create invites
                        const botMember = await interaction.guild.members.fetch(interaction.client.user!.id);
                        if (!botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
                            inviteErrorMessage = "Bot missing CREATE_INSTANT_INVITE permission";
                            logger.error(`[Referral Command] ${inviteErrorMessage}`);
                        } else {
                            const discordInvite = await channel.createInvite({
                                maxAge: 0, // Never expires
                                maxUses: 0, // Unlimited uses
                                unique: true, // Create a new unique invite
                                reason: `Personal referral invite for ${interaction.user.tag}`
                            });

                            inviteUrl = discordInvite.url;

                            // Update invite cache
                            await interaction.client.inviteCache.cacheGuildInvites(interaction.guild);

                            logger.info(`[Referral Command] ✅ Created new invite: ${discordInvite.code}`);
                        }
                    }
                }
            } catch (inviteError: any) {
                logger.error(`[Referral Command] Error getting invite:`, inviteError.message);
                if (inviteError.message?.includes('permission')) {
                    inviteErrorMessage = "Bot missing permissions";
                } else {
                    inviteErrorMessage = "Error creating invite";
                }
            }

            // Build embed with stats and invite link
            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle("🎁 Your Referral Stats")
                .setDescription(
                    rewardConfig.isEnabled
                        ? `Share your **personal invite link** and earn **${rewardConfig.currencyName}${rewardConfig.rewardAmount}** for each person who completes onboarding!`
                        : `Share your **personal invite link** to invite friends! (Rewards currently disabled)`
                )
                .addFields(
                    {
                        name: "📊 Total Referrals",
                        value: (stats.totalReferrals || 0).toString(),
                        inline: true,
                    },
                    {
                        name: "✅ Successful",
                        value: (stats.successfulReferrals || 0).toString(),
                        inline: true,
                    },
                    {
                        name: "⏳ Pending",
                        value: (stats.pendingReferrals || 0).toString(),
                        inline: true,
                    },
                    {
                        name: "💰 Rewards Earned",
                        value: `$${(stats.totalRewards || 0).toFixed(2)}`,
                        inline: false,
                    },
                    {
                        name: "🔗 Your Personal Invite Link",
                        value: inviteUrl || (inviteErrorMessage ? `❌ ${inviteErrorMessage}` : "Could not generate invite"),
                        inline: false,
                    }
                )
                .setFooter({ text: "Share your link to start earning!" })
                .setTimestamp();

            // Add recent referrals section
            if (stats.recentReferrals && stats.recentReferrals.length > 0) {
                const recentList = stats.recentReferrals
                    .slice(0, 5)
                    .map((r: any, i: number) => {
                        const status = r.rewardGiven ? "✅" : r.onboardedAt ? "⏳" : "❌";
                        const name = r.referredUser?.discordUsername || r.referredDiscordId;
                        return `${status} ${name}`;
                    })
                    .join("\n");

                embed.addFields({
                    name: "🆕 Recent (✅ Rewarded, ⏳ Pending, ❌ Not Onboarded)",
                    value: recentList,
                });
            }

            await interaction.editReply({ embeds: [embed.toJSON() as any] });

        } catch (error: any) {
            logger.error("[Referral Command] Fatal error:", error.message);

            const errorMessage = error.message?.includes('Unknown interaction')
                ? "❌ Command timed out. Please try again."
                : `❌ Error: ${error.message || 'Unknown error'}`;

            try {
                await interaction.editReply({ content: errorMessage });
            } catch (replyError) {
                logger.error("[Referral Command] Could not send error message");
            }
        }
    },
};
