import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleCompleteOrder(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const embed = EmbedBuilder.createSuccessEmbed(
            "Order completed! The customer has been notified.",
            "Order Completed"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        logger.info(`Order completed by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling complete order button:", error);
        await interaction.editReply({
            content: "Failed to complete order. Please try again.",
        });
    }
}
