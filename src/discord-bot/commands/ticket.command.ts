import {
    SlashCommandBuilder,
    CommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import { Command } from "../types/discord.types";
import { EmbedBuilder } from "../utils/embedBuilder";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Open a support ticket for custom requests or support"),

    async execute(interaction: CommandInteraction) {
        try {
            // Create the ticket details modal (without service/price info)
            const modal = new ModalBuilder()
                .setCustomId("ticket_create_modal_general_general_0")
                .setTitle("Open Support Ticket");

            // Service description input
            const descriptionInput = new TextInputBuilder()
                .setCustomId("ticket_description")
                .setLabel("Describe your request")
                .setPlaceholder(
                    "Please describe what you need help with or any additional details..."
                )
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            // Optional OSRS username
            const usernameInput = new TextInputBuilder()
                .setCustomId("ticket_osrs_username")
                .setLabel("OSRS Username (Optional)")
                .setPlaceholder("Your in-game username")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(50);

            // Contact preference
            const contactInput = new TextInputBuilder()
                .setCustomId("ticket_contact")
                .setLabel("Preferred Contact Method (Optional)")
                .setPlaceholder("Discord DM, in-game, etc.")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(100);

            // Add inputs to action rows
            const row1 =
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    descriptionInput
                );
            const row2 =
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    usernameInput
                );
            const row3 =
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    contactInput
                );

            modal.addComponents(row1, row2, row3);

            await interaction.showModal(modal as any);

            logger.info(`Ticket command executed by ${interaction.user.tag}`);
        } catch (error) {
            logger.error("Error executing ticket command:", error);

            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "Failed to open ticket form. Please try again later.",
                "Ticket Error"
            );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [errorEmbed as any],
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed as any],
                    ephemeral: true,
                });
            }
        }
    },
} as Command;
