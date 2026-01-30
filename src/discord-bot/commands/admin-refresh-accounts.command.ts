import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types/discord.types";
import { getAccountChannelManager } from "../services/accountChannelManager.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("admin-refresh-accounts")
        .setDescription("Refresh the account shop channel (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption((option) =>
            option
                .setName("clear-all")
                .setDescription(
                    "Clear ALL messages in channel (not just bot messages)"
                )
                .setRequired(false)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            // Check permissions
            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.Administrator
                )
            ) {
                await interaction.reply({
                    content:
                        "You do not have permission to use this command. Admin role required.",
                    ephemeral: true,
                });
                return;
            }

            const clearAll =
                interaction.options.get("clear-all")?.value as boolean || false;

            // Defer reply as this might take a while
            await interaction.deferReply({ ephemeral: true });

            // Check if account channel is configured
            if (!discordConfig.accountShopChannelId) {
                await interaction.editReply({
                    content:
                        "Account shop channel is not configured. Please set DISCORD_ACCOUNT_SHOP_CHANNEL_ID in your environment.",
                });
                return;
            }

            // Get or create the account channel manager
            const accountManager = getAccountChannelManager(interaction.client);

            // Initialize if not already done
            if (!accountManager.isReady()) {
                await accountManager.setupOnly();
            }

            // Rebuild the channel
            await accountManager.rebuildChannel(clearAll);

            await interaction.editReply({
                content:
                    `Account shop channel has been refreshed successfully!\n\n` +
                    `**Channel:** <#${discordConfig.accountShopChannelId}>\n` +
                    `**Clear All Messages:** ${clearAll ? "Yes" : "No"}`,
            });

            logger.info(
                `[AdminRefreshAccounts] Account shop channel refreshed by ${interaction.user.tag} (clearAll: ${clearAll})`
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

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `Failed to refresh account shop channel: ${errorMessage}`,
                });
            } else {
                await interaction.reply({
                    content: `Failed to refresh account shop channel: ${errorMessage}`,
                    ephemeral: true,
                });
            }
        }
    },
} as Command;
