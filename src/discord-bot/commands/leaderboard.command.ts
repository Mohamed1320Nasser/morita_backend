import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import { unwrapApiData } from "../utils/apiResponse.util";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View top referrers"),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();

            // Fetch leaderboard from API
            const leaderboard = unwrapApiData<any[]>(
                await discordApiClient.get(`/referral/leaderboard?limit=10`)
            ) || [];

            if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
                return interaction.editReply({
                    content: "📊 No referrals yet! Be the first!",
                });
            }

            const leaderboardText = leaderboard
                .map((user: any) => {
                    const medal = user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : user.rank === 3 ? "🥉" : `${user.rank}.`;
                    const name = user.discordUsername || user.discordDisplayName || `User ${user.userId}`;
                    return `${medal} **${name}** - ${user.totalReferrals} referrals ($${Number(user.totalRewards || 0).toFixed(2)})`;
                })
                .join("\n");

            const embed = new EmbedBuilder()
                .setColor(0xfca311)
                .setTitle("🏆 Referral Leaderboard")
                .setDescription(leaderboardText)
                .setFooter({ text: "Keep inviting to climb the ranks!" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed.toJSON() as any] });
        } catch (error) {
            logger.error("[Leaderboard Command] Error:", error);
            await interaction.editReply({
                content: "❌ An error occurred",
            }).catch(() => {});
        }
    },
};
