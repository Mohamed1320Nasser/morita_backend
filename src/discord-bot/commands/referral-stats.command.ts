import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

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
            const retentionRate = totalReferrals > 0 ? ((activeCount / totalReferrals) * 100).toFixed(1) : "0";

            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle(`📊 Referral Stats: ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: "👥 Total Referrals", value: totalReferrals.toString(), inline: true },
                    { name: "✅ Still in Server", value: activeCount.toString(), inline: true },
                    { name: "❌ Left Server", value: (stats.leftCount || 0).toString(), inline: true },
                    { name: "📈 Retention Rate", value: `${retentionRate}%`, inline: true },
                    { name: "💰 Total Rewards", value: `$${(stats.totalRewards || 0).toFixed(2)}`, inline: true },
                    { name: "✅ Successful", value: (stats.successfulReferrals || 0).toString(), inline: true }
                )
                .setTimestamp();

            if (stats.recentReferrals && stats.recentReferrals.length > 0) {
                const recentList = stats.recentReferrals.slice(0, 10).map((r: any) => {
                    const status = r.hasLeftServer ? "❌ Left" : r.rewardGiven ? "✅ Active" : "⏳ Pending";
                    const days = r.daysInServer || 0;
                    const name = r.referredUser?.discordUsername || r.referredDiscordId;
                    return `${status} ${name} (${days}d)`;
                }).join("\n");

                embed.addFields({ name: "Recent Referrals", value: recentList });
            }

            return interaction.editReply({ embeds: [embed.toJSON() as any] });
        } else {
            const response = await discordApiClient.get(`/referral/leaderboard?sortBy=${sortBy}&limit=10`);
            const leaderboard = response.data;

            if (!leaderboard || leaderboard.length === 0) {
                return interaction.editReply({ content: "No referral data available" });
            }

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle(`🏆 Referral Leaderboard (${sortBy})`)
                .setDescription("Top 10 referrers")
                .setTimestamp();

            const list = leaderboard.map((user: any, index: number) => {
                const totalRefs = user.totalReferrals || 0;
                const active = totalRefs - (user.leftCount || 0);
                const retention = totalRefs > 0 ? ((active / totalRefs) * 100).toFixed(0) : "0";

                return `**${index + 1}.** <@${user.discordId}>\n` +
                       `└ Total: ${totalRefs} | Active: ${active} | Left: ${user.leftCount || 0} | Retention: ${retention}%`;
            }).join("\n\n");

            embed.addFields({ name: "Rankings", value: list });

            return interaction.editReply({ embeds: [embed.toJSON() as any] });
        }
    },
};
