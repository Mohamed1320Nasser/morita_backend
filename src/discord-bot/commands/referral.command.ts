import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import { unwrapApiData } from "../utils/apiResponse.util";
import {
    fetchReferralConfig,
    perReferralReward,
    describeRequirement,
    describeOrderReward,
    formatMoney,
} from "../services/referralNotifier.service";
import { getOrCreatePersonalInvite } from "../services/personalInvite.service";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("referral")
        .setDescription("View your referral stats and personal invite link"),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const discordId = interaction.user.id;

            let stats: any;
            try {
                stats = unwrapApiData(await discordApiClient.get(`/referral/stats/discord/${discordId}`));
            } catch (statsError: any) {
                logger.error(`[Referral Command] Failed to fetch stats:`, statsError.message);
                return interaction.editReply({
                    content: statsError?.response?.status === 404
                        ? "❌ Complete onboarding first to get your referral link!"
                        : "❌ Could not fetch your referral stats. Please try again later.",
                });
            }

            const config = await fetchReferralConfig();
            const currency = config?.currencyName || "$";

            let inviteUrl: string | null = null;
            let inviteErrorMessage: string | null = null;

            try {
                if (!interaction.guild) throw new Error("Guild not found");
                inviteUrl = (
                    await getOrCreatePersonalInvite(interaction.client, interaction.guild, discordId, interaction.user.tag)
                ).inviteUrl;
            } catch (inviteError: any) {
                logger.error(`[Referral Command] Error getting invite:`, inviteError.message);
                inviteErrorMessage = inviteError?.response?.status === 404
                    ? "Complete onboarding first to get your link"
                    : inviteError.message?.toLowerCase().includes("permission")
                        ? "Bot missing permissions"
                        : "Error creating invite";
            }

            let description: string;
            if (!config) {
                // Settings could not be loaded; do not claim rewards are off
                description = `Share your **personal invite link** to invite friends!`;
            } else if (!config.isEnabled) {
                description = `Share your **personal invite link** to invite friends! (Rewards currently disabled)`;
            } else {
                const reward = perReferralReward(config);
                const requirement = describeRequirement(config, "the member");
                // Computed by the backend with the same count the payout uses
                const nextMilestone = stats.nextMilestone;

                description = reward !== null
                    ? `Share your **personal invite link** and earn **${formatMoney(currency, reward)}** for each person who joins with it once ${requirement}.`
                    : `Share your **personal invite link** and earn milestone bonuses. A referral counts once ${requirement}.`;

                const orderText = describeOrderReward(config);
                if (orderText) {
                    description += `\n🛒 Order bonus: **${orderText.main}** from people you refer\n_${orderText.details}_`;
                }

                if (nextMilestone) {
                    description +=
                        `\n🎯 Next milestone: **${nextMilestone.count}** referrals → **${formatMoney(currency, nextMilestone.reward)}** bonus ` +
                        `(${nextMilestone.progress}/${nextMilestone.count}, ${nextMilestone.remaining} to go)`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xfca311)
                .setTitle("🎁 Your Referral Stats")
                .setDescription(description)
                .addFields(
                    { name: "📊 Total Referrals", value: String(stats.totalReferrals || 0), inline: true },
                    { name: "✅ Rewarded", value: String(stats.successfulReferrals || 0), inline: true },
                    { name: "⏳ Awaiting Reward", value: String(stats.pendingReferrals || 0), inline: true },
                    { name: "📝 Not Onboarded", value: String(stats.notOnboardedReferrals || 0), inline: true },
                    { name: "🚪 Left Server", value: String(stats.leftCount || 0), inline: true },
                    { name: "💰 Rewards Earned", value: formatMoney(currency, stats.totalRewards || 0), inline: true },
                    {
                        name: "🔗 Your Personal Invite Link",
                        value: inviteUrl || `❌ ${inviteErrorMessage || "Could not generate invite"}`,
                        inline: false,
                    }
                )
                .setFooter({ text: "Share this link: people who join through it count as your referrals" })
                .setTimestamp();

            if (stats.recentReferrals?.length > 0) {
                const recentList = stats.recentReferrals
                    .slice(0, 5)
                    .map((r: any) => {
                        const name = r.referredUser?.discordUsername || `<@${r.referredDiscordId}>`;
                        if (r.rewardGiven) return `✅ ${name}`;
                        if (r.rewardEligible === false) return `➖ ${name} — joined while rewards were off`;
                        if (r.hasLeftServer) return `🚪 ${name} — left the server`;
                        if (!r.onboardedAt) return `❌ ${name} — not onboarded yet`;
                        return `⏳ ${name}${r.holdReason ? ` — ${r.holdReason}` : ""}`;
                    })
                    .join("\n");

                embed.addFields({ name: "🆕 Recent Referrals", value: recentList.substring(0, 1024) });
            }

            await interaction.editReply({ embeds: [embed.toJSON() as any] });
        } catch (error: any) {
            logger.error("[Referral Command] Fatal error:", error.message);

            const errorMessage = error.message?.includes("Unknown interaction")
                ? "❌ Command timed out. Please try again."
                : `❌ Error: ${error.message || "Unknown error"}`;

            try {
                await interaction.editReply({ content: errorMessage });
            } catch (replyError) {
                logger.error("[Referral Command] Could not send error message");
            }
        }
    },
};
