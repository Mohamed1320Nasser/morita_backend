import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleConfirmOrder(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        // This would typically process the order and create a ticket
        const embed = EmbedBuilder.createSuccessEmbed(
            "Order confirmed! A support ticket has been created for you.",
            "Order Confirmed"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        logger.info(`Order confirmed by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling confirm order button:", error);
        await interaction.editReply({
            content: "Failed to confirm order. Please try again.",
        });
    }
}
