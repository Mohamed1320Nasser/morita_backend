import { ButtonInteraction } from "discord.js";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleOrderNow(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        
        const serviceId = interaction.customId.replace("order_now_", "");

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

        logger.info(
            `Order modal opened for service: ${serviceId} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling order now button:", error);
        await interaction.reply({
            content: "Failed to open order form. Please try again.",
            ephemeral: true,
        });
    }
}
