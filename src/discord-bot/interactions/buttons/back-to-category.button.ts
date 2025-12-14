import { ButtonInteraction } from "discord.js";
import logger from "../../../common/loggers";
import { pricingMessageTracker } from "../../services/pricingMessageTracker.service";

export async function handleBackToCategory(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Extract category ID from customId (format: back_to_category_{categoryId})
        const categoryId = interaction.customId.replace("back_to_category_", "");

        logger.info(
            `[BackToCategory] User ${interaction.user.tag} dismissed service details for category: ${categoryId}`
        );

        // Clear auto-delete timeout (user dismissed manually)
        const messageId = `${interaction.id}`;
        pricingMessageTracker.clearTimeout(messageId);

        // Simply dismiss the ephemeral message (like Discord's "Dismiss message" button)
        // No confirmation message needed - just delete it immediately
        await interaction.deferUpdate();
        await interaction.deleteReply();

        logger.debug("[BackToCategory] Service details message dismissed");

    } catch (error) {
        logger.error("[BackToCategory] Error dismissing message:", error);

        // Fallback: try to delete anyway
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferUpdate();
            }
            await interaction.deleteReply();
        } catch (fallbackError) {
            logger.debug("[BackToCategory] Could not delete message:", fallbackError);
        }
    }
}
