import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
} from "discord.js";
import { Command } from "../types/discord.types";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { createTransactionsEmbed } from "../utils/wallet-embeds.util";

export default {
    data: new SlashCommandBuilder()
        .setName("t")
        .setDescription("View your transaction history (private - only you can see)"),

    async execute(interaction: CommandInteraction) {
        try {
            // Ephemeral - only the user can see this
            await interaction.deferReply({ ephemeral: true });

            const discordId = interaction.user.id;

            const response: any = await discordApiClient.get(
                `/discord/wallets/transactions/${discordId}`,
                { params: { limit: 10 } }
            );

            const responseData = response.data || response;
            const data = responseData.data || responseData;
            const transactions = data.list || [];

            const embed = createTransactionsEmbed(transactions, {
                isAdminView: false,
            });

            await interaction.editReply({ embeds: [embed.toJSON() as any] });

            logger.info(`[Wallet] Transactions viewed by ${interaction.user.tag}`);
        } catch (error) {
            logger.error("[Wallet] Error fetching transactions:", error);

            const embed = new EmbedBuilder()
                .setTitle("Error")
                .setDescription("Failed to fetch transaction history. Please try again later.")
                .setColor(0xed4245)
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
            } else {
                await interaction.reply({
                    embeds: [embed.toJSON() as any],
                    ephemeral: true,
                });
            }
        }
    },
} as Command;
