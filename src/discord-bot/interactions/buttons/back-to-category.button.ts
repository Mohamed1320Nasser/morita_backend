import { ButtonInteraction } from "discord.js";
import logger from "../../../common/loggers";
import { pricingMessageTracker } from "../../services/pricingMessageTracker.service";

export async function handleBackToCategory(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        
        const categoryId = interaction.customId.replace("back_to_category_", "");

        logger.info(
            `[BackToCategory] User ${interaction.user.tag} dismissed service details for category: ${categoryId}`
        );

        const messageId = `${interaction.id}`;
        pricingMessageTracker.clearTimeout(messageId);

        await interaction.deferUpdate();
        await interaction.deleteReply();

        logger.debug("[BackToCategory] Service details message dismissed");

    } catch (error) {
        logger.error("[BackToCategory] Error dismissing message:", error);

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
