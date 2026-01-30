import { SelectMenuInteraction, StringSelectMenuInteraction } from "discord.js";
import { SelectMenu } from "../../types/discord.types";
import logger from "../../../common/loggers";

import { handleCategorySelect } from "./category-select.menu";
import { handleServiceSelect } from "./service-select.menu";
import { handleMethodSelect } from "./method-select.menu";
import { handlePaymentSelect } from "./payment-select.menu";
import { handleImprovedPricingServiceSelect } from "./improved-pricing-service-select.selectMenu";
import { handleAccountShopSelect } from "./account-shop-select.selectMenu";

// Account select menu handlers
import {
    handleAccountCategorySelect,
    handleAccountSelect,
    handleAccountPaymentSelect,
} from "./account-select.menu";
import { ACCOUNT_SELECT_IDS } from "../../utils/accountComponentBuilder";

const selectMenuHandlers: {
    [key: string]: (interaction: SelectMenuInteraction) => Promise<void>;
} = {
    category_select: handleCategorySelect,
    service_select: handleServiceSelect,
    method_select: handleMethodSelect,
    payment_select: handlePaymentSelect,

    // Account shop select menus
    [ACCOUNT_SELECT_IDS.CATEGORY_SELECT]: handleAccountCategorySelect as any,
    [ACCOUNT_SELECT_IDS.ACCOUNT_SELECT]: handleAccountSelect as any,
    [ACCOUNT_SELECT_IDS.PAYMENT_SELECT]: handleAccountPaymentSelect as any,
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

    // Handle account shop select menus (account_shop_select_CATEGORY)
    if (customId.startsWith("account_shop_select_")) {
        await handleAccountShopSelect(interaction as StringSelectMenuInteraction);
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
