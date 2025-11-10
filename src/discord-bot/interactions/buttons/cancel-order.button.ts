import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleCancelOrder(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const embed = EmbedBuilder.createErrorEmbed(
            "Order cancelled. You can start a new order anytime using /order or /services.",
            "Order Cancelled"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        logger.info(`Order cancelled by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling cancel order button:", error);
        await interaction.editReply({
            content: "Failed to cancel order. Please try again.",
        });
    }
}
