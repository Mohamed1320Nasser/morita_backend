import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { Command } from "../types/discord.types";
import { EmbedBuilder } from "../utils/embedBuilder";
import { ComponentBuilder } from "../utils/componentBuilder";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show help information and available commands"),

    async execute(interaction: CommandInteraction) {
        try {
            const embed = EmbedBuilder.createHelpEmbed();
            const helpButtons = ComponentBuilder.createHelpButtons();

            await interaction.reply({
                embeds: [embed as any],
                components: [helpButtons as any],
                ephemeral: true,
            });

            logger.info(`Help command executed by ${interaction.user.tag}`);
        } catch (error) {
            logger.error("Error executing help command:", error);

            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "Failed to load help information. Please try again later.",
                "Help Error"
            );

            await interaction.reply({
                embeds: [errorEmbed as any],
                ephemeral: true,
            });
        }
    },
} as Command;
