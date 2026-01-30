import {
    StringSelectMenuInteraction,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} from "discord.js";
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
 * Rebuild dropdown components without default selection (clears checkmark)
 */
function rebuildComponentsWithoutDefaults(
    messageComponents: any[]
): ActionRowBuilder<StringSelectMenuBuilder>[] {
    const newRows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

    for (const row of messageComponents) {
        const components = row.components || [];

        for (const component of components) {
            const isSelectMenu = component.type === 3 ||
                component.data?.type === 3 ||
                component.customId?.startsWith('account_shop_select_');

            if (isSelectMenu) {
                try {
                    const clonedMenu = StringSelectMenuBuilder.from(component);

                    const currentOptions = clonedMenu.options || [];
                    const newOptions = currentOptions.map((opt: any) => {
                        const optData = opt.data || opt;
                        return {
                            label: optData.label,
                            value: optData.value,
                            description: optData.description,
                            emoji: optData.emoji,
                            default: false // Clear the checkmark
                        };
                    });

                    clonedMenu.setOptions(newOptions);

                    newRows.push(
                        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(clonedMenu)
                    );
                } catch (menuError) {
                    logger.error(
                        `[AccountShopSelect] Error cloning menu:`,
                        menuError instanceof Error ? menuError.message : menuError
                    );
                }
            }
        }
    }

    return newRows;
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
            // Rebuild components to clear checkmark
            const rebuiltComponents = rebuildComponentsWithoutDefaults(
                interaction.message.components as any
            );

            await interaction.update({
                components: rebuiltComponents as any
            });

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

            const rebuiltComponents = rebuildComponentsWithoutDefaults(
                interaction.message.components as any
            );

            await interaction.update({
                components: rebuiltComponents as any
            });

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
