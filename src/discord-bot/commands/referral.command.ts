import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, PermissionFlagsBits, Guild } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import { unwrapApiData } from "../utils/apiResponse.util";
import {
    fetchReferralConfig,
    perReferralReward,
    describeRequirement,
    describeOrderReward,
    formatMoney,
} from "../services/referralNotifier.service";
import logger from "../../common/loggers";

/**
 * Returns the member's personal invite link. The bot creates the invite, so
 * Discord lists the bot as its inviter; the code -> member mapping is stored
 * in the backend, which is what attributes joins to the right referrer.
 */
async function getPersonalInvite(interaction: ChatInputCommandInteraction, guild: Guild): Promise<string> {
    const discordId = interaction.user.id;

    // 1. Existing mapping, if the invite still exists in Discord
    const existing = unwrapApiData<any>(
        await discordApiClient.post("/referral/invite/get-or-create", { discordId, guildId: guild.id })
    );

    if (existing?.inviteCode) {
        const liveInvites = await guild.invites.fetch();
        if (liveInvites.has(existing.inviteCode)) {
            return existing.inviteUrl || `https://discord.gg/${existing.inviteCode}`;
        }
        // Deleted or expired in Discord: retire it and hand out a new one
        await discordApiClient.post("/referral/invite/deactivate", { inviteCode: existing.inviteCode });
    }

    // 2. Create a new one
    const channel =
        guild.channels.cache.find(ch => ch.isTextBased() && (ch.name === "general" || ch.name === "welcome")) ||
        guild.channels.cache.find(ch => ch.isTextBased());

    if (!channel || !("createInvite" in channel)) {
        throw new Error("No suitable channel found for invites");
    }

    const botMember = await guild.members.fetch(interaction.client.user!.id);
    if (!botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
        throw new Error("Bot missing CREATE_INSTANT_INVITE permission");
    }

    const discordInvite = await channel.createInvite({
        maxAge: 0,
        maxUses: 0,
        unique: true,
        reason: `Personal referral invite for ${interaction.user.tag}`,
    });

    // Snapshot it at 0 uses so the first join through it is detected
    interaction.client.inviteCache?.addInvite(guild.id, discordInvite);

    await discordApiClient.post("/referral/invite/create", {
        inviteCode: discordInvite.code,
        inviteUrl: discordInvite.url,
        discordId,
        channelId: discordInvite.channelId,
        uses: discordInvite.uses || 0,
    });

    logger.info(`[Referral Command] ✅ Created personal invite ${discordInvite.code} for ${interaction.user.tag}`);
    return discordInvite.url;
}

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
                inviteUrl = await getPersonalInvite(interaction, interaction.guild);
            } catch (inviteError: any) {
                logger.error(`[Referral Command] Error getting invite:`, inviteError.message);
                inviteErrorMessage = inviteError.message?.toLowerCase().includes("permission")
                    ? "Bot missing permissions"
                    : "Error creating invite";
            }

            let description: string;
            if (!config || !config.isEnabled) {
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
                .setFooter({ text: "Only joins through your personal link count as your referrals" })
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
