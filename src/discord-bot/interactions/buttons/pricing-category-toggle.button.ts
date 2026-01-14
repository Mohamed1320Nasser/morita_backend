import { ButtonInteraction } from "discord.js";
import logger from "../../../common/loggers";

export async function handleCategoryToggle(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
        }

        const customId = interaction.customId;
        const categoryId = customId
            .replace("pricing_category_", "")
            .replace("_toggle", "");

        const improvedChannelManager =
            interaction.client.improvedChannelManager;
        const channelManager = interaction.client.channelManager;

        if (channelManager) {
            const isExpanded = channelManager.toggleCategoryState(categoryId);
            logger.info(
                `Toggled category ${categoryId} by ${interaction.user.tag} (expanded: ${isExpanded})`
            );
        }

        if (improvedChannelManager) {

            logger.debug(
                `Category toggle requested for ${categoryId} - improved manager will handle updates automatically`
            );
        } else if (channelManager) {

            logger.debug(
                `Category toggle for ${categoryId} - grouped message update not available`
            );
        }
    } catch (error) {
        
        if (
            error instanceof Error &&
            (error.message === "Unknown interaction" ||
                error.message.includes("interaction"))
        ) {
            logger.debug("Interaction expired, ignoring");
            return;
        }

        logger.error("Error handling category toggle:", error);

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
