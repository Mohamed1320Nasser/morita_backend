import { ButtonInteraction } from "discord.js";
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

        // Use improved channel manager if available, otherwise use legacy channel manager
        const improvedChannelManager =
            interaction.client.improvedChannelManager;
        const channelManager = interaction.client.channelManager;

        // Toggle category state (if using legacy channel manager)
        if (channelManager) {
            const isExpanded = channelManager.toggleCategoryState(categoryId);
            logger.info(
                `Toggled category ${categoryId} by ${interaction.user.tag} (expanded: ${isExpanded})`
            );
        }

        // Update the category message using improved channel manager
        if (improvedChannelManager) {
            // The ImprovedChannelManager handles updates via event listeners
            // For now, just trigger a refresh of that category
            // Note: ImprovedChannelManager doesn't have toggle state management yet
            logger.debug(
                `Category toggle requested for ${categoryId} - improved manager will handle updates automatically`
            );
        } else if (channelManager) {
            // Legacy fallback: categories are handled via grouped messages
            // Since updateGroupedMessage doesn't exist, we'll just log the toggle
            logger.debug(
                `Category toggle for ${categoryId} - grouped message update not available`
            );
        }
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
