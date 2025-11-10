import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { Command } from "../types/discord.types";
import { EmbedBuilder } from "../utils/embedBuilder";
import { ComponentBuilder } from "../utils/componentBuilder";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("services")
        .setDescription("Browse available gaming services"),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply();

            // Fetch categories from API
            const categories =
                await interaction.client.apiService.getCategories();

            if (!categories || categories.length === 0) {
                await interaction.editReply({
                    content:
                        "No services are currently available. Please try again later.",
                });
                return;
            }

            // Create embed and components
            const embed = EmbedBuilder.createServicesEmbed(categories);
            const categorySelectMenu =
                ComponentBuilder.createCategorySelectMenu(categories);
            const navigationButtons =
                ComponentBuilder.createNavigationButtons();

            await interaction.editReply({
                embeds: [embed as any],
                components: [
                    categorySelectMenu as any,
                    navigationButtons as any,
                ],
            });

            logger.info(`Services command executed by ${interaction.user.tag}`);
        } catch (error) {
            logger.error("Error executing services command:", error);

            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "Failed to load services. Please try again later.",
                "Services Error"
            );

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed as any] });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed as any],
                    ephemeral: true,
                });
            }
        }
    },
} as Command;
