import { SelectMenuInteraction } from "discord.js";
import { SelectMenu } from "../../types/discord.types";
import logger from "../../../common/loggers";

// Import all select menu handlers
import { handleCategorySelect } from "./category-select.menu";
import { handleServiceSelect } from "./service-select.menu";
import { handleMethodSelect } from "./method-select.menu";
import { handlePaymentSelect } from "./payment-select.menu";
import { handleImprovedPricingServiceSelect } from "./improved-pricing-service-select.selectMenu";

// Select menu handler mapping
const selectMenuHandlers: {
    [key: string]: (interaction: SelectMenuInteraction) => Promise<void>;
} = {
    category_select: handleCategorySelect,
    service_select: handleServiceSelect,
    method_select: handleMethodSelect,
    payment_select: handlePaymentSelect,
};

// Export select menu handlers as array for the main interaction handler
export default Object.entries(selectMenuHandlers).map(
    ([customId, execute]) => ({
        customId,
        execute,
    })
) as SelectMenu[];

// Helper function to handle select menu interactions
export async function handleSelectMenuInteraction(
    interaction: SelectMenuInteraction
): Promise<void> {
    const customId = interaction.customId;

    // Handle pattern matching for pricing service selects
    if (customId.startsWith("pricing_service_select_")) {
        await handleImprovedPricingServiceSelect(interaction as any);
        return;
    }

    // Handle other select menus
    const handler = selectMenuHandlers[customId];

    if (handler) {
        try {
            await handler(interaction);
        } catch (error) {
            logger.error(`Error handling select menu ${customId}:`, error);
            // Only reply if interaction hasn't been handled
            if (
                interaction.isRepliable() &&
                !interaction.replied &&
                !interaction.deferred
            ) {
                try {
                    await interaction.reply({
                        content:
                            "An error occurred while processing this selection.",
                        ephemeral: true,
                    });
                } catch (replyError) {
                    logger.error("Could not send error reply:", replyError);
                }
            }
        }
    } else {
        logger.warn(`No select menu handler found for: ${customId}`);
        // Only reply if interaction hasn't been handled
        if (
            interaction.isRepliable() &&
            !interaction.replied &&
            !interaction.deferred
        ) {
            try {
                await interaction.reply({
                    content: "This menu is not implemented yet.",
                    ephemeral: true,
                });
            } catch (replyError) {
                logger.error("Could not send error reply:", replyError);
            }
        }
    }
}
