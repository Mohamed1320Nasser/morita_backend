import { ButtonInteraction } from "discord.js";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleOrderFromPrice(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        
        const serviceId = interaction.customId.replace("order_from_price_", "");

        if (!serviceId) {
            await interaction.reply({
                content: "Invalid service selection. Please try again.",
                ephemeral: true,
            });
            return;
        }

        const modal = ComponentBuilder.createOrderDetailsModal();
        modal.setCustomId(`order_details_modal_${serviceId}`);

        await interaction.showModal(modal as any);

        logger.info(`Order modal opened from price by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling order from price button:", error);
        await interaction.reply({
            content: "Failed to open order form. Please try again.",
            ephemeral: true,
        });
    }
}
