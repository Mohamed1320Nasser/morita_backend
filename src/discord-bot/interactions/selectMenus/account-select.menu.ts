import { StringSelectMenuInteraction } from "discord.js";
import logger from "../../../common/loggers";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import {
    AccountEmbedBuilder,
    AccountListItem,
} from "../../utils/accountEmbedBuilder";
import {
    AccountComponentBuilder,
    ACCOUNT_SELECT_IDS,
} from "../../utils/accountComponentBuilder";

// Initialize API service
const apiService = new ApiService(discordConfig.apiBaseUrl);

/**
 * Handle account category selection from dropdown
 * Shows list of available accounts in the selected category
 */
export async function handleAccountCategorySelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const category = interaction.values[0];

        if (!category || category === "none") {
            await interaction.editReply({
                embeds: [
                    AccountEmbedBuilder.createErrorEmbed(
                        "Invalid Selection",
                        "Please select a valid category."
                    ) as any,
                ],
                components: [],
            });
            return;
        }

        // Fetch accounts for the selected category
        const result = await apiService.getAccountViewList(category, 1, 5);

        if (!result || result.list.length === 0) {
            // No accounts available in this category
            const embed = AccountEmbedBuilder.createOutOfStockEmbed(category);
            const backButton = AccountComponentBuilder.createPaginationButtons(
                category,
                1,
                1,
                0
            );

            const components = backButton ? [backButton as any] : [];
            await interaction.editReply({
                embeds: [embed as any],
                components,
            });
            return;
        }

        // Calculate pagination
        const page = 1;
        const limit = 5;
        const totalPages = Math.ceil(result.filterCount / limit);

        // Create account list embed
        const embed = AccountEmbedBuilder.createAccountListEmbed(
            category,
            result.list,
            page,
            totalPages,
            result.filterCount
        );

        // Create account selection dropdown
        const selectMenu = AccountComponentBuilder.createAccountSelectMenu(result.list);

        // Create pagination buttons (only if more than 5 items)
        const paginationButtons = AccountComponentBuilder.createPaginationButtons(
            category,
            page,
            totalPages,
            result.filterCount
        );

        const components = [selectMenu as any];
        if (paginationButtons) {
            components.push(paginationButtons as any);
        }

        await interaction.editReply({
            embeds: [embed as any],
            components,
        });

        logger.info(
            `[AccountSelectMenu] User ${interaction.user.tag} selected category: ${category} (${result.filterCount} accounts)`
        );
    } catch (error) {
        logger.error("[AccountSelectMenu] Error handling category select:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "Failed to load accounts. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle account selection from dropdown
 * Shows detailed view of the selected account
 */
export async function handleAccountSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const accountId = interaction.values[0];

        if (!accountId || accountId === "none") {
            await interaction.editReply({
                embeds: [
                    AccountEmbedBuilder.createErrorEmbed(
                        "Invalid Selection",
                        "Please select a valid account."
                    ) as any,
                ],
                components: [],
            });
            return;
        }

        // Fetch account details
        const account = await apiService.getAccountDetail(accountId);

        if (!account) {
            await interaction.editReply({
                embeds: [
                    AccountEmbedBuilder.createErrorEmbed(
                        "Account Not Available",
                        "This account is no longer available. It may have been purchased by another customer."
                    ) as any,
                ],
                components: [],
            });
            return;
        }

        // Create detailed account view embeds (with all images)
        const embeds = AccountEmbedBuilder.createAccountDetailEmbeds(account);

        // Create action buttons (purchase, back to list)
        const buttons = AccountComponentBuilder.createAccountDetailButtons(
            accountId,
            account.category
        );

        await interaction.editReply({
            embeds: embeds.map(e => e as any),
            components: [buttons as any],
        });

        logger.info(
            `[AccountSelectMenu] User ${interaction.user.tag} viewing account: ${account.name}`
        );
    } catch (error) {
        logger.error("[AccountSelectMenu] Error handling account select:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "Failed to load account details. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle payment method selection
 * Part of the purchase flow
 */
export async function handleAccountPaymentSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const paymentMethodId = interaction.values[0];

        if (!paymentMethodId) {
            await interaction.editReply({
                embeds: [
                    AccountEmbedBuilder.createErrorEmbed(
                        "Invalid Selection",
                        "Please select a payment method."
                    ) as any,
                ],
                components: [],
            });
            return;
        }

        // This will be integrated with the ticket creation flow
        // For now, store the selection and show confirmation
        logger.info(
            `[AccountSelectMenu] User ${interaction.user.tag} selected payment method: ${paymentMethodId}`
        );

        // TODO: Integrate with ticket creation in Phase 7
        await interaction.followUp({
            content: "Payment method selected. Proceeding with ticket creation...",
            ephemeral: true,
        });
    } catch (error) {
        logger.error("[AccountSelectMenu] Error handling payment select:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "Failed to process payment selection. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}
