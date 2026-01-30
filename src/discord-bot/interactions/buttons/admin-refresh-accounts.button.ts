import { ButtonInteraction, PermissionFlagsBits } from "discord.js";
import logger from "../../../common/loggers";
import { getAccountChannelManager } from "../../services/accountChannelManager.service";
import { discordConfig } from "../../config/discord.config";

/**
 * Handle admin refresh accounts button click
 * Refreshes the account shop channel with fresh data
 */
export async function handleAdminRefreshAccounts(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Check permissions
        const member = interaction.guild?.members.cache.get(interaction.user.id);
        const hasAdminRole = member?.roles.cache.has(discordConfig.adminRoleId);
        const isAdministrator = member?.permissions.has(
            PermissionFlagsBits.Administrator
        );

        if (!hasAdminRole && !isAdministrator) {
            await interaction.reply({
                content:
                    "You do not have permission to refresh the account shop channel.",
                ephemeral: true,
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Get the account channel manager
        const accountManager = getAccountChannelManager(interaction.client);

        if (!accountManager.isReady()) {
            await accountManager.setupOnly();
        }

        // Rebuild the channel
        await accountManager.rebuildChannel(false);

        await interaction.editReply({
            content:
                `Account shop channel has been refreshed successfully!\n\n` +
                `**Channel:** <#${discordConfig.accountShopChannelId}>`,
        });

        logger.info(
            `[AdminRefreshAccounts] Account shop refreshed via button by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error(
            "[AdminRefreshAccounts] Error refreshing account shop:",
            error
        );

        const errorMessage =
            error instanceof Error
                ? error.message
                : "An unexpected error occurred";

        if (interaction.deferred) {
            await interaction.editReply({
                content: `Failed to refresh account shop: ${errorMessage}`,
            });
        } else {
            await interaction.reply({
                content: `Failed to refresh account shop: ${errorMessage}`,
                ephemeral: true,
            });
        }
    }
}
