import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import axios from "axios";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View top referrers"),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();

            // Fetch leaderboard from API
            const response = await axios.get(`${discordConfig.apiBaseUrl}/referral/leaderboard?limit=10`);
            const leaderboard = response.data;

            if (leaderboard.length === 0) {
                return interaction.editReply({
                    content: "📊 No referrals yet! Be the first!",
                });
            }

            const leaderboardText = leaderboard
                .map((user: any) => {
                    const medal = user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : user.rank === 3 ? "🥉" : `${user.rank}.`;
                    const name = user.discordUsername || user.discordDisplayName || `User ${user.userId}`;
                    return `${medal} **${name}** - ${user.totalReferrals} referrals ($${user.totalRewards.toFixed(2)})`;
                })
                .join("\n");

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
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
