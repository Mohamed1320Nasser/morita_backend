import { ButtonInteraction } from "discord.js";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import { EnhancedPricingBuilder } from "../../utils/enhancedPricingBuilder";
import {
    parsePaginationButtonId,
    calculateNewPage,
    getTotalGroups
} from "../../utils/pricingPagination";
import logger from "../../../common/loggers";
import { handleInteractionError } from "../../utils/errorHandler";
import { DISCORD_LIMITS } from "../../constants/discord-limits";

const apiService = new ApiService(discordConfig.apiBaseUrl);

const INTERACTION_EXPIRED_ERRORS = [
    "unknown interaction",
    "interaction has already been acknowledged",
    "already been acknowledged",
    "unknown message",
];

function isInteractionExpiredError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return INTERACTION_EXPIRED_ERRORS.some(err => message.includes(err));
}

export async function handlePricingPagination(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        
        const paginationInfo = parsePaginationButtonId(interaction.customId);

        if (!paginationInfo) {
            logger.error(
                `[PricingPagination] Invalid pagination button ID: ${interaction.customId}`
            );
            await interaction.reply({
                content: "❌ Invalid pagination button. Please try again.",
                ephemeral: true,
            });
            return;
        }

        const { action, serviceId, categoryId, currentPage } = paginationInfo;

        try {
            await interaction.deferUpdate();
        } catch (deferError) {
            
            if (isInteractionExpiredError(deferError)) {
                logger.debug(
                    `[PricingPagination] Interaction expired (likely bot restart). User: ${interaction.user.tag}`
                );
                return;
            }
            throw deferError;
        }

        const service = await apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await interaction.editReply({
                content: "❌ Service not found. It may have been removed.",
            });
            return;
        }

        const itemsPerPage = DISCORD_LIMITS.PAGINATION.PRICING_ITEMS_PER_PAGE;
        // Use group count for pagination, not individual method count
        const totalGroups = service.pricingMethods ? getTotalGroups(service.pricingMethods) : 0;
        const totalPages = Math.ceil(totalGroups / itemsPerPage);
        const newPage = calculateNewPage(action, currentPage, totalPages);

        logger.info(
            `[PricingPagination] ${interaction.user.tag} navigating from page ${currentPage + 1} to page ${newPage + 1} for service ${service.name}`
        );

        const embed = EnhancedPricingBuilder.buildServiceInfoEmbed(service, {
            page: newPage,
            itemsPerPage,
        });

        const paginationOptions = totalGroups > itemsPerPage ? {
            currentPage: newPage,
            itemsPerPage,
            totalItems: totalGroups,
            serviceId,
            categoryId,
        } : undefined;

        const actionButtons = EnhancedPricingBuilder.buildServiceActionButtons(
            serviceId,
            categoryId,
            paginationOptions
        );

        await interaction.editReply({
            embeds: [embed.toJSON() as any],
            components: actionButtons.map(row => row.toJSON()) as any,
        });

        logger.debug(
            `[PricingPagination] Successfully updated to page ${newPage + 1}/${totalPages}`
        );
    } catch (error) {
        logger.error("[PricingPagination] Error handling pagination:", error);
        await handleInteractionError(error, interaction);
    }
}
