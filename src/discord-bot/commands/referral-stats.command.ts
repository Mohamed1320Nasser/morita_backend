import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

const SORT_EMOJIS: Record<string, string> = {
    total: "👥",
    active: "✅",
    retention: "📈",
    left: "❌"
};

export default {
    data: new SlashCommandBuilder()
        .setName("referral-stats")
        .setDescription("[ADMIN] View detailed referral stats for a user")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("User to check (leave empty for overall stats)")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("sort")
                .setDescription("Sort by")
                .setRequired(false)
                .addChoices(
                    { name: "Total Referrals", value: "total" },
                    { name: "Active Members", value: "active" },
                    { name: "Retention Rate", value: "retention" },
                    { name: "Left Members", value: "left" }
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser("user");
        const sortBy = interaction.options.getString("sort") || "total";

        if (targetUser) {
            const response = await discordApiClient.get(`/referral/stats/discord/${targetUser.id}`);
            const stats = response.data;

            if (!stats) {
                return interaction.editReply({ content: "❌ No referral data found for this user" });
            }

            const totalReferrals = stats.totalReferrals || 0;
            const activeCount = totalReferrals - (stats.leftCount || 0);
            const leftCount = stats.leftCount || 0;
            const retentionRate = totalReferrals > 0 ? ((activeCount / totalReferrals) * 100).toFixed(1) : "0.0";
            const totalRewards = (stats.totalRewards || 0).toFixed(2);

            const description =
                `**${targetUser.username}**\n` +
                `▸ Total: **${totalReferrals}** referrals\n\n` +
                `**✅ Referral Overview**\n` +
                `\`\`\`ansi\n` +
                `\u001b[36mTotal Referrals:     ${totalReferrals.toString().padStart(10)}\u001b[0m\n` +
                `\u001b[36mActive (In Server):  ${activeCount.toString().padStart(10)}\u001b[0m\n` +
                `Left Server:         ${leftCount.toString().padStart(10)}\n` +
                `\u001b[36mRetention Rate:      ${retentionRate.padStart(9)}%\u001b[0m\n` +
                `\`\`\`\n` +
                `**💰 Rewards Summary**\n` +
                `\`\`\`ansi\n` +
                `\u001b[1;36mTotal Earned:        $${totalRewards.padStart(9)}\u001b[0m\n` +
                `\u001b[36mSuccessful:          ${(stats.successfulReferrals || 0).toString().padStart(10)}\u001b[0m\n` +
                `\`\`\``;

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📊 Referral Statistics`)
                .setDescription(description)
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            if (stats.recentReferrals && stats.recentReferrals.length > 0) {
                const completedReferrals = stats.recentReferrals.filter((r: any) => r.rewardGiven);

                if (completedReferrals.length > 0) {
                    const recentList = completedReferrals.slice(0, 5).map((r: any, idx: number) => {
                        const status = r.hasLeftServer ? "❌ Left" : "✅ Active";
                        const days = r.daysInServer || 0;
                        const displayName = r.referredUser?.discordDisplayName || r.referredUser?.discordUsername || r.referredDiscordId;
                        const reward = r.rewardAmount ? `$${Number(r.rewardAmount).toFixed(2)}` : "$0.00";

                        return (
                            `**${idx + 1}.** ${displayName}\n` +
                            `\`\`\`ansi\n` +
                            `Status:  ${status.padEnd(12)} │ Days: ${days.toString().padStart(3)}d\n` +
                            `\u001b[36mReward:  ${reward.padEnd(12)}\u001b[0m │ Date: ${new Date(r.joinedAt).toLocaleDateString()}\n` +
                            `\`\`\``
                        );
                    }).join("\n");

                    embed.addFields({
                        name: "📋 Recent Referrals",
                        value: recentList,
                        inline: false
                    });
                }
            }

            return interaction.editReply({ embeds: [embed.toJSON() as any] });
        } else {
            const response = await discordApiClient.get(`/referral/leaderboard?sortBy=${sortBy}&limit=10`);
            const leaderboard = response.data;

            if (!leaderboard || leaderboard.length === 0) {
                return interaction.editReply({ content: "❌ No referral data available" });
            }

            const sortEmoji = SORT_EMOJIS[sortBy] || "📊";
            const sortLabel = sortBy === "total" ? "Total Referrals"
                : sortBy === "active" ? "Active Members"
                : sortBy === "retention" ? "Retention Rate"
                : "Left Members";

            const list = leaderboard.map((user: any, index: number) => {
                const totalRefs = user.totalReferrals || 0;
                const active = user.activeCount || 0;
                const left = user.leftCount || 0;
                const retention = user.retentionRate?.toFixed(0) || "0";
                const username = user.discordUsername || "Unknown";

                const medals = ["🥇", "🥈", "🥉"];
                const rank = index < 3 ? medals[index] : `**${index + 1}.**`;

                return (
                    `${rank} <@${user.discordId}>\n` +
                    `\`\`\`ansi\n` +
                    `\u001b[36mTotal:     ${totalRefs.toString().padStart(6)}\u001b[0m │ ` +
                    `\u001b[36mActive:    ${active.toString().padStart(6)}\u001b[0m\n` +
                    `Left:      ${left.toString().padStart(6)} │ ` +
                    `\u001b[36mRetention: ${retention.padStart(5)}%\u001b[0m\n` +
                    `\`\`\``
                );
            }).join("\n");

            const description =
                `**Top 10 Referrers**\n` +
                `Sorted by: **${sortLabel}** ${sortEmoji}\n\n` +
                `${list}`;

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`🏆 Referral Leaderboard`)
                .setDescription(description)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed.toJSON() as any] });
        }
    },
};
