import { StringSelectMenuInteraction } from "discord.js";
import { rebuildSelectMenusWithoutDefaults } from "../../utils/selectMenuReset";
import logger from "../../../common/loggers";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import { EnhancedAccountBuilder } from "../../utils/enhancedAccountBuilder";
import { pricingMessageTracker } from "../../services/pricingMessageTracker.service";

// Initialize API service
const apiService = new ApiService(discordConfig.apiBaseUrl);

const INTERACTION_EXPIRED_ERRORS = [
    "unknown interaction",
    "interaction has already been acknowledged",
    "already been acknowledged",
];

function isInteractionExpiredError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return INTERACTION_EXPIRED_ERRORS.some(err => message.includes(err));
}

/**
 * Clears the user's checkmark on the shared shop dropdowns. If the menus cannot
 * be rebuilt, the message is acknowledged without changes: writing back a
 * shorter component list would delete the dropdowns for every customer.
 */
async function resetShopMenus(interaction: StringSelectMenuInteraction): Promise<void> {
    const rows = rebuildSelectMenusWithoutDefaults(interaction.message.components as any);
    if (rows) {
        await interaction.update({ components: rows as any });
    } else {
        await interaction.deferUpdate();
    }
}

/**
 * Handle account selection from shop channel dropdown
 * Shows detailed view of the selected account with images and purchase button
 * Uses interaction.update() to reset dropdown + followUp for ephemeral response
 */
export async function handleAccountShopSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    // Skip if already handled
    if (interaction.replied || interaction.deferred) {
        logger.debug("[AccountShopSelect] Interaction already handled, skipping");
        return;
    }

    try {
        const customId = interaction.customId;
        // Extract category from customId: account_shop_select_MAIN
        const category = customId.replace("account_shop_select_", "");
        const accountId = interaction.values[0];

        // Handle special cases - need to reset dropdown first
        if (accountId === "none" || accountId === "view_more") {
            await resetShopMenus(interaction);

            const message = accountId === "none"
                ? "❌ No accounts are available in this category. Please check back later."
                : "📋 **More Accounts Available**\n\n" +
                  "This category has more than 25 accounts. " +
                  "Please contact support or use the `/accounts` command to browse all available accounts.";

            await interaction.followUp({
                content: message,
                ephemeral: true,
            });
            return;
        }

        // First, update the message to reset the dropdown (clear checkmark)
        try {
            logger.debug(
                `[AccountShopSelect] Rebuilding components for message ${interaction.message.id}`
            );

            await resetShopMenus(interaction);

            logger.debug("[AccountShopSelect] Update successful, checkmark cleared");
        } catch (updateError) {
            logger.error(
                `[AccountShopSelect] Update failed:`,
                updateError instanceof Error ? updateError.message : updateError
            );
            if (isInteractionExpiredError(updateError)) {
                logger.debug("[AccountShopSelect] Interaction expired");
                return;
            }
            throw updateError;
        }

        // Fetch account details
        const account = await apiService.getAccountDetail(accountId);

        if (!account) {
            await interaction.followUp({
                embeds: [
                    EnhancedAccountBuilder.buildErrorEmbed(
                        "Account Not Available",
                        "This account is no longer available. It may have been purchased by another customer.\n\nPlease select another account from the list."
                    ) as any,
                ],
                ephemeral: true,
            });
            return;
        }

        // Build account detail embeds with images and purchase button
        const { embeds, components } =
            EnhancedAccountBuilder.buildAccountDetailEmbeds(account);

        await interaction.followUp({
            embeds: embeds.map((e) => e as any),
            components: components.map((c) => c as any),
            ephemeral: true,
        });

        // Track message for auto-deletion (10 minutes)
        const messageId = `${interaction.id}`;
        pricingMessageTracker.trackMessage(messageId, async () => {
            try {
                await interaction.deleteReply();
            } catch (error) {
                logger.debug(
                    "[AccountShopSelect] Could not delete message (likely already deleted)"
                );
            }
        });

        logger.info(
            `[AccountShopSelect] User ${interaction.user.tag} viewing account: ${account.name} (Category: ${category})`
        );
    } catch (error) {
        // Handle expired interaction errors silently
        if (isInteractionExpiredError(error)) {
            logger.debug("[AccountShopSelect] Interaction expired");
            return;
        }

        logger.error(
            "[AccountShopSelect] Error handling account shop select:",
            error
        );

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content:
                        "❌ Error loading account details. Please try again later.",
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content:
                        "❌ Error loading account details. Please try again later.",
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.debug(
                "[AccountShopSelect] Could not send error message:",
                replyError
            );
        }
    }
}
