import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types/discord.types";
import { ChannelManagerService } from "../services/channelManager.service";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("admin-refresh-pricing")
        .setDescription("Manually refresh the pricing channel (Admin only)")
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

            await interaction.client.improvedChannelManager.manualRefresh();

            await interaction.editReply({
                content: "✅ Pricing channel has been refreshed successfully!",
            });

            logger.info(
                `Pricing channel refreshed by admin: ${interaction.user.tag}`
            );
        } catch (error) {
            logger.error(
                "Error executing admin-refresh-pricing command:",
                error
            );

            const errorMessage =
                "Failed to refresh pricing channel. Please try again later.";

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
