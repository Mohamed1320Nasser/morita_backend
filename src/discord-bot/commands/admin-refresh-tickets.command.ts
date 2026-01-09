import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types/discord.types";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("admin-refresh-tickets")
        .setDescription("Manually refresh ticket channel messages (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction: CommandInteraction) {
        try {
            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.Administrator
                )
            ) {
                await interaction.reply({
                    content:
                        "❌ You don't have permission to use this command.",
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            await interaction.client.ticketCategoryManager.refreshMessages();

            await interaction.editReply({
                content: "✅ Ticket channel messages have been refreshed successfully!",
            });

            logger.info(
                `Ticket channels refreshed by admin: ${interaction.user.tag}`
            );
        } catch (error) {
            logger.error(
                "Error executing admin-refresh-tickets command:",
                error
            );

            const errorMessage =
                "Failed to refresh ticket channels. Please try again later.";

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true,
                });
            }
        }
    },
} as Command;
