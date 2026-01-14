import { SelectMenuInteraction } from "discord.js";
import { SelectMenu } from "../../types/discord.types";
import logger from "../../../common/loggers";

import { handleCategorySelect } from "./category-select.menu";
import { handleServiceSelect } from "./service-select.menu";
import { handleMethodSelect } from "./method-select.menu";
import { handlePaymentSelect } from "./payment-select.menu";
import { handleImprovedPricingServiceSelect } from "./improved-pricing-service-select.selectMenu";

const selectMenuHandlers: {
    [key: string]: (interaction: SelectMenuInteraction) => Promise<void>;
} = {
    category_select: handleCategorySelect,
    service_select: handleServiceSelect,
    method_select: handleMethodSelect,
    payment_select: handlePaymentSelect,
};

export default Object.entries(selectMenuHandlers).map(
    ([customId, execute]) => ({
        customId,
        execute,
    })
) as SelectMenu[];

export async function handleSelectMenuInteraction(
    interaction: SelectMenuInteraction
): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith("pricing_service_select_")) {
        await handleImprovedPricingServiceSelect(interaction as any);
        return;
    }

    const handler = selectMenuHandlers[customId];

    if (handler) {
        try {
            await handler(interaction);
        } catch (error) {
            logger.error(`Error handling select menu ${customId}:`, error);
            
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
