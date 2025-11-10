import { ButtonInteraction } from "discord.js";
import { PricingMessageBuilder } from "../../utils/pricingMessageBuilder";
import logger from "../../../common/loggers";

export async function handleCategoryToggle(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Immediately defer the interaction to prevent timeout
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
        }

        const customId = interaction.customId;
        const categoryId = customId
            .replace("pricing_category_", "")
            .replace("_toggle", "");

        // Get channel manager from client
        const channelManager = interaction.client.channelManager;

        // Toggle category state
        const isExpanded = channelManager.toggleCategoryState(categoryId);

        // Find which group this category belongs to
        const categories = channelManager.getCachedCategories();
        if (!categories) {
            if (!interaction.replied) {
                await interaction.followUp({
                    content:
                        "Categories not loaded. Please try again in a moment.",
                    ephemeral: true,
                });
            }
            return;
        }

        // Group categories into chunks of 4 to find the group index
        const grouped = chunkArray(categories, 4);
        let groupIndex = -1;

        for (let i = 0; i < grouped.length; i++) {
            if (grouped[i].some(cat => cat.id === categoryId)) {
                groupIndex = i;
                break;
            }
        }

        if (groupIndex === -1) {
            logger.error(`Category ${categoryId} not found in any group`);
            return;
        }

        // Update the grouped message
        const expandedCategoryId = isExpanded ? categoryId : undefined;
        await channelManager.updateGroupedMessage(
            groupIndex,
            expandedCategoryId
        );

        logger.info(
            `Toggled category ${categoryId} by ${interaction.user.tag} (expanded: ${isExpanded})`
        );
    } catch (error) {
        // Handle specific Discord interaction errors
        if (
            error instanceof Error &&
            (error.message === "Unknown interaction" ||
                error.message.includes("interaction"))
        ) {
            logger.debug("Interaction expired, ignoring");
            return;
        }

        logger.error("Error handling category toggle:", error);

        // Only send error message if interaction hasn't been replied to
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.followUp({
                    content: "Error toggling category. Please try again later.",
                    ephemeral: true,
                });
            } catch (followUpError) {
                logger.debug(
                    "Could not send follow-up message:",
                    followUpError
                );
            }
        }
    }
}

/**
 * Utility function to chunk array into groups
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}
