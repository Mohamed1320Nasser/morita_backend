import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
} from "discord.js";
import { Command } from "../types/discord.types";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { createBalanceEmbed } from "../utils/wallet-embeds.util";

export default {
    data: new SlashCommandBuilder()
        .setName("w")
        .setDescription("View your wallet balance (private - only you can see)"),

    async execute(interaction: CommandInteraction) {
        try {
            // Ephemeral - only the user can see this
            await interaction.deferReply({ ephemeral: true });

            const discordId = interaction.user.id;

            const response: any = await discordApiClient.get(
                `/discord/wallets/balance/${discordId}`
            );

            const responseData = response.data || response;
            const data = responseData.data || responseData;

            const embed = createBalanceEmbed(data, {
                isAdminView: false,
            });

            await interaction.editReply({ embeds: [embed.toJSON() as any] });

            logger.info(`[Wallet] Balance viewed by ${interaction.user.tag}`);
        } catch (error) {
            logger.error("[Wallet] Error fetching balance:", error);

            const embed = new EmbedBuilder()
                .setTitle("Error")
                .setDescription("Failed to fetch wallet information. Please try again later.")
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
