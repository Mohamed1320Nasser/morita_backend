import { ButtonInteraction, PermissionFlagsBits } from "discord.js";
import logger from "../../../common/loggers";

export async function handleAdminRefreshPricing(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        
        if (
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.Administrator
            )
        ) {
            await interaction.reply({
                content: "❌ Only administrators can refresh the pricing channel.",
                ephemeral: true,
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const channelManager = interaction.client.improvedChannelManager;

        if (!channelManager) {
            await interaction.editReply({
                content: "❌ Channel manager not initialized. Please contact support.",
            });
            return;
        }

        await channelManager.manualRefresh();

        await interaction.editReply({
            content: "✅ **Pricing channel refreshed successfully!**\n\nAll categories and services have been updated with the latest data.",
        });

        logger.info(
            `[AdminRefreshButton] Pricing channel manually refreshed by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error(
            "[AdminRefreshButton] Error refreshing pricing channel:",
            error
        );

        const errorMessage = "❌ Failed to refresh pricing channel. Please try again later.";

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMessage });
        } else {
            await interaction.reply({
                content: errorMessage,
                ephemeral: true,
            });
        }
    }
}
